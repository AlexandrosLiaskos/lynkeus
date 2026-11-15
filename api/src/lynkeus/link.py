"""The connection of an own server with the project server.

Lynkeus Server runs on a computer of a visitor. ``Link`` pairs it with the project server, keeps one
question for tasks open, carries out every task and reports the state of the computer and of its
jobs, as ``docs/Own_Servers.md`` rules. The jobs run through ``lynkeus.jobs`` with the processes of
``lynkeus.offered``, and their layers are kept in the data folder of the computer.

Every connection is opened by this program, over HTTPS with a checked certificate. When the network
or the project server is away, the program waits and tries again, and the jobs go on meanwhile. The
Earthdata token of a job passes from its task to ``lynkeus.jobs`` and is never written or reported.
"""

import contextlib
import hashlib
import http.client
import ipaddress
import logging
import ssl
import threading
import time
import urllib.parse
import urllib.request
from base64 import b64encode
from collections.abc import Mapping, Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import certifi
from pydantic import ValidationError

from lynkeus import __version__, computer
from lynkeus.computer import Settings
from lynkeus.jobs import Jobs, LimitError, Limits
from lynkeus.layers import Format, LayerDescription
from lynkeus.linking import (
    MOST_BYTES,
    MOST_WAIT,
    REPORT_PAUSE,
    DismissTask,
    Done,
    ForgetTask,
    JobState,
    LimitsTask,
    Machine,
    Pairing,
    PairingKey,
    PairingQuestion,
    PairingRefusal,
    ReadFailure,
    ReadTask,
    RemoveTask,
    RenameTask,
    Report,
    ServerLimits,
    ServerState,
    StartTask,
    Task,
    Tasks,
)
from lynkeus.processes import Process
from lynkeus.store import JobRecord, Store

PROJECT_SERVER = "https://lynkeus.nkua.cloud"
"""The address of the project server."""

ANSWER_TIME = 30.0
"""The longest time that the program waits for an answer of the project server, in seconds.

A question for tasks is held open by the project server, so it has ``MOST_WAIT`` seconds more.
"""

MOST_ANSWER = 4_000_000
"""The largest answer of the project server that the program reads, in bytes."""

FIRST_RETRY = 1.0
"""The time after which the program tries again when the project server did not answer, in seconds.

The time doubles with every failure in a row, up to ``LONGEST_RETRY``.
"""

LONGEST_RETRY = 30.0
"""The longest time between two tries to reach the project server, in seconds."""

CHANGE_PAUSE = 1.0
"""The time between two looks at the jobs for a change of state, in seconds. No report follows another sooner."""

MOST_REPORTED_JOBS = 20
"""The largest number of jobs that one report names. The others follow in the next report."""

READERS = 4
"""The number of tasks that read a file which the program answers at the same time."""

ANSWER_TRIES = 3
"""The number of times that the program tries to send the answer to a task."""

SLOW_DOWN = 5
"""The time that the answer ``slow_down`` adds between two questions about a pairing, in seconds (RFC 8628)."""

JSON = "application/json"
BYTES = "application/octet-stream"
FAULT = "Lynkeus Server could not carry out the task because of an internal error."
NO_ANSWER = "The project server does not answer. Lynkeus Server tries again."

logger = logging.getLogger(__name__)


class AwayError(Exception):
    """The project server could not be reached, or did not answer. The message is a sentence for the user."""


class RemovedError(Exception):
    """The project server no longer knows the key: the owner removed this server on the site."""


class _StoppedError(Exception):
    """The program was asked to stop."""


@dataclass(frozen=True)
class JobView:
    """A job that runs or waits, as the program shows it.

    Attributes
    ----------
    title : str
        Name of the job.
    status : {"accepted", "running"}
        ``accepted`` for a job that waits for its turn.
    progress : int
        Part of the work that is done, in percent.
    message : str
        One sentence about the present step.
    """

    title: str
    status: str
    progress: int
    message: str


@dataclass(frozen=True)
class View:
    """What the program shows to the user of the computer.

    Attributes
    ----------
    version : str
        Version of Lynkeus Server.
    folder : pathlib.Path
        Data folder.
    site : str
        Address of Lynkeus for the browser.
    code : str or None
        Code of the pairing that waits for the visitor, or None.
    address : str or None
        Address at which the visitor types the code.
    complete : str or None
        The same address with the code in it.
    paired : bool
        Whether the server is paired with an Earthdata user.
    connected : bool
        Whether the last question to the project server was answered.
    user : str or None
        Earthdata user name of the owner, when the project server stated it.
    problem : str or None
        One sentence about why the server is not connected, or None.
    jobs : tuple of JobView
        The jobs that run, then the jobs that wait.
    used : int
        Space that the layers use, in bytes.
    storage : int or None
        Most space that the layers may use, in bytes, or None before the limits are derived.
    layers : int
        Number of layers that the server keeps.
    """

    version: str
    folder: Path
    site: str
    code: str | None
    address: str | None
    complete: str | None
    paired: bool
    connected: bool
    user: str | None
    problem: str | None
    jobs: tuple[JobView, ...]
    used: int
    storage: int | None
    layers: int


def _is_this_computer(host: str) -> bool:
    """Tell whether a host name is an address of this computer itself."""
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


class ProjectServer:
    """The requests of the program to the project server.

    Every thread keeps one connection open and uses it for all its requests. The proxy that the
    operating system or the environment names for the address is used.

    Parameters
    ----------
    address : str
        Address of the project server. It starts with ``https://``. ``http://`` is taken only for an
        address of this computer itself, which the tests use.

    Raises
    ------
    ValueError
        When the address is of another form.
    """

    def __init__(self, address: str = PROJECT_SERVER) -> None:
        parts = urllib.parse.urlsplit(address)
        host = parts.hostname or ""
        if parts.scheme not in ("https", "http") or not host or parts.path.strip("/") or parts.query or parts.fragment:
            raise ValueError("the address of the project server has the form https://name")
        if parts.username or parts.password:
            raise ValueError("the address of the project server holds no user name")
        if parts.scheme == "http" and not _is_this_computer(host):
            raise ValueError("the address of the project server must start with https://")
        self.address = address.rstrip("/")
        self._secure = parts.scheme == "https"
        self._host = host
        self._port = parts.port or (443 if self._secure else 80)
        self._local = threading.local()
        self._lock = threading.Lock()
        self._open: set[http.client.HTTPConnection] = set()
        self._interruptions = 0
        self._context: ssl.SSLContext | None = None

    def _checked(self) -> ssl.SSLContext:
        """Return the settings of a connection whose certificate is checked.

        The certificate must be valid for the name of the project server and be issued by an authority
        that the operating system or the list of ``certifi`` trusts. A packed program on macOS or
        Linux may find no list of the operating system, so both are read.
        """
        if self._context is None:
            context = ssl.create_default_context()
            context.load_verify_locations(certifi.where())
            self._context = context
        return self._context

    def _connect(self, wait: float) -> http.client.HTTPConnection:
        """Open a connection, through the proxy of the system when it names one for the address."""
        scheme = "https" if self._secure else "http"
        proxy = None
        if not _is_this_computer(self._host) and not urllib.request.proxy_bypass(self._host):
            proxy = urllib.request.getproxies().get(scheme)
        target = urllib.parse.urlsplit(proxy if "//" in proxy else f"http://{proxy}") if proxy else None
        host, port = (target.hostname, target.port or 8080) if target and target.hostname else (self._host, self._port)
        connection: http.client.HTTPConnection
        if self._secure:
            connection = http.client.HTTPSConnection(host, port, timeout=wait, context=self._checked())
        else:
            connection = http.client.HTTPConnection(host, port, timeout=wait)
        if target and target.hostname:
            headers = {}
            if target.username:
                secret = f"{urllib.parse.unquote(target.username)}:{urllib.parse.unquote(target.password or '')}"
                headers["Proxy-Authorization"] = "Basic " + b64encode(secret.encode()).decode()
            connection.set_tunnel(self._host, self._port, headers)
        with self._lock:
            self._open.add(connection)
        return connection

    def _drop(self) -> None:
        """Close the connection of this thread."""
        connection: http.client.HTTPConnection | None = getattr(self._local, "connection", None)
        self._local.connection = None
        if connection is not None:
            with self._lock:
                self._open.discard(connection)
            connection.close()

    def ask(
        self,
        path: str,
        body: bytes | None = None,
        *,
        key: str | None = None,
        kind: str = JSON,
        headers: Mapping[str, str] | None = None,
        wait: float = ANSWER_TIME,
    ) -> tuple[int, bytes]:
        """Send a POST request and return the status and the body of the answer.

        Parameters
        ----------
        path : str
            Path of the address, with its parameters.
        body : bytes, optional
            Body of the request.
        key : str, optional
            Key of the paired server, sent as ``Authorization: Bearer``.
        kind : str
            Media type of the body.
        headers : mapping of str to str, optional
            Further headers.
        wait : float
            Longest time to wait for the answer, in seconds.

        Raises
        ------
        AwayError
            When the project server could not be reached, did not answer in time, showed a
            certificate that is not valid, or answered with more than ``MOST_ANSWER`` bytes.
        """
        sent = {"Accept": JSON, "User-Agent": f"Lynkeus-Server/{__version__}", **(headers or {})}
        if body is not None:
            sent["Content-Type"] = kind
        sent["Content-Length"] = str(len(body or b""))
        if key is not None:
            sent["Authorization"] = f"Bearer {key}"
        # A connection that the project server closed while it was not in use fails at the next
        # request. The request is then sent once more over a new connection.
        interruptions = self._interruptions
        if getattr(self._local, "interruptions", interruptions) != interruptions:
            # The connection of this thread was closed by ``interrupt``, and it is not used again.
            self._drop()
        self._local.interruptions = interruptions
        for first in (True, False):
            connection: http.client.HTTPConnection | None = getattr(self._local, "connection", None)
            used = connection is not None
            try:
                if connection is None:
                    connection = self._local.connection = self._connect(wait)
                connection.timeout = wait
                if connection.sock is not None:
                    connection.sock.settimeout(wait)
                connection.request("POST", path, body=body, headers=sent)
                response = connection.getresponse()
                answer = response.read(MOST_ANSWER + 1)
                if len(answer) > MOST_ANSWER:
                    raise AwayError("The project server sent an answer that is too large.")
                if response.will_close:
                    self._drop()
                return response.status, answer
            except AwayError:
                self._drop()
                raise
            except ssl.SSLCertVerificationError as error:
                self._drop()
                raise AwayError(
                    "The certificate of the project server could not be verified, so nothing was sent."
                ) from error
            except (OSError, http.client.HTTPException) as error:
                self._drop()
                if not (first and used) or interruptions != self._interruptions:
                    raise AwayError(NO_ANSWER) from error
        raise AwayError(NO_ANSWER)

    def interrupt(self) -> None:
        """Close the connections of all threads, so that a thread that waits for an answer stops waiting."""
        with self._lock:
            self._interruptions += 1
            connections = list(self._open)
            self._open.clear()
        for connection in connections:
            sock = connection.sock
            if sock is not None:
                with contextlib.suppress(OSError):
                    sock.shutdown(2)
            with contextlib.suppress(OSError):
                connection.close()


def job_limits(limits: ServerLimits, others: int) -> Limits:
    """Return the limits of the jobs of an own server from the limits of its owner.

    Parameters
    ----------
    limits : ServerLimits
        Limits that the owner set.
    others : int
        Space that layers of earlier pairings use on the disk, in bytes. They count towards the
        storage of the owner.

    Returns
    -------
    lynkeus.jobs.Limits
        The running jobs and the size of a layer of the owner. The storage of the owner is the
        largest total size, and less ``others`` it is the size left for the layers of the pairing. The
        numbers of waiting jobs, of unfinished jobs and of layers have no limit: the project server
        decides how many jobs it passes on.
    """
    return Limits(
        running_jobs=limits.running_jobs,
        layer_size=limits.layer_size,
        session_size=max(limits.storage - others, 0),
        total_size=limits.storage,
        waiting_jobs=None,
        session_unfinished_jobs=None,
        session_layers=None,
    )


class Link:
    """An own server: its pairing, its connection with the project server and its jobs.

    Parameters
    ----------
    folder : pathlib.Path
        Data folder. It is created when it does not exist.
    processes : sequence of Process
        The processes that the server runs.
    address : str
        Address of the project server.

    Raises
    ------
    ValueError
        When the address is not one of a project server, or two processes have the same name.
    lynkeus.computer.AlreadyRunningError
        When another Lynkeus Server runs on the data folder.
    """

    def __init__(
        self,
        folder: Path,
        processes: Sequence[Process[Any]],
        address: str = PROJECT_SERVER,
    ) -> None:
        self._server = ProjectServer(address)
        self._processes = {process.id: process for process in processes}
        if len(self._processes) != len(processes):
            raise ValueError("two processes have the same name")
        self.folder = folder
        self._files = folder / computer.FILES
        self._files.mkdir(parents=True, exist_ok=True)
        self._held = computer.hold(folder)
        try:
            self._store = Store(folder / computer.RECORD)
        except Exception:
            self._held.close()
            raise
        self._settings = computer.read_settings(folder)
        self._lock = threading.RLock()
        self._stop = threading.Event()
        self._removed = threading.Event()
        self._thread = threading.Thread(target=self._run, name="lynkeus-link", daemon=True)
        self._jobs: Jobs | None = None
        self._pairing: Pairing | None = None
        self._connected = False
        self._problem: str | None = None
        self._acknowledged: dict[str, float] = {}
        self._dismissed: set[str] = set()
        self._system = computer.system_name()

    # What the program shows

    def view(self) -> View:
        """Return what the program shows at present."""
        with self._lock:
            settings, pairing = self._settings, self._pairing
            session = settings.server
            unfinished = [job for job in self._store.unfinished_jobs() if job.session == session]
            unfinished.sort(key=lambda job: (job.status != "running", job.created))
            return View(
                version=__version__,
                folder=self.folder,
                site=self._server.address,
                code=pairing.user_code if pairing else None,
                address=pairing.verification_uri if pairing else None,
                complete=pairing.verification_uri_complete if pairing else None,
                paired=settings.key is not None,
                connected=self._connected,
                user=settings.user,
                problem=self._problem,
                jobs=tuple(JobView(job.title, job.status, job.progress, job.message) for job in unfinished),
                used=self._store.size_of_layers(),
                storage=settings.limits.storage if settings.limits else None,
                layers=len(self._store.layer_names()),
            )

    def _note(self, connected: bool, problem: str | None = None) -> None:
        """Record whether the project server answers, with one sentence when it does not."""
        with self._lock:
            changed = (self._connected, self._problem) != (connected, problem)
            self._connected, self._problem = connected, problem
        if changed and problem:
            logger.warning("%s", problem)

    # Start and stop

    def start(self) -> None:
        """Start the connection, in a thread of its own."""
        self._thread.start()

    def stop(self) -> None:
        """End the running jobs, report their end when the project server answers, and close the record."""
        self._stop.set()
        self._server.interrupt()
        if self._thread.is_alive():
            self._thread.join()
        self._server.interrupt()
        self._store.close()
        self._held.close()

    def _run(self) -> None:
        """Pair the server when it is not paired, and serve the project server while it is."""
        while not self._stop.is_set():
            try:
                if self._settings.key is None:
                    self._pair()
                else:
                    self._serve()
            except _StoppedError:
                return
            except Exception:
                logger.exception("The connection with the project server met an error and starts again.")
                self._note(False, "Lynkeus Server met an internal error. It starts the connection again.")
                self._stop.wait(LONGEST_RETRY)

    def _pause(self, seconds: float) -> None:
        """Wait for a time, or raise when the program is asked to stop."""
        if self._stop.wait(seconds):
            raise _StoppedError

    # Pairing

    def _pair(self) -> None:
        """Ask for a pairing, show its code and ask until the visitor has confirmed it on the site."""
        machine = Machine(name=computer.computer_name(), system=self._system, version=__version__)
        retry = FIRST_RETRY
        while True:
            try:
                status, answer = self._server.ask("/api/link/pairings", machine.model_dump_json().encode())
                if status != 200:
                    raise AwayError(f"The project server answered the request for a pairing with the status {status}.")
                pairing = Pairing.model_validate_json(answer)
                break
            except (AwayError, ValidationError) as error:
                sentence = str(error) if isinstance(error, AwayError) else "The project server sent an unknown answer."
                self._note(False, sentence)
                self._pause(retry)
                retry = min(retry * 2, LONGEST_RETRY)
        with self._lock:
            self._pairing = pairing
        self._note(True)
        logger.info("A pairing was started. Its code is %s.", pairing.user_code)
        try:
            key = self._await_confirmation(pairing)
        finally:
            with self._lock:
                self._pairing = None
        if key is None:
            return
        with self._lock:
            limits = self._settings.limits or computer.first_limits(
                computer.processors(), computer.memory(), computer.free_space(self._files)
            )
            self._settings = Settings(server=key.server, key=key.key, user=key.user, limits=limits)
            computer.write_settings(self.folder, self._settings)
        logger.info("The server was paired under the name %s.", key.server)

    def _await_confirmation(self, pairing: Pairing) -> PairingKey | None:
        """Ask whether the visitor has confirmed a pairing, until its codes are no longer valid."""
        question = PairingQuestion(device_code=pairing.device_code).model_dump_json().encode()
        end = time.monotonic() + pairing.expires_in
        interval = float(pairing.interval)
        while time.monotonic() < end:
            self._pause(interval)
            try:
                status, answer = self._server.ask("/api/link/pairings/token", question)
            except AwayError as error:
                self._note(False, str(error))
                continue
            try:
                if status == 200:
                    self._note(True)
                    return PairingKey.model_validate_json(answer)
                if status != 400:
                    self._note(False, f"The project server answered the question about the pairing with {status}.")
                    continue
                refusal = PairingRefusal.model_validate_json(answer).error
            except ValidationError:
                self._note(False, "The project server sent an unknown answer about the pairing.")
                continue
            self._note(True)
            if refusal == "slow_down":
                interval += SLOW_DOWN
            elif refusal != "authorization_pending":
                return None
        return None

    def _forget(self) -> None:
        """Forget the pairing. The limits and the files of the layers stay."""
        with self._lock:
            logger.info("The pairing of the server %s was forgotten.", self._settings.server)
            self._settings = Settings(limits=self._settings.limits)
            computer.write_settings(self.folder, self._settings)
            self._acknowledged.clear()
            self._dismissed.clear()
        self._note(False)

    # A paired server

    def _serve(self) -> None:
        """Run the jobs and carry out the tasks of the project server until the pairing ends or the program stops."""
        with self._lock:
            if self._settings.limits is None:
                first = computer.first_limits(
                    computer.processors(), computer.memory(), computer.free_space(self._files)
                )
                self._settings = self._settings.model_copy(update={"limits": first})
                computer.write_settings(self.folder, self._settings)
            server, key, limits = self._settings.server, self._settings.key, self._settings.limits
        if server is None or key is None or limits is None:
            raise RuntimeError("the server is not paired")
        digest = hashlib.sha256(key.encode()).hexdigest()
        if self._store.session_of_key(digest) is None:
            self._store.add_session(server, digest, time.time())
        # A layer whose folder the user deleted by hand is no longer kept.
        for layer in self._store.layer_names():
            if not (self._files / layer).is_dir():
                self._store.remove_layer(layer)
        jobs = Jobs(
            self._store,
            self._files,
            self._processes,
            address=f"/api/servers/{server}/files",
            limits=job_limits(limits, self._others(server)),
        )
        jobs.start()
        self._removed.clear()
        with self._lock:
            self._jobs = jobs
        reporter = threading.Thread(
            target=self._report_changes, args=(server, key), name="lynkeus-reports", daemon=True
        )
        readers = ThreadPoolExecutor(READERS, thread_name_prefix="lynkeus-read")
        reporter.start()
        removed = False
        try:
            self._follow_tasks(server, key, readers)
        except RemovedError:
            removed = True
        finally:
            self._removed.set()
            readers.shutdown(wait=True, cancel_futures=True)
            reporter.join()
            # The connections of the threads that have ended are closed.
            self._server.interrupt()
            jobs.stop()
            with self._lock:
                self._jobs = None
            if removed:
                self._forget()
            else:
                # The program stops: the jobs that it ended are reported once more, when the project server answers.
                with contextlib.suppress(AwayError, RemovedError):
                    self._report(server, key, due=True)

    def _others(self, server: str) -> int:
        """Return the space that the layers of earlier pairings use, in bytes."""
        return self._store.size_of_layers() - self._store.size_of_layers(server)

    def _follow_tasks(self, server: str, key: str, readers: ThreadPoolExecutor) -> None:
        """Keep one question for tasks open, and carry out the tasks of every answer."""
        retry = FIRST_RETRY
        while True:
            if self._stop.is_set():
                raise _StoppedError
            if self._removed.is_set():
                raise RemovedError
            sentence = None
            tasks: tuple[Task, ...] = ()
            try:
                status, answer = self._server.ask(
                    f"/api/link/tasks?wait={MOST_WAIT}", key=key, wait=MOST_WAIT + ANSWER_TIME
                )
                if status == 401:
                    raise RemovedError
                if status != 200:
                    sentence = f"The project server answered the question for tasks with the status {status}."
                else:
                    tasks = Tasks.model_validate_json(answer).tasks
            except AwayError as error:
                sentence = str(error)
            except ValidationError:
                sentence = (
                    "The project server sent a task that this version of Lynkeus Server does not know. "
                    "Install the newest version."
                )
            if sentence is not None:
                if self._stop.is_set() or self._removed.is_set():
                    continue
                self._note(False, sentence)
                self._pause(retry)
                retry = min(retry * 2, LONGEST_RETRY)
                continue
            retry = FIRST_RETRY
            self._note(True)
            for task in tasks:
                if isinstance(task, ReadTask):
                    readers.submit(self._read, server, key, task)
                    continue
                self._answer(key, task.id, "done", self._carry_out(server, task))
                if isinstance(task, ForgetTask):
                    raise RemovedError

    def _answer(self, key: str, task: str, kind: str, answer: Format | bytes, size: int | None = None) -> None:
        """Send the answer to a task. An answer that the project server no longer waits for is dropped."""
        headers: dict[str, str] = {}
        if isinstance(answer, bytes):
            body, media = answer, BYTES
            headers["Lynkeus-File-Size"] = str(size)
        else:
            body, media = answer.model_dump_json().encode(), JSON
        for attempt in range(ANSWER_TRIES):
            try:
                status, _ = self._server.ask(
                    f"/api/link/tasks/{task}/{kind}", body, key=key, kind=media, headers=headers
                )
            except AwayError:
                if attempt + 1 == ANSWER_TRIES or self._stop.wait(FIRST_RETRY):
                    return
                continue
            if status == 401:
                self._removed.set()
            elif status not in (204, 404):
                logger.warning("The project server answered the answer to a task with the status %s.", status)
            return

    def _carry_out(self, server: str, task: Task) -> Done:
        """Carry out a task other than reading, and return its answer."""
        jobs = self._jobs
        try:
            if jobs is None:
                raise RuntimeError("no jobs")
            if isinstance(task, StartTask):
                return self._start(server, jobs, task)
            if isinstance(task, DismissTask):
                record = self._store.job(task.job)
                if record is None or record.session != server:
                    return Done(ok=False, detail="The server has no job of this name.")
                jobs.dismiss(record)
                with self._lock:
                    self._dismissed.add(record.id)
            elif isinstance(task, RenameTask):
                if jobs.rename_layer(server, task.layer, task.title) is None:
                    return Done(ok=False, detail="The server holds no layer of this name.")
            elif isinstance(task, RemoveTask):
                if not jobs.remove_layer(server, task.layer):
                    return Done(ok=False, detail="The server holds no layer of this name.")
            elif isinstance(task, LimitsTask):
                with self._lock:
                    self._settings = self._settings.model_copy(update={"limits": task.limits})
                    computer.write_settings(self.folder, self._settings)
                jobs.set_limits(job_limits(task.limits, self._others(server)))
            return Done(ok=True)
        except Exception:
            logger.exception("A task of the kind %s could not be carried out.", task.kind)
            return Done(ok=False, detail=FAULT)

    def _start(self, server: str, jobs: Jobs, task: StartTask) -> Done:
        """Validate the inputs of a job again, record it and start it when a place is free."""
        if self._store.job(task.job) is not None:
            # The project server gave the task a second time because the first answer did not arrive.
            return Done(ok=True)
        process = self._processes.get(task.process)
        if process is None:
            sentence = (
                f"This server does not offer the process {task.process[:80]}. Install the newest Lynkeus Server on it."
            )
            return Done(ok=False, detail=sentence)
        try:
            inputs = process.inputs.model_validate_json(task.inputs)
        except ValidationError:
            return Done(
                ok=False, detail="This server does not accept the inputs of the job. Install the newest version."
            )
        if process.needs_earthdata and task.token is None:
            return Done(ok=False, detail="The job needs the Earthdata token of the visitor, and the task carried none.")
        limits = self._settings.limits
        if limits is not None and self._store.size_of_layers() >= limits.storage:
            size = f"{limits.storage / 1e9:.3g} gigabytes"
            sentence = (
                f"The layers on this server use the {size} that its owner allows. "
                "Remove a layer or raise the storage of the server, and start again."
            )
            return Done(ok=False, detail=sentence)
        try:
            jobs.submit(server, process, inputs, "document", task.token, job=task.job, title=task.title)
        except LimitError as error:
            return Done(ok=False, detail=str(error)[:500])
        return Done(ok=True)

    # Reading

    def _read(self, server: str, key: str, task: ReadTask) -> None:
        """Send a part of one of the two files of a layer, or the reason why it cannot be sent."""
        try:
            part = self.part(server, task)
        except Exception:
            logger.exception("A part of a file could not be read.")
            part = ReadFailure(status=500, detail="The file could not be read.")
        if isinstance(part, ReadFailure):
            self._answer(key, task.id, "failure", part)
        else:
            self._answer(key, task.id, "bytes", part[0], part[1])

    def part(self, server: str, task: ReadTask) -> tuple[bytes, int] | ReadFailure:
        """Read a part of a file of a layer.

        Only the two files that the record of the layer names are read, from the folder of the layer.
        No other file of the computer can be named.

        Parameters
        ----------
        server : str
            Name of the own server, whose layers may be read.
        task : ReadTask
            The layer, the file and the part.

        Returns
        -------
        tuple of bytes and int, or ReadFailure
            The bytes of the part, at most ``MOST_BYTES``, with the size of the whole file in bytes; or
            the reason why the part cannot be sent.
        """
        missing = ReadFailure(status=404, detail="The server holds no such file of a layer.")
        record = self._store.layer(task.layer)
        if record is None or record.session != server:
            return missing
        description = LayerDescription.model_validate_json(record.description)
        names = {description.url.rsplit("/", 1)[-1], description.record.rsplit("/", 1)[-1]}
        if task.file not in names:
            return missing
        folder = self._files / record.id
        path = folder / task.file
        try:
            if path.is_symlink() or not path.is_file() or path.resolve().parent != folder.resolve():
                return missing
            size = path.stat().st_size
            end = min(task.end, size, task.start + MOST_BYTES)
            if task.start >= end:
                return ReadFailure(status=416, detail="The part starts after the end of the file.")
            with path.open("rb") as file:
                file.seek(task.start)
                return file.read(end - task.start), size
        except OSError:
            logger.exception("The file %s of the layer %s could not be read.", task.file, task.layer)
            return ReadFailure(status=500, detail="The file could not be read.")

    # Reports

    def state(self) -> ServerState:
        """Return what the server reports about itself."""
        with self._lock:
            limits, session = self._settings.limits, self._settings.server
        if limits is None:
            raise RuntimeError("the server has no limits yet")
        unfinished = [job for job in self._store.unfinished_jobs() if job.session == session]
        return ServerState(
            processors=computer.processors(),
            memory=computer.memory(),
            disk_free=computer.free_space(self._files),
            disk_used=self._store.size_of_layers(),
            running=sum(job.status == "running" for job in unfinished),
            waiting=sum(job.status == "accepted" for job in unfinished),
            layers=len(self._store.layer_names()),
            limits=limits,
            system=self._system,
            version=__version__,
        )

    def _job_state(self, job: JobRecord) -> JobState:
        """Return the state of a job as a report gives it."""
        layer = self._store.layer(job.layer) if job.layer else None
        return JobState(
            job=job.id,
            status=job.status,
            progress=max(0, min(100, job.progress)),
            message=job.message[:500] or "The job gave no message.",
            started=job.started,
            finished=job.finished,
            layer=LayerDescription.model_validate_json(layer.description) if layer else None,
            size=layer.size if layer else None,
        )

    def _changed(self, server: str) -> list[JobRecord]:
        """Return the jobs whose state the project server has not yet acknowledged, the oldest change first."""
        with self._lock:
            dismissed = [job for name in self._dismissed if (job := self._store.job(name)) is not None]
            jobs = [*self._store.jobs_of(server), *dismissed]
            changed = [job for job in jobs if self._acknowledged.get(job.id) != job.updated]
        return sorted(changed, key=lambda job: job.updated)

    def _report(self, server: str, key: str, due: bool) -> bool:
        """Send a report when a job changed or a report is due, and return whether one was acknowledged."""
        changed = self._changed(server)[:MOST_REPORTED_JOBS]
        if not changed and not due:
            return False
        report = Report(state=self.state(), jobs=tuple(self._job_state(job) for job in changed))
        status, _ = self._server.ask("/api/link/report", report.model_dump_json().encode(), key=key)
        if status == 401:
            raise RemovedError
        if status != 204:
            raise AwayError(f"The project server answered a report with the status {status}.")
        with self._lock:
            for job in changed:
                self._acknowledged[job.id] = job.updated
                if job.status == "dismissed":
                    self._dismissed.discard(job.id)
        return True

    def _report_changes(self, server: str, key: str) -> None:
        """Report at the start, whenever the state of a job changes and at least every ``REPORT_PAUSE`` seconds."""
        latest: float | None = None
        pause = 0.0
        while not self._removed.wait(pause) and not self._stop.is_set():
            pause = CHANGE_PAUSE
            due = latest is None or time.monotonic() - latest >= REPORT_PAUSE
            try:
                if self._report(server, key, due):
                    latest = time.monotonic()
                    self._note(True)
            except RemovedError:
                self._removed.set()
                self._server.interrupt()
                return
            except AwayError as error:
                if not self._stop.is_set():
                    self._note(False, str(error))
                pause = FIRST_RETRY * 5
            except Exception:
                logger.exception("A report could not be made.")
                pause = LONGEST_RETRY
