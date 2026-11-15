"""Tests of the addresses of the own servers, through a web service that listens on a port.

A stand-in own server (``tests.ownserver``) and the visitors connect to the
service over HTTP. The layer that the stand-in reports is a real file of NISAR
backscatter, written by ``lynkeus.writing``.
"""

import hashlib
import json
import signal
import socket
import subprocess
import sys
import threading
import time
from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import httpx2
import pytest
import uvicorn
from fastapi import FastAPI

from lynkeus import jobs, server_routes, servers
from lynkeus.linking import MAX_USER_SERVERS, MOST_BYTES, DismissTask, ReadTask, RemoveTask, StartTask
from lynkeus.processes import Process
from lynkeus.routes import Service, install
from lynkeus.server_routes import byte_range, install_servers
from tests import standin
from tests.ownserver import LARGE, SMALL, OwnServer
from tests.standin import SIGNED_IN, STAND_IN, KeyServer, StandInInputs, key_server, token

OGC = "http://www.opengis.net/def/"
NO_JOB = f"{OGC}exceptions/ogcapi-processes-1/1.0/no-such-job"


def uses_of(inputs: StandInInputs) -> tuple[str, ...]:
    return inputs.uses


USES = Process(
    id="uses-layers",
    title="Stand-in that reads layers",
    description="Writes two small files after it has found its input layers.",
    inputs=StandInInputs,
    run=standin.run,
    job_title=standin.job_title,
    layers=uses_of,
)


class Site:
    """A web service that listens on a port of this computer, with what makes its visitors and its own servers."""

    def __init__(self, app: FastAPI, address: str, folder: Path) -> None:
        self.app = app
        self.address = address
        self.folder = folder
        self.clients: list[httpx2.Client] = []
        self.machines = 0

    @property
    def service(self) -> Service:
        service: Service = self.app.state.lynkeus
        return service

    def client(self) -> httpx2.Client:
        client = httpx2.Client(base_url=self.address, timeout=40)
        self.clients.append(client)
        return client

    def visit(self, user: str | None = None) -> httpx2.Client:
        """Return a visitor with a cookie jar of its own, signed in to Earthdata when a user is named."""
        visitor = self.client()
        if user is not None:
            assert visitor.post("/api/session/earthdata", json={"token": token(user)}).status_code == 200
        return visitor

    def machine(self, name: str = "Field laptop", sample: Path = SMALL) -> OwnServer:
        """Return a stand-in own server with a data folder of its own."""
        self.machines += 1
        return OwnServer(self.client(), self.folder / f"machine-{self.machines}", name, sample)


@contextmanager
def running(
    folder: Path, keys: KeyServer, processes: Sequence[Process[Any]] = (STAND_IN, SIGNED_IN, USES)
) -> Iterator[Site]:
    """Run the web service with its processes on a folder until the block ends."""
    app = FastAPI()
    install(app, processes, folder=folder / "project", keys_address=keys.address, secure_cookie=False)
    install_servers(app)
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    service = uvicorn.Server(uvicorn.Config(app, log_level="warning", timeout_graceful_shutdown=2))
    thread = threading.Thread(target=service.run, kwargs={"sockets": [listener]}, name="web-service")
    thread.start()
    until(lambda: service.started)
    site = Site(app, f"http://127.0.0.1:{listener.getsockname()[1]}", folder)
    try:
        yield site
    finally:
        for client in site.clients:
            client.close()
        service.should_exit = True
        thread.join()
        listener.close()


@pytest.fixture
def keys() -> Iterator[KeyServer]:
    with key_server() as server:
        yield server


@pytest.fixture
def site(tmp_path: Path, keys: KeyServer) -> Iterator[Site]:
    with running(tmp_path, keys) as service:
        yield service


def until[Value](condition: Callable[[], Value], limit: float = 30.0) -> Value:
    """Wait until a condition holds, and return its value."""
    end = time.monotonic() + limit
    while True:
        value = condition()
        if value:
            return value
        assert time.monotonic() < end, "the condition did not hold in time"
        time.sleep(0.02)


def start(visitor: httpx2.Client, process: str = "stand-in", server: str | None = None, **inputs: object) -> Any:
    address = f"/api/processes/{process}/execution" + (f"?server={server}" if server else "")
    return visitor.post(address, json={"inputs": {"name": "a", **inputs}})


def started(visitor: httpx2.Client, process: str = "stand-in", server: str | None = None, **inputs: object) -> Any:
    response = start(visitor, process, server, **inputs)
    assert response.status_code == 201, response.text
    return response.json()


def state(visitor: httpx2.Client, job: str, *states: str) -> Any:
    """Wait until a job is in one of the states, and return its state."""
    return until(
        lambda: (
            (info := visitor.get(f"/api/jobs/{job}").json())["status"] in (states or ("successful", "failed")) and info
        )
    )


def problem(response: httpx2.Response, status: int, detail: str = "") -> None:
    assert response.status_code == status, response.text
    assert response.headers["content-type"] == "application/problem+json"
    body = response.json()
    assert body["status"] == status
    assert body["detail"].startswith(detail), body["detail"]


def listed(visitor: httpx2.Client) -> list[dict[str, Any]]:
    servers: list[dict[str, Any]] = visitor.get("/api/servers").json()["servers"]
    return servers


# The pairing


def test_program_is_paired_after_the_visitor_confirms_its_code(site: Site, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(servers, "PAIRING_INTERVAL", 1)
    visitor, machine = site.visit("a_user"), site.machine("Field laptop")
    pairing = machine.ask_pairing()
    assert len(pairing.device_code) == 43
    assert pairing.verification_uri == "https://lynkeus.nkua.cloud/?connect"
    assert pairing.verification_uri_complete == f"https://lynkeus.nkua.cloud/?connect={pairing.user_code}"
    assert (pairing.expires_in, pairing.interval) == (900, 1)
    pending = machine.ask_key(pairing)
    assert (pending.status_code, pending.json()) == (400, {"error": "authorization_pending"})
    too_soon = machine.ask_key(pairing)
    assert (too_soon.status_code, too_soon.json()) == (400, {"error": "slow_down"})
    view = visitor.get(f"/api/servers/pairings/{pairing.user_code}")
    assert view.status_code == 200
    assert view.json() == {
        "user_code": pairing.user_code,
        "machine": {"name": "Field laptop", "system": "Stand-in 1", "version": "0.1.0"},
    }
    assert listed(visitor) == []
    confirmed = visitor.post("/api/servers", json={"user_code": pairing.user_code})
    assert confirmed.status_code == 201
    server = confirmed.json()
    assert confirmed.headers["location"] == f"/api/servers/{server['id']}"
    assert len(server["id"]) == 16
    assert (server["name"], server["connected"], server["state"]) == ("Field laptop", False, None)
    assert server["seen"] == server["paired"]
    # A confirmed code names no pairing any more.
    problem(visitor.get(f"/api/servers/pairings/{pairing.user_code}"), 404, "No computer waits")
    problem(visitor.post("/api/servers", json={"user_code": pairing.user_code}), 404, "No computer waits")
    time.sleep(1.05)
    given = machine.ask_key(pairing)
    assert given.status_code == 200
    assert given.json() == {"server": server["id"], "key": machine.key, "user": "a_user"}
    assert len(machine.key) == 43
    # The key is given once, and the record holds its digest only.
    again = machine.ask_key(pairing)
    assert (again.status_code, again.json()) == (400, {"error": "expired_token"})
    record = (site.folder / "project" / "lynkeus.sqlite3").read_bytes()
    assert machine.key.encode() not in record
    assert pairing.device_code.encode() not in record
    assert hashlib.sha256(machine.key.encode()).hexdigest().encode() in record
    answer = visitor.get("/api/servers").json()
    assert answer["limit"] == MAX_USER_SERVERS == 8
    [found] = answer["servers"]
    assert (found["id"], found["connected"], found["state"]) == (server["id"], True, None)
    assert machine.ask_tasks().json() == {"tasks": []}


def test_every_address_of_the_servers_needs_a_signed_in_session(site: Site) -> None:
    owner, machine = site.visit("a_user"), site.machine()
    server = machine.pair(owner)
    pairing = machine.ask_pairing()
    visitor = site.visit()
    visitor.get("/api/session")
    file = f"/api/servers/{server}/files/{'0' * 32}/a.tif"
    for response in (
        visitor.get("/api/servers"),
        visitor.get(f"/api/servers/pairings/{pairing.user_code}"),
        visitor.post("/api/servers", json={"user_code": pairing.user_code}),
        visitor.patch(f"/api/servers/{server}", json={"name": "Mine"}),
        visitor.delete(f"/api/servers/{server}"),
        visitor.get(file),
    ):
        problem(response, 401, "Sign in to Earthdata")
        assert response.headers["www-authenticate"] == 'Bearer realm="Earthdata Login"'
    owner.delete("/api/session/earthdata")
    problem(owner.get("/api/servers"), 401)
    assert [server_["name"] for server_ in listed(site.visit("a_user"))] == ["Field laptop"]


def test_wrong_user_codes_of_one_user_are_limited(site: Site) -> None:
    guesser, other, machine = site.visit("a_guesser"), site.visit("another_user"), site.machine()
    pairing = machine.ask_pairing()
    wrong = "BBBB-BBBC" if pairing.user_code != "BBBB-BBBC" else "BBBB-BBBD"
    for number in range(servers.MAX_CODE_ATTEMPTS):
        address = f"/api/servers/pairings/{wrong}" if number % 2 else "/api/servers/pairings/not-a-code"
        problem(guesser.get(address), 404, "No computer waits to be connected under this code.")
    refused = guesser.get(f"/api/servers/pairings/{pairing.user_code}")
    assert servers.MAX_CODE_ATTEMPTS == 5
    problem(refused, 429, "You gave 5 codes that name no pairing.")
    assert 0 < int(refused.headers["retry-after"]) <= 901
    problem(guesser.post("/api/servers", json={"user_code": pairing.user_code}), 429)
    assert other.get(f"/api/servers/pairings/{pairing.user_code}").status_code == 200
    problem(other.post("/api/servers", json={"user_code": wrong}), 404)
    assert other.post("/api/servers", json={"user_code": pairing.user_code}).status_code == 201


def test_codes_are_valid_for_a_limited_time(site: Site, monkeypatch: pytest.MonkeyPatch) -> None:
    visitor, first, second = site.visit("a_user"), site.machine("First"), site.machine("Second")
    monkeypatch.setattr(servers, "PAIRING_TIME", 1)
    unconfirmed, confirmed = first.ask_pairing(), second.ask_pairing()
    assert visitor.post("/api/servers", json={"user_code": confirmed.user_code}).status_code == 201
    assert [server["name"] for server in listed(visitor)] == ["Second"]
    time.sleep(1.1)
    problem(visitor.get(f"/api/servers/pairings/{unconfirmed.user_code}"), 404)
    problem(visitor.post("/api/servers", json={"user_code": unconfirmed.user_code}), 404)
    for machine, pairing in ((first, unconfirmed), (second, confirmed)):
        late = machine.ask_key(pairing)
        assert (late.status_code, late.json()) == (400, {"error": "expired_token"})
    # The server whose program never asked for its key can receive none any more, so it is removed.
    assert listed(visitor) == []
    assert site.service.store.count_pairings() == 0


def test_user_connects_a_limited_number_of_servers(site: Site, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(servers, "MAX_USER_SERVERS", 2)
    visitor, other = site.visit("a_user"), site.visit("another_user")
    for name in ("First", "Second"):
        site.machine(name).pair(visitor)
    third = site.machine("Third")
    pairing = third.ask_pairing()
    problem(visitor.post("/api/servers", json={"user_code": pairing.user_code}), 409, "You have 2 servers")
    assert [server["name"] for server in listed(visitor)] == ["First", "Second"]
    # The code stays valid, for the same user after he removed a server and for another user.
    assert other.post("/api/servers", json={"user_code": pairing.user_code}).status_code == 201


def test_program_learns_that_its_server_was_removed_before_it_received_the_key(site: Site) -> None:
    visitor, machine = site.visit("a_user"), site.machine()
    pairing = machine.ask_pairing()
    server = visitor.post("/api/servers", json={"user_code": pairing.user_code}).json()["id"]
    assert visitor.delete(f"/api/servers/{server}").status_code == 204
    denied = machine.ask_key(pairing)
    assert (denied.status_code, denied.json()) == (400, {"error": "access_denied"})


def test_pairings_in_progress_are_limited(site: Site, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(servers, "MAX_PAIRINGS", 1)
    site.machine().ask_pairing()
    machine = site.machine()
    refused = machine.client.post("/api/link/pairings", content=machine.machine.model_dump_json(), headers=JSON)
    problem(refused, 503, "Too many computers ask to be connected")
    assert refused.headers["retry-after"] == "300"


JSON = {"Content-Type": "application/json"}


def test_messages_of_the_program_must_be_in_their_format(site: Site) -> None:
    visitor, machine = site.visit("a_user"), site.machine()
    client = machine.client
    problem(
        client.post("/api/link/pairings", json={"name": "A", "system": "B"}), 422, "The request body is not a Machine"
    )
    problem(client.post("/api/link/pairings", json={"name": "A", "system": "B", "version": "1", "more": 1}), 422)
    problem(client.post("/api/link/pairings", content="{", headers=JSON), 422)
    problem(client.post("/api/link/pairings", content="name=A"), 415)
    problem(client.post("/api/link/pairings/token", json={"device_code": "short"}), 422)
    unknown = client.post("/api/link/pairings/token", json={"device_code": "x" * 43})
    assert (unknown.status_code, unknown.json()) == (400, {"error": "expired_token"})
    large = json.dumps({"name": "A" * 1_100_000, "system": "B", "version": "1"})
    problem(client.post("/api/link/pairings", content=large, headers=JSON), 413)
    machine.pair(visitor)
    problem(client.post("/api/link/report", json={"state": {}}, headers=machine.headers), 422)
    problem(client.post("/api/link/tasks?wait=soon", headers=machine.headers), 400, "The parameter wait")
    for body in ({}, {"user_code": 7}, {"user_code": "BBBB-BBBB", "name": "x"}, ["BBBB-BBBB"]):
        problem(visitor.post("/api/servers", json=body), 400, "The request body must be")
    problem(visitor.post("/api/servers", content="{", headers=JSON), 400, "The request body is not valid JSON.")
    problem(
        visitor.patch(f"/api/servers/{machine.server}", json={"name": ""}),
        400,
        "The request body is not a ServerChange",
    )
    problem(visitor.patch(f"/api/servers/{machine.server}", json={"limits": {"running_jobs": 0}}), 400)


# The connection of a paired server


def test_connection_needs_the_key_of_a_paired_server(site: Site) -> None:
    visitor, machine = site.visit("a_user"), site.machine()
    machine.pair(visitor)
    client = machine.client
    task = "t" * 43
    for headers in (
        {},
        {"Authorization": "Bearer " + "k" * 43},
        {"Authorization": machine.key},
        {"Authorization": "Bearer x"},
    ):
        for response in (
            client.post("/api/link/tasks?wait=0", headers=headers),
            client.post("/api/link/report", json={}, headers=headers),
            client.post(f"/api/link/tasks/{task}/done", json={"ok": True}, headers=headers),
            client.post(f"/api/link/tasks/{task}/bytes", content=b"x", headers=headers),
            client.post(f"/api/link/tasks/{task}/failure", json={}, headers=headers),
        ):
            problem(response, 401, "This key names no server.")
            assert response.headers["www-authenticate"] == 'Bearer realm="Lynkeus Server"'
    assert machine.ask_tasks().status_code == 200


def test_question_for_tasks_is_answered_at_once_when_a_task_arrives(
    site: Site, monkeypatch: pytest.MonkeyPatch
) -> None:
    visitor, machine = site.visit("a_user"), site.machine()
    server = machine.pair(visitor)
    begin = time.monotonic()
    assert machine.ask_tasks(0).json() == {"tasks": []}
    assert time.monotonic() - begin < 1
    begin = time.monotonic()
    assert machine.ask_tasks(2).json() == {"tasks": []}
    assert 1.9 < time.monotonic() - begin < 4
    answers: list[tuple[float, Any]] = []
    waiting = threading.Thread(target=lambda: answers.append((time.monotonic(), machine.ask_tasks(20).json())))
    begin = time.monotonic()
    waiting.start()
    time.sleep(0.5)
    job = started(visitor, server=server)["jobID"]
    waiting.join()
    [(end, answer)] = answers
    assert end - begin < 5
    [task] = answer["tasks"]
    assert (task["kind"], task["job"], task["process"]) == ("start", job, "stand-in")
    # A wait longer than the longest is shortened to it.
    monkeypatch.setattr(server_routes, "MOST_WAIT", 1)
    begin = time.monotonic()
    assert machine.ask_tasks(600).json() == {"tasks": []}
    assert 0.9 < time.monotonic() - begin < 4


def test_newer_question_ends_the_older_one_and_a_closed_connection_takes_no_task(site: Site) -> None:
    visitor, machine = site.visit("a_user"), site.machine()
    server = machine.pair(visitor)
    answers: list[tuple[float, Any]] = []
    older = threading.Thread(target=lambda: answers.append((time.monotonic(), machine.ask_tasks(20).json())))
    begin = time.monotonic()
    older.start()
    time.sleep(0.5)
    other = site.client()
    assert other.post("/api/link/tasks?wait=0", headers=machine.headers).json() == {"tasks": []}
    older.join()
    assert answers[0][0] - begin < 5
    assert answers[0][1] == {"tasks": []}
    # The program leaves a question without waiting for its answer, and a task arrives afterwards.
    with pytest.raises(httpx2.TimeoutException):
        other.post("/api/link/tasks?wait=20", headers=machine.headers, timeout=0.5)
    time.sleep(0.2)
    job = started(visitor, server=server)["jobID"]
    time.sleep(0.5)
    [task] = machine.ask_tasks(0).json()["tasks"]
    assert task["job"] == job


def test_hundred_waiting_servers_leave_the_service_responsive(site: Site, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(servers, "MAX_USER_SERVERS", 100)
    visitor = site.visit("a_user")
    machines = [site.machine(f"Computer {number}") for number in range(100)]
    for machine in machines:
        machine.pair(visitor)
    ended: dict[int, tuple[float, Any]] = {}

    def ask(number: int) -> None:
        answer = machines[number].ask_tasks(12).json()
        ended[number] = (time.monotonic(), answer)

    questions = [threading.Thread(target=ask, args=(number,)) for number in range(100)]
    begin = time.monotonic()
    for question in questions:
        question.start()
    time.sleep(2)
    # Every other address answers while the hundred questions wait. The addresses that read the record
    # run in the 40 threads of the service, so they would wait for 12 seconds if a question held a thread.
    for address in ("/api/session", "/api/layers", "/api/servers", "/api/jobs", "/api/processes") * 4:
        asked = time.monotonic()
        assert visitor.get(address).status_code == 200
        assert time.monotonic() - asked < 3
    assert len(listed(visitor)) == 100
    assert ended == {}
    asked = time.monotonic()
    job = started(visitor, server=machines[7].server)["jobID"]
    until(lambda: 7 in ended)
    assert ended[7][0] - asked < 3
    assert [task["job"] for task in ended[7][1]["tasks"]] == [job]
    assert len(ended) == 1
    for question in questions:
        question.join()
    assert len(ended) == 100
    assert all(answer == {"tasks": []} for number, (_, answer) in ended.items() if number != 7)
    assert all(11.5 < end - begin < 25 for number, (end, _) in ended.items() if number != 7)


def test_task_is_answered_once_and_in_its_own_form(site: Site) -> None:
    visitor, machine = site.visit("a_user"), site.machine()
    server = machine.pair(visitor)
    machine.silent = {"start"}
    started(visitor, server=server)
    [task] = machine.step()
    address = f"/api/link/tasks/{task.id}"
    headers = machine.headers
    problem(machine.client.post(f"/api/link/tasks/{'u' * 43}/done", json={"ok": True}, headers=headers), 404)
    # A task that starts a job is not answered with a part of a file.
    part = {**headers, "Content-Type": "application/octet-stream", "Lynkeus-File-Size": "1"}
    problem(
        machine.client.post(f"{address}/bytes", content=b"x", headers=part), 404, "The server has no unanswered task"
    )
    problem(machine.client.post(f"{address}/failure", json={"status": 404, "detail": "No file."}, headers=headers), 404)
    problem(machine.client.post(f"{address}/done", json={"ok": "perhaps"}, headers=headers), 422)
    assert machine.client.post(f"{address}/done", json={"ok": True}, headers=headers).status_code == 204
    problem(machine.client.post(f"{address}/done", json={"ok": True}, headers=headers), 404)


def test_program_that_is_quit_leaves_its_server_not_connected_at_once(site: Site) -> None:
    visitor, machine = site.visit("a_user"), site.machine()
    server = machine.pair(visitor)
    problem(machine.client.post("/api/link/leave", headers={"Authorization": "Bearer " + "k" * 43}), 401)
    with machine.serving(wait=20):
        done = state(visitor, started(visitor, server=server)["jobID"])
        layer = visitor.get(f"/api/jobs/{done['jobID']}/results").json()
        assert listed(visitor)[0]["connected"] is True
        # A request of the visitor waits for the server when its program is quit.
        machine.silent = {"read"}
        answers: list[httpx2.Response] = []
        reader = threading.Thread(target=lambda: answers.append(visitor.get(layer["url"])))
        reader.start()
        until(lambda: any(isinstance(task, ReadTask) for task in machine.tasks))
        begin = time.monotonic()
        left = machine.leave()
        assert (left.status_code, left.content) == (204, b"")
        reader.join()
    # The waiting request and the open question of the program ended at once, the question without a task.
    assert time.monotonic() - begin < 5
    problem(answers[0], 503, "Your server Field laptop is not connected.")
    machine.silent = set()
    [found] = listed(visitor)
    assert (found["connected"], found["state"]["layers"]) == (False, 1)
    assert found["seen"] > found["paired"]
    # The list, a new job, the automatic choice and the requests for the layer behave as for a server that is away.
    problem(start(visitor, server=server), 503, "Your server Field laptop is not connected.")
    assert started(visitor)["server"] is None
    for away in (
        visitor.get(layer["url"]),
        visitor.get(layer["record"], headers={"Range": "bytes=0-9"}),
        visitor.patch(f"/api/layers/{layer['id']}", json={"title": "Other"}),
        visitor.delete(f"/api/layers/{layer['id']}"),
    ):
        problem(away, 503, "Your server Field laptop is not connected.")
    assert time.monotonic() - begin < 10
    assert [entry["layer"]["id"] for entry in visitor.get("/api/layers").json()["layers"] if entry["server"]] == [
        layer["id"]
    ]
    # Its next message connects it again.
    assert machine.ask_tasks().json() == {"tasks": []}
    assert listed(visitor)[0]["connected"] is True
    assert machine.leave().status_code == 204
    assert listed(visitor)[0]["connected"] is False
    assert machine.report().status_code == 204
    with machine.serving():
        assert listed(visitor)[0]["connected"] is True
        assert visitor.get(layer["url"]).content == machine.file(layer["id"], "gcov-hhhh-20261021-small.tif")
        assert started(visitor)["server"] == {"id": server, "name": "Field laptop"}


def test_requests_that_wait_for_an_own_server_are_answered_with_503_when_the_service_stops(site: Site) -> None:
    visitor = site.visit("a_user")
    keeper, asker = site.machine("Keeper"), site.machine("Asker")
    keeper.pair(visitor)
    asker.pair(visitor)
    with keeper.serving():
        done = state(visitor, started(visitor, server=keeper.server)["jobID"])
        layer = visitor.get(f"/api/jobs/{done['jobID']}/results").json()
    # One request waits for a part of a file, and one server holds a question for tasks open.
    answers: dict[str, httpx2.Response] = {}
    waiting = [
        threading.Thread(target=lambda: answers.update(file=visitor.get(layer["url"]))),
        threading.Thread(target=lambda: answers.update(question=asker.ask_tasks(20))),
    ]
    for thread in waiting:
        thread.start()
    time.sleep(1)
    assert answers == {}
    begin = time.monotonic()
    site.service.servers.stop()
    for thread in waiting:
        thread.join()
    assert time.monotonic() - begin < 5
    later = site.visit("a_user")
    for response in (answers["file"], answers["question"], asker.ask_tasks(20), later.get(layer["url"])):
        problem(response, 503, "Lynkeus is being restarted. Ask again in a moment.")
        assert response.headers["retry-after"] == "5"
    assert time.monotonic() - begin < 5
    # The addresses that wait for no own server still answer until the service has stopped.
    assert asker.report().status_code == 204
    assert len(listed(later)) == 2


def test_stopped_service_answers_the_open_question_with_503_and_writes_no_error(tmp_path: Path) -> None:
    command = [sys.executable, "-m", "tests.service", str(tmp_path / "project")]
    with (
        subprocess.Popen(  # noqa: S603 - the interpreter of the tests runs the web service
            command, cwd=Path(__file__).parent.parent, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        ) as process,
        httpx2.Client(timeout=40) as visitor,
        httpx2.Client(timeout=40) as connection,
    ):
        try:
            assert process.stdout is not None
            assert process.stderr is not None
            visitor.base_url = connection.base_url = f"http://127.0.0.1:{int(process.stdout.readline())}"

            def answers() -> bool:
                try:
                    return visitor.get("/api/session").status_code == 200
                except httpx2.TransportError:
                    return False

            until(answers)
            assert visitor.post("/api/session/earthdata", json={"token": token("a_user")}).status_code == 200
            machine = OwnServer(connection, tmp_path / "machine")
            machine.pair(visitor)
            questions: list[httpx2.Response] = []
            question = threading.Thread(target=lambda: questions.append(machine.ask_tasks(25)))
            question.start()
            time.sleep(1)
            assert questions == []
            # The container of the web service is stopped with this signal.
            begin = time.monotonic()
            process.send_signal(signal.SIGTERM)
            question.join()
            assert time.monotonic() - begin < 5
            problem(questions[0], 503, "Lynkeus is being restarted. Ask again in a moment.")
            code = process.wait(20)
            assert time.monotonic() - begin < 10
            log = process.stderr.read()
        finally:
            if process.poll() is None:
                process.kill()
    # The web server ends its process with the signal that it received, once it has stopped in order.
    assert code in (0, -signal.SIGTERM)
    assert "Shutting down" in log
    assert "Finished server process" in log
    assert not any(word in log for word in ("ERROR", "Traceback", "Cancel", "Exception")), log


# Jobs and layers of an own server


def test_job_runs_on_the_own_server_and_its_layer_is_read_through_the_project_server(site: Site) -> None:
    secret = token("a_user")
    visitor = site.visit()
    assert visitor.post("/api/session/earthdata", json={"token": secret}).status_code == 200
    machine = site.machine("Field laptop", LARGE)
    server = machine.pair(visitor)
    machine.manual = True
    with machine.serving():
        until(lambda: listed(visitor)[0]["state"])
        # Without a wish, the job of a visitor with a connected own server goes to that server.
        response = start(visitor, "signed-in", seconds=3)
        assert response.status_code == 201
        info = response.json()
        job = info["jobID"]
        assert response.headers["location"] == f"/api/jobs/{job}"
        assert info["server"] == {"id": server, "name": "Field laptop"}
        assert (info["status"], info["message"]) == ("accepted", "The job waits for your server to take it.")
        running = state(visitor, job, "running")
        assert (running["message"], running["progress"], running["server"]) == (
            "The job has started.",
            5,
            info["server"],
        )
        assert "started" in running
        assert "finished" not in running
        [task] = [task for task in machine.tasks if isinstance(task, StartTask)]
        assert (task.job, task.process, task.title) == (job, "signed-in", "Stand-in a")
        assert json.loads(task.inputs) == info["inputs"]
        assert info["inputs"]["seconds"] == 3.0
        # The Earthdata token travels with the task, and the server reports itself.
        assert machine.tokens == {job: secret}
        [found] = listed(visitor)
        assert found["connected"] is True
        assert (found["state"]["running"], found["state"]["waiting"], found["state"]["layers"]) == (1, 0, 0)
        assert found["state"]["limits"] == {"running_jobs": 2, "storage": 10**10, "layer_size": 10**9}
        assert found["paired"] <= found["seen"] <= time.time()
        problem(visitor.get(f"/api/jobs/{job}/results"), 404, "The job has not finished yet.")
        written = machine.finish(job)
        assert written is not None
        done = state(visitor, job)
        assert (done["status"], done["progress"], done["message"]) == ("successful", 100, "The layer is ready.")
        assert done["created"] <= done["started"] <= done["finished"] <= done["updated"]
        assert done["layer"] == written.id
        layer = visitor.get(f"/api/jobs/{job}/results").json()
        assert layer == json.loads(written.model_dump_json())
        folder = f"/api/servers/{server}/files/{layer['id']}"
        assert (layer["url"], layer["record"]) == (
            f"{folder}/gcov-hhhh-20261021.tif",
            f"{folder}/gcov-hhhh-20261021.json",
        )
        [entry] = visitor.get("/api/layers").json()["layers"]
        image, record = (
            machine.file(layer["id"], "gcov-hhhh-20261021.tif"),
            machine.file(layer["id"], "gcov-hhhh-20261021.json"),
        )
        assert set(entry) == {"layer", "size", "created", "server"}
        assert (entry["layer"], entry["size"], entry["server"]) == (layer, len(image) + len(record), info["server"])
        assert [job_["jobID"] for job_ in visitor.get("/api/jobs").json()["jobs"]] == [job]
        # The project server keeps no file of the layer, and no record or answer holds the token.
        assert list((site.folder / "project" / "files").iterdir()) == []
        assert secret.encode() not in (site.folder / "project" / "lynkeus.sqlite3").read_bytes()
        assert secret not in visitor.get(f"/api/jobs/{job}").text + visitor.get("/api/jobs").text

        # The whole file passes in parts of at most MOST_BYTES bytes, in order.
        assert len(image) > MOST_BYTES
        machine.tasks.clear()
        whole = visitor.get(layer["url"])
        assert whole.status_code == 200
        assert whole.content == image
        assert whole.headers["content-type"] == "image/tiff; application=geotiff; profile=cloud-optimized"
        assert (whole.headers["content-length"], whole.headers["accept-ranges"]) == (str(len(image)), "bytes")
        assert "content-range" not in whole.headers
        reads = [task for task in machine.tasks if isinstance(task, ReadTask)]
        expected = [(first, min(first + MOST_BYTES, len(image))) for first in range(0, len(image), MOST_BYTES)]
        assert len(expected) == 3
        assert [(read.start, read.end) for read in reads] == expected
        assert all(read.end - read.start <= MOST_BYTES and read.file == "gcov-hhhh-20261021.tif" for read in reads)
        text = visitor.get(layer["record"])
        assert (text.status_code, text.content) == (200, record)
        assert text.headers["content-type"] == "application/geo+json"
        assert text.json()["properties"]["title"] == "Stand-in a"

        # Ranges of bytes, as a map reads a Cloud Optimized GeoTIFF.
        size = len(image)
        for wanted, first, last in (
            ("bytes=0-99", 0, 99),
            ("bytes=0-0", 0, 0),
            ("bytes=65536-131071", 65536, 131071),
            (f"bytes={MOST_BYTES - 1000}-{MOST_BYTES + 999}", MOST_BYTES - 1000, MOST_BYTES + 999),
            (f"bytes={size - 10}-", size - 10, size - 1),
            (f"bytes={size - 10}-{size + 500}", size - 10, size - 1),
            ("bytes=-500", size - 500, size - 1),
            (f"bytes=-{size + 9}", 0, size - 1),
            ("bytes=100000-", 100000, size - 1),
        ):
            part = visitor.get(layer["url"], headers={"Range": wanted})
            assert part.status_code == 206, wanted
            assert part.content == image[first : last + 1], wanted
            assert part.headers["content-range"] == f"bytes {first}-{last}/{size}"
            assert part.headers["content-length"] == str(last - first + 1)
        # A request for several ranges, or for another unit, receives the whole file.
        for unread in ("bytes=0-9,20-29", "cells=0-9", "bytes=9-0", "bytes=-"):
            assert visitor.get(layer["record"], headers={"Range": unread}).content == record
        for beyond in (f"bytes={size}-", "bytes=-0"):
            outside = visitor.get(layer["url"], headers={"Range": beyond})
            problem(outside, 416)
            assert outside.headers["content-range"] == f"bytes */{size}"
        problem(visitor.get(f"{folder}/other.tif"), 404, "Your server keeps no such file.")
        problem(visitor.get(f"/api/servers/{server}/files/{'0' * 32}/gcov-hhhh-20261021.tif"), 404)
        assert visitor.get(f"{folder}/..%2Flynkeus.sqlite3").status_code == 404


def test_another_user_reaches_no_server_no_job_and_no_layer_of_the_owner(site: Site) -> None:
    owner, other = site.visit("a_user"), site.visit("another_user")
    machine = site.machine()
    server = machine.pair(owner)
    machine.manual = True
    with machine.serving():
        job = started(owner)["jobID"]
        state(owner, job, "running")
        for address in (f"/api/jobs/{job}", f"/api/jobs/{job}/results"):
            problem(other.get(address), 404, "Your session has no job of this name.")
        problem(other.delete(f"/api/jobs/{job}"), 404, "Your session has no job of this name.")
        machine.finish(job)
        layer = owner.get(f"/api/jobs/{state(owner, job)['jobID']}/results").json()
        assert other.get("/api/jobs").json()["jobs"] == []
        assert other.get("/api/layers").json() == {"layers": []}
        assert listed(other) == []
        problem(other.patch(f"/api/servers/{server}", json={"name": "Taken"}), 404, "You have no server of this name.")
        problem(other.delete(f"/api/servers/{server}"), 404, "You have no server of this name.")
        problem(other.get(layer["url"]), 404, "You have no server of this name.")
        problem(other.get(layer["record"], headers={"Range": "bytes=0-9"}), 404)
        problem(other.get(f"/api/jobs/{job}/results"), 404)
        problem(other.patch(f"/api/layers/{layer['id']}", json={"title": "Taken"}), 404, "Your session has no layer")
        problem(other.delete(f"/api/layers/{layer['id']}"), 404, "Your session has no layer")
        problem(start(other, server=server), 404, "You have no server of this name.")
        # The job of the other user runs on the project server, not on the connected server of the owner.
        assert started(other)["server"] is None
        assert [task.kind for task in machine.tasks] == ["start"]

        # The owner finds the server, the job and the layer from another browser in which he signs in.
        second = site.visit("a_user")
        assert [found["id"] for found in listed(second)] == [server]
        assert [found["jobID"] for found in second.get("/api/jobs").json()["jobs"]] == [job]
        assert [entry["layer"]["id"] for entry in second.get("/api/layers").json()["layers"]] == [layer["id"]]
        assert second.get(layer["url"]).content == machine.file(layer["id"], "gcov-hhhh-20261021-small.tif")
        # After he signs out, the session reaches them no longer.
        assert second.delete("/api/session/earthdata").status_code == 204
        assert second.get("/api/jobs").json()["jobs"] == []
        assert second.get("/api/layers").json() == {"layers": []}
        problem(second.get(f"/api/jobs/{job}"), 404)
        problem(second.get(layer["url"]), 401)
        assert owner.get(f"/api/jobs/{job}").json()["server"]["name"] == "Field laptop"


def test_parameter_server_chooses_where_a_job_runs(site: Site, monkeypatch: pytest.MonkeyPatch) -> None:
    visitor = site.visit("a_user")
    first, second = site.machine("First"), site.machine("Second")
    first.pair(visitor)
    time.sleep(0.01)
    second.pair(visitor)
    problem(start(visitor, server="Project"), 400, "The parameter server must be the name of one of your servers")
    problem(start(visitor, server="0123456789abcdef"), 404, "You have no server of this name.")
    first.manual = second.manual = True
    with first.serving(), second.serving():
        # The word project names the project server, whose own process runs the job.
        ours = started(visitor, server="project")
        assert ours["server"] is None
        assert state(visitor, ours["jobID"])["status"] == "successful"
        project_layer = visitor.get(f"/api/jobs/{ours['jobID']}/results").json()
        assert project_layer["url"].startswith("/files/")
        # Without a wish the job goes to the connected server with the fewest unfinished jobs.
        one = started(visitor)
        assert one["server"]["name"] == "First"
        two = started(visitor)
        assert two["server"]["name"] == "Second"
        three = started(visitor, server=second.server)
        assert three["server"]["name"] == "Second"
        four = started(visitor)
        assert four["server"]["name"] == "First"
        placed = ((first, one), (second, two), (second, three), (first, four))
        until(lambda: all(job["jobID"] in machine.jobs for machine, job in placed))
        for machine, job in placed:
            machine.finish(job["jobID"])
        on_first = visitor.get(f"/api/jobs/{state(visitor, one['jobID'])['jobID']}/results").json()["id"]
        on_second = visitor.get(f"/api/jobs/{state(visitor, two['jobID'])['jobID']}/results").json()["id"]
        state(visitor, three["jobID"])
        state(visitor, four["jobID"])

        # A job that reads layers goes to the server that keeps them all.
        assert started(visitor, "uses-layers", uses=[on_second])["server"]["name"] == "Second"
        assert started(visitor, "uses-layers", uses=[project_layer["id"]])["server"] is None
        assert started(visitor, "uses-layers", server=first.server, uses=[on_first])["server"]["name"] == "First"
        # A layer that no server keeps is found missing by the job, as before.
        unknown = started(visitor, "uses-layers", server="project", uses=["f" * 32])
        assert (unknown["server"], state(visitor, unknown["jobID"])["status"]) == (None, "failed")
        # Input layers of more than one server are refused with 422 and one sentence.
        sentence = "and a job takes input layers of its own server only."
        for server, uses in (
            (None, [on_first, on_second]),
            (None, [on_first, project_layer["id"]]),
            ("project", [on_first]),
            (first.server, [on_second]),
            (first.server, [on_first, project_layer["id"]]),
            (second.server, ["f" * 32]),
        ):
            refused = start(visitor, "uses-layers", server, uses=uses)
            problem(refused, 422)
            assert refused.json()["detail"].endswith(sentence), refused.text
            assert refused.json()["detail"].count(". ") == 0
    # A server that is not connected receives no new job.
    monkeypatch.setattr(servers, "CONNECTED_TIME", 0.5)
    time.sleep(0.6)
    assert [found["connected"] for found in listed(visitor)] == [False, False]
    away = start(visitor, server=first.server)
    problem(away, 503, "Your server First is not connected.")
    assert away.headers["retry-after"] == "30"
    problem(start(visitor, "uses-layers", uses=[on_second]), 503, "Your server Second is not connected.")
    assert started(visitor)["server"] is None


def test_limits_of_the_project_server_are_not_applied_to_an_own_server(
    site: Site, monkeypatch: pytest.MonkeyPatch
) -> None:
    visitor, machine = site.visit("a_user"), site.machine()
    server = machine.pair(visitor)
    with machine.serving():
        monkeypatch.setattr(jobs, "MAX_SESSION_UNFINISHED_JOBS", 0)
        problem(start(visitor, server="project"), 429, "You have 0 jobs that wait or run")
        done = [state(visitor, started(visitor, server=server)["jobID"]) for _ in range(3)]
        assert [info["status"] for info in done] == ["successful"] * 3
        monkeypatch.setattr(jobs, "MAX_SESSION_UNFINISHED_JOBS", 4)
        # Three layers of the own server do not count towards the layers and the space of the session.
        monkeypatch.setattr(jobs, "MAX_SESSION_LAYERS", 1)
        monkeypatch.setattr(jobs, "MAX_SESSION_SIZE", 3000)
        assert len(visitor.get("/api/layers").json()["layers"]) == 3
        ours = started(visitor, server="project")
        assert state(visitor, ours["jobID"])["status"] == "successful"
        problem(start(visitor, server="project"), 507, "A session holds at most 1 layers.")
        assert state(visitor, started(visitor, server=server)["jobID"])["status"] == "successful"
        # The record of the project server holds a limited number of unfinished jobs of one server.
        monkeypatch.setattr(servers, "MAX_SERVER_UNFINISHED_JOBS", 1)
        machine.manual = True
        waiting = started(visitor, server=server)["jobID"]
        problem(start(visitor, server=server), 429, "Your server Field laptop has 1 jobs that wait or run")
        state(visitor, waiting, "running")
        machine.finish(waiting)
        state(visitor, waiting)
        monkeypatch.setattr(servers, "MAX_SERVER_LAYERS", 5)
        problem(start(visitor, server=server), 507, "Lynkeus records at most 5 layers of one server.")


def test_own_server_that_does_not_offer_the_process_refuses_the_job(site: Site) -> None:
    visitor, machine = site.visit("a_user"), site.machine()
    server = machine.pair(visitor)
    machine.offered = {"get-layer"}
    with machine.serving():
        failed = state(visitor, started(visitor, server=server)["jobID"])
        assert (failed["status"], failed["message"]) == ("failed", "Your server does not offer the process stand-in.")
        problem(visitor.get(f"/api/jobs/{failed['jobID']}/results"), 500, "Your server does not offer")
        machine.offered = None
        machine.manual = True
        job = started(visitor, server=server)["jobID"]
        state(visitor, job, "running")
        machine.finish(job, "NASA Harmony did not deliver the layer.")
        assert state(visitor, job)["message"] == "NASA Harmony did not deliver the layer."


def test_dismissed_job_of_an_own_server_is_ended_by_a_task(site: Site) -> None:
    visitor, machine = site.visit("a_user"), site.machine()
    server = machine.pair(visitor)
    # A job that the server has not received yet is never given to it.
    never = started(visitor, server=server)["jobID"]
    dismissed = visitor.delete(f"/api/jobs/{never}")
    assert (dismissed.status_code, dismissed.json()["status"]) == (200, "dismissed")
    assert dismissed.json()["server"] == {"id": server, "name": "Field laptop"}
    problem(visitor.get(f"/api/jobs/{never}"), 410, "The job was dismissed.")
    assert machine.step() == []
    machine.manual = True
    with machine.serving():
        job = started(visitor, server=server)["jobID"]
        state(visitor, job, "running")
        assert visitor.delete(f"/api/jobs/{job}").json()["message"] == "The job was dismissed."
        problem(visitor.delete(f"/api/jobs/{job}"), 410)
        assert visitor.get("/api/jobs").json()["jobs"] == []
        until(lambda: machine.jobs[job].status == "dismissed")
        assert [task.job for task in machine.tasks if isinstance(task, DismissTask)] == [job]
        # A finished job is dismissed on the server too, and its layer stays.
        machine.manual = False
        done = state(visitor, started(visitor, server=server)["jobID"])
        assert visitor.delete(f"/api/jobs/{done['jobID']}").json()["status"] == "dismissed"
        until(lambda: len([task for task in machine.tasks if isinstance(task, DismissTask)]) == 2)
        assert [entry["layer"]["id"] for entry in visitor.get("/api/layers").json()["layers"]] == [done["layer"]]


def test_server_ends_a_job_that_the_record_holds_as_dismissed_or_not_at_all(site: Site) -> None:
    visitor, machine = site.visit("a_user"), site.machine()
    server = machine.pair(visitor)
    machine.manual = True
    job = started(visitor, server=server)["jobID"]
    machine.step()
    state(visitor, job, "running")
    assert visitor.delete(f"/api/jobs/{job}").status_code == 200
    # The task that ends the job is lost with a restart of the project server; the next report brings it again.
    site.service.servers._links.clear()
    assert machine.step() == []
    machine._set(job, progress=50)
    assert machine.report().status_code == 204
    assert machine.report().status_code == 204
    [task] = machine.step()
    assert isinstance(task, DismissTask)
    assert task.job == job
    # The server had finished the job before it was told to end it: it is told to delete the layer.
    machine.jobs[job] = machine.jobs[job].model_copy(update={"status": "running"})
    layer = machine.finish(job)
    assert layer is not None
    [task] = machine.step()
    assert isinstance(task, RemoveTask)
    assert task.layer == layer.id
    assert visitor.get("/api/layers").json() == {"layers": []}
    unknown = machine.jobs[job].model_copy(update={"job": "0" * 32, "status": "accepted", "layer": None, "size": None})
    assert machine.report(unknown).status_code == 204
    [task] = machine.step()
    assert isinstance(task, DismissTask)
    assert task.job == "0" * 32


def test_layer_of_an_own_server_is_renamed_and_removed_by_tasks(site: Site, monkeypatch: pytest.MonkeyPatch) -> None:
    visitor, machine = site.visit("a_user"), site.machine()
    server = machine.pair(visitor)
    with machine.serving():
        done = state(visitor, started(visitor, server=server)["jobID"])
        layer = visitor.get(f"/api/jobs/{done['jobID']}/results").json()
        address = f"/api/layers/{layer['id']}"
        renamed = visitor.patch(address, json={"title": "  Backscatter HH of the estuary "})
        assert renamed.status_code == 200
        entry = renamed.json()
        assert set(entry) == {"layer", "size", "created", "server"}
        assert (entry["layer"]["title"], entry["server"]["id"]) == ("Backscatter HH of the estuary", server)
        assert entry["layer"] == {**layer, "title": "Backscatter HH of the estuary"}
        assert visitor.get("/api/layers").json()["layers"] == [entry]
        # The server changed the title in its files, which are read through the project server.
        assert visitor.get(layer["record"]).json()["properties"]["title"] == "Backscatter HH of the estuary"
        assert visitor.get(f"/api/jobs/{done['jobID']}/results").json()["title"] == "Backscatter HH of the estuary"
        problem(visitor.patch(address, json={"title": ""}), 400)

        machine.refused = {"rename", "remove"}
        problem(visitor.patch(address, json={"title": "Other"}), 409, "Your server keeps no layer of this name.")
        problem(visitor.delete(address), 409, "Your server keeps no layer of this name.")
        machine.refused = set()
        monkeypatch.setattr(servers, "READ_TIME", 1)
        machine.silent = {"rename", "remove", "read"}
        for late in (
            visitor.patch(address, json={"title": "Other"}),
            visitor.delete(address),
            visitor.get(layer["url"]),
        ):
            problem(late, 504, "Your server Field laptop did not answer in time.")
        machine.silent = set()
        machine.refused = {"read"}
        problem(visitor.get(layer["url"]), 502, "The stand-in could not read the file.")
        machine.refused = set()
        assert visitor.get("/api/layers").json()["layers"] == [entry]

        folder = machine.folder / "files" / layer["id"]
        assert len(list(folder.iterdir())) == 2
        assert visitor.delete(address).status_code == 204
        assert not folder.exists()
        assert visitor.get("/api/layers").json() == {"layers": []}
        problem(visitor.delete(address), 404, "Your session has no layer of this name.")
        problem(visitor.get(layer["url"]), 404, "Your server keeps no such file.")
        # The record of the job that produced the layer is removed with it.
        problem(visitor.get(f"/api/jobs/{done['jobID']}"), 404)
        kept = state(visitor, started(visitor, server=server)["jobID"])
        layer = visitor.get(f"/api/jobs/{kept['jobID']}/results").json()
    # A server that is not connected is not asked.
    monkeypatch.setattr(servers, "CONNECTED_TIME", 0.3)
    time.sleep(0.4)
    for away in (
        visitor.patch(f"/api/layers/{layer['id']}", json={"title": "Other"}),
        visitor.delete(f"/api/layers/{layer['id']}"),
        visitor.get(layer["url"]),
        visitor.get(layer["record"], headers={"Range": "bytes=0-9"}),
    ):
        problem(away, 503, "Your server Field laptop is not connected.")
    assert [entry["layer"]["id"] for entry in visitor.get("/api/layers").json()["layers"]] == [layer["id"]]


def test_file_that_fails_after_its_first_part_ends_the_answer_early(
    site: Site, monkeypatch: pytest.MonkeyPatch
) -> None:
    visitor, machine = site.visit("a_user"), site.machine("Field laptop", LARGE)
    server = machine.pair(visitor)
    with machine.serving():
        done = state(visitor, started(visitor, server=server)["jobID"])
        layer = visitor.get(f"/api/jobs/{done['jobID']}/results").json()
        image = machine.file(layer["id"], "gcov-hhhh-20261021.tif")
        monkeypatch.setattr(servers, "READ_TIME", 1)
        with visitor.stream("GET", layer["url"]) as response:
            assert response.status_code == 200
            assert response.headers["content-length"] == str(len(image))
            parts = response.iter_raw()
            received = next(parts)
            machine.silent = {"read"}
            with pytest.raises(httpx2.HTTPError):
                for part in parts:
                    received += part
        assert received == image[: len(received)]
        assert len(received) <= MOST_BYTES
        machine.silent = set()
        assert visitor.get(layer["url"]).content == image


def test_job_keeps_its_state_while_its_server_is_away_and_continues_when_it_reports_again(
    site: Site, monkeypatch: pytest.MonkeyPatch
) -> None:
    visitor, machine = site.visit("a_user"), site.machine()
    server = machine.pair(visitor)
    machine.manual = True
    with machine.serving():
        job = started(visitor, server=server)["jobID"]
        before = state(visitor, job, "running")
    monkeypatch.setattr(servers, "CONNECTED_TIME", 0.5)
    time.sleep(1.1)
    [found] = listed(visitor)
    assert found["connected"] is False
    assert found["state"]["running"] == 1
    assert time.time() - found["seen"] > 0.5
    assert visitor.get(f"/api/jobs/{job}").json() == before
    machine._set(job, progress=60, message="The layer is being written.")
    assert machine.report().status_code == 204
    assert listed(visitor)[0]["connected"] is True
    now = visitor.get(f"/api/jobs/{job}").json()
    assert (now["status"], now["progress"], now["message"]) == ("running", 60, "The layer is being written.")
    machine.finish(job)
    assert state(visitor, job)["status"] == "successful"


def test_job_that_its_server_no_longer_holds_is_recorded_as_failed(site: Site) -> None:
    visitor, machine = site.visit("a_user"), site.machine()
    server = machine.pair(visitor)
    machine.manual = True
    assert machine.report().status_code == 204
    job = started(visitor, server=server)["jobID"]
    machine.silent = {"start"}
    [task] = machine.step()
    assert (
        machine.client.post(f"/api/link/tasks/{task.id}/done", json={"ok": True}, headers=machine.headers).status_code
        == 204
    )
    # The record of the server is deleted. Its first report after the task may have been made before
    # the server recorded the job, so it decides nothing; the second one does.
    machine.lose_jobs()
    assert machine.state().running + machine.state().waiting == 0
    assert machine.report().status_code == 204
    assert visitor.get(f"/api/jobs/{job}").json()["status"] == "accepted"
    assert machine.report().status_code == 204
    failed = visitor.get(f"/api/jobs/{job}").json()
    assert (failed["status"], failed["message"]) == (
        "failed",
        "Your server no longer holds this job. Start the job again.",
    )
    assert failed["message"].count(". ") == 1
    # A server that holds the job is not affected by such reports of another state.
    machine.silent = set()
    kept = started(visitor, server=server)["jobID"]
    machine.step()
    for _ in range(3):
        assert machine.report().status_code == 204
    assert visitor.get(f"/api/jobs/{kept}").json()["status"] == "running"


def test_task_that_a_server_never_answered_does_not_keep_its_job_waiting_for_ever(
    site: Site, monkeypatch: pytest.MonkeyPatch
) -> None:
    visitor, machine = site.visit("a_user"), site.machine()
    server = machine.pair(visitor)
    assert machine.report().status_code == 204
    job = started(visitor, server=server)["jobID"]
    # The answer with the task never reaches the server.
    [task] = machine.ask_tasks().json()["tasks"]
    assert task["job"] == job
    for _ in range(3):
        assert machine.report().status_code == 204
    assert visitor.get(f"/api/jobs/{job}").json()["status"] == "accepted"
    monkeypatch.setattr(servers, "TASK_TIME", 0.2)
    time.sleep(0.3)
    assert machine.step() == []
    for _ in range(2):
        assert machine.report().status_code == 204
    assert (
        visitor.get(f"/api/jobs/{job}").json()["message"]
        == "Your server no longer holds this job. Start the job again."
    )
    problem(machine.client.post(f"/api/link/tasks/{task['id']}/done", json={"ok": True}, headers=machine.headers), 404)


def test_restart_of_the_project_server_keeps_the_servers_and_the_jobs_that_they_took(
    tmp_path: Path, keys: KeyServer
) -> None:
    with running(tmp_path, keys) as site:
        visitor, machine = site.visit("a_user"), site.machine()
        server = machine.pair(visitor)
        machine.manual = True
        done = started(visitor, server=server)["jobID"]
        taken = started(visitor, server=server)["jobID"]
        machine.step()
        layer = machine.finish(done)
        assert layer is not None
        state(visitor, done)
        waiting = started(visitor, server=server)["jobID"]
    with running(tmp_path, keys) as site:
        visitor = site.visit("a_user")
        machine.client = site.client()
        [found] = listed(visitor)
        assert (found["id"], found["name"], found["state"]["running"]) == (server, "Field laptop", 1)
        info = {job["jobID"]: job for job in visitor.get("/api/jobs").json()["jobs"]}
        assert [info[job]["status"] for job in (done, taken, waiting)] == ["successful", "running", "failed"]
        assert info[waiting]["message"] == "Lynkeus was restarted before your server took the job. Start the job again."
        assert all(job["server"] == {"id": server, "name": "Field laptop"} for job in info.values())
        # The key is still the key of the server, and the server receives no task for the failed job.
        assert machine.step() == []
        assert machine.report().status_code == 204
        machine.finish(taken)
        assert state(visitor, taken)["status"] == "successful"
        assert len(visitor.get("/api/layers").json()["layers"]) == 2
        with machine.serving():
            assert visitor.get(layer.url).content == machine.file(layer.id, "gcov-hhhh-20261021-small.tif")


def test_layer_that_a_server_reports_in_a_wrong_form_is_not_recorded(site: Site) -> None:
    owner, other = site.visit("a_user"), site.visit("another_user")
    machine, victim = site.machine(), site.machine("Other laptop")
    server = machine.pair(owner)
    victim.pair(other)
    machine.manual = True
    wrong = [
        {"url": "/files/0123456789abcdef0123456789abcdef/a.tif"},
        {"url": f"/api/servers/{victim.server}/files/LAYER/NAME.tif"},
        {"record": "/api/servers/SERVER/files/LAYER/../../lynkeus.json"},
        {"id": "short"},
    ]
    for change in wrong:
        job = started(owner, server=server)["jobID"]
        machine.step()
        layer = machine.finish(job)
        assert layer is not None
        text = {name: value.replace("SERVER", server).replace("LAYER", layer.id) for name, value in change.items()}
        text = {name: value.replace("NAME", "gcov-hhhh-20261021-small") for name, value in text.items()}
        assert state(owner, job)["status"] == "successful"
        again = started(owner, server=server)["jobID"]
        machine.step()
        reported = machine.jobs[job].model_copy(update={"job": again, "layer": layer.model_copy(update=text)})
        assert machine.report(reported).status_code == 204
        failed = owner.get(f"/api/jobs/{again}").json()
        assert failed["status"] == "failed", change
        assert (
            failed["message"]
            == "The job failed because your server reported its layer in a form that Lynkeus does not take."
        )
    assert len(owner.get("/api/layers").json()["layers"]) == 4
    assert other.get("/api/layers").json() == {"layers": []}


# The servers of a user


def test_owner_renames_a_server_and_sets_its_limits(site: Site, monkeypatch: pytest.MonkeyPatch) -> None:
    visitor, machine = site.visit("a_user"), site.machine()
    server = machine.pair(visitor)
    limits = {"running_jobs": 4, "storage": 5 * 10**10, "layer_size": 2 * 10**9}
    with machine.serving():
        job = state(visitor, started(visitor, server=server)["jobID"])
        changed = visitor.patch(f"/api/servers/{server}", json={"name": "Office computer"})
        assert changed.status_code == 200
        assert (changed.json()["id"], changed.json()["name"]) == (server, "Office computer")
        assert visitor.get(f"/api/jobs/{job['jobID']}").json()["server"] == {"id": server, "name": "Office computer"}
        assert visitor.get("/api/layers").json()["layers"][0]["server"]["name"] == "Office computer"
        # The limits pass to the server as a task, and its state shows them once it has applied them.
        assert visitor.patch(f"/api/servers/{server}", json={"limits": limits}).status_code == 200
        until(lambda: listed(visitor)[0]["state"]["limits"] == limits)
        assert json.loads(machine.limits.model_dump_json()) == limits
        assert visitor.patch(f"/api/servers/{server}", json={}).json()["name"] == "Office computer"
    # Limits that are set while the server is away reach it with its next report.
    monkeypatch.setattr(servers, "CONNECTED_TIME", 0.3)
    time.sleep(0.4)
    later = {**limits, "running_jobs": 1}
    away = visitor.patch(f"/api/servers/{server}", json={"limits": later, "name": "Laptop"})
    assert (away.status_code, away.json()["connected"], away.json()["state"]["limits"]) == (200, False, limits)
    assert machine.step() == []
    assert machine.report().status_code == 204
    assert [task.kind for task in machine.step()] == ["limits"]
    assert listed(visitor)[0]["state"]["limits"] == later
    assert machine.report().status_code == 204
    assert machine.step() == []
    # Limits that the server refuses are not sent again.
    machine.refused = {"limits"}
    assert visitor.patch(f"/api/servers/{server}", json={"limits": limits}).status_code == 200
    assert [task.kind for task in machine.step()] == ["limits"]
    assert machine.report().status_code == 204
    assert machine.step() == []
    assert listed(visitor)[0]["state"]["limits"] == later


def test_removed_server_is_told_to_forget_its_pairing_and_keeps_its_files(site: Site) -> None:
    visitor = site.visit("a_user")
    machine, other = site.machine("Field laptop"), site.machine("Office computer")
    server = machine.pair(visitor)
    other.pair(visitor)
    with machine.serving(wait=20):
        done = state(visitor, started(visitor, server=server)["jobID"])
        layer = visitor.get(f"/api/jobs/{done['jobID']}/results").json()
        machine.manual = True
        running = started(visitor, server=server)["jobID"]
        state(visitor, running, "running")
        assert visitor.delete(f"/api/servers/{server}").status_code == 204
        # The open question of the server is answered at once with the task.
        until(lambda: machine.forgotten, 5)
    assert [task.kind for task in machine.tasks][-1] == "forget"
    assert [found["name"] for found in listed(visitor)] == ["Office computer"]
    assert visitor.get("/api/layers").json() == {"layers": []}
    assert visitor.get("/api/jobs").json()["jobs"] == []
    for address in (f"/api/jobs/{done['jobID']}", f"/api/jobs/{running}", layer["url"]):
        problem(visitor.get(address), 404)
    problem(visitor.delete(f"/api/servers/{server}"), 404, "You have no server of this name.")
    # The files of the layer stay on the computer, and the key names nothing any more.
    assert len(list((machine.folder / "files" / layer["id"]).iterdir())) == 2
    problem(machine.ask_tasks(), 401, "This key names no server.")
    problem(machine.report(), 401)
    assert other.ask_tasks().status_code == 200


def test_server_that_is_away_when_it_is_removed_receives_401(site: Site) -> None:
    visitor, machine = site.visit("a_user"), site.machine()
    server = machine.pair(visitor)
    assert visitor.delete(f"/api/servers/{server}").status_code == 204
    problem(machine.report(), 401)
    # The task to forget is kept for the time in which the server counts as connected.
    [task] = machine.step()
    assert task.kind == "forget"
    assert machine.forgotten
    problem(machine.ask_tasks(), 401)


@pytest.mark.parametrize(
    ("header", "wanted"),
    [
        (None, None),
        ("bytes=0-65535", (0, 65535)),
        ("bytes=65536-", (65536, None)),
        ("bytes=-512", (None, 512)),
        ("bytes = 7 - 7", (7, 7)),
        ("bytes=-", None),
        ("bytes=5-4", None),
        ("bytes=0-9,20-29", None),
        ("cells=0-9", None),
        ("bytes=a-b", None),
        ("bytes=1" + "0" * 30 + "-", None),
    ],
)
def test_range_of_bytes_is_read_from_its_header(
    header: str | None, wanted: tuple[int | None, int | None] | None
) -> None:
    assert byte_range(header) == wanted
