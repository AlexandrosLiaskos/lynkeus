"""A stand-in for the project server, for the tests of Lynkeus Server.

It answers the addresses under ``/api/link/`` as ``docs/Own_Servers.md`` rules them, on a port of this
computer, and reads every message with the formats of ``lynkeus.linking``: a message of the program
that does not follow the rules is answered with 422 and noted in ``faults``. A test plays the visitor
(``confirm``), gives tasks (``give``) and reads what the program reported, and when it left (``leaves``).
"""

import secrets
import socket
import threading
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager, suppress
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlsplit

from pydantic import ValidationError

from lynkeus.layers import Format
from lynkeus.linking import (
    MOST_BYTES,
    MOST_WAIT,
    PAIRING_TIME,
    USER_CODE_LETTERS,
    Done,
    JobState,
    Machine,
    Pairing,
    PairingKey,
    PairingQuestion,
    PairingRefusal,
    ReadFailure,
    Report,
    Task,
    Tasks,
)

WAIT = 60.0
"""The longest time that a test waits for the program, in seconds. A job starts a new interpreter."""

type Answer = Done | ReadFailure | tuple[bytes, int]


class Project(ThreadingHTTPServer):
    """The stand-in. ``port`` 0 takes a free port; a test that stops and starts the stand-in gives the port again."""

    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, port: int = 0, interval: int = 1) -> None:
        super().__init__(("127.0.0.1", port), _Handler)
        self.interval = interval
        self.changed = threading.Condition()
        self.machines: dict[str, Machine] = {}
        self.codes: dict[str, str] = {}
        self.confirmed: dict[str, str] = {}
        self.refusals: list[str] = []
        self.server: str | None = None
        self.key: str | None = None
        self.waiting: list[Task] = []
        self.given: dict[str, Task] = {}
        self.answers: dict[str, Answer] = {}
        self.reports: list[Report] = []
        self.report_times: list[float] = []
        self.connections: list[Any] = []
        self.questions: list[float] = []
        self.open_questions = 0
        self.most_open_questions = 0
        self.open_at_answers: list[int] = []
        self.leaves: list[float] = []
        self.leave_time = 0.0
        self.asked: list[str] = []
        self.faults: list[str] = []
        self.wait = float(MOST_WAIT)

    @property
    def address(self) -> str:
        return f"http://127.0.0.1:{self.server_address[1]}"

    def handle_error(self, request: Any, client_address: Any) -> None:
        # A connection that the program closes while a question is open is not a fault of the stand-in.
        pass

    def end(self) -> None:
        """Stop answering and close the connections that the program keeps open, as when the server goes away."""
        self.shutdown()
        self.server_close()
        with self.changed:
            connections, self.connections = self.connections, []
        for connection in connections:
            with suppress(OSError):
                connection.shutdown(socket.SHUT_RDWR)

    # The visitor and the site

    def until[Result](self, reached: Callable[[], Result | None], what: str, wait: float = WAIT) -> Result:
        """Wait until a function returns something true, and return it."""
        limit = time.monotonic() + wait
        with self.changed:
            while not (result := reached()):
                left = limit - time.monotonic()
                if left <= 0:
                    raise AssertionError(f"the stand-in waited {wait:g} seconds for {what}; faults: {self.faults}")
                self.changed.wait(min(left, 0.1))
            return result

    def code(self) -> str:
        """Return the user code of the newest pairing that the program asked for and that is not confirmed."""

        def newest() -> str | None:
            codes = [code for code in self.codes.values() if code not in self.confirmed]
            return codes[-1] if codes else None

        return self.until(newest, "a request for a pairing")

    def confirm(self, code: str, user: str | None = "a_visitor") -> str:
        """Confirm a pairing as the signed-in visitor does, and return the name of the new own server."""
        with self.changed:
            self.server, self.key = secrets.token_hex(8), secrets.token_urlsafe(32)
            self.confirmed[code] = user or ""
            self.reports.clear()
            self.changed.notify_all()
            return self.server

    def remove(self) -> None:
        """Remove the own server as its owner does on the site: its key is no longer known."""
        with self.changed:
            self.key = None
            self.changed.notify_all()

    def give(self, task: Task, wait: float = WAIT) -> Answer:
        """Give a task to the own server, and return its answer."""
        with self.changed:
            self.waiting.append(task)
            self.changed.notify_all()
        self.until(lambda: task.id in self.answers or None, f"the answer to a task of the kind {task.kind}", wait)
        return self.answers[task.id]

    def job(self, job: str, *states: str, wait: float = WAIT) -> JobState:
        """Wait until a report gives a job in one of the states, and return that state of the job."""

        def reported() -> JobState | None:
            for report in reversed(self.reports):
                for state in report.jobs:
                    if state.job == job:
                        return state if state.status in (states or ("successful", "failed")) else None
            return None

        return self.until(reported, f"a report of the job {job} as {' or '.join(states) or 'finished'}", wait)

    def report(self, reached: Callable[[Report], bool], what: str, wait: float = WAIT) -> Report:
        """Wait until a report fulfils a condition, and return it."""

        def found() -> Report | None:
            return next((report for report in reversed(self.reports) if reached(report)), None)

        return self.until(found, what, wait)


class _Handler(BaseHTTPRequestHandler):
    server: Project
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 - name set by the standard library
        pass

    def setup(self) -> None:
        super().setup()
        with self.server.changed:
            self.server.connections.append(self.connection)

    def _answer(self, status: int, body: Format | None = None) -> None:
        text = b"" if body is None else body.model_dump_json().encode()
        self.send_response(status)
        if body is not None:
            self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(text)))
        self.end_headers()
        self.wfile.write(text)

    def _fault(self, sentence: str) -> None:
        with self.server.changed:
            self.server.faults.append(f"{self.path}: {sentence}")
            self.server.changed.notify_all()
        self._answer(HTTPStatus.UNPROCESSABLE_ENTITY)

    def do_POST(self) -> None:
        project = self.server
        address = urlsplit(self.path)
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        with project.changed:
            project.asked.append(address.path)
        try:
            if address.path == "/api/link/pairings":
                self._pairing(Machine.model_validate_json(body))
            elif address.path == "/api/link/pairings/token":
                self._token(PairingQuestion.model_validate_json(body).device_code)
            elif project.key is None or self.headers.get("Authorization") != f"Bearer {project.key}":
                self._answer(HTTPStatus.UNAUTHORIZED)
            elif address.path == "/api/link/tasks":
                self._tasks(parse_qs(address.query), body)
            elif address.path == "/api/link/report":
                report = Report.model_validate_json(body)
                with project.changed:
                    # A report that was on its way when the visitor confirmed a new pairing is not one of that pairing.
                    if self.headers.get("Authorization") == f"Bearer {project.key}":
                        project.reports.append(report)
                        project.report_times.append(time.monotonic())
                    project.changed.notify_all()
                self._answer(HTTPStatus.NO_CONTENT)
            elif address.path == "/api/link/leave":
                self._leave(body)
            elif address.path.startswith("/api/link/tasks/"):
                self._task_answer(address.path.removeprefix("/api/link/tasks/"), body)
            else:
                self._answer(HTTPStatus.NOT_FOUND)
        except ValidationError as error:
            self._fault(str(error))

    def _pairing(self, machine: Machine) -> None:
        project = self.server
        letters = [secrets.choice(USER_CODE_LETTERS) for _ in range(8)]
        code = "".join(letters[:4]) + "-" + "".join(letters[4:])
        device = secrets.token_urlsafe(32)
        with project.changed:
            project.machines[code] = machine
            project.codes[device] = code
            project.changed.notify_all()
        self._answer(
            HTTPStatus.OK,
            Pairing(
                device_code=device,
                user_code=code,
                verification_uri=f"{project.address}/?connect",
                verification_uri_complete=f"{project.address}/?connect={code}",
                expires_in=PAIRING_TIME,
                interval=project.interval,
            ),
        )

    def _token(self, device: str) -> None:
        project = self.server
        with project.changed:
            code = project.codes.get(device)
            refusal = project.refusals.pop(0) if project.refusals else None
            if code is None or refusal in ("expired_token", "access_denied"):
                project.codes.pop(device, None)
                answer: Format = PairingRefusal(
                    error="access_denied" if refusal == "access_denied" else "expired_token"
                )
            elif refusal == "slow_down":
                answer = PairingRefusal(error="slow_down")
            elif code not in project.confirmed or project.server is None or project.key is None:
                answer = PairingRefusal(error="authorization_pending")
            else:
                # The key is given once.
                del project.codes[device]
                answer = PairingKey(server=project.server, key=project.key, user=project.confirmed[code] or None)
            project.changed.notify_all()
        self._answer(HTTPStatus.OK if isinstance(answer, PairingKey) else HTTPStatus.BAD_REQUEST, answer)

    def _tasks(self, parameters: dict[str, list[str]], body: bytes) -> None:
        project = self.server
        if body or parameters != {"wait": [str(MOST_WAIT)]}:
            return self._fault("the question for tasks has no body and the parameter wait of MOST_WAIT seconds")
        limit = time.monotonic() + project.wait
        with project.changed:
            # A question belongs to the pairing whose key it carried: it receives no task of a later pairing.
            key = project.key
            project.questions.append(time.monotonic())
            project.open_questions += 1
            project.most_open_questions = max(project.most_open_questions, project.open_questions)
            try:
                while not project.waiting and project.key == key and (left := limit - time.monotonic()) > 0:
                    project.changed.wait(min(left, 0.1))
                if project.key != key:
                    tasks = None
                else:
                    tasks = Tasks(tasks=tuple(project.waiting))
                    project.given.update({task.id: task for task in project.waiting})
                    project.waiting.clear()
            finally:
                project.open_questions -= 1
        return self._answer(HTTPStatus.UNAUTHORIZED) if tasks is None else self._answer(HTTPStatus.OK, tasks)

    def _leave(self, body: bytes) -> None:
        project = self.server
        if body:
            return self._fault("the leave of a program that is quit has no body")
        with project.changed:
            project.leaves.append(time.monotonic())
            project.changed.notify_all()
        # A test may let the answer wait, as a project server that is slow or away does.
        time.sleep(project.leave_time)
        return self._answer(HTTPStatus.NO_CONTENT)

    def _task_answer(self, rest: str, body: bytes) -> None:
        project = self.server
        name, _, kind = rest.partition("/")
        with project.changed:
            task = project.given.get(name)
        if task is None or name in project.answers:
            return self._answer(HTTPStatus.NOT_FOUND)
        answer: Answer
        if kind == "done" and task.kind != "read":
            answer = Done.model_validate_json(body)
        elif kind == "failure" and task.kind == "read":
            answer = ReadFailure.model_validate_json(body)
        elif kind == "bytes" and task.kind == "read":
            size = self.headers.get("Lynkeus-File-Size", "")
            if self.headers.get("Content-Type") != "application/octet-stream" or not size.isdecimal():
                return self._fault(
                    "a part of a file comes as application/octet-stream with the header Lynkeus-File-Size"
                )
            if not 0 < len(body) <= min(MOST_BYTES, task.end - task.start) or task.start + len(body) > int(size):
                return self._fault("a part of a file holds at most the bytes asked for, and at least one")
            answer = (body, int(size))
        else:
            return self._fault(f"the answer {kind} does not suit a task of the kind {task.kind}")
        with project.changed:
            project.answers[name] = answer
            project.open_at_answers.append(project.open_questions)
            project.changed.notify_all()
        return self._answer(HTTPStatus.NO_CONTENT)


@contextmanager
def project(port: int = 0, interval: int = 1) -> Iterator[Project]:
    """Run the stand-in for the project server until the block ends."""
    with Project(port, interval) as server:
        thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True)
        thread.start()
        try:
            yield server
        finally:
            server.end()
            thread.join()


def task_name() -> str:
    """Return a new name for a task."""
    return secrets.token_urlsafe(32)
