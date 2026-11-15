# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""Tests of the addresses of the sessions, the processes, the jobs, the layers and the storage (``docs/Storage.md``)."""

import hashlib
import json
import logging
import shutil
import sqlite3
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from lynkeus import __version__, jobs, routes, server, sessions
from lynkeus.references import UnreadableReferenceError
from lynkeus.routes import Service, install
from lynkeus.store import Holder
from tests.standin import SIGNED_IN, STAND_IN, KeyServer, key_server, token
from tests.test_store import VERSION_3, _confirmed

JSON = {"Content-Type": "application/json"}
OGC = "http://www.opengis.net/def/"

type Visit = Callable[[], TestClient]


def _read(address: str) -> object:
    if address != "https://example.org/name.json":
        raise UnreadableReferenceError("A link given as an input value could not be read.")
    return "from-a-link"


@pytest.fixture
def keys() -> Iterator[KeyServer]:
    with key_server() as server:
        yield server


@contextmanager
def _running(folder: Path, keys: KeyServer) -> Iterator[Visit]:
    """Run the web service on a folder, and return what makes a visitor with a cookie jar of its own."""
    app = FastAPI(openapi_url="/api/openapi.json")
    install(app, [STAND_IN, SIGNED_IN], folder=folder, keys_address=keys.address, read=_read)
    with TestClient(app, base_url="https://testserver") as first:
        app.state.clients = [first]

        def visit() -> TestClient:
            visitor = TestClient(app, base_url="https://testserver")
            app.state.clients.append(visitor)
            return visitor

        yield visit


@pytest.fixture
def visit(tmp_path: Path, keys: KeyServer) -> Iterator[Visit]:
    with _running(tmp_path, keys) as visitor:
        yield visitor


def _sign_in(client: TestClient, user: str = "test_user") -> TestClient:
    """Sign a visitor in to Earthdata as a user, and return the visitor."""
    response = client.post("/api/session/earthdata", json={"token": token(user)})
    assert response.status_code == 200, response.text
    assert response.json() == {"earthdata": {"user": user, "token": True}}
    return client


@pytest.fixture
def client(visit: Visit) -> TestClient:
    """Return a visitor who is signed in to Earthdata as ``test_user``."""
    return _sign_in(visit())


@pytest.fixture
def visitor(visit: Visit) -> TestClient:
    """Return a visitor who is not signed in."""
    return visit()


def _removes_cookie(response: Any) -> bool:
    """Tell whether an answer removes the cookie of the session."""
    cookie = response.headers.get("set-cookie", "")
    return cookie.startswith('lynkeus_session="";') and "Max-Age=0" in cookie and "Path=/api" in cookie


def _cookie(key: str) -> dict[str, str]:
    """Return the header with which a request carries a key of a session that the visitor does not hold in a jar."""
    return {"Cookie": f"lynkeus_session={key}"}


def _forget_token(client: TestClient) -> None:
    """Make the web service forget the Earthdata tokens that it holds, as it does after their time."""
    monkey = pytest.MonkeyPatch()
    monkey.setattr(sessions, "EARTHDATA_TIME", -1.0)
    try:
        _service(client).sessions.remove_unused()
    finally:
        monkey.undo()


def _service(client: TestClient) -> Service:
    service: Service = client.app.state.lynkeus  # type: ignore[attr-defined]
    return service


def _start(client: TestClient, process: str = "stand-in", **inputs: object) -> dict[str, Any]:
    response = client.post(f"/api/processes/{process}/execution", json={"inputs": {"name": "a", **inputs}})
    assert response.status_code == 201, response.text
    info: dict[str, Any] = response.json()
    return info


def _layers(client: TestClient) -> list[dict[str, Any]]:
    """Return the descriptions of the layers of the visitor, the newest first."""
    entries = client.get("/api/layers").json()["layers"]
    assert all(set(entry) == {"layer", "size", "created", "server", "kept_until", "source"} for entry in entries)
    assert all(entry["server"] is None for entry in entries)
    return [entry["layer"] for entry in entries]


def _wait(client: TestClient, job: str, *states: str) -> dict[str, Any]:
    """Wait until a job is in one of the states, and return its state."""
    limit = time.monotonic() + 30
    while time.monotonic() < limit:
        info: dict[str, Any] = client.get(f"/api/jobs/{job}").json()
        if info["status"] in (states or ("successful", "failed")):
            return info
        time.sleep(0.05)
    raise AssertionError(f"the job stayed in the state {info['status']}")


def _problem(response: Any, status: int, detail: str, kind: str = "about:blank") -> None:
    assert response.status_code == status, response.text
    assert response.headers["content-type"] == "application/problem+json"
    body = response.json()
    assert (body["status"], body["type"]) == (status, kind)
    assert isinstance(body["title"], str)
    assert body["detail"].startswith(detail), body["detail"]


# Sessions


def test_visitor_who_does_not_sign_in_receives_no_session_and_no_cookie(visitor: TestClient) -> None:
    response = visitor.get("/api/session")
    assert (response.status_code, response.json()) == (200, {"earthdata": None})
    assert "set-cookie" not in response.headers
    for address in ("/api/", "/api/conformance", "/api/processes", "/api/jobs", "/api/layers", "/api/series"):
        answer = visitor.get(address)
        assert (answer.status_code, "set-cookie" in answer.headers) == (200, False)
    assert visitor.get("/api/layers").json() == {"layers": []}
    assert "set-cookie" not in visitor.get("/api/jobs/unknown").headers
    out = visitor.delete("/api/session/earthdata")
    assert (out.status_code, "set-cookie" in out.headers) == (204, False)
    # The start of a job makes no session either: a job belongs to an account.
    for process in ("stand-in", "signed-in"):
        refused = visitor.post(f"/api/processes/{process}/execution", json={"inputs": {"name": "a"}})
        _problem(refused, 401, "Sign in to Earthdata to start this job.")
        assert refused.headers["www-authenticate"] == 'Bearer realm="Earthdata Login"'
        assert "set-cookie" not in refused.headers
    assert _service(visitor).store.count_sessions() == 0


def test_sign_in_makes_the_session_with_a_protected_cookie(visitor: TestClient) -> None:
    response = visitor.post("/api/session/earthdata", json={"token": f"  {token('a_user')}\n"})
    assert response.status_code == 200
    assert response.json() == {"earthdata": {"user": "a_user", "token": True}}
    cookie = response.headers["set-cookie"]
    name, key = cookie.split(";")[0].split("=")
    assert name == "lynkeus_session"
    assert len(key) == 43
    # The cookie lives for the keeping time, which is the time without use after which the session ends.
    assert (sessions.SESSION_IDLE_TIME, jobs.KEEP_TIME) == (1209600, 1209600)
    assert set(cookie.split("; ")[1:]) == {"HttpOnly", "Max-Age=1209600", "Path=/api", "SameSite=strict", "Secure"}
    # The cookie is given again whenever the page asks for the state, so that its time starts again.
    again = visitor.get("/api/session")
    assert again.json() == {"earthdata": {"user": "a_user", "token": True}}
    assert again.headers["set-cookie"] == cookie
    store = _service(visitor).store
    assert store.count_sessions() == 1
    found = store.session_of_key(hashlib.sha256(key.encode()).hexdigest())
    assert found is not None
    assert found.account == "a_user"
    # The record holds the digest of the key, and never the key.
    assert key.encode() not in (Path(_service(visitor).folder) / "lynkeus.sqlite3").read_bytes()


def test_cookie_may_pass_over_plain_http_only_when_the_setting_says_so(
    tmp_path: Path, keys: KeyServer, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("LYNKEUS_COOKIE_SECURE", "false")
    monkeypatch.setenv("LYNKEUS_DATA_FOLDER", str(tmp_path / "named"))
    monkeypatch.setenv("LYNKEUS_EARTHDATA_KEYS", keys.address)
    app = FastAPI()
    install(app)
    with TestClient(app) as client:
        assert "Secure" not in client.post("/api/session/earthdata", json={"token": token()}).headers["set-cookie"]
        assert "Secure" not in client.delete("/api/session/earthdata").headers["set-cookie"]
    assert (tmp_path / "named" / "lynkeus.sqlite3").is_file()
    assert (tmp_path / "named" / "files").is_dir()


def test_key_that_names_no_session_is_answered_as_not_signed_in_and_the_answer_removes_the_cookie(
    visitor: TestClient,
) -> None:
    for wrong in ("x" * 43, "short", "a/b"):
        for address in ("/api/session", "/api/layers", "/api/series", "/api/jobs"):
            response = visitor.get(address, headers=_cookie(wrong))
            assert response.status_code == 200
            empty: tuple[dict[str, Any], ...] = ({"earthdata": None}, {"layers": []}, {"series": []})
            assert response.json() in empty or response.json()["jobs"] == []
            assert _removes_cookie(response), response.headers
            assert set(response.headers["set-cookie"].split("; ")[1:]) >= {"HttpOnly", "SameSite=strict", "Secure"}
            # The next request carries no cookie, and its answer sets none.
            assert "set-cookie" not in visitor.get(address).headers
        refused = visitor.post(
            "/api/processes/stand-in/execution", json={"inputs": {"name": "a"}}, headers=_cookie(wrong)
        )
        _problem(refused, 401, "Sign in to Earthdata to start this job.")
        assert _removes_cookie(refused)
        servers = visitor.get("/api/servers", headers=_cookie(wrong))
        _problem(servers, 401, "Sign in to Earthdata to connect and use servers of your own.")
        assert _removes_cookie(servers)
        # An address that asks for no session leaves the cookie as it is.
        assert "set-cookie" not in visitor.get("/api/processes", headers=_cookie(wrong)).headers
    assert _service(visitor).store.count_sessions() == 0


def test_visitor_signs_in_with_a_token_and_out(visitor: TestClient) -> None:
    first = visitor.post("/api/session/earthdata", json={"token": token("a_user")})
    before = first.headers["set-cookie"].split(";")[0]
    # A second sign-in to the same account keeps the session and gives it a new key: the earlier key names nothing.
    response = visitor.post("/api/session/earthdata", json={"token": token("a_user")})
    assert response.json() == {"earthdata": {"user": "a_user", "token": True}}
    after = response.headers["set-cookie"].split(";")[0]
    assert after != before
    service = _service(visitor)
    assert service.store.count_sessions() == 1
    assert service.sessions.find(before.split("=")[1]) is None
    assert service.sessions.find(after.split("=")[1]) is not None
    # Sign out ends the session, and the answer removes the cookie.
    out = visitor.delete("/api/session/earthdata")
    assert (out.status_code, out.content) == (204, b"")
    assert _removes_cookie(out)
    assert service.store.count_sessions() == 0
    assert service.sessions.find(after.split("=")[1]) is None
    state = visitor.get("/api/session")
    assert (state.json(), "set-cookie" in state.headers) == ({"earthdata": None}, False)
    # The key of the ended session, sent again, names nothing.
    again = visitor.get("/api/session", headers=_cookie(after.split("=")[1]))
    assert (again.json(), _removes_cookie(again)) == ({"earthdata": None}, True)


@pytest.mark.parametrize("wrong", ["not a token", token(expires=1.0), token(algorithm="none"), token()[:-4] + "AAAA"])
def test_token_that_earthdata_does_not_accept_is_answered_with_401(visit: Visit, wrong: str) -> None:
    visitor, client = visit(), _sign_in(visit(), "a_user")
    response = visitor.post("/api/session/earthdata", json={"token": wrong})
    _problem(response, 401, "Earthdata Login does not accept this token.")
    assert response.headers["www-authenticate"] == 'Bearer realm="Earthdata Login"'
    assert wrong not in response.text
    assert "set-cookie" not in response.headers
    assert visitor.get("/api/session").json() == {"earthdata": None}
    # A refused token changes nothing for a visitor who is signed in.
    _problem(client.post("/api/session/earthdata", json={"token": wrong}), 401, "Earthdata Login does not accept")
    assert client.get("/api/session").json() == {"earthdata": {"user": "a_user", "token": True}}
    assert _service(client).store.count_sessions() == 1


def test_token_cannot_be_checked_when_earthdata_does_not_answer(visitor: TestClient, keys: KeyServer) -> None:
    keys.status = 500  # type: ignore[assignment]
    response = visitor.post("/api/session/earthdata", json={"token": token()})
    _problem(response, 502, "Earthdata Login did not answer")
    assert "set-cookie" not in response.headers
    assert _service(visitor).store.count_sessions() == 0


@pytest.mark.parametrize("body", [{}, {"token": 7}, {"token": "a", "user": "b"}, ["token"]])
def test_sign_in_takes_the_token_and_nothing_else(visitor: TestClient, body: object) -> None:
    _problem(visitor.post("/api/session/earthdata", json=body), 400, "The request body must be")
    assert _service(visitor).store.count_sessions() == 0


def test_visitor_stays_signed_in_when_the_token_is_forgotten_and_only_a_request_to_nasa_asks_for_it(
    client: TestClient,
) -> None:
    job = _wait(client, _start(client, "signed-in")["jobID"])
    layer = client.get(f"/api/jobs/{job['jobID']}/results").json()
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(sessions, "EARTHDATA_IDLE_TIME", 0.05)
        time.sleep(0.1)
        assert client.get("/api/session").json() == {"earthdata": {"user": "test_user", "token": False}}
    # The lists, renaming, extending, the servers of the account and a job that sends no request to NASA work.
    assert _layers(client) == [layer]
    assert client.patch(f"/api/layers/{layer['id']}", json={"title": "New"}).json()["layer"]["title"] == "New"
    assert client.post(f"/api/layers/{layer['id']}/extension").status_code == 200
    assert client.post("/api/storage/extension").status_code == 204
    assert client.get("/api/servers").json()["servers"] == []
    assert client.get("/api/jobs").status_code == 200
    tool = _wait(client, _start(client, name="b", uses=[layer["id"]])["jobID"])
    assert tool["status"] == "successful"
    # A process that needs Earthdata is answered with 401 and the one sentence about the token.
    refused = client.post("/api/processes/signed-in/execution", json={"inputs": {"name": "a"}})
    _problem(refused, 401, "Enter your Earthdata token again to start this job, because the server no longer holds it.")
    assert refused.json()["detail"] == routes.ENTER_AGAIN
    assert refused.headers["www-authenticate"] == 'Bearer realm="Earthdata Login"'
    assert "set-cookie" not in refused.headers
    assert client.get("/api/session").json() == {"earthdata": {"user": "test_user", "token": False}}
    # After the token is given again, the same request is accepted, and nothing was lost.
    _sign_in(client)
    assert _wait(client, _start(client, "signed-in", name="c")["jobID"])["status"] == "successful"
    assert len(_layers(client)) == 3
    assert _service(client).store.count_sessions() == 1
    assert client.delete(f"/api/layers/{layer['id']}").status_code == 204


def test_token_is_forgotten_after_its_longest_time_and_when_it_expires(
    visitor: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    visitor.post("/api/session/earthdata", json={"token": token(expires=time.time() + 2)})
    assert visitor.get("/api/session").json() == {"earthdata": {"user": "test_user", "token": True}}
    time.sleep(2.1)
    assert visitor.get("/api/session").json() == {"earthdata": {"user": "test_user", "token": False}}
    _sign_in(visitor)
    monkeypatch.setattr(sessions, "EARTHDATA_TIME", 0.0)
    assert visitor.get("/api/session").json() == {"earthdata": {"user": "test_user", "token": False}}
    assert _service(visitor).store.count_sessions() == 1


def test_token_reaches_no_answer_no_log_and_no_file(
    visitor: TestClient, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    client = visitor
    secret = token("a_user")
    seen = []
    with caplog.at_level(logging.DEBUG):
        seen.append(client.post("/api/session/earthdata", json={"token": secret}))
        seen.append(client.get("/api/session"))
        for end in ("layer", "token", "fault"):
            started = client.post("/api/processes/signed-in/execution", json={"inputs": {"name": "a", "end": end}})
            seen.append(started)
            job = started.json()["jobID"]
            _wait(client, job)
            seen += [client.get(f"/api/jobs/{job}"), client.get(f"/api/jobs/{job}/results")]
        seen += [client.get("/api/jobs"), client.get("/api/layers"), client.delete("/api/session/earthdata")]
    refused = next(response.json() for response in seen if response.status_code == 500)
    assert refused["detail"] == "NASA refused the token [Earthdata token]."
    assert "KeyError" in caplog.text
    for response in seen:
        assert secret not in response.text
        assert secret not in str(response.headers)
    assert secret not in caplog.text
    files = [path for path in tmp_path.rglob("*") if path.is_file()]
    assert len(files) >= 3
    assert all(secret.encode() not in path.read_bytes() for path in files)


def test_unused_session_ends_and_its_account_keeps_what_it_holds(visit: Visit, tmp_path: Path) -> None:
    client = _sign_in(visit(), "a_user")
    job = _start(client)["jobID"]
    layer = client.get(f"/api/jobs/{_wait(client, job)['jobID']}/results").json()["id"]
    waiting = _start(client, seconds=0.5)["jobID"]
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(sessions, "SESSION_IDLE_TIME", 0.0)
        time.sleep(0.01)
        _service(client).remove_passed()
    assert _service(client).store.count_sessions() == 0
    ended = client.get("/api/layers")
    assert (ended.json(), _removes_cookie(ended)) == ({"layers": []}, True)
    assert (tmp_path / "files" / layer / "a.tif").is_file()
    # The next sign-in to the account finds the layer, and the job that ran through the end of the session.
    again = _sign_in(visit(), "a_user")
    assert _wait(again, waiting)["status"] == "successful"
    assert sorted(entry["id"] for entry in _layers(again)) == sorted([layer, _wait(again, waiting)["layer"]])


def test_number_of_sessions_is_limited_and_a_session_without_a_token_makes_place(
    visit: Visit, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(sessions, "MAX_SESSIONS", 2)
    first, second, third = _sign_in(visit(), "a_user"), _sign_in(visit(), "b_user"), visit()
    _wait(first, _start(first)["jobID"])
    # Each of the two sessions holds a token, so no session can make place.
    response = third.post("/api/session/earthdata", json={"token": token("c_user")})
    _problem(response, 503, "The server holds the largest number of sessions")
    assert response.headers["retry-after"] == "300"
    assert "set-cookie" not in response.headers
    # Without their tokens, the session that was unused for the longest time ends for the new one.
    _forget_token(first)
    store = _service(first).store
    store.use_session(store.sessions_of("a_user")[0], time.time() - 3600)
    _sign_in(third, "c_user")
    assert store.count_sessions() == 2
    assert (store.sessions_of("a_user"), len(store.sessions_of("b_user")), len(store.sessions_of("c_user"))) == (
        [],
        1,
        1,
    )
    assert first.get("/api/session").json() == {"earthdata": None}
    # The account of the ended session keeps its layer.
    second.delete("/api/session/earthdata")
    assert len(_layers(_sign_in(first, "a_user"))) == 1


def test_account_has_a_limited_number_of_sessions_and_the_longest_unused_one_ends(
    visit: Visit, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert sessions.MAX_ACCOUNT_SESSIONS == 10
    monkeypatch.setattr(sessions, "MAX_ACCOUNT_SESSIONS", 2)
    first, second, other = _sign_in(visit(), "a_user"), _sign_in(visit(), "a_user"), _sign_in(visit(), "b_user")
    store = _service(first).store
    oldest = store.sessions_of("a_user")[0]
    store.use_session(oldest, time.time() - 3600)
    third = _sign_in(visit(), "a_user")
    assert len(store.sessions_of("a_user")) == 2
    assert oldest not in store.sessions_of("a_user")
    states = [client.get("/api/session").json()["earthdata"] for client in (first, second, third, other)]
    assert [state and state["user"] for state in states] == [None, "a_user", "a_user", "b_user"]


# Accounts


def test_second_session_of_an_account_holds_what_the_first_holds(visit: Visit, tmp_path: Path) -> None:
    first, second, other = _sign_in(visit(), "a_user"), _sign_in(visit(), "a_user"), _sign_in(visit(), "b_user")
    assert _service(first).store.count_sessions() == 3
    job = _start(first, seconds=0.2)["jobID"]
    # The second browser of the account follows the job, lists its layer, renames it and uses it in a tool.
    assert _wait(second, job)["status"] == "successful"
    assert [info["jobID"] for info in second.get("/api/jobs").json()["jobs"]] == [job]
    [layer] = _layers(second)
    assert _layers(first) == [layer]
    assert second.get(f"/api/jobs/{job}/results").json() == layer
    assert second.patch(f"/api/layers/{layer['id']}", json={"title": "Shared"}).status_code == 200
    assert _layers(first)[0]["title"] == "Shared"
    tool = _wait(second, _start(second, name="b", uses=[layer["id"]])["jobID"])
    assert tool["status"] == "successful"
    assert len(_layers(first)) == 2
    # Another account holds none of it.
    assert (other.get("/api/layers").json(), other.get("/api/jobs").json()["jobs"]) == ({"layers": []}, [])
    _problem(other.delete(f"/api/layers/{layer['id']}"), 404, "You have no layer of this name.")
    # What one browser removes is gone in the other.
    assert second.delete(f"/api/layers/{layer['id']}").status_code == 204
    assert [entry["title"] for entry in _layers(first)] == ["b"]
    assert not (tmp_path / "files" / layer["id"]).exists()


def test_limits_count_the_account_and_not_the_browser(visit: Visit, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(jobs, "MAX_ACCOUNT_UNFINISHED_JOBS", 2)
    monkeypatch.setattr(jobs, "MAX_ACCOUNT_LAYERS", 3)
    first, second, other = _sign_in(visit(), "a_user"), _sign_in(visit(), "a_user"), _sign_in(visit(), "b_user")
    address = "/api/processes/stand-in/execution"
    _wait(first, _start(first, name="one")["jobID"])
    started = [_start(first, seconds=30)["jobID"], _start(second, seconds=30)["jobID"]]
    for client in (first, second):
        _problem(client.post(address, json={"inputs": {"name": "a"}}), 429, "You have 2 jobs that wait or run")
    assert other.post(address, json={"inputs": {"name": "a"}}).status_code == 201
    second.delete(f"/api/jobs/{started[0]}")
    # One layer and one unfinished job of the account are held: the next job is the last that fits three layers.
    _wait(second, _start(second, name="three")["jobID"])
    for client in (first, second):
        _problem(client.post(address, json={"inputs": {"name": "a"}}), 507, "You may keep at most 3 layers.")
    first.delete(f"/api/jobs/{started[1]}")


def test_sign_in_as_another_account_in_the_same_browser_ends_the_link_to_the_first(visit: Visit) -> None:
    browser, elsewhere = _sign_in(visit(), "a_user"), visit()
    _wait(browser, _start(browser)["jobID"])
    [layer] = _layers(browser)
    before = browser.cookies["lynkeus_session"]
    _sign_in(browser, "b_user")
    service = _service(browser)
    # The session of the first account has ended, and the second account received nothing of the first.
    assert service.sessions.find(before) is None
    assert (service.store.sessions_of("a_user"), len(service.store.sessions_of("b_user"))) == ([], 1)
    assert browser.get("/api/session").json() == {"earthdata": {"user": "b_user", "token": True}}
    assert (browser.get("/api/layers").json(), browser.get("/api/jobs").json()["jobs"]) == ({"layers": []}, [])
    _problem(browser.patch(f"/api/layers/{layer['id']}", json={"title": "b"}), 404, "You have no layer of this name.")
    assert service.store.layers_of(Holder(account="b_user")) == []
    # The first account still holds its layer, from any browser.
    assert _layers(_sign_in(elsewhere, "a_user")) == [layer]
    assert _layers(_sign_in(browser, "a_user")) == [layer]


def test_sign_out_leaves_what_the_account_holds_on_the_project_server(visit: Visit, tmp_path: Path) -> None:
    client = _sign_in(visit(), "a_user")
    job = _start(client, seconds=0.5)["jobID"]
    assert _removes_cookie(client.delete("/api/session/earthdata"))
    assert client.get("/api/layers").json() == {"layers": []}
    _problem(
        client.get(f"/api/jobs/{job}"),
        404,
        "You have no job of this name.",
        f"{OGC}exceptions/ogcapi-processes-1/1.0/no-such-job",
    )
    # The job ran on, and the layer is there at the next sign-in.
    _sign_in(client, "a_user")
    assert _wait(client, job)["status"] == "successful"
    [layer] = _layers(client)
    assert (tmp_path / "files" / layer["id"] / "a.tif").is_file()


def _legacy(folder: Path, key: str) -> None:
    """Put the record file of version 3 in a folder, with a known key for the session that holds its content."""
    path = folder / "lynkeus.sqlite3"
    shutil.copyfile(VERSION_3, path)
    database = sqlite3.connect(path)
    [[session]] = database.execute("SELECT DISTINCT session FROM layers").fetchall()
    database.execute(
        "UPDATE sessions SET key_digest = ? WHERE id = ?", (hashlib.sha256(key.encode()).hexdigest(), session)
    )
    database.commit()
    database.close()


def test_content_of_a_session_of_an_earlier_version_stays_with_it_and_passes_to_the_account_at_its_sign_in(
    tmp_path: Path, keys: KeyServer
) -> None:
    key = "k" * 43
    _legacy(tmp_path, key)
    start = time.time()
    with _running(tmp_path, keys) as visit:
        browser, elsewhere, other = visit(), visit(), visit()
        held = _cookie(key)
        # The session is known and has no account: no visitor is signed in, and the cookie stays.
        state = browser.get("/api/session", headers=held)
        assert state.json() == {"earthdata": None}
        assert state.headers["set-cookie"].startswith(f"lynkeus_session={key};")
        browser.cookies.clear()
        out = browser.delete("/api/session/earthdata", headers=held)
        assert (out.status_code, "set-cookie" in out.headers) == (204, False)
        # It still holds its two layers and its series, each kept for the keeping time from the start of the service.
        entries = browser.get("/api/layers", headers=held).json()["layers"]
        assert len(entries) == 2
        [series] = browser.get("/api/series", headers=held).json()["series"]
        for entry in (*entries, series):
            until = datetime.fromisoformat(entry["kept_until"]).timestamp()
            assert start - 1 + jobs.KEEP_TIME <= until <= time.time() + jobs.KEEP_TIME
        assert all(entry["source"]["process"] == "stand-in" for entry in entries)
        assert len(browser.get("/api/jobs", headers=held).json()["jobs"]) == 3
        # A job that needs Earthdata asks for the sign-in, and no other browser holds anything of the session.
        refused = browser.post("/api/processes/signed-in/execution", json={"inputs": {"name": "a"}}, headers=held)
        _problem(refused, 401, "Sign in to Earthdata to start this job.")
        assert elsewhere.get("/api/layers").json() == {"layers": []}
        # The sign-in records the account and gives it the content. Every browser of the account then holds it.
        signed = browser.post("/api/session/earthdata", json={"token": token("a_user")}, headers=held)
        assert signed.json() == {"earthdata": {"user": "a_user", "token": True}}
        assert browser.cookies["lynkeus_session"] != key
        assert _service(browser).sessions.find(key) is None
        assert browser.get("/api/layers").json()["layers"] == entries
        assert browser.get("/api/series").json()["series"] == [series]
        assert len(browser.get("/api/jobs").json()["jobs"]) == 3
        assert _sign_in(elsewhere, "a_user").get("/api/layers").json()["layers"] == entries
        assert _sign_in(other, "b_user").get("/api/layers").json() == {"layers": []}
        store = _service(browser).store
        assert len(store.layers_of(Holder(account="a_user"))) == 2
        # The sign-out no longer removes it.
        browser.delete("/api/session/earthdata")
        assert elsewhere.get("/api/layers").json()["layers"] == entries
        assert elsewhere.get("/api/series").json()["series"] == [series]


def test_unused_session_of_an_earlier_version_ends_with_what_it_holds(
    tmp_path: Path, keys: KeyServer, monkeypatch: pytest.MonkeyPatch
) -> None:
    key = "k" * 43
    _legacy(tmp_path, key)
    with _running(tmp_path, keys) as visit:
        browser = visit()
        store = _service(browser).store
        assert store.count_sessions() == 2
        # The start of the service counts as a use of the session that holds content, so the first run ends
        # only the session that holds nothing: it was last used when the file was made.
        monkeypatch.setattr(sessions, "SESSION_IDLE_TIME", 60.0)
        _service(browser).remove_passed()
        assert store.count_sessions() == 1
        assert len(browser.get("/api/layers", headers=_cookie(key)).json()["layers"]) == 2
        monkeypatch.setattr(sessions, "SESSION_IDLE_TIME", 0.0)
        time.sleep(0.01)
        _service(browser).remove_passed()
        assert store.count_sessions() == 0
        assert (store.layer_names(), store.size_of_layers()) == (set(), 0)
        gone = browser.get("/api/layers", headers=_cookie(key))
        assert (gone.json(), _removes_cookie(gone)) == ({"layers": []}, True)


# Processes


def test_landing_page_links_to_the_definition_the_conformance_and_the_processes(client: TestClient) -> None:
    for address in ("/api", "/api/"):
        response = client.get(address)
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/json"
        links = {link["rel"]: link["href"] for link in response.json()["links"]}
        assert links == {
            "self": "/api/",
            "service-desc": "/api/openapi.json",
            f"{OGC}rel/ogc/1.0/conformance": "/api/conformance",
            f"{OGC}rel/ogc/1.0/processes": "/api/processes",
            f"{OGC}rel/ogc/1.0/job-list": "/api/jobs",
        }
        assert (
            '</api/processes>; rel="http://www.opengis.net/def/rel/ogc/1.0/processes"; type="application/json"'
            in response.headers["link"]
        )
        assert all(client.get(href).status_code == 200 for href in links.values())


def test_conformance_lists_the_five_classes(client: TestClient) -> None:
    classes = client.get("/api/conformance").json()["conformsTo"]
    assert classes == [
        f"http://www.opengis.net/spec/ogcapi-processes-1/1.0/conf/{name}"
        for name in ("core", "json", "ogc-process-description", "job-list", "dismiss")
    ]


def test_process_list_gives_the_summaries_in_pages(client: TestClient) -> None:
    body = client.get("/api/processes").json()
    assert [process["id"] for process in body["processes"]] == ["stand-in", "signed-in"]
    assert body["processes"][0]["links"][1] == {
        "href": "/api/processes/stand-in/execution",
        "rel": f"{OGC}rel/ogc/1.0/execute",
        "type": "application/json",
        "title": "Execution of the process",
    }
    assert "inputs" not in body["processes"][0]
    assert [link["rel"] for link in body["links"]] == ["self"]
    first = client.get("/api/processes?limit=1").json()
    assert [process["id"] for process in first["processes"]] == ["stand-in"]
    links = {link["rel"]: link["href"] for link in first["links"]}
    assert links == {"self": "/api/processes?limit=1&offset=0", "next": "/api/processes?limit=1&offset=1"}
    second = client.get(links["next"]).json()
    assert [process["id"] for process in second["processes"]] == ["signed-in"]
    assert {link["rel"] for link in second["links"]} == {"self", "prev"}
    assert len(client.get("/api/processes?limit=5000").json()["processes"]) == 2
    for wrong in ("limit=0", "limit=abc", "limit=-1", "offset=x", "limit=%C2%B2", "limit=1.5"):
        _problem(client.get(f"/api/processes?{wrong}"), 400, "The parameter")


def test_process_description_gives_inputs_and_output_and_an_unknown_process_is_answered_with_404(
    client: TestClient,
) -> None:
    response = client.get("/api/processes/stand-in")
    body = response.json()
    assert (body["id"], body["version"], body["jobControlOptions"]) == (
        "stand-in",
        __version__,
        ["async-execute", "dismiss"],
    )
    assert body["inputs"]["name"]["schema"]["type"] == "string"
    assert set(body["outputs"]) == {"layer"}
    assert "additionalParameters" not in body
    limited = client.get("/api/processes/signed-in").json()["additionalParameters"]
    assert limited == {
        "parameters": [{"name": "most-seconds", "value": [60]}, {"name": "kinds", "value": ["layer", "result"]}]
    }
    assert client.get("/api/processes").json()["processes"][1]["additionalParameters"] == limited
    assert [link["rel"] for link in body["links"]] == ["self", f"{OGC}rel/ogc/1.0/execute"]
    kind = f"{OGC}exceptions/ogcapi-processes-1/1.0/no-such-process"
    _problem(client.get("/api/processes/other"), 404, "The server offers no process of this name.", kind)
    _problem(
        client.post("/api/processes/other/execution", json={"inputs": {}}), 404, "The server offers no process", kind
    )


# Jobs


def test_job_passes_from_accepted_to_running_to_successful(client: TestClient, tmp_path: Path) -> None:
    response = client.post(
        "/api/processes/stand-in/execution",
        json={"inputs": {"name": "a", "seconds": 1}},
        headers={"Prefer": "respond-async, wait=5"},
    )
    assert response.status_code == 201
    info = response.json()
    job = info["jobID"]
    assert response.headers["location"] == f"/api/jobs/{job}"
    assert response.headers["preference-applied"] == "respond-async"
    assert "set-cookie" not in response.headers
    assert len(job) == 32
    assert (info["processID"], info["type"], info["title"], info["progress"]) == (
        "stand-in",
        "process",
        "Stand-in a",
        0,
    )
    assert (info["status"], info["message"]) == ("accepted", "The job waits for its turn.")
    assert info["links"] == [
        {"href": f"/api/jobs/{job}", "rel": "self", "type": "application/json", "title": "State of the job"}
    ]
    assert info["inputs"]["seconds"] == 1.0
    assert "layer" not in info
    kind = f"{OGC}exceptions/ogcapi-processes-1/1.0/result-not-ready"
    _problem(client.get(f"/api/jobs/{job}/results"), 404, "The job has not finished yet.", kind)
    running = _wait(client, job, "running")
    assert "started" in running
    assert "finished" not in running
    seen = set()
    while (now := client.get(f"/api/jobs/{job}").json())["status"] == "running":
        seen.add((now["progress"], now["message"]))
        time.sleep(0.05)
    assert len(seen) > 2
    assert all(0 <= progress < 100 for progress, message in seen)
    assert max(progress for progress, message in seen) > 50
    assert {message for progress, message in seen} <= {
        "The job has started.",
        "The stand-in has started with the token None.",
        "The stand-in waits.",
    }
    done = client.get(f"/api/jobs/{job}")
    info = done.json()
    assert (info["status"], info["progress"], info["message"]) == ("successful", 100, "The layer is ready.")
    assert info["created"] <= info["started"] <= info["finished"] <= info["updated"]
    assert info["created"].endswith("Z")
    assert info["links"][1] == {
        "href": f"/api/jobs/{job}/results",
        "rel": f"{OGC}rel/ogc/1.0/results",
        "type": "application/json",
        "title": "Results of the job",
    }
    assert f'</api/jobs/{job}/results>; rel="{OGC}rel/ogc/1.0/results"' in done.headers["link"]
    results = client.get(f"/api/jobs/{job}/results")
    assert results.headers["content-type"] == "application/json"
    layer = results.json()
    assert (layer["title"], layer["kind"], layer["dates"]) == ("a", "layer", ["2026-11-14"])
    assert layer["url"] == f"/files/{layer['id']}/a.tif"
    assert layer["record"] == f"/files/{layer['id']}/a.json"
    assert len(layer["id"]) == 32
    folder = tmp_path / "files" / layer["id"]
    assert sorted(path.name for path in folder.iterdir()) == ["a.json", "a.tif"]
    assert (folder / "a.tif").stat().st_size == 2000
    assert info["layer"] == layer["id"]
    assert info["inputs"] == {
        "name": "a",
        "seconds": 1.0,
        "size": 2000,
        "area": None,
        "data": None,
        "uses": [],
        "end": "layer",
    }
    [entry] = client.get("/api/layers").json()["layers"]
    assert (entry["layer"], entry["size"]) == (layer, 2000 + len('{"type": "Feature", "properties": {"title": "a"}}'))
    assert info["started"] <= entry["created"] <= info["finished"]
    # The entry states until when the layer is kept, and the request that made it.
    kept = datetime.fromisoformat(entry["kept_until"]) - datetime.fromisoformat(entry["created"])
    assert (entry["kept_until"].endswith("Z"), kept.total_seconds()) == (True, jobs.KEEP_TIME)
    assert entry["source"] == {"process": "stand-in", "inputs": info["inputs"]}


def test_results_are_a_document_when_the_request_asks_for_one(client: TestClient) -> None:
    body = {
        "inputs": {"name": "a"},
        "response": "document",
        "outputs": {"layer": {"transmissionMode": "value", "format": {"mediaType": "application/json"}}},
    }
    job = client.post("/api/processes/stand-in/execution", json=body).json()["jobID"]
    _wait(client, job, "successful")
    document = client.get(f"/api/jobs/{job}/results").json()
    assert set(document) == {"layer"}
    assert set(document["layer"]) == {"value"}
    assert document["layer"]["value"] == _layers(client)[0]


def test_inputs_are_taken_in_the_forms_of_the_standard(client: TestClient) -> None:
    inputs = {
        "name": {"href": "https://example.org/name.json"},
        "seconds": {"value": 0},
        "area": {"bbox": [-71.2, 42.6, -70.75, 42.95]},
        "data": "AAEC",
        "uses": [],
    }
    response = client.post(
        "/api/processes/stand-in/execution",
        json={"inputs": inputs, "subscriber": {"successUri": "https://example.org/"}},
    )
    assert response.status_code == 201
    assert response.json()["title"] == "Stand-in from-a-link"


@pytest.mark.parametrize(
    ("body", "detail"),
    [
        ({"inputs": {"name": "A B"}}, "The input name is not valid"),
        ({"inputs": {}}, "The input name is not valid: Field required."),
        ({}, "The input name is not valid: Field required."),
        (
            {"inputs": {"name": {"href": "https://example.org/other.json"}}},
            "A link given as an input value could not be read.",
        ),
        ({"inputs": {"name": "a"}, "other": 1}, "The request body holds the fields"),
        ({"inputs": {"name": "a"}, "response": "table"}, "The request body holds the fields"),
        (
            {"inputs": {"name": "a"}, "outputs": {"other": {}}},
            "The field outputs, when given, must name the one output",
        ),
        ({"inputs": {"name": "a"}, "outputs": {}}, "The field outputs, when given, must name the one output"),
        (
            {"inputs": {"name": "a"}, "outputs": {"layer": {"transmissionMode": "reference"}}},
            "The output layer is given by value only",
        ),
        (
            {"inputs": {"name": "a"}, "outputs": {"layer": {"format": {"mediaType": "image/tiff"}}}},
            "The output layer is given by value only",
        ),
    ],
)
def test_wrong_execute_request_is_answered_with_400_and_creates_nothing(
    client: TestClient, body: object, detail: str
) -> None:
    response = client.post("/api/processes/stand-in/execution", json=body)
    _problem(response, 400, detail)
    assert "set-cookie" not in response.headers
    assert client.get("/api/jobs").json()["jobs"] == []


def test_body_must_be_json_of_a_limited_size(client: TestClient) -> None:
    address = "/api/processes/stand-in/execution"
    _problem(
        client.post(address, content=b'{"inputs": {"name": "a"}}', headers={"Content-Type": "text/plain"}),
        415,
        "The request body must be of the type application/json.",
    )
    _problem(client.post(address, content=b"name=a"), 415, "The request body must be")
    _problem(client.post(address, content=b"{not json", headers=JSON), 400, "The request body is not valid JSON.")
    _problem(client.post(address, content=b"[1]", headers=JSON), 400, "The request body must be a JSON object.")
    large = json.dumps({"inputs": {"name": "a" * routes.MAX_BODY_SIZE}}).encode()
    _problem(client.post(address, content=large, headers=JSON), 413, "The request body is larger than 65536 bytes.")
    _problem(client.post("/api/session/earthdata", content=large, headers=JSON), 413, "The request body is larger")

    def parts() -> Iterator[bytes]:
        # A body without a declared length is counted while it is read.
        yield from [large[:40000], large[40000:]]

    _problem(client.post(address, content=parts(), headers=JSON), 413, "The request body is larger")
    exact = json.dumps({"inputs": {"name": "a"}, "subscriber": {"successUri": ""}})
    exact = exact.replace('""', '"' + "u" * (routes.MAX_BODY_SIZE - len(exact)) + '"')
    assert len(exact) == routes.MAX_BODY_SIZE
    assert client.post(address, content=exact.encode(), headers=JSON).status_code == 201


def test_job_keeps_the_token_that_it_received_at_its_start(client: TestClient) -> None:
    job = _start(client, "signed-in", seconds=0.5)["jobID"]
    seen = _wait(client, job, "running")
    # The job runs on with its token after the web service has forgotten the token of the visitor.
    _forget_token(client)
    assert client.get("/api/session").json() == {"earthdata": {"user": "test_user", "token": False}}
    done = _wait(client, job)
    assert (seen["status"], done["status"]) == ("running", "successful")


def test_failed_job_carries_a_sentence_and_the_log_carries_the_error(
    client: TestClient, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    expected = {
        "sentence": "The stand-in was asked to fail.",
        "fault": jobs.FAULT,
        "exit": jobs.FAULT,
        "other-name": jobs.FAULT,
        "no-file": jobs.FAULT,
    }
    for end, sentence in expected.items():
        job = _start(client, end=end)["jobID"]
        info = _wait(client, job)
        assert (info["status"], info["message"]) == ("failed", sentence), end
        assert "finished" in info
        _problem(client.get(f"/api/jobs/{job}/results"), 500, sentence)
    long = _wait(client, _start(client, end="long")["jobID"])["message"]
    assert len(long) == jobs.MAX_MESSAGE_LENGTH
    assert long.startswith("The stand-in fails with many words. The stand-in")
    assert "a detail that the visitor must not see" in caplog.text
    assert "ended with exit code 3" in caplog.text
    assert "named its layer or its files wrongly" in caplog.text
    assert "a detail" not in client.get("/api/jobs").text
    assert list((tmp_path / "files").iterdir()) == []
    assert client.get("/api/layers").json() == {"layers": []}


def test_job_that_runs_too_long_is_ended(client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(jobs, "JOB_TIME", 0.6)
    info = _wait(client, _start(client, seconds=30)["jobID"])
    assert (info["status"], info["message"]) == (
        "failed",
        "The job was ended because it ran for more than 0.01 minutes.",
    )
    assert list((tmp_path / "files").iterdir()) == []


def test_job_whose_files_grow_too_large_is_ended(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(jobs, "MAX_LAYER_SIZE", 1000)
    info = _wait(client, _start(client)["jobID"])
    assert (info["status"], info["message"]) == (
        "failed",
        "The job was ended because its layer is larger than 0.001 megabytes.",
    )
    monkeypatch.setattr(jobs, "SIZE_PAUSE", 0.1)
    job = _start(client, "stand-in", seconds=30, uses=[])["jobID"]
    _wait(client, job, "running")
    [folder] = (tmp_path / "files").iterdir()
    (folder / "growing.tmp").write_bytes(b"0" * 1001)
    assert _wait(client, job)["message"] == "The job was ended because its layer is larger than 0.001 megabytes."
    assert list((tmp_path / "files").iterdir()) == []


def test_jobs_beyond_the_number_that_run_at_once_wait_in_order(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(jobs, "MAX_RUNNING_JOBS", 1)
    first, second, third = (_start(client, name=name, seconds=0.5)["jobID"] for name in ("first", "second", "third"))
    _wait(client, first, "running")
    waiting = client.get(f"/api/jobs/{second}").json()
    assert (waiting["status"], waiting["message"]) == ("accepted", "The job waits for its turn.")
    assert "started" not in waiting
    assert client.get(f"/api/jobs/{third}").json()["status"] == "accepted"
    assert _wait(client, first, "successful")
    assert _wait(client, second, "running", "successful")
    assert client.get(f"/api/jobs/{third}").json()["status"] == "accepted"
    done = [_wait(client, job, "successful") for job in (first, second, third)]
    assert done[0]["finished"] <= done[1]["started"] <= done[1]["finished"] <= done[2]["started"]
    assert [layer["title"] for layer in _layers(client)] == ["third", "second", "first"]


def test_tool_receives_the_layers_of_the_account(client: TestClient) -> None:
    first = client.get(f"/api/jobs/{_wait(client, _start(client)['jobID'])['jobID']}/results").json()
    info = _wait(client, _start(client, name="b", uses=[first["id"]])["jobID"])
    assert info["status"] == "successful"
    assert client.get(f"/api/jobs/{info['jobID']}/results").json()["inputs"] == [first["id"]]
    assert _wait(client, _start(client, name="c", uses=["unknown"])["jobID"])["message"] == jobs.FAULT


def test_running_job_is_dismissed_once_and_then_gone(client: TestClient, tmp_path: Path) -> None:
    job = _start(client, seconds=30)["jobID"]
    _wait(client, job, "running")
    [folder] = (tmp_path / "files").iterdir()
    response = client.delete(f"/api/jobs/{job}")
    assert response.status_code == 200
    info = response.json()
    assert (info["jobID"], info["status"], info["message"]) == (job, "dismissed", "The job was dismissed.")
    assert info["links"] == [
        {"href": "/api/jobs", "rel": "up", "type": "application/json", "title": "Jobs of the account"}
    ]
    for again in (
        client.delete(f"/api/jobs/{job}"),
        client.get(f"/api/jobs/{job}"),
        client.get(f"/api/jobs/{job}/results"),
    ):
        _problem(again, 410, "The job was dismissed.")
    assert client.get("/api/jobs").json()["jobs"] == []
    limit = time.monotonic() + jobs.END_TIME + 5
    while folder.exists() and time.monotonic() < limit:
        time.sleep(0.05)
    assert not folder.exists()
    assert client.get("/api/layers").json() == {"layers": []}
    # The place of the dismissed job is free again.
    assert _wait(client, _start(client)["jobID"])["status"] == "successful"


def test_waiting_job_is_dismissed_and_never_starts(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(jobs, "MAX_RUNNING_JOBS", 1)
    first = _start(client, seconds=0.5)["jobID"]
    second = _start(client, name="second")["jobID"]
    assert client.delete(f"/api/jobs/{second}").json()["status"] == "dismissed"
    _wait(client, first, "successful")
    time.sleep(0.3)
    assert [layer["title"] for layer in _layers(client)] == ["a"]


def test_dismissing_a_finished_job_removes_its_record_and_keeps_its_layer(client: TestClient, tmp_path: Path) -> None:
    job = _start(client)["jobID"]
    _wait(client, job)
    assert client.delete(f"/api/jobs/{job}").json()["status"] == "dismissed"
    _problem(client.get(f"/api/jobs/{job}"), 410, "The job was dismissed.")
    [layer] = _layers(client)
    assert (tmp_path / "files" / layer["id"] / "a.tif").is_file()


def test_another_visitor_sees_no_job_and_no_layer_of_the_first(visit: Visit) -> None:
    first, second, third = _sign_in(visit(), "a_user"), _sign_in(visit(), "b_user"), visit()
    job = _start(first, seconds=0.2)["jobID"]
    kind = f"{OGC}exceptions/ogcapi-processes-1/1.0/no-such-job"
    for other in (second, third):
        _problem(other.get(f"/api/jobs/{job}"), 404, "You have no job of this name.", kind)
        _problem(other.get(f"/api/jobs/{job}/results"), 404, "You have no job of this name.", kind)
        _problem(other.delete(f"/api/jobs/{job}"), 404, "You have no job of this name.", kind)
        assert other.get("/api/jobs").json()["jobs"] == []
    _wait(first, job, "successful")
    [layer] = _layers(first)
    for other in (second, third):
        assert other.get("/api/layers").json() == {"layers": []}
        _problem(other.delete(f"/api/layers/{layer['id']}"), 404, "You have no layer of this name.")
        _problem(other.get(f"/api/jobs/{job}/results"), 404, "You have no job of this name.", kind)
    assert len(_layers(first)) == 1
    _problem(first.get("/api/jobs/unknown"), 404, "You have no job of this name.", kind)


def test_job_list_is_selected_by_the_parameters_of_the_standard(client: TestClient) -> None:
    done = _start(client, name="done")["jobID"]
    _wait(client, done)
    failed = _start(client, "signed-in", name="failed", end="sentence")["jobID"]
    _wait(client, failed)
    running = _start(client, name="running", seconds=30)["jobID"]
    _wait(client, running, "running")

    def listed(query: str = "") -> list[str]:
        response = client.get(f"/api/jobs{query}")
        assert response.status_code == 200, response.text
        return [job["jobID"] for job in response.json()["jobs"]]

    assert listed() == [running, failed, done]
    assert listed("?status=successful") == [done]
    assert listed("?status=running,failed") == [running, failed]
    assert listed("?status=running&status=successful") == [running, done]
    assert listed("?status=accepted") == []
    assert listed("?processID=signed-in") == [failed]
    assert listed("?processID=stand-in,signed-in&status=failed") == [failed]
    assert listed("?type=process") == [running, failed, done]
    assert listed("?type=other") == []
    created = client.get(f"/api/jobs/{done}").json()["created"]
    assert done in listed(f"?datetime={created}")
    assert listed("?datetime=2026-01-01T00:00:00Z") == []
    assert listed("?datetime=../2026-01-01T00:00:00%2B02:00") == []
    assert listed("?datetime=2026-01-01T00:00:00Z/..") == [running, failed, done]
    assert listed("?datetime=/2999-01-01T00:00:00Z") == [running, failed, done]
    assert listed(f"?datetime={created}/2999-01-01T00:00:00Z") == [running, failed, done]
    assert listed("?maxDuration=3600") == [running, failed, done]
    assert listed("?minDuration=3600") == []
    time.sleep(1.2)
    assert running in listed("?minDuration=1")
    assert listed("?minDuration=1&maxDuration=3600&status=running") == [running]
    assert listed("?minDuration=0,1&status=running") == [running]
    assert running not in listed("?maxDuration=1,3600")
    assert listed("?maxDuration=3600&status=accepted") == []
    for wrong in (
        "datetime=yesterday",
        "datetime=2026-11-14",
        "datetime=2026-11-14T12:00:00",
        "minDuration=x",
        "maxDuration=1.5",
    ):
        _problem(client.get(f"/api/jobs?{wrong}"), 400, "The parameter")
    page = client.get("/api/jobs?status=successful,failed,running&limit=2")
    body = page.json()
    assert [job["jobID"] for job in body["jobs"]] == [running, failed]
    links = {link["rel"]: link["href"] for link in body["links"]}
    assert links == {
        "self": "/api/jobs?status=successful,failed,running&limit=2&offset=0",
        "next": "/api/jobs?status=successful,failed,running&limit=2&offset=2",
    }
    assert 'rel="next"' in page.headers["link"]
    # A value of the address is written into a link in its encoded form.
    odd = client.get("/api/jobs?processID=a%0D%0Ab%3E%22&datetime=2026-01-01T00:00:00%2B02:00/..&limit=1")
    assert odd.status_code == 200
    assert (
        odd.json()["links"][0]["href"]
        == "/api/jobs?processID=a%0D%0Ab%3E%22&datetime=2026-01-01T00:00:00%2B02:00/..&limit=1&offset=0"
    )
    rest = client.get(links["next"]).json()
    assert [job["jobID"] for job in rest["jobs"]] == [done]
    assert {link["rel"] for link in rest["links"]} == {"self", "prev"}
    client.delete(f"/api/jobs/{running}")


# Limits


def test_account_may_hold_a_limited_number_of_unfinished_jobs(visit: Visit, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(jobs, "MAX_ACCOUNT_UNFINISHED_JOBS", 2)
    monkeypatch.setattr(jobs, "MAX_RUNNING_JOBS", 1)
    first, second = _sign_in(visit(), "a_user"), _sign_in(visit(), "b_user")
    started = [_start(first, seconds=30)["jobID"] for _ in range(2)]
    response = first.post("/api/processes/stand-in/execution", json={"inputs": {"name": "a"}})
    _problem(response, 429, "You have 2 jobs that wait or run, which is the most allowed. Wait for one to finish.")
    monkeypatch.setattr(jobs, "MAX_WAITING_JOBS", 1)
    # One job of the first account waits, so the queue of the machine is full for every account.
    response = second.post("/api/processes/stand-in/execution", json={"inputs": {"name": "a"}})
    _problem(response, 503, "Too many jobs wait at present.")
    assert response.headers["retry-after"] == "120"
    assert second.get("/api/jobs").json()["jobs"] == []
    for job in started:
        first.delete(f"/api/jobs/{job}")
    assert _wait(first, _start(first)["jobID"])["status"] == "successful"


def test_account_may_hold_a_limited_number_and_size_of_layers(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(jobs, "MAX_ACCOUNT_LAYERS", 2)
    for name in ("one", "two"):
        _wait(client, _start(client, name=name)["jobID"], "successful")
    address = "/api/processes/stand-in/execution"
    _problem(client.post(address, json={"inputs": {"name": "three"}}), 507, "You may keep at most 2 layers.")
    monkeypatch.setattr(jobs, "MAX_ACCOUNT_LAYERS", 50)
    monkeypatch.setattr(jobs, "MAX_ACCOUNT_SIZE", 5000)
    # The two layers use 4102 bytes, so a third of 2053 bytes does not fit.
    info = _wait(client, _start(client, name="three")["jobID"])
    assert (info["status"], info["message"].split(".")[0]) == (
        "failed",
        "The layer does not fit in the space that is left for your layers",
    )
    assert len(list((tmp_path / "files").iterdir())) == 2
    monkeypatch.setattr(jobs, "MAX_ACCOUNT_SIZE", 4102)
    _problem(client.post(address, json={"inputs": {"name": "three"}}), 507, "Your layers use the 4.102e-06 gigabytes")
    monkeypatch.setattr(jobs, "MAX_ACCOUNT_SIZE", 2_000_000_000)
    monkeypatch.setattr(jobs, "MAX_TOTAL_SIZE", 4102)
    _problem(
        client.post(address, json={"inputs": {"name": "three"}}),
        507,
        "The server has no space for more layers at present.",
    )


def test_oldest_records_of_finished_jobs_are_removed(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(jobs, "MAX_ACCOUNT_FINISHED_JOBS", 2)
    started = []
    for end in ("sentence", "sentence", "sentence", "sentence"):
        started.append(_start(client, end=end)["jobID"])
        _wait(client, started[-1])
    assert [job["jobID"] for job in client.get("/api/jobs").json()["jobs"]] == [started[3], started[2], started[1]]


# Layers


def test_layer_is_removed_with_its_files_and_the_record_of_its_job(client: TestClient, tmp_path: Path) -> None:
    job = _start(client)["jobID"]
    _wait(client, job)
    [layer] = _layers(client)
    response = client.delete(f"/api/layers/{layer['id']}")
    assert (response.status_code, response.content) == (204, b"")
    assert client.get("/api/layers").json() == {"layers": []}
    assert list((tmp_path / "files").iterdir()) == []
    kind = f"{OGC}exceptions/ogcapi-processes-1/1.0/no-such-job"
    _problem(client.get(f"/api/jobs/{job}"), 404, "You have no job of this name.", kind)
    _problem(client.delete(f"/api/layers/{layer['id']}"), 404, "You have no layer of this name.")
    assert client.delete("/api/layers/..%2F..%2Flynkeus.sqlite3").status_code == 404
    assert (tmp_path / "lynkeus.sqlite3").is_file()


def test_layer_receives_a_new_title_in_its_description_and_in_its_record(visit: Visit, tmp_path: Path) -> None:
    client, other = _sign_in(visit(), "a_user"), _sign_in(visit(), "b_user")
    _wait(client, _start(client)["jobID"])
    [layer] = _layers(client)
    address = f"/api/layers/{layer['id']}"
    response = client.patch(address, json={"title": "  Backscatter of 2 November  "})
    assert response.status_code == 200
    entry = response.json()
    assert entry["layer"] == {**layer, "title": "Backscatter of 2 November"}
    assert client.get("/api/layers").json() == {"layers": [entry]}
    record = tmp_path / "files" / layer["id"] / "a.json"
    assert json.loads(record.read_text(encoding="utf-8")) == {
        "type": "Feature",
        "properties": {"title": "Backscatter of 2 November"},
    }
    assert entry["size"] == 2000 + record.stat().st_size
    assert sorted(path.name for path in record.parent.iterdir()) == ["a.json", "a.tif"]
    for wrong in (
        {"title": ""},
        {"title": "   "},
        {"title": "a" * 201},
        {"title": 7},
        {"title": "a", "kind": "result"},
        {},
    ):
        _problem(
            client.patch(address, json=wrong),
            400,
            'The request body must be {"title": "..."} with a title of 1 to 200 characters.',
        )
    assert client.patch(address, json={"title": "a" * 200}).status_code == 200
    _problem(client.patch("/api/layers/unknown", json={"title": "b"}), 404, "You have no layer of this name.")
    _problem(other.patch(address, json={"title": "b"}), 404, "You have no layer of this name.")
    _problem(client.patch(address, content=b"title=b"), 415, "The request body must be")
    # A record without a title, and a record that cannot be read, stay as they are.
    record.write_text('{"type": "Feature", "properties": {}}', encoding="utf-8")
    assert client.patch(address, json={"title": "c"}).json()["layer"]["title"] == "c"
    assert json.loads(record.read_text(encoding="utf-8")) == {"type": "Feature", "properties": {}}
    record.write_text("not JSON", encoding="utf-8")
    assert client.patch(address, json={"title": "d"}).json()["layer"]["title"] == "d"
    assert record.read_text(encoding="utf-8") == "not JSON"


# Restart


def test_restart_keeps_layers_and_finished_jobs_and_forgets_the_token(tmp_path: Path, keys: KeyServer) -> None:
    with _running(tmp_path, keys) as visit:
        client = _sign_in(visit())
        done = _start(client, name="kept")["jobID"]
        _wait(client, done, "successful")
        failed = _start(client, end="sentence")["jobID"]
        _wait(client, failed)
        monkey = pytest.MonkeyPatch()
        monkey.setattr(jobs, "MAX_RUNNING_JOBS", 1)
        running = _start(client, "signed-in", seconds=30)["jobID"]
        waiting = _start(client, seconds=30)["jobID"]
        _wait(client, running, "running")
        monkey.undo()
        cookies = dict(client.cookies)
        [layer] = _layers(client)
        stray = tmp_path / "files" / "0123456789abcdef0123456789abcdef"
        stray.mkdir()
        (stray / "left.tif").write_bytes(b"left")
    assert sorted(path.name for path in (tmp_path / "files").iterdir()) == sorted([layer["id"], stray.name])
    with _running(tmp_path, keys) as visit:
        client = visit()
        client.cookies.update(cookies)
        # The visitor is still signed in to the account, and the web service no longer holds the token.
        assert client.get("/api/session").json() == {"earthdata": {"user": "test_user", "token": False}}
        assert _layers(client) == [layer]
        states = {job["jobID"]: (job["status"], job["message"]) for job in client.get("/api/jobs").json()["jobs"]}
        assert states == {
            done: ("successful", "The layer is ready."),
            failed: ("failed", "The stand-in was asked to fail."),
            running: ("failed", jobs.RESTARTED),
            waiting: ("failed", jobs.RESTARTED),
        }
        assert client.get(f"/api/jobs/{done}/results").json() == layer
        assert [path.name for path in (tmp_path / "files").iterdir()] == [layer["id"]]
        assert (tmp_path / "files" / layer["id"] / "kept.tif").stat().st_size == 2000
        assert _wait(client, _start(client, name="after")["jobID"])["status"] == "successful"
        refused = client.post("/api/processes/signed-in/execution", json={"inputs": {"name": "a"}})
        _problem(refused, 401, routes.ENTER_AGAIN)


def test_web_service_of_lynkeus_offers_the_addresses() -> None:
    with TestClient(server.create_app(), base_url="https://testserver") as client:
        assert client.get("/api/session").json() == {"earthdata": None}
        assert client.get("/api/processes").status_code == 200
        assert client.get("/api/health").status_code == 200
        definition = client.get("/api/openapi.json").json()
        assert "/api/processes/{name}/execution" in definition["paths"]


# The keeping time and the storage of an account


def _instant(text: str) -> float:
    """Return a date-time of an answer in seconds since 1 January 1970 (UTC)."""
    assert text.endswith("Z")
    return datetime.fromisoformat(text).timestamp()


def test_layer_is_kept_for_the_keeping_time_from_its_extension(visit: Visit) -> None:
    client, other, visitor = _sign_in(visit(), "a_user"), _sign_in(visit(), "b_user"), visit()
    _wait(client, _start(client)["jobID"])
    [entry] = client.get("/api/layers").json()["layers"]
    name = entry["layer"]["id"]
    store = _service(client).store
    # Three days before its moment, the layer is extended: it is kept for the keeping time from now.
    store.keep_layer(name, time.time() + 3 * 24 * 3600)
    soon = client.get("/api/layers").json()["layers"][0]["kept_until"]
    assert _instant(soon) < time.time() + 3 * 24 * 3600 + 1
    before = time.time()
    response = client.post(f"/api/layers/{name}/extension")
    assert response.status_code == 200
    extended = response.json()
    assert int(before) + jobs.KEEP_TIME <= _instant(extended["kept_until"]) <= time.time() + jobs.KEEP_TIME
    assert extended == {**entry, "kept_until": extended["kept_until"]}
    assert client.get("/api/layers").json() == {"layers": [extended]}
    # The request takes no body, and only the account of the layer may send it.
    for wrong in (other, visitor):
        _problem(wrong.post(f"/api/layers/{name}/extension"), 404, "You have no layer of this name.")
    _problem(client.post("/api/layers/unknown/extension"), 404, "You have no layer of this name.")
    assert client.get(f"/api/layers/{name}/extension").status_code == 405


def test_everything_of_an_account_is_extended_at_once_and_nothing_of_another(visit: Visit) -> None:
    client, other, visitor = _sign_in(visit(), "a_user"), _sign_in(visit(), "b_user"), visit()
    for name in ("one", "two"):
        _wait(client, _start(client, name=name)["jobID"])
    _wait(other, _start(other, name="three")["jobID"])
    store = _service(client).store
    soon = time.time() + 3600
    for layer in (*store.layers_of(Holder(account="a_user")), *store.layers_of(Holder(account="b_user"))):
        store.keep_layer(layer.id, soon)
    before = time.time()
    response = client.post("/api/storage/extension")
    assert (response.status_code, response.content) == (204, b"")
    for entry in client.get("/api/layers").json()["layers"]:
        assert int(before) + jobs.KEEP_TIME <= _instant(entry["kept_until"]) <= time.time() + jobs.KEEP_TIME
    [untouched] = other.get("/api/layers").json()["layers"]
    assert _instant(untouched["kept_until"]) == int(soon)
    refused = visitor.post("/api/storage/extension")
    _problem(refused, 401, "Sign in to Earthdata to keep or remove what the project server keeps for your account.")
    assert refused.headers["www-authenticate"] == 'Bearer realm="Earthdata Login"'
    assert "set-cookie" not in refused.headers


def test_removal_run_removes_what_has_passed_its_moment_also_while_its_account_is_signed_in(
    client: TestClient, tmp_path: Path
) -> None:
    kept, passed = (_wait(client, _start(client, name=name)["jobID"]) for name in ("kept", "passed"))
    failed = _wait(client, _start(client, end="sentence")["jobID"])
    dismissed = _start(client, seconds=30)["jobID"]
    _wait(client, dismissed, "running")
    client.delete(f"/api/jobs/{dismissed}")
    service = _service(client)
    assert routes.REMOVAL_PAUSE == 300
    # A run removes nothing before the moments.
    service.remove_passed()
    assert len(_layers(client)) == 2
    service.store.keep_layer(passed["layer"], time.time() - 1)
    service.remove_passed()
    assert client.get("/api/session").json() == {"earthdata": {"user": "test_user", "token": True}}
    assert [layer["id"] for layer in _layers(client)] == [kept["layer"]]
    assert sorted(path.name for path in (tmp_path / "files").iterdir() if any(path.iterdir())) == [kept["layer"]]
    kind = f"{OGC}exceptions/ogcapi-processes-1/1.0/no-such-job"
    _problem(client.get(f"/api/jobs/{passed['jobID']}"), 404, "You have no job of this name.", kind)
    # The records of the failed and of the dismissed job stay for the keeping time after their end.
    assert client.get(f"/api/jobs/{failed['jobID']}").json()["status"] == "failed"
    _problem(client.get(f"/api/jobs/{dismissed}"), 410, "The job was dismissed.")
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(jobs, "KEEP_TIME", 0.01)
        time.sleep(0.05)
        service.jobs.remove_passed()
    for gone in (failed["jobID"], dismissed):
        _problem(client.get(f"/api/jobs/{gone}"), 404, "You have no job of this name.", kind)
    assert client.get(f"/api/jobs/{kept['jobID']}").json()["status"] == "successful"


def test_removal_run_takes_place_by_itself_at_the_start_and_after_each_pause(
    tmp_path: Path, keys: KeyServer, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(routes, "REMOVAL_PAUSE", 0.2)
    with _running(tmp_path, keys) as visit:
        client = _sign_in(visit())
        job = _wait(client, _start(client)["jobID"])
        _service(client).store.keep_layer(job["layer"], time.time() - 1)
        limit = time.monotonic() + 10
        while _layers(client) and time.monotonic() < limit:
            time.sleep(0.05)
        assert _layers(client) == []
        assert not (tmp_path / "files" / job["layer"]).exists()


def test_fault_in_a_removal_run_is_recorded_and_the_next_run_takes_place(
    tmp_path: Path, keys: KeyServer, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr(routes, "REMOVAL_PAUSE", 0.1)
    runs: list[int] = []

    def failing(self: Service) -> None:
        runs.append(len(runs))
        raise RuntimeError("a fault of the test")

    monkeypatch.setattr(Service, "remove_passed", failing)
    with _running(tmp_path, keys):
        limit = time.monotonic() + 10
        while len(runs) < 3 and time.monotonic() < limit:
            time.sleep(0.05)
    assert len(runs) >= 3
    assert "A removal run failed." in caplog.text


def test_everything_of_an_account_is_removed_from_the_project_server_and_its_servers_stay(
    visit: Visit, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(jobs, "MAX_RUNNING_JOBS", 1)
    client, second, other, visitor = (
        _sign_in(visit(), "a_user"),
        _sign_in(visit(), "a_user"),
        _sign_in(visit(), "b_user"),
        visit(),
    )
    for name in ("one", "two"):
        _wait(client, _start(client, name=name)["jobID"])
    _wait(client, _start(client, end="sentence")["jobID"])
    _wait(other, _start(other, name="three")["jobID"])
    running = _start(client, seconds=30)["jobID"]
    waiting = _start(second, seconds=30)["jobID"]
    _wait(client, running, "running")
    service = _service(client)
    assert _confirmed(service.store, "0123456789abcdef", "a_user") == "confirmed"
    refused = visitor.delete("/api/storage")
    _problem(refused, 401, "Sign in to Earthdata to keep or remove what the project server keeps for your account.")
    response = second.delete("/api/storage")
    assert (response.status_code, response.content) == (204, b"")
    # Both browsers of the account stay signed in and hold nothing: no layer, no job, no record of a job.
    for browser in (client, second):
        assert browser.get("/api/session").json() == {"earthdata": {"user": "a_user", "token": True}}
        assert browser.get("/api/layers").json() == {"layers": []}
        assert browser.get("/api/jobs").json()["jobs"] == []
    kind = f"{OGC}exceptions/ogcapi-processes-1/1.0/no-such-job"
    for job in (running, waiting):
        _problem(client.get(f"/api/jobs/{job}"), 404, "You have no job of this name.", kind)
    account = Holder(account="a_user")
    assert (service.store.jobs_of(account), service.store.layers_of(account), service.store.series_of(account)) == (
        [],
        [],
        [],
    )
    # The other account keeps its layer, and the server of the account stays.
    [layer] = _layers(other)
    limit = time.monotonic() + jobs.END_TIME + 10
    while len(list((tmp_path / "files").iterdir())) > 1 and time.monotonic() < limit:
        time.sleep(0.05)
    assert [path.name for path in (tmp_path / "files").iterdir()] == [layer["id"]]
    assert [server.id for server in service.store.servers_of("a_user")] == ["0123456789abcdef"]
    # The account starts again at once, and a second removal finds nothing.
    assert _wait(client, _start(client)["jobID"])["status"] == "successful"
    assert client.delete("/api/storage").status_code == 204
    assert client.delete("/api/storage").status_code == 204


# The free space of the disk


def test_job_is_refused_with_507_when_it_would_leave_less_than_the_reserve_free(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    needed = jobs.FREE_SPACE_RESERVE + jobs.MAX_LAYER_SIZE
    assert (jobs.FREE_SPACE_RESERVE, needed) == (5_000_000_000, 5_500_000_000)
    monkeypatch.setattr(jobs, "free_space", lambda folder: needed - 1)
    response = client.post("/api/processes/stand-in/execution", json={"inputs": {"name": "a"}})
    _problem(response, 507, "The server has too little free space on its disk for a new layer at present.")
    assert response.json()["title"] == "Insufficient Storage"
    assert client.get("/api/jobs").json()["jobs"] == []
    monkeypatch.setattr(jobs, "free_space", lambda folder: needed)
    assert _wait(client, _start(client)["jobID"])["status"] == "successful"


def test_running_job_is_ended_with_one_sentence_when_the_disk_reaches_the_reserve(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(jobs, "SIZE_PAUSE", 0.1)
    job = _start(client, seconds=30)["jobID"]
    _wait(client, job, "running")
    monkeypatch.setattr(jobs, "free_space", lambda folder: jobs.FREE_SPACE_RESERVE - 1)
    info = _wait(client, job)
    assert (info["status"], info["message"]) == (
        "failed",
        "The job was ended because the server has too little free space on its disk.",
    )
    assert list((tmp_path / "files").iterdir()) == []
