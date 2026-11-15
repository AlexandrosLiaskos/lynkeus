"""A stand-in for the program Lynkeus Server, for the tests of the own servers.

It speaks the connection as ``docs/Own_Servers.md`` gives it, with the messages
of ``lynkeus.linking``: it asks for a pairing, asks for its tasks with its key,
answers each task, and reports its state and the jobs whose state changed. It
connects to the web service over HTTP, as the program does, and nothing
connects to it.

The layer of a job is a real file. The stand-in reads a sample of the NISAR
backscatter HH of 21 October 2026 from ``tests/data/layers`` and writes it with
``lynkeus.writing``, as a job of the program writes the layer that it received.
"""

import json
import os
import shutil
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date
from pathlib import Path

import httpx2

from lynkeus.layers import LayerDescription
from lynkeus.linking import (
    DismissTask,
    Done,
    ForgetTask,
    JobState,
    LimitsTask,
    Machine,
    Pairing,
    PairingKey,
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
from lynkeus.writing import read_layer, write_layer
from tests.records import LAYERS

SMALL = LAYERS / "gcov-hhhh-20261021-small.tif"
"""128 by 128 cells of the backscatter HH of 21 October 2026."""

LARGE = LAYERS / "gcov-hhhh-20261021.tif"
"""600 by 560 cells of the same product. Its layer file is larger than one part of a file (``MOST_BYTES``)."""

GRANULE = "NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001.h5"
JSON = {"Content-Type": "application/json"}


class OwnServer:
    """A stand-in own server.

    Parameters
    ----------
    client : httpx2.Client
        Connection to the web service.
    folder : pathlib.Path
        Data folder of the server, which receives the folder ``files`` with the files of the layers.
    name : str
        Name of the computer.
    sample : pathlib.Path
        The GeoTIFF whose values every job writes as its layer.

    Attributes
    ----------
    manual : bool
        When true, a started job runs until the test calls ``finish``.
    silent, refused : set of str
        Kinds of tasks that the server does not answer, and that it answers with ``ok`` false.
    offered : set of str or None
        Names of the processes that the server runs, or None for every process.
    tasks : list of Task
        Every task that the server received, in order.
    tokens : dict
        The Earthdata token that arrived with the task of each job.
    """

    def __init__(self, client: httpx2.Client, folder: Path, name: str = "Field laptop", sample: Path = SMALL) -> None:
        self.client = client
        self.folder = folder
        self.sample = sample
        self.machine = Machine(name=name, system="Stand-in 1", version="0.1.0")
        self.server = ""
        self.key = ""
        self.limits = ServerLimits(running_jobs=2, storage=10**10, layer_size=10**9)
        self.manual = False
        self.silent: set[str] = set()
        self.refused: set[str] = set()
        self.offered: set[str] | None = None
        self.pause = 0.5
        self.tasks: list[Task] = []
        self.tokens: dict[str, str | None] = {}
        self.jobs: dict[str, JobState] = {}
        self.titles: dict[str, str] = {}
        self.layers: dict[str, LayerDescription] = {}
        self.forgotten = False
        self._changed: list[str] = []
        self._lock = threading.RLock()
        self._stop = threading.Event()
        self._reported = float("-inf")
        (folder / "files").mkdir(parents=True, exist_ok=True)

    # Pairing

    def ask_pairing(self) -> Pairing:
        """Ask for a pairing."""
        response = self.client.post("/api/link/pairings", content=self.machine.model_dump_json(), headers=JSON)
        assert response.status_code == 200, response.text
        return Pairing.model_validate_json(response.content)

    def ask_key(self, pairing: Pairing) -> httpx2.Response:
        """Ask whether the visitor has confirmed the pairing, and keep the name and the key when he has."""
        body = json.dumps({"device_code": pairing.device_code})
        response = self.client.post("/api/link/pairings/token", content=body, headers=JSON)
        if response.status_code == 200:
            key = PairingKey.model_validate_json(response.content)
            self.server, self.key = key.server, key.key
        return response

    def pair(self, visitor: httpx2.Client) -> str:
        """Pair the server with the Earthdata user of a signed-in visitor, and return the name of the server."""
        pairing = self.ask_pairing()
        confirmed = visitor.post("/api/servers", json={"user_code": pairing.user_code})
        assert confirmed.status_code == 201, confirmed.text
        assert self.ask_key(pairing).status_code == 200
        assert confirmed.json()["id"] == self.server
        return self.server

    # Connection

    @property
    def headers(self) -> dict[str, str]:
        """The header with the key."""
        return {"Authorization": f"Bearer {self.key}"}

    def state(self) -> ServerState:
        """Return the state of the server."""
        with self._lock:
            used = sum(path.stat().st_size for path in (self.folder / "files").rglob("*") if path.is_file())
            return ServerState(
                processors=os.cpu_count() or 1,
                memory=None,
                disk_free=shutil.disk_usage(self.folder).free,
                disk_used=used,
                running=sum(job.status == "running" for job in self.jobs.values()),
                waiting=sum(job.status == "accepted" for job in self.jobs.values()),
                layers=len(self.layers),
                limits=self.limits,
                system=self.machine.system,
                version=self.machine.version,
            )

    def report(self, *named: JobState) -> httpx2.Response:
        """Send a report with the jobs whose state changed, or with the states given."""
        with self._lock:
            changed = list(dict.fromkeys(self._changed))
            jobs = named or tuple(self.jobs[job] for job in changed if job in self.jobs)
            body = Report(state=self.state(), jobs=jobs).model_dump_json()
            response = self.client.post("/api/link/report", content=body, headers={**self.headers, **JSON})
            if response.status_code == 204 and not named:
                # A report names a job until the project server has answered it with 204.
                self._changed.clear()
            self._reported = time.monotonic()
            return response

    def ask_tasks(self, wait: int = 0) -> httpx2.Response:
        """Ask for tasks."""
        return self.client.post(f"/api/link/tasks?wait={wait}", headers=self.headers)

    def step(self, wait: int = 0) -> list[Task]:
        """Ask for tasks once and carry them out. Return the tasks."""
        response = self.ask_tasks(wait)
        if response.status_code == 401:
            self.forgotten = True
            return []
        assert response.status_code == 200, response.text
        tasks = list(Tasks.model_validate_json(response.content).tasks)
        for task in tasks:
            self.handle(task)
        return tasks

    def _set(self, job: str, **changes: object) -> None:
        with self._lock:
            self.jobs[job] = self.jobs[job].model_copy(update=changes)
            self._changed.append(job)

    def _done(self, task: Task, detail: str | None = None) -> None:
        if task.kind in self.silent:
            return
        ok = detail is None and task.kind not in self.refused
        if not ok:
            detail = detail or f"The stand-in was asked to refuse the task {task.kind}."
        body = Done(ok=ok, detail=None if ok else detail).model_dump_json()
        response = self.client.post(f"/api/link/tasks/{task.id}/done", content=body, headers={**self.headers, **JSON})
        assert response.status_code == 204, response.text

    def handle(self, task: Task) -> None:
        """Carry out a task and answer it."""
        self.tasks.append(task)
        if task.kind in self.silent and not isinstance(task, StartTask):
            return
        if isinstance(task, StartTask):
            self.tokens[task.job] = task.token
            if (self.offered is not None and task.process not in self.offered) or "start" in self.refused:
                self._done(task, f"Your server does not offer the process {task.process}.")
                return
            with self._lock:
                self.titles[task.job] = task.title
                self.jobs[task.job] = JobState(
                    job=task.job, status="accepted", progress=0, message="The job waits for its turn."
                )
                self._changed.append(task.job)
            self._done(task)
            if "start" not in self.silent:
                self._set(task.job, status="running", progress=5, message="The job has started.", started=time.time())
                self.report()
                if not self.manual:
                    self.finish(task.job)
        elif isinstance(task, DismissTask):
            if task.job in self.jobs and self.jobs[task.job].status in ("accepted", "running"):
                self._set(task.job, status="dismissed", message="The job was dismissed.", finished=time.time())
            self._done(task)
        elif isinstance(task, RenameTask):
            known = task.layer in self.layers and "rename" not in self.refused
            if known:
                description = self.layers[task.layer].model_copy(update={"title": task.title})
                self.layers[task.layer] = description
                record = self.folder / "files" / task.layer / description.record.rsplit("/", 1)[-1]
                item = json.loads(record.read_text(encoding="utf-8"))
                item["properties"]["title"] = task.title
                record.write_text(json.dumps(item, ensure_ascii=False, indent=2), encoding="utf-8")
            self._done(task, None if known else "Your server keeps no layer of this name.")
        elif isinstance(task, RemoveTask):
            known = task.layer in self.layers and "remove" not in self.refused
            if known:
                del self.layers[task.layer]
                shutil.rmtree(self.folder / "files" / task.layer)
            self._done(task, None if known else "Your server keeps no layer of this name.")
        elif isinstance(task, ReadTask):
            self._read(task)
        elif isinstance(task, LimitsTask):
            if "limits" not in self.refused:
                self.limits = task.limits
            self._done(task)
        elif isinstance(task, ForgetTask):
            self._done(task)
            self.forgotten = True
            self._stop.set()

    def _read(self, task: ReadTask) -> None:
        path = self.folder / "files" / task.layer / task.file
        address = f"/api/link/tasks/{task.id}"
        failure: ReadFailure | None = None
        if "read" in self.refused:
            failure = ReadFailure(status=500, detail="The stand-in could not read the file.")
        elif task.layer not in self.layers or not path.is_file():
            failure = ReadFailure(status=404, detail="Your server keeps no such file.")
        elif task.start >= path.stat().st_size:
            failure = ReadFailure(status=416, detail="The part starts after the end of the file.")
        if failure is not None:
            body = failure.model_dump_json()
            response = self.client.post(f"{address}/failure", content=body, headers={**self.headers, **JSON})
        else:
            with path.open("rb") as file:
                file.seek(task.start)
                data = file.read(task.end - task.start)
            headers = {
                **self.headers,
                "Content-Type": "application/octet-stream",
                "Lynkeus-File-Size": str(path.stat().st_size),
            }
            response = self.client.post(f"{address}/bytes", content=data, headers=headers)
        assert response.status_code in (204, 404), response.text

    def finish(self, job: str, sentence: str | None = None) -> LayerDescription | None:
        """End a running job, with a real layer or with the sentence of a failure, and report it."""
        if sentence is not None:
            self._set(job, status="failed", message=sentence, finished=time.time())
            self.report()
            return None
        layer = os.urandom(16).hex()
        folder = self.folder / "files" / layer
        folder.mkdir()
        values, grid = read_layer(self.sample)
        description = write_layer(
            values,
            grid,
            layer_id=layer,
            folder=folder,
            address=f"/api/servers/{self.server}/files/{layer}",
            name=self.sample.stem,
            title=self.titles[job],
            kind="layer",
            quantity="Radar backscatter gamma nought, HH, linear power",
            unit="1",
            legend="percentiles",
            colours="grey",
            dates=[date(2026, 10, 21)],
            inputs=[GRANULE],
            lineage="Values of a sample of NISAR backscatter, written by the stand-in own server.",
        )
        size = sum(path.stat().st_size for path in folder.iterdir())
        with self._lock:
            self.layers[layer] = description
        self._set(
            job,
            status="successful",
            progress=100,
            message="The layer is ready.",
            finished=time.time(),
            layer=description,
            size=size,
        )
        self.report()
        return description

    def file(self, layer: str, name: str) -> bytes:
        """Return the bytes of a file of a layer, as the disk of the server holds them."""
        return (self.folder / "files" / layer / name).read_bytes()

    def lose_jobs(self) -> None:
        """Forget every job, as a server does whose record was deleted."""
        with self._lock:
            self.jobs.clear()
            self._changed.clear()

    def _serve(self, wait: int) -> None:
        self.report()
        while not self._stop.is_set() and not self.forgotten:
            self.step(wait)
            if self._changed or time.monotonic() - self._reported >= self.pause:
                self.report()

    @contextmanager
    def serving(self, wait: int = 1) -> Iterator["OwnServer"]:
        """Keep one question for tasks open and report, as the program does, until the block ends."""
        self._stop.clear()
        thread = threading.Thread(target=self._serve, args=(wait,), name=f"own-server-{self.machine.name}")
        thread.start()
        try:
            yield self
        finally:
            self._stop.set()
            thread.join()
