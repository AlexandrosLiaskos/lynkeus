"""Tests of the limits of the jobs and of the end of a job.

The addresses of the web service use the jobs with the limits of the project server
(``tests/test_routes.py``). These tests give other limits, as an own server does.
"""

import multiprocessing
import signal
import threading
import time
from collections.abc import Iterator
from pathlib import Path

import pytest

from lynkeus import jobs
from lynkeus.jobs import Jobs, LimitError, Limits
from lynkeus.store import JobRecord, Store
from tests.standin import STAND_IN, StandInInputs

SESSION = "a-session"


@pytest.fixture
def store(tmp_path: Path) -> Iterator[Store]:
    store = Store(tmp_path / "lynkeus.sqlite3")
    store.add_session(SESSION, "digest", time.time())
    yield store
    store.close()


def _jobs(store: Store, folder: Path, limits: Limits | None = None) -> Jobs:
    (folder / "files").mkdir()
    return Jobs(store, folder / "files", {STAND_IN.id: STAND_IN}, "/files", limits)


def _wait(store: Store, job: str, *states: str) -> JobRecord:
    limit = time.monotonic() + 60
    while time.monotonic() < limit:
        record = store.job(job)
        assert record is not None
        if record.status in (states or ("successful", "failed")):
            return record
        time.sleep(0.05)
    raise AssertionError(f"the job did not reach the state {' or '.join(states) or 'of a finished job'}")


def test_limits_without_values_are_those_of_the_project_server(store: Store, tmp_path: Path) -> None:
    assert Limits() == Limits(
        running_jobs=jobs.MAX_RUNNING_JOBS,
        layer_size=jobs.MAX_LAYER_SIZE,
        session_size=jobs.MAX_SESSION_SIZE,
        total_size=jobs.MAX_TOTAL_SIZE,
        waiting_jobs=jobs.MAX_WAITING_JOBS,
        session_unfinished_jobs=jobs.MAX_SESSION_UNFINISHED_JOBS,
        session_layers=jobs.MAX_SESSION_LAYERS,
    )
    assert (Limits().running_jobs, Limits().layer_size, Limits().session_size, Limits().total_size) == (
        2,
        500_000_000,
        2_000_000_000,
        20_000_000_000,
    )
    assert _jobs(store, tmp_path).limits == Limits()


def test_jobs_without_given_limits_follow_the_constants_as_they_are(
    store: Store, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    running = _jobs(store, tmp_path)
    monkeypatch.setattr(jobs, "MAX_RUNNING_JOBS", 5)
    monkeypatch.setattr(jobs, "MAX_LAYER_SIZE", 7)
    assert (running.limits.running_jobs, running.limits.layer_size) == (5, 7)
    running.set_limits(Limits(running_jobs=1))
    assert (running.limits.running_jobs, running.limits.layer_size) == (1, 7)


@pytest.mark.parametrize(
    "values",
    [{"running_jobs": 0}, {"layer_size": -1}, {"total_size": -1}, {"waiting_jobs": -1}, {"session_layers": -5}],
)
def test_limits_that_no_server_can_have_are_refused(values: dict[str, int]) -> None:
    with pytest.raises(ValueError, match=r"at least one job must be able to run|a limit cannot be negative"):
        Limits(**values)


def test_given_limits_decide_how_many_jobs_run_and_wait(store: Store, tmp_path: Path) -> None:
    limits = Limits(running_jobs=1, waiting_jobs=None, session_unfinished_jobs=None, session_layers=None)
    running = _jobs(store, tmp_path, limits)
    try:
        started = [
            running.submit(SESSION, STAND_IN, StandInInputs(name="a", seconds=30), "document", None) for _ in range(6)
        ]
        _wait(store, started[0].id, "running")
        assert [store.job(job.id).status for job in started[1:]] == ["accepted"] * 5  # type: ignore[union-attr]
        # More jobs may run: the jobs that waited longest start, and no running job is ended by a smaller limit.
        running.set_limits(Limits(running_jobs=3, waiting_jobs=None, session_unfinished_jobs=None, session_layers=None))
        assert running.limits.running_jobs == 3
        for job in started[1:3]:
            _wait(store, job.id, "running")
        running.set_limits(limits)
        time.sleep(0.5)
        assert [store.job(job.id).status for job in started] == ["running"] * 3 + ["accepted"] * 3  # type: ignore[union-attr]
    finally:
        running.stop()


def test_limits_of_a_shared_server_refuse_a_job_and_none_lifts_them(store: Store, tmp_path: Path) -> None:
    running = _jobs(store, tmp_path, Limits(running_jobs=1, session_unfinished_jobs=1))
    try:
        running.submit(SESSION, STAND_IN, StandInInputs(name="a", seconds=30), "document", None)
        with pytest.raises(LimitError, match="You have 1 jobs that wait or run"):
            running.submit(SESSION, STAND_IN, StandInInputs(name="a"), "document", None)
        running.set_limits(Limits(running_jobs=1, session_unfinished_jobs=None, waiting_jobs=0))
        with pytest.raises(LimitError, match="Too many jobs wait at present"):
            running.submit(SESSION, STAND_IN, StandInInputs(name="a"), "document", None)
        running.set_limits(Limits(running_jobs=1, session_unfinished_jobs=None, session_layers=1))
        with pytest.raises(LimitError, match="A session holds at most 1 layers"):
            running.submit(SESSION, STAND_IN, StandInInputs(name="a"), "document", None)
        running.set_limits(Limits(session_size=0))
        with pytest.raises(LimitError, match="Your layers use the 0 gigabytes that a session may hold"):
            running.submit(SESSION, STAND_IN, StandInInputs(name="a"), "document", None)
        running.set_limits(Limits(total_size=0))
        with pytest.raises(LimitError, match="The server has no space for more layers at present"):
            running.submit(SESSION, STAND_IN, StandInInputs(name="a"), "document", None)
    finally:
        running.stop()


def test_job_takes_the_name_and_the_title_that_another_server_gave(store: Store, tmp_path: Path) -> None:
    running = _jobs(store, tmp_path)
    try:
        name = "0123456789abcdef0123456789abcdef"
        job = running.submit(SESSION, STAND_IN, StandInInputs(name="a"), "document", None, job=name, title="A title")
        assert (job.id, job.title) == (name, "A title")
        own = running.submit(SESSION, STAND_IN, StandInInputs(name="b"), "document", None)
        assert (len(own.id), own.title) == (32, "Stand-in b")
        assert _wait(store, name).status == "successful"
    finally:
        running.stop()


def test_size_of_a_layer_and_of_a_session_follow_the_given_limits(store: Store, tmp_path: Path) -> None:
    running = _jobs(store, tmp_path, Limits(layer_size=3_000, session_size=5_000))
    try:
        large = running.submit(SESSION, STAND_IN, StandInInputs(name="a", size=4_000), "document", None)
        assert _wait(store, large.id).message == "The job was ended because its layer is larger than 0.003 megabytes."
        first = running.submit(SESSION, STAND_IN, StandInInputs(name="a", size=2_500), "document", None)
        assert _wait(store, first.id).status == "successful"
        second = running.submit(SESSION, STAND_IN, StandInInputs(name="a", size=2_500), "document", None)
        assert _wait(store, second.id).message.startswith("The layer does not fit in the space that is left")
    finally:
        running.stop()


def test_thread_of_a_job_raises_the_signal_that_ends_it_when_the_server_asks() -> None:
    received: list[tuple[int, str]] = []
    before = signal.signal(
        signal.SIGTERM, lambda number, frame: received.append((number, threading.current_thread().name))
    )
    try:
        ending = multiprocessing.get_context("spawn").Semaphore(0)
        thread = threading.Thread(target=jobs._raise_when_asked, args=(ending,))
        thread.start()
        time.sleep(0.2)
        assert received == []
        ending.release()
        thread.join(10)
        limit = time.monotonic() + 10
        while not received and time.monotonic() < limit:
            time.sleep(0.01)
        # The handler of the job runs in its main thread, as for a signal that the server sent.
        assert received == [(signal.SIGTERM, "MainThread")]
    finally:
        signal.signal(signal.SIGTERM, before)


def test_server_that_asks_a_job_to_end_does_not_wait_for_a_job_that_has_ended() -> None:
    ending = multiprocessing.get_context("spawn").Semaphore(0)
    process = multiprocessing.get_context("spawn").Process(target=time.sleep, args=(0,))
    process.start()
    process.join(60)
    start = time.monotonic()
    jobs._end(process, ending)
    assert time.monotonic() - start < jobs.END_TIME
    assert process.exitcode == 0
