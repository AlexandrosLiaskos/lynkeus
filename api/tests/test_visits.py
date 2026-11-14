"""Tests of the visit counter."""

import json
import threading
from collections.abc import Iterator
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest

from lynkeus.visits import VisitCounter, VisitServer


def test_counter_starts_at_zero(tmp_path: Path) -> None:
    assert VisitCounter(tmp_path / "visits.json").current() == 0


def test_counter_adds_and_keeps_visits(tmp_path: Path) -> None:
    path = tmp_path / "data" / "visits.json"
    counter = VisitCounter(path)
    assert counter.increment() == 1
    assert counter.increment() == 2
    assert VisitCounter(path).current() == 2
    assert json.loads(path.read_text(encoding="utf-8")) == {"count": 2}


@pytest.mark.parametrize("content", ["", "not json", "[]", '{"count": "many"}', '{"other": 1}'])
def test_unreadable_file_counts_as_zero(tmp_path: Path, content: str) -> None:
    path = tmp_path / "visits.json"
    path.write_text(content, encoding="utf-8")
    assert VisitCounter(path).current() == 0


@pytest.fixture
def address(tmp_path: Path) -> Iterator[str]:
    server = VisitServer(("127.0.0.1", 0), VisitCounter(tmp_path / "visits.json"))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
    server.server_close()
    thread.join()


def fetch(url: str, method: str = "GET") -> tuple[int, dict[str, object]]:
    try:
        with urlopen(Request(url, method=method), timeout=5) as response:  # noqa: S310 - local test server
            return response.status, json.loads(response.read())
    except HTTPError as error:
        return error.code, json.loads(error.read())


def test_service_counts_posts_only(address: str) -> None:
    assert fetch(address + "/api/visit") == (200, {"count": 0})
    assert fetch(address + "/api/visit", "POST") == (200, {"count": 1})
    assert fetch(address + "/api/visit", "POST") == (200, {"count": 2})
    assert fetch(address + "/api/visit") == (200, {"count": 2})


def test_service_reports_health_and_unknown_paths(address: str) -> None:
    assert fetch(address + "/healthz") == (200, {"status": "ok"})
    assert fetch(address + "/other") == (404, {"error": "not found"})
    assert fetch(address + "/other", "POST") == (404, {"error": "not found"})
