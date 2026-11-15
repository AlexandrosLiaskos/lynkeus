# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""The jobs of the server.

A job runs the function of a process in an operating-system process of its
own, so that it can be ended at any moment and a fault in it cannot stop the
server. A fixed number of jobs run at once and the others wait in the order
in which they were started. The record of a job is kept in the store. The
Earthdata token of a job is kept in memory only, until the job starts.

A job, and the layer or the series that it makes, belong to a holder
(``lynkeus.store.Holder``): on the project server an account, and on an own
server the session of its pairing. The project server keeps a layer and a
series for ``KEEP_TIME`` and then removes them (``docs/Storage.md``). It reads
the free space of the disk of its data folder before a job starts and while
the job writes, and it keeps ``FREE_SPACE_RESERVE`` free.

The limits of the jobs are those of ``Limits``. Their default values are the
constants of this module, which suit the project server. An own server
(``lynkeus.link``) gives the limits that its owner set.
"""

import json
import logging
import multiprocessing
import os
import secrets
import shutil
import signal
import threading
import time
import traceback
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from http import HTTPStatus
from multiprocessing.connection import Connection
from multiprocessing.process import BaseProcess
from multiprocessing.synchronize import Semaphore
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ValidationError

from lynkeus.layers import LayerDescription, SeriesDescription
from lynkeus.processes import SERIES_OUTPUT, Process, Work
from lynkeus.store import Holder, JobRecord, LayerRecord, SeriesRecord, Store

MAX_RUNNING_JOBS = 2
"""The largest number of jobs that run at once. It equals the number of processors of the machine.

The memory limit of the web service in ``compose.yaml`` allows for this number of jobs.
"""

MAX_WAITING_JOBS = 20
"""The largest number of jobs of all accounts that wait. With more, a new job would wait for hours."""

MAX_ACCOUNT_UNFINISHED_JOBS = 4
"""The largest number of jobs of one account that wait or run, so that one visitor cannot fill the queue."""

MAX_ACCOUNT_FINISHED_JOBS = 100
"""The largest number of finished jobs of one account whose record is kept. The oldest records are removed."""

MAX_ACCOUNT_DISMISSED_JOBS = 100
"""The largest number of dismissed jobs of one account whose name is still answered with 410 Gone."""

MAX_ACCOUNT_LAYERS = 50
"""The largest number of layers of one account."""

MAX_ACCOUNT_SERIES = 50
"""The largest number of series of one account. It is the number of ``MAX_ACCOUNT_LAYERS``."""

MAX_LAYER_SIZE = 500_000_000
"""The largest size of the files of one layer, in bytes."""

MAX_ACCOUNT_SIZE = 2_000_000_000
"""The largest total size of the layers of one account, in bytes."""

MAX_TOTAL_SIZE = 20_000_000_000
"""The largest total size of the layers of all accounts, in bytes.

It is the most that Lynkeus takes of a disk that it shares with other sites. It says nothing about the space
that the disk has: the service reads the free space before each job and while the job writes
(``FREE_SPACE_RESERVE``).
"""

FREE_SPACE_RESERVE = 5_000_000_000
"""The free space that the service leaves on the disk of its data folder, in bytes.

A job that makes a layer is not accepted and not started when its largest folder would leave less than this
free, and a running job is ended when less than this is free. The reserve is ten times ``MAX_LAYER_SIZE``. It
covers what the service does not measure: the files that ``MAX_RUNNING_JOBS`` jobs write between two
measurements, a new build of the two images of the site beside the running ones (about 1 gigabyte), the
record file with its daily copies, the logs, and the other sites that write on the same disk.
"""

KEEP_TIME = 14 * 24 * 3600.0
"""The keeping time, in seconds: the one duration of ``docs/Storage.md``.

The project server keeps a layer and a series until this time after they were made or last extended, removes
the record of a failed or dismissed job this time after its end, and ends a session that was not used for this
time (``lynkeus.sessions.SESSION_IDLE_TIME``). ASF HyP3, a service that NASA funds, keeps its products for the
same 14 days (``docs/research/storage.md``).
"""

JOB_TIME = 2400.0
"""The longest time that a job may run, in seconds, unless the limits of the server give another (``Limits.job_time``).

It is 10 minutes longer than the longest wait for NASA Harmony (``lynkeus.harmony.MOST_WAIT``). A job whose
wait for Harmony passes that limit therefore ends with the sentence of ``lynkeus.harmony``, and a job that
receives its layer near the limit still has the time to fetch it and to write its files.
"""

END_TIME = 5.0
"""The time that a job has to end after it is asked to, in seconds. It is then ended at once.

A job is asked to end with the signal SIGTERM, and ended at once with SIGKILL. Windows has neither for
a process: there the server releases the semaphore ``ending`` of the job, on which a thread of the job
raises SIGTERM inside the job, and it ends the job at once with ``TerminateProcess``.
"""

MAX_MESSAGE_LENGTH = 500
"""The largest length of a message of a job, in characters."""

REPORT_PAUSE = 0.25
"""The shortest time between two records of the progress of a job, in seconds."""

SIZE_PAUSE = 2.0
"""The time between two measurements of the size of the files of a running job, in seconds."""

NO_SPACE = "The server has too little free space on its disk for a new layer at present."
NOT_STARTED = "The job was not started because the server has too little free space on its disk."
SPACE_PASSED = "The job was ended because the server has too little free space on its disk."
WAITING = "The job waits for its turn."
STARTED = "The job has started."
READY = "The layer is ready."
SERIES_READY = "The series is ready."
DISMISSED = "The job was dismissed."
RESTARTED = "The server was restarted before the job finished. Start the job again."
FAULT = "The job failed because of an error in Lynkeus. The error was recorded."

_HIDDEN = "[Earthdata token]"

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Limits:
    """The limits of the jobs and of the layers of a server.

    A limit that is not given is the constant of this module, as it is when the limits are made: these
    are the limits of the project server. The first four come from its hardware; an own server
    replaces them by the limits of its owner. The next five protect a server that many visitors
    share, and None lifts one of them. The last three are those of an own server, whose layers may
    be larger than those of the project server; without them the project server works as before.

    Attributes
    ----------
    running_jobs : int
        Largest number of jobs that run at once.
    layer_size : int
        Largest size of the files of one layer, in bytes.
    holder_size : int
        Largest total size of the layers of one holder, in bytes.
    total_size : int
        Largest total size of the layers of all holders, in bytes.
    waiting_jobs : int or None
        Largest number of jobs of all holders that wait.
    holder_unfinished_jobs : int or None
        Largest number of jobs of one holder that wait or run.
    holder_layers : int or None
        Largest number of layers of one holder.
    free_space_reserve : int or None
        Free space that the jobs leave on the disk of the folder of the files, in bytes. None: the free
        space is not read.
    keep_time : float or None
        Time for which a layer and a series are kept, in seconds. None: they are kept without an end.
    layer_cells : int or None
        Largest number of cells of a layer that a job receives. None leaves the limit to the process
        (``lynkeus.harmony.MOST_CELLS``).
    work_size : int or None
        Largest size of the folder of a job while it runs, in bytes. It holds the temporary files of
        the job besides the files of the layer. None is ``layer_size``.
    job_time : float
        Longest time that a job may run, in seconds.
    """

    running_jobs: int = field(default_factory=lambda: MAX_RUNNING_JOBS)
    layer_size: int = field(default_factory=lambda: MAX_LAYER_SIZE)
    holder_size: int = field(default_factory=lambda: MAX_ACCOUNT_SIZE)
    total_size: int = field(default_factory=lambda: MAX_TOTAL_SIZE)
    waiting_jobs: int | None = field(default_factory=lambda: MAX_WAITING_JOBS)
    holder_unfinished_jobs: int | None = field(default_factory=lambda: MAX_ACCOUNT_UNFINISHED_JOBS)
    holder_layers: int | None = field(default_factory=lambda: MAX_ACCOUNT_LAYERS)
    free_space_reserve: int | None = field(default_factory=lambda: FREE_SPACE_RESERVE)
    keep_time: float | None = field(default_factory=lambda: KEEP_TIME)
    layer_cells: int | None = None
    work_size: int | None = None
    job_time: float = field(default_factory=lambda: JOB_TIME)

    def __post_init__(self) -> None:
        """Check that a job can run and that no limit is negative."""
        if self.running_jobs < 1:
            raise ValueError("at least one job must be able to run")
        if self.layer_cells is not None and self.layer_cells < 1:
            raise ValueError("a layer must be able to hold a cell")
        if self.job_time <= 0:
            raise ValueError("a job must have time to run")
        if self.keep_time is not None and self.keep_time <= 0:
            raise ValueError("a layer must be kept for some time")
        counts = (self.waiting_jobs, self.holder_unfinished_jobs, self.holder_layers)
        sizes = (self.layer_size, self.holder_size, self.total_size, self.work_size, self.free_space_reserve)
        if any(limit is not None and limit < 0 for limit in (*sizes, *counts)):
            raise ValueError("a limit cannot be negative")

    @property
    def folder_size(self) -> int:
        """The largest size of the folder of a job while it runs, in bytes."""
        return self.layer_size if self.work_size is None else self.work_size


class LimitError(Exception):
    """A limit of the server does not allow a new job. The message is a sentence for the visitor.

    Attributes
    ----------
    status : http.HTTPStatus
        Status code of the answer.
    wait : int or None
        Time after which the request may be repeated, in seconds.
    """

    def __init__(self, status: HTTPStatus, sentence: str, wait: int | None = None) -> None:
        super().__init__(sentence)
        self.status = status
        self.wait = wait


@dataclass
class _Running:
    job: JobRecord
    layer: str
    folder: Path
    process: BaseProcess
    connection: Connection
    ending: Semaphore
    writes: bool = True
    watcher: threading.Thread | None = None
    dismissed: bool = False
    ended: threading.Event = field(default_factory=threading.Event)


def _work(
    connection: Connection,
    run: Callable[[Any, Work], LayerDescription | SeriesDescription],
    inputs_format: type[BaseModel],
    inputs: str,
    errors: tuple[type[Exception], ...],
    layer: str,
    folder: Path,
    address: str,
    token: str | None,
    layers: Mapping[str, tuple[LayerDescription, Path]],
    ending: Semaphore,
    layer_cells: int | None = None,
) -> None:
    """Run the function of a process and send its reports and its result to the server.

    This is the whole of the operating-system process of a job. It leads a
    process group of its own, so that the server can end it together with
    every program that it started. The function runs in the main thread of
    the process, so it can set a handler for the signal that ends the job.
    Where the operating system has no process groups, a thread of the job
    raises that signal when the server releases ``ending``.
    """
    if hasattr(os, "setsid"):
        os.setsid()
    if not hasattr(os, "killpg"):
        threading.Thread(target=_raise_when_asked, args=(ending,), name="lynkeus-ending", daemon=True).start()

    def shown(text: str) -> str:
        return text.replace(token, _HIDDEN) if token else text

    def report(progress: int, message: str) -> None:
        connection.send(("report", max(0, min(100, int(progress))), shown(str(message))[:MAX_MESSAGE_LENGTH]))

    try:
        work = Work(
            layer_id=layer,
            folder=folder,
            address=address,
            token=token,
            layers=layers,
            report=report,
            layer_cells=layer_cells,
        )
        description = run(inputs_format.model_validate_json(inputs), work)
        if isinstance(description, SeriesDescription):
            connection.send(("series", description.model_dump_json()))
        elif isinstance(description, LayerDescription):
            connection.send(("layer", description.model_dump_json()))
        else:
            raise TypeError("the function of the process returned neither a layer description nor a series description")
    except Exception as error:
        sentence = shown(str(error))[:MAX_MESSAGE_LENGTH] if isinstance(error, errors) else None
        connection.send(("error", sentence, shown(traceback.format_exc())))
    finally:
        connection.close()


def _raise_when_asked(ending: Semaphore) -> None:
    """Wait until the server asks the job to end, and raise the signal SIGTERM inside the job.

    A handler that the function of the process set then runs in the main thread, as it does for a
    signal of the server. Without a handler the signal ends the operating-system process.

    The server asks by releasing a semaphore, which never waits for the job. An event would: the
    server would wait for ever on a job that had ended by itself a moment before.
    """
    ending.acquire()
    signal.raise_signal(signal.SIGTERM)


def free_space(folder: Path) -> int:
    """Return the free space of the disk that holds a folder, in bytes."""
    return shutil.disk_usage(folder).free


def _size(folder: Path) -> int:
    """Return the total size of the files of a folder, in bytes."""
    total = 0
    for path in folder.rglob("*"):
        try:
            total += path.stat().st_size if path.is_file() else 0
        except OSError:
            continue
    return total


def _signal(process: BaseProcess, sign: signal.Signals) -> None:
    """Send a signal to the process group of a job, or to the job alone while it leads no group yet."""
    if process.pid is not None and hasattr(os, "killpg"):
        try:
            os.killpg(process.pid, sign)
        except ProcessLookupError:
            pass
        else:
            return
    if process.is_alive() and sign == signal.SIGTERM:
        process.terminate()
    elif process.is_alive():
        process.kill()


def _end(process: BaseProcess, ending: Semaphore) -> None:
    """End the operating-system process of a job and every program that it started.

    Where the operating system has no process groups, the job is asked to end through ``ending``, and
    after ``END_TIME`` the job alone is ended: a program that it started is not.
    """
    if hasattr(os, "killpg"):
        _signal(process, signal.SIGTERM)
    else:
        ending.release()
    process.join(END_TIME)
    _signal(process, getattr(signal, "SIGKILL", signal.SIGTERM))
    process.join()


class Jobs:
    """Starts, watches and ends the jobs, and keeps the layers and the series that they produce.

    Parameters
    ----------
    store : Store
        Record of the sessions, jobs, layers and series.
    files : pathlib.Path
        Folder that holds one folder for the files of each layer.
    processes : mapping of str to Process
        The processes that the server offers, by name.
    address : str
        Address of ``files`` for the browser.
    limits : Limits, optional
        The limits of the jobs and of the layers, which ``set_limits`` replaces later. Without them the
        constants of this module apply, as they are at each moment.
    """

    def __init__(
        self,
        store: Store,
        files: Path,
        processes: Mapping[str, Process[Any]],
        address: str = "/files",
        limits: Limits | None = None,
    ) -> None:
        self._store = store
        self._files = files
        self._processes = processes
        self._address = address
        self._given = limits
        self._lock = threading.RLock()
        self._running: dict[str, _Running] = {}
        self._tokens: dict[str, str | None] = {}
        self._stopping = False
        self._spawn = multiprocessing.get_context("spawn")

    def start(self) -> None:
        """Bring the record and the files in order after a stop of the server.

        The jobs that the stop interrupted are recorded as failed, and files that belong to no layer
        are removed. On a server that keeps its layers for a time, a layer or a series without a moment
        of removal receives one: such a one comes from a record file of an earlier version, and it is
        kept for the keeping time from this moment.
        """
        now = time.time()
        for job in self._store.unfinished_jobs():
            self._store.fail_job(job.id, RESTARTED, now)
        kept = self._store.layer_names()
        for folder in self._files.iterdir():
            if folder.name not in kept:
                shutil.rmtree(folder, ignore_errors=True)
        keep_time = self.limits.keep_time
        if keep_time is not None:
            self._store.keep_unset(now + keep_time, now)

    def stop(self) -> None:
        """End every running job and wait until all have ended."""
        with self._lock:
            self._stopping = True
            running = list(self._running.values())
        for job in running:
            job.ended.set()
        for job in running:
            if job.watcher is not None:
                job.watcher.join()

    @property
    def limits(self) -> Limits:
        """The limits in force."""
        return Limits() if self._given is None else self._given

    def set_limits(self, limits: Limits) -> None:
        """Replace the limits, and start waiting jobs when more jobs may now run.

        A job that runs is not ended when fewer jobs may run; the next one starts when a place is free.
        """
        with self._lock:
            self._given = limits
            self._start_waiting()

    def submit[Inputs: BaseModel](
        self,
        holder: Holder,
        process: Process[Inputs],
        inputs: Inputs,
        response: str,
        token: str | None,
        job: str | None = None,
        title: str | None = None,
    ) -> JobRecord:
        """Record a new job of an account or of a session and start it when a place is free.

        Parameters
        ----------
        holder : Holder
            The account, or the session without an account, that starts the job.
        process : Process
            Process to run.
        inputs : pydantic.BaseModel
            Inputs, in the format of the process.
        response : {"raw", "document"}
            Form of the results that the request chose.
        token : str or None
            Earthdata token of the visitor.
        job : str, optional
            Name of the job, when another server gave it. Without it the job receives a new name.
        title : str, optional
            Name of the job for the visitor. Without it the process names the job from the inputs.

        Raises
        ------
        LimitError
            When a limit on jobs or on storage, or the free space of the disk, does not allow the job.
        """
        with self._lock:
            limits = self.limits
            unfinished = self._store.count_unfinished_jobs(holder)
            layers = len(self._store.layers_of(holder))
            if limits.holder_unfinished_jobs is not None and unfinished >= limits.holder_unfinished_jobs:
                sentence = (
                    f"You have {unfinished} jobs that wait or run, which is the most allowed. Wait for one to finish."
                )
                raise LimitError(HTTPStatus.TOO_MANY_REQUESTS, sentence)
            if limits.waiting_jobs is not None and self._store.count_waiting_jobs() >= limits.waiting_jobs:
                raise LimitError(
                    HTTPStatus.SERVICE_UNAVAILABLE, "Too many jobs wait at present. Try again in a few minutes.", 120
                )
            if process.output == SERIES_OUTPUT:
                if len(self._store.series_of(holder)) + unfinished >= MAX_ACCOUNT_SERIES:
                    sentence = f"You may keep at most {MAX_ACCOUNT_SERIES} series. Remove a series and try again."
                    raise LimitError(HTTPStatus.INSUFFICIENT_STORAGE, sentence)
            else:
                if limits.holder_layers is not None and layers + unfinished >= limits.holder_layers:
                    sentence = f"You may keep at most {limits.holder_layers} layers. Remove a layer and try again."
                    raise LimitError(HTTPStatus.INSUFFICIENT_STORAGE, sentence)
                if self._store.size_of_layers(holder) >= limits.holder_size:
                    size = f"{limits.holder_size / 1e9:g} gigabytes"
                    sentence = f"Your layers use the {size} that you may keep. Remove a layer and try again."
                    raise LimitError(HTTPStatus.INSUFFICIENT_STORAGE, sentence)
                if self._store.size_of_layers() >= limits.total_size:
                    raise LimitError(
                        HTTPStatus.INSUFFICIENT_STORAGE,
                        "The server has no space for more layers at present. Try again later.",
                    )
                if not self._has_space(limits.folder_size):
                    raise LimitError(HTTPStatus.INSUFFICIENT_STORAGE, NO_SPACE)
            now = time.time()
            record = JobRecord(
                id=job or secrets.token_hex(16),
                session=holder.session,
                process=process.id,
                title=title or process.job_title(inputs),
                inputs=inputs.model_dump_json(),
                response=response,
                status="accepted",
                message=WAITING,
                progress=0,
                created=now,
                started=None,
                finished=None,
                updated=now,
                layer=None,
                owner=holder.account,
            )
            self._store.add_job(record)
            self._store.keep_latest_jobs(holder, MAX_ACCOUNT_FINISHED_JOBS, MAX_ACCOUNT_DISMISSED_JOBS)
            self._tokens[record.id] = token
            self._start_waiting()
            return record

    def _has_space(self, needed: int) -> bool:
        """Tell whether the disk of the files has ``needed`` bytes free beyond the reserve.

        Without a reserve the free space is not read. A disk whose free space cannot be read counts as
        a disk without space, so that a fault of the disk does not start a job.
        """
        reserve = self.limits.free_space_reserve
        if reserve is None:
            return True
        try:
            return free_space(self._files) >= reserve + needed
        except OSError:
            logger.exception("The free space of the folder of the files could not be read.")
            return False

    def dismiss(self, job: JobRecord) -> JobRecord:
        """End a job that waits or runs, and remove the record of a finished job.

        The name of the job is kept, so that a later request for it can be
        answered with 410 Gone. The layer of a successful job stays.
        """
        with self._lock:
            self._store.dismiss_job(job.id, DISMISSED, time.time())
            self._tokens.pop(job.id, None)
            running = self._running.get(job.id)
            if running is not None:
                running.dismissed = True
                running.ended.set()
            return self._store.job(job.id) or job

    def rename_layer(self, holder: Holder, layer: str, title: str) -> LayerRecord | None:
        """Give a layer of an account or of a session a new title, in its description and in its STAC record.

        The record is changed only when it holds a title, in the field
        ``title`` of its ``properties``.

        Returns
        -------
        LayerRecord or None
            The layer with its new title, or None when the holder has no layer of this name.
        """
        with self._lock:
            record = self._store.layer(layer)
            if record is None or record.holder != holder:
                return None
            description = LayerDescription.model_validate({**json.loads(record.description), "title": title})
            folder = self._files / layer
            path = folder / description.record.rsplit("/", 1)[-1]
            try:
                item = json.loads(path.read_text(encoding="utf-8"))
                if "title" in item["properties"]:
                    item["properties"]["title"] = title
                    temporary = path.with_name(path.name + ".tmp")
                    temporary.write_text(json.dumps(item, ensure_ascii=False, indent=2), encoding="utf-8")
                    temporary.chmod(0o644)
                    temporary.replace(path)
            except (OSError, ValueError, KeyError, TypeError):
                logger.exception("The STAC record of the layer %s could not be given its new title.", layer)
            self._store.change_layer(layer, description.model_dump_json(), _size(folder))
            return self._store.layer(layer)

    def remove_layer(self, holder: Holder, layer: str) -> bool:
        """Remove a layer of an account or of a session with its files and the record of the job that produced it.

        Returns
        -------
        bool
            False when the holder has no layer of this name.
        """
        record = self._store.layer(layer)
        if record is None or record.holder != holder:
            return False
        self._store.remove_layer(layer)
        shutil.rmtree(self._files / layer, ignore_errors=True)
        return True

    def rename_series(self, holder: Holder, series: str, title: str) -> SeriesRecord | None:
        """Give a series of an account or of a session a new title.

        Returns
        -------
        SeriesRecord or None
            The series with its new title, or None when the holder has no series of this name.
        """
        with self._lock:
            record = self._store.series(series)
            if record is None or record.holder != holder:
                return None
            description = SeriesDescription.model_validate({**json.loads(record.description), "title": title})
            self._store.change_series(series, description.model_dump_json())
            return self._store.series(series)

    def remove_series(self, holder: Holder, series: str) -> bool:
        """Remove a series of an account or of a session and the record of the job that produced it.

        Returns
        -------
        bool
            False when the holder has no series of this name.
        """
        record = self._store.series(series)
        if record is None or record.holder != holder:
            return False
        self._store.remove_series(series)
        return True

    # The keeping time

    def keep_layer(self, holder: Holder, layer: str) -> LayerRecord | None:
        """Keep a layer of an account or of a session for the keeping time from now.

        Returns
        -------
        LayerRecord or None
            The layer with its new moment of removal, or None when the holder has no layer of this name.
            On a server that keeps its layers without an end the layer is returned as it is.
        """
        record = self._store.layer(layer)
        if record is None or record.holder != holder:
            return None
        keep_time = self.limits.keep_time
        if keep_time is not None:
            self._store.keep_layer(layer, time.time() + keep_time)
        return self._store.layer(layer)

    def keep_series(self, holder: Holder, series: str) -> SeriesRecord | None:
        """Keep a series of an account or of a session for the keeping time from now.

        Returns
        -------
        SeriesRecord or None
            The series with its new moment of removal, or None when the holder has no series of this name.
        """
        record = self._store.series(series)
        if record is None or record.holder != holder:
            return None
        keep_time = self.limits.keep_time
        if keep_time is not None:
            self._store.keep_series(series, time.time() + keep_time)
        return self._store.series(series)

    def keep_all(self, holder: Holder) -> None:
        """Keep every layer and series of an account or of a session for the keeping time from now."""
        keep_time = self.limits.keep_time
        if keep_time is not None:
            self._store.keep_all(holder, time.time() + keep_time)

    def remove_passed(self, now: float | None = None) -> None:
        """Remove what has passed its keeping time.

        These are the layers and the series whose moment of removal has passed, each with its files
        and the record of the job that produced it, and the records of the failed and of the dismissed
        jobs that ended more than the keeping time ago. Who is signed in makes no difference.

        Parameters
        ----------
        now : float, optional
            Present time, in seconds since 1 January 1970 (UTC).
        """
        keep_time = self.limits.keep_time
        if keep_time is None:
            return
        now = time.time() if now is None else now
        for layer in self._store.layers_kept_until(now):
            self._store.remove_layer(layer.id)
            shutil.rmtree(self._files / layer.id, ignore_errors=True)
        for series in self._store.series_kept_until(now):
            self._store.remove_series(series.id)
        self._store.remove_jobs_ended_before(now - keep_time)

    def remove_content(self, holder: Holder) -> None:
        """End the jobs of a holder, and remove its layers with their files, its series and its job records."""
        with self._lock:
            for job in self._store.jobs_of(holder):
                if job.status in ("accepted", "running"):
                    self.dismiss(job)
            layers = self._store.remove_content(holder)
        for layer in layers:
            shutil.rmtree(self._files / layer, ignore_errors=True)

    def end_session(self, session: str) -> None:
        """End a session.

        What the account of the session holds stays. A session without an account holds its jobs,
        layers and series itself: its jobs are ended, and they are removed with it, the files of the
        layers too.
        """
        holder = Holder(session=session)
        with self._lock:
            for job in self._store.jobs_of(holder):
                if job.status in ("accepted", "running"):
                    self.dismiss(job)
            layers = self._store.layers_of(holder)
            self._store.remove_session(session)
        for layer in layers:
            shutil.rmtree(self._files / layer.id, ignore_errors=True)

    def _start_waiting(self) -> None:
        """Start waiting jobs, the one that has waited longest first, while a place is free."""
        with self._lock:
            while not self._stopping and len(self._running) < self.limits.running_jobs:
                job = self._store.next_waiting_job()
                if job is None:
                    return
                self._start(job)

    def _start(self, job: JobRecord) -> None:
        token = self._tokens.pop(job.id, None)
        process = self._processes.get(job.process)
        if process is None:
            self._store.fail_job(job.id, FAULT, time.time())
            logger.error("Job %s names the process %s, which the server does not offer.", job.id, job.process)
            return
        if process.output != SERIES_OUTPUT and not self._has_space(self.limits.folder_size):
            self._store.fail_job(job.id, NOT_STARTED, time.time())
            return
        layer = secrets.token_hex(16)
        folder = self._files / layer
        layers = {
            record.id: (description, self._files / record.id / description.url.rsplit("/", 1)[-1])
            for record in self._store.layers_of(job.holder)
            for description in [LayerDescription.model_validate_json(record.description)]
        }
        receiving, sending = self._spawn.Pipe(duplex=False)
        ending = self._spawn.Semaphore(0)
        address = f"{self._address}/{layer}"
        arguments = (
            sending,
            process.run,
            process.inputs,
            job.inputs,
            process.errors,
            layer,
            folder,
            address,
            token,
            layers,
            ending,
            self.limits.layer_cells,
        )
        worker = self._spawn.Process(target=_work, args=arguments, name=f"lynkeus-job-{job.id}", daemon=True)
        try:
            folder.mkdir(mode=0o755)
            worker.start()
        except Exception:
            receiving.close()
            sending.close()
            shutil.rmtree(folder, ignore_errors=True)
            self._store.fail_job(job.id, FAULT, time.time())
            logger.exception("Job %s could not be started.", job.id)
            return
        sending.close()
        self._store.start_job(job.id, STARTED, time.time())
        running = _Running(
            job=job,
            layer=layer,
            folder=folder,
            process=worker,
            connection=receiving,
            ending=ending,
            writes=process.output != SERIES_OUTPUT,
        )
        running.watcher = threading.Thread(
            target=self._watch, args=(running,), name=f"lynkeus-watch-{job.id}", daemon=True
        )
        self._running[job.id] = running
        running.watcher.start()

    def _watch(self, running: _Running) -> None:
        """Receive the reports of a running job until it ends, and end it when a limit is passed."""
        job, connection = running.job, running.connection
        result: tuple[Any, ...] | None = None
        failure: str | None = None
        report: tuple[int, str] | None = None
        latest = time.monotonic()
        job_time = self.limits.job_time
        limit, measured, recorded = latest + job_time, latest, latest - REPORT_PAUSE
        while not running.ended.is_set():
            if connection.poll(0.2):
                try:
                    message = connection.recv()
                except (EOFError, OSError):
                    break
                if message[0] != "report":
                    result = message
                    break
                report = (message[1], message[2])
            elif not running.process.is_alive() and not connection.poll():
                break
            latest = time.monotonic()
            if report is not None and latest - recorded >= REPORT_PAUSE:
                self._store.report_job(job.id, report[0], report[1], time.time())
                report, recorded = None, latest
            if latest > limit:
                failure = f"The job was ended because it ran for more than {job_time / 60:g} minutes."
                break
            if latest - measured >= SIZE_PAUSE:
                measured = latest
                limits = self.limits
                if _size(running.folder) > limits.folder_size:
                    failure = _too_large(limits.layer_size)
                    break
                if running.writes and not self._has_space(0):
                    failure = SPACE_PASSED
                    break
        _end(running.process, running.ending)
        code = running.process.exitcode
        connection.close()
        try:
            self._finish(running, result, failure, code)
        except Exception:
            self._store.fail_job(job.id, FAULT, time.time())
            logger.exception("The result of job %s could not be recorded.", job.id)
        with self._lock:
            del self._running[job.id]
            if self._store.job(job.id) is None or self._store.layer(running.layer) is None:
                shutil.rmtree(running.folder, ignore_errors=True)
            self._start_waiting()

    def _finish(self, running: _Running, result: tuple[Any, ...] | None, failure: str | None, code: int | None) -> None:
        """Record how a job ended."""
        job, now = running.job, time.time()
        if running.dismissed:
            return
        if self._stopping:
            self._store.fail_job(job.id, RESTARTED, now)
        elif failure is not None:
            self._store.fail_job(job.id, failure, now)
        elif result is None:
            self._store.fail_job(job.id, FAULT, now)
            logger.error(
                "Job %s of the process %s ended with exit code %s and sent no result.", job.id, job.process, code
            )
        elif result[0] == "error":
            self._store.fail_job(job.id, result[1] or FAULT, now)
            logger.error("Job %s of the process %s failed.\n%s", job.id, job.process, result[2])
        else:
            keep = self._keep_series if result[0] == "series" else self._keep_layer
            failure = keep(running, str(result[1]), now)
            if failure is not None:
                self._store.fail_job(job.id, failure, now)

    def _keep_series(self, running: _Running, text: str, now: float) -> str | None:
        """Record the series of a job, and return a sentence when the series cannot be kept.

        A series has no files: its description holds all its values. The folder of the job stays empty and is
        removed when the job has ended.
        """
        job = running.job
        process = self._processes.get(job.process)
        try:
            description = SeriesDescription.model_validate_json(text)
        except ValidationError:
            logger.exception("Job %s of the process %s returned a wrong series description.", job.id, job.process)
            return FAULT
        if process is None or process.output != SERIES_OUTPUT or description.id != running.layer:
            logger.error("Job %s of the process %s named its series wrongly: %s", job.id, job.process, text)
            return FAULT
        if len(self._store.series_of(job.holder)) >= MAX_ACCOUNT_SERIES:
            return f"You may keep at most {MAX_ACCOUNT_SERIES} series. Remove a series and start again."
        series = SeriesRecord(
            id=running.layer,
            session=job.session,
            description=description.model_dump_json(),
            created=now,
            owner=job.owner,
            kept_until=self._kept_until(now),
        )
        self._store.succeed_job_with_series(job.id, SERIES_READY, series)
        return None

    def _keep_layer(self, running: _Running, text: str, now: float) -> str | None:
        """Record the layer of a job, and return a sentence when the layer cannot be kept."""
        job, address = running.job, f"{self._address}/{running.layer}/"
        process = self._processes.get(job.process)
        if process is not None and process.output == SERIES_OUTPUT:
            logger.error("Job %s of the process %s returned a layer in the place of a series.", job.id, job.process)
            return FAULT
        try:
            description = LayerDescription.model_validate_json(text)
        except ValidationError:
            logger.exception("Job %s of the process %s returned a wrong layer description.", job.id, job.process)
            return FAULT
        image, record = description.url.removeprefix(address), description.record.removeprefix(address)
        named_well = (
            description.id == running.layer
            and description.url == address + image
            and description.record == address + record
            and image.endswith(".tif")
            and record.endswith(".json")
            and "/" not in image + record
        )
        if not named_well or not (running.folder / image).is_file() or not (running.folder / record).is_file():
            logger.error("Job %s of the process %s named its layer or its files wrongly: %s", job.id, job.process, text)
            return FAULT
        for path in running.folder.iterdir():
            if path.name in (image, record):
                path.chmod(0o644)
            elif path.is_dir():
                shutil.rmtree(path, ignore_errors=True)
            else:
                path.unlink()
        size = _size(running.folder)
        limits = self.limits
        if size > limits.layer_size:
            return _too_large(limits.layer_size)
        if self._store.size_of_layers(job.holder) + size > limits.holder_size:
            return "The layer does not fit in the space that is left for your layers. Remove a layer and start again."
        layer = LayerRecord(
            id=running.layer,
            session=job.session,
            description=description.model_dump_json(),
            size=size,
            created=now,
            owner=job.owner,
            kept_until=self._kept_until(now),
        )
        self._store.succeed_job(job.id, READY, layer)
        return None

    def _kept_until(self, now: float) -> float | None:
        """Return the moment until which a layer or a series made now is kept, or None when it has no end."""
        keep_time = self.limits.keep_time
        return None if keep_time is None else now + keep_time


def _too_large(limit: int) -> str:
    return f"The job was ended because its layer is larger than {limit / 1e6:g} megabytes."
