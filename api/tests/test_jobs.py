# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""Tests of the limits of the jobs and of the end of a job.

The addresses of the web service use the jobs with the limits of the project server
(``tests/test_routes.py``). These tests give other limits, as an own server does, and
they test the keeping time and the reserve of free space without the addresses.
"""

import dataclasses
import multiprocessing
import shutil
import signal
import threading
import time
from collections.abc import Iterator
from pathlib import Path

import pytest

from lynkeus import jobs
from lynkeus.jobs import Jobs, LimitError, Limits
from lynkeus.layers import LayerDescription
from lynkeus.processes import ProcessError, Work
from lynkeus.store import Holder, JobRecord, Store
from tests import standin
from tests.standin import STAND_IN, StandInInputs

SESSION = "a-session"
HOLDER = Holder(session=SESSION)
ACCOUNT = Holder(account="a_user")


def _state_cells(inputs: StandInInputs, work: Work) -> LayerDescription:
    """End with the cells of a layer that the server gave to the job."""
    raise ProcessError(f"The job may receive a layer of {work.layer_cells} cells.")


def _write_through_a_larger_file(inputs: StandInInputs, work: Work) -> LayerDescription:
    """Hold a temporary file of 5000 bytes for longer than the pause between two measurements, then write the layer."""
    temporary = work.folder / ".temporary"
    temporary.write_bytes(bytes(5000))
    time.sleep(2 * jobs.SIZE_PAUSE + 1)
    temporary.unlink()
    return standin.run(inputs, work)


STATES_CELLS = dataclasses.replace(STAND_IN, id="states-cells", run=_state_cells)
WRITES_THROUGH = dataclasses.replace(STAND_IN, id="writes-through", run=_write_through_a_larger_file)


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
        holder_size=jobs.MAX_ACCOUNT_SIZE,
        total_size=jobs.MAX_TOTAL_SIZE,
        waiting_jobs=jobs.MAX_WAITING_JOBS,
        holder_unfinished_jobs=jobs.MAX_ACCOUNT_UNFINISHED_JOBS,
        holder_layers=jobs.MAX_ACCOUNT_LAYERS,
        free_space_reserve=jobs.FREE_SPACE_RESERVE,
        keep_time=jobs.KEEP_TIME,
    )
    assert (Limits().free_space_reserve, Limits().keep_time) == (5_000_000_000, 14 * 24 * 3600)
    assert (Limits().running_jobs, Limits().layer_size, Limits().holder_size, Limits().total_size) == (
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
    [
        {"running_jobs": 0},
        {"layer_size": -1},
        {"total_size": -1},
        {"waiting_jobs": -1},
        {"holder_layers": -5},
        {"layer_cells": 0},
        {"work_size": -1},
        {"job_time": 0},
        {"free_space_reserve": -1},
        {"keep_time": 0},
    ],
)
def test_limits_that_no_server_can_have_are_refused(values: dict[str, int]) -> None:
    sentences = (
        "at least one job must be able to run",
        "a limit cannot be negative",
        "a layer must be able to hold a cell",
        "a job must have time to run",
        "a layer must be kept for some time",
    )
    with pytest.raises(ValueError, match="|".join(sentences)):
        Limits(**values)


def test_limits_of_the_project_server_leave_the_cells_to_the_process_and_keep_its_times() -> None:
    assert (Limits().layer_cells, Limits().work_size, Limits().job_time) == (None, None, jobs.JOB_TIME)


def test_job_is_given_the_cells_of_a_layer_that_the_server_receives(store: Store, tmp_path: Path) -> None:
    (tmp_path / "files").mkdir()
    running = Jobs(store, tmp_path / "files", {STATES_CELLS.id: STATES_CELLS}, "/files", Limits(layer_cells=90_000_000))
    try:
        job = running.submit(HOLDER, STATES_CELLS, StandInInputs(name="a"), "document", None)
        assert _wait(store, job.id).message == "The job may receive a layer of 90000000 cells."
        # Without a limit of the server, the process applies its own.
        running.set_limits(Limits())
        job = running.submit(HOLDER, STATES_CELLS, StandInInputs(name="a"), "document", None)
        assert _wait(store, job.id).message == "The job may receive a layer of None cells."
    finally:
        running.stop()


def test_folder_of_a_running_job_may_hold_more_than_the_layer_when_the_limits_say_so(
    store: Store, tmp_path: Path
) -> None:
    (tmp_path / "files").mkdir()
    processes = {WRITES_THROUGH.id: WRITES_THROUGH}
    running = Jobs(store, tmp_path / "files", processes, "/files", Limits(layer_size=3_000, work_size=8_000))
    try:
        job = running.submit(HOLDER, WRITES_THROUGH, StandInInputs(name="a"), "document", None)
        assert _wait(store, job.id).status == "successful"
        # Without that limit the folder may hold the size of a layer, as on the project server.
        running.set_limits(Limits(layer_size=3_000))
        job = running.submit(HOLDER, WRITES_THROUGH, StandInInputs(name="b"), "document", None)
        assert _wait(store, job.id).message == "The job was ended because its layer is larger than 0.003 megabytes."
    finally:
        running.stop()


def test_job_runs_for_the_time_of_the_limits(store: Store, tmp_path: Path) -> None:
    running = _jobs(store, tmp_path, Limits(job_time=1.5))
    try:
        job = running.submit(HOLDER, STAND_IN, StandInInputs(name="a", seconds=30), "document", None)
        assert _wait(store, job.id).message == "The job was ended because it ran for more than 0.025 minutes."
    finally:
        running.stop()


def test_given_limits_decide_how_many_jobs_run_and_wait(store: Store, tmp_path: Path) -> None:
    limits = Limits(running_jobs=1, waiting_jobs=None, holder_unfinished_jobs=None, holder_layers=None)
    running = _jobs(store, tmp_path, limits)
    try:
        started = [
            running.submit(HOLDER, STAND_IN, StandInInputs(name="a", seconds=30), "document", None) for _ in range(6)
        ]
        _wait(store, started[0].id, "running")
        assert [store.job(job.id).status for job in started[1:]] == ["accepted"] * 5  # type: ignore[union-attr]
        # More jobs may run: the jobs that waited longest start, and no running job is ended by a smaller limit.
        running.set_limits(Limits(running_jobs=3, waiting_jobs=None, holder_unfinished_jobs=None, holder_layers=None))
        assert running.limits.running_jobs == 3
        for job in started[1:3]:
            _wait(store, job.id, "running")
        running.set_limits(limits)
        time.sleep(0.5)
        assert [store.job(job.id).status for job in started] == ["running"] * 3 + ["accepted"] * 3  # type: ignore[union-attr]
    finally:
        running.stop()


def test_limits_of_a_shared_server_refuse_a_job_and_none_lifts_them(store: Store, tmp_path: Path) -> None:
    running = _jobs(store, tmp_path, Limits(running_jobs=1, holder_unfinished_jobs=1))
    try:
        running.submit(HOLDER, STAND_IN, StandInInputs(name="a", seconds=30), "document", None)
        with pytest.raises(LimitError, match="You have 1 jobs that wait or run"):
            running.submit(HOLDER, STAND_IN, StandInInputs(name="a"), "document", None)
        running.set_limits(Limits(running_jobs=1, holder_unfinished_jobs=None, waiting_jobs=0))
        with pytest.raises(LimitError, match="Too many jobs wait at present"):
            running.submit(HOLDER, STAND_IN, StandInInputs(name="a"), "document", None)
        running.set_limits(Limits(running_jobs=1, holder_unfinished_jobs=None, holder_layers=1))
        with pytest.raises(LimitError, match="You may keep at most 1 layers"):
            running.submit(HOLDER, STAND_IN, StandInInputs(name="a"), "document", None)
        running.set_limits(Limits(holder_size=0))
        with pytest.raises(LimitError, match="Your layers use the 0 gigabytes that you may keep"):
            running.submit(HOLDER, STAND_IN, StandInInputs(name="a"), "document", None)
        running.set_limits(Limits(total_size=0))
        with pytest.raises(LimitError, match="The server has no space for more layers at present"):
            running.submit(HOLDER, STAND_IN, StandInInputs(name="a"), "document", None)
    finally:
        running.stop()


def test_job_takes_the_name_and_the_title_that_another_server_gave(store: Store, tmp_path: Path) -> None:
    running = _jobs(store, tmp_path)
    try:
        name = "0123456789abcdef0123456789abcdef"
        job = running.submit(HOLDER, STAND_IN, StandInInputs(name="a"), "document", None, job=name, title="A title")
        assert (job.id, job.title) == (name, "A title")
        own = running.submit(HOLDER, STAND_IN, StandInInputs(name="b"), "document", None)
        assert (len(own.id), own.title) == (32, "Stand-in b")
        assert _wait(store, name).status == "successful"
    finally:
        running.stop()


def test_size_of_a_layer_and_of_a_holder_follow_the_given_limits(store: Store, tmp_path: Path) -> None:
    running = _jobs(store, tmp_path, Limits(layer_size=3_000, holder_size=5_000))
    try:
        large = running.submit(HOLDER, STAND_IN, StandInInputs(name="a", size=4_000), "document", None)
        assert _wait(store, large.id).message == "The job was ended because its layer is larger than 0.003 megabytes."
        first = running.submit(HOLDER, STAND_IN, StandInInputs(name="a", size=2_500), "document", None)
        assert _wait(store, first.id).status == "successful"
        second = running.submit(HOLDER, STAND_IN, StandInInputs(name="a", size=2_500), "document", None)
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


# Accounts


def test_account_meets_its_limits_whichever_session_starts_the_job(store: Store, tmp_path: Path) -> None:
    running = _jobs(store, tmp_path, Limits(running_jobs=1, holder_unfinished_jobs=2, holder_layers=3))
    try:
        first = running.submit(ACCOUNT, STAND_IN, StandInInputs(name="a"), "document", None)
        assert (first.owner, first.session, first.holder) == ("a_user", None, ACCOUNT)
        done = _wait(store, first.id)
        assert done.status == "successful"
        layer = store.layer(done.layer or "")
        assert layer is not None
        assert layer.holder == ACCOUNT
        # The layer of the account is an input of its next job, and of no job of another holder.
        uses = running.submit(ACCOUNT, STAND_IN, StandInInputs(name="b", uses=(layer.id,)), "document", None)
        assert _wait(store, uses.id).status == "successful"
        other = running.submit(HOLDER, STAND_IN, StandInInputs(name="b", uses=(layer.id,)), "document", None)
        assert _wait(store, other.id).status == "failed"
        # Two unfinished jobs of the account are the most, and the third layer is the last.
        running.submit(ACCOUNT, STAND_IN, StandInInputs(name="c", seconds=30), "document", None)
        with pytest.raises(LimitError, match="You may keep at most 3 layers"):
            running.submit(ACCOUNT, STAND_IN, StandInInputs(name="d"), "document", None)
        running.set_limits(Limits(running_jobs=1, holder_unfinished_jobs=2, holder_layers=None))
        running.submit(ACCOUNT, STAND_IN, StandInInputs(name="d"), "document", None)
        with pytest.raises(LimitError, match="You have 2 jobs that wait or run"):
            running.submit(ACCOUNT, STAND_IN, StandInInputs(name="e"), "document", None)
        # Another holder is not counted with the account.
        running.submit(HOLDER, STAND_IN, StandInInputs(name="e"), "document", None)
    finally:
        running.stop()


def test_layer_of_one_holder_is_not_renamed_kept_or_removed_by_another(store: Store, tmp_path: Path) -> None:
    running = _jobs(store, tmp_path)
    try:
        job = running.submit(ACCOUNT, STAND_IN, StandInInputs(name="a"), "document", None)
        layer = _wait(store, job.id).layer or ""
        for other in (HOLDER, Holder(account="another_user")):
            assert running.rename_layer(other, layer, "New") is None
            assert running.keep_layer(other, layer) is None
            assert not running.remove_layer(other, layer)
        renamed = running.rename_layer(ACCOUNT, layer, "New")
        assert renamed is not None
        assert LayerDescription.model_validate_json(renamed.description).title == "New"
        assert running.remove_layer(ACCOUNT, layer)
        assert not (tmp_path / "files" / layer).exists()
    finally:
        running.stop()


# The keeping time


def test_layer_is_kept_for_the_keeping_time_and_removed_with_its_files_and_its_job(
    store: Store, tmp_path: Path
) -> None:
    running = _jobs(store, tmp_path)
    try:
        before = time.time()
        first = _wait(store, running.submit(ACCOUNT, STAND_IN, StandInInputs(name="a"), "document", None).id)
        second = _wait(store, running.submit(ACCOUNT, STAND_IN, StandInInputs(name="b"), "document", None).id)
        failed = _wait(
            store, running.submit(ACCOUNT, STAND_IN, StandInInputs(name="c", end="sentence"), "document", None).id
        )
        layers = {layer.id: layer for layer in store.layers_of(ACCOUNT)}
        for layer in layers.values():
            assert before + jobs.KEEP_TIME <= (layer.kept_until or 0) <= time.time() + jobs.KEEP_TIME
            assert (tmp_path / "files" / layer.id).is_dir()
        # A removal run before the moment removes nothing.
        running.remove_passed()
        running.remove_passed(time.time() + jobs.KEEP_TIME - 60)
        assert len(store.layers_of(ACCOUNT)) == 2
        assert store.job(failed.id) is not None
        # An extended layer is kept for the keeping time from the moment of the extension.
        store.keep_layer(first.layer or "", 1000.0)
        kept = running.keep_layer(ACCOUNT, first.layer or "")
        assert kept is not None
        assert time.time() + jobs.KEEP_TIME - 5 <= (kept.kept_until or 0) <= time.time() + jobs.KEEP_TIME
        store.keep_layer(first.layer or "", time.time() + jobs.KEEP_TIME + 3600)
        # After the moment the layer goes with its files and the record of its job, and the record of the
        # failed job goes after the keeping time. The layer that was extended stays.
        running.remove_passed(time.time() + jobs.KEEP_TIME + 60)
        assert [layer.id for layer in store.layers_of(ACCOUNT)] == [first.layer]
        assert not (tmp_path / "files" / (second.layer or "")).exists()
        assert (tmp_path / "files" / (first.layer or "")).is_dir()
        assert (store.job(second.id), store.job(failed.id)) == (None, None)
        assert store.job(first.id) is not None
    finally:
        running.stop()


def test_everything_of_a_holder_is_extended_and_removed_at_once(store: Store, tmp_path: Path) -> None:
    running = _jobs(store, tmp_path)
    try:
        mine = [
            _wait(store, running.submit(ACCOUNT, STAND_IN, StandInInputs(name=name), "document", None).id)
            for name in ("a", "b")
        ]
        other = _wait(store, running.submit(HOLDER, STAND_IN, StandInInputs(name="c"), "document", None).id)
        for layer in (*mine, other):
            store.keep_layer(layer.layer or "", 1000.0)
        running.keep_all(ACCOUNT)
        assert all((layer.kept_until or 0) > time.time() for layer in store.layers_of(ACCOUNT))
        assert [layer.kept_until for layer in store.layers_of(HOLDER)] == [1000.0]
        # The removal ends the jobs of the holder and leaves the other holder as it is.
        waits = running.submit(ACCOUNT, STAND_IN, StandInInputs(name="d", seconds=30), "document", None)
        _wait(store, waits.id, "running")
        running.remove_content(ACCOUNT)
        assert (store.jobs_of(ACCOUNT), store.layers_of(ACCOUNT)) == ([], [])
        assert store.job(waits.id) is None
        for layer in mine:
            assert not (tmp_path / "files" / (layer.layer or "")).exists()
        assert (tmp_path / "files" / (other.layer or "")).is_dir()
        assert len(store.jobs_of(HOLDER)) == 1
        limit = time.monotonic() + 30
        while len(list((tmp_path / "files").iterdir())) > 1 and time.monotonic() < limit:
            time.sleep(0.05)
        # The folder of the job that ran is removed when the job has ended.
        assert [folder.name for folder in (tmp_path / "files").iterdir()] == [other.layer]
    finally:
        running.stop()


def test_start_gives_a_moment_to_what_has_none_on_a_server_that_keeps_for_a_time(store: Store, tmp_path: Path) -> None:
    without_end = Limits(keep_time=None, free_space_reserve=None)
    running = _jobs(store, tmp_path, without_end)
    try:
        job = _wait(store, running.submit(HOLDER, STAND_IN, StandInInputs(name="a"), "document", None).id)
        layer = store.layer(job.layer or "")
        assert layer is not None
        # A server without a keeping time, as an own server is, keeps a layer without an end.
        assert layer.kept_until is None
        assert running.keep_layer(HOLDER, layer.id) == layer
        running.keep_all(HOLDER)
        running.remove_passed(time.time() + 10 * jobs.KEEP_TIME)
        running.start()
        assert store.layer(layer.id) == layer
    finally:
        running.stop()
    # The project server gives the layer the keeping time from the moment of its start.
    project = Jobs(store, tmp_path / "files", {STAND_IN.id: STAND_IN}, "/files")
    before = time.time()
    project.start()
    kept = store.layer(layer.id)
    assert kept is not None
    assert before + jobs.KEEP_TIME <= (kept.kept_until or 0) <= time.time() + jobs.KEEP_TIME
    project.start()
    assert store.layer(layer.id) == kept
    project.stop()


# The free space of the disk


def test_job_is_refused_when_its_folder_would_leave_less_than_the_reserve_free(
    store: Store, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    read: list[Path] = []
    free = [0]

    def measured(folder: Path) -> int:
        read.append(folder)
        return free[0]

    monkeypatch.setattr(jobs, "free_space", measured)
    running = _jobs(store, tmp_path, Limits(layer_size=3_000, free_space_reserve=10_000))
    try:
        free[0] = 12_999
        with pytest.raises(LimitError, match="The server has too little free space on its disk") as refusal:
            running.submit(HOLDER, STAND_IN, StandInInputs(name="a"), "document", None)
        assert (refusal.value.status, str(refusal.value)) == (507, jobs.NO_SPACE)
        assert read == [tmp_path / "files"]
        assert store.jobs_of(HOLDER) == []
        # The largest folder of the job is the folder of its work when the limits give one.
        free[0] = 13_000
        running.set_limits(Limits(layer_size=3_000, work_size=4_000, free_space_reserve=10_000))
        with pytest.raises(LimitError, match="too little free space"):
            running.submit(HOLDER, STAND_IN, StandInInputs(name="a"), "document", None)
        running.set_limits(Limits(layer_size=3_000, free_space_reserve=10_000))
        job = running.submit(HOLDER, STAND_IN, StandInInputs(name="a"), "document", None)
        assert _wait(store, job.id).status == "successful"
        # Without a reserve the free space is not read.
        read.clear()
        free[0] = 0
        running.set_limits(Limits(free_space_reserve=None))
        job = running.submit(HOLDER, STAND_IN, StandInInputs(name="b"), "document", None)
        assert _wait(store, job.id).status == "successful"
        assert read == []
    finally:
        running.stop()


def test_waiting_job_is_not_started_and_running_job_is_ended_when_the_reserve_is_reached(
    store: Store, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    free = [1_000_000]
    monkeypatch.setattr(jobs, "free_space", lambda folder: free[0])
    running = _jobs(store, tmp_path, Limits(running_jobs=1, layer_size=3_000, free_space_reserve=10_000))
    try:
        first = running.submit(HOLDER, STAND_IN, StandInInputs(name="a", seconds=30), "document", None)
        second = running.submit(HOLDER, STAND_IN, StandInInputs(name="b"), "document", None)
        _wait(store, first.id, "running")
        # The disk still has the reserve, so the job runs on through a measurement.
        free[0] = 10_000
        time.sleep(jobs.SIZE_PAUSE + 1)
        assert _wait(store, first.id, "running").status == "running"
        free[0] = 9_999
        ended = _wait(store, first.id)
        assert (ended.status, ended.message) == ("failed", jobs.SPACE_PASSED)
        assert ended.message == "The job was ended because the server has too little free space on its disk."
        # The job that waited is not started on a disk without the space for its folder.
        waited = _wait(store, second.id)
        assert (waited.status, waited.message, waited.started) == ("failed", jobs.NOT_STARTED, None)
        assert waited.message == "The job was not started because the server has too little free space on its disk."
        assert list((tmp_path / "files").iterdir()) == []
    finally:
        running.stop()


def test_disk_whose_free_space_cannot_be_read_takes_no_job(
    store: Store, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    def unreadable(folder: Path) -> int:
        raise OSError("no such disk")

    running = _jobs(store, tmp_path)
    monkeypatch.setattr(jobs, "free_space", unreadable)
    try:
        with pytest.raises(LimitError, match="too little free space"):
            running.submit(HOLDER, STAND_IN, StandInInputs(name="a"), "document", None)
        assert "The free space of the folder of the files could not be read." in caplog.text
    finally:
        running.stop()


def test_free_space_is_that_of_the_disk_of_the_folder(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # The tests run with a stand-in for the measurement (tests/conftest.py); this one reads the disk.
    monkeypatch.undo()
    measured = jobs.free_space(tmp_path)
    assert measured > 0
    assert abs(measured - shutil.disk_usage(tmp_path).free) < 1_000_000_000
