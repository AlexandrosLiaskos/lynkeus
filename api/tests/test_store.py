"""Tests of the record of the sessions, jobs and layers."""

import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest

from lynkeus.store import JobRecord, LayerRecord, Store


@pytest.fixture
def store(tmp_path: Path) -> Iterator[Store]:
    record = Store(tmp_path / "record.sqlite3")
    record.add_session("s1", "digest-1", 100.0)
    record.add_session("s2", "digest-2", 200.0)
    yield record
    record.close()


def _job(name: str, session: str = "s1", created: float = 0.0) -> JobRecord:
    return JobRecord(
        name, session, "stand-in", "Title", "{}", "raw", "accepted", "Waits.", 0, created, None, None, created, None
    )


def test_session_is_found_by_the_digest_of_its_key(store: Store) -> None:
    found = store.session_of_key("digest-1")
    assert found is not None
    assert (found.id, found.created, found.used) == ("s1", 100.0, 100.0)
    assert store.session_of_key("digest-3") is None
    store.set_key("s1", "digest-3")
    store.use_session("s1", 150.0)
    assert store.session_of_key("digest-1") is None
    renewed = store.session_of_key("digest-3")
    assert renewed is not None
    assert (renewed.id, renewed.used) == ("s1", 150.0)
    assert store.count_sessions() == 2
    assert store.sessions_unused_since(180.0) == ["s1"]


def test_job_passes_from_waiting_to_running_to_successful(store: Store) -> None:
    store.add_job(_job("j1", created=1.0))
    store.add_job(_job("j2", created=2.0))
    assert [job.id for job in store.jobs_of("s1")] == ["j2", "j1"]
    first = store.next_waiting_job()
    assert first is not None
    assert first.id == "j1"
    assert (store.count_unfinished_jobs("s1"), store.count_waiting_jobs()) == (2, 2)
    store.start_job("j1", "Started.", 3.0)
    store.report_job("j1", 40, "Works.", 4.0)
    running = store.job("j1")
    assert running is not None
    assert (running.status, running.progress, running.message, running.started, running.updated) == (
        "running",
        40,
        "Works.",
        3.0,
        4.0,
    )
    assert store.succeed_job("j1", "Ready.", LayerRecord("l1", "s1", "{}", 500, 5.0))
    done = store.job("j1")
    assert done is not None
    assert (done.status, done.progress, done.finished, done.layer) == ("successful", 100, 5.0, "l1")
    assert [layer.id for layer in store.layers_of("s1")] == ["l1"]
    assert (store.size_of_layers("s1"), store.size_of_layers("s2"), store.size_of_layers()) == (500, 0, 500)
    assert [job.id for job in store.unfinished_jobs()] == ["j2"]


def test_finished_job_does_not_change_its_state(store: Store) -> None:
    store.add_job(_job("j1"))
    store.fail_job("j1", "Failed.", 2.0)
    store.start_job("j1", "Started.", 3.0)
    store.report_job("j1", 50, "Works.", 3.0)
    assert not store.succeed_job("j1", "Ready.", LayerRecord("l1", "s1", "{}", 1, 4.0))
    failed = store.job("j1")
    assert failed is not None
    assert (failed.status, failed.message, failed.finished, failed.progress) == ("failed", "Failed.", 2.0, 0)
    assert store.layer("l1") is None


def test_dismissed_job_is_not_listed_and_keeps_its_name(store: Store) -> None:
    store.add_job(_job("j1"))
    store.dismiss_job("j1", "Dismissed.", 2.0)
    assert store.jobs_of("s1") == []
    dismissed = store.job("j1")
    assert dismissed is not None
    assert (dismissed.status, dismissed.finished) == ("dismissed", 2.0)
    assert store.sessions_without_content() == ["s1", "s2"]


def test_oldest_records_of_finished_and_dismissed_jobs_are_removed(store: Store) -> None:
    for number in range(6):
        store.add_job(_job(f"j{number}", created=float(number)))
    for number in (0, 1, 2):
        store.fail_job(f"j{number}", "Failed.", 9.0)
    for number in (3, 4):
        store.dismiss_job(f"j{number}", "Dismissed.", 9.0)
    store.keep_latest_jobs("s1", finished=2, dismissed=1)
    assert [job.id for job in store.jobs_of("s1")] == ["j5", "j2", "j1"]
    assert store.job("j3") is None
    assert store.job("j4") is not None


def test_removing_a_layer_removes_the_job_that_produced_it(store: Store) -> None:
    store.add_job(_job("j1"))
    store.start_job("j1", "Started.", 1.0)
    store.succeed_job("j1", "Ready.", LayerRecord("l1", "s1", "{}", 5, 2.0))
    assert store.layer_names() == {"l1"}
    assert store.sessions_without_content() == ["s2"]
    store.remove_layer("l1")
    assert store.layer("l1") is None
    assert store.job("j1") is None


def test_removing_a_session_removes_its_jobs_and_layers(store: Store) -> None:
    store.add_job(_job("j1"))
    store.start_job("j1", "Started.", 1.0)
    store.succeed_job("j1", "Ready.", LayerRecord("l1", "s1", "{}", 5, 2.0))
    store.add_job(_job("j2", session="s2"))
    store.remove_session("s1")
    assert store.job("j1") is None
    assert store.layer("l1") is None
    assert store.job("j2") is not None
    assert store.count_sessions() == 1


def test_record_outlives_closing_and_a_file_of_another_version_is_not_opened(tmp_path: Path) -> None:
    path = tmp_path / "record.sqlite3"
    first = Store(path)
    first.add_session("s1", "digest-1", 1.0)
    first.close()
    assert path.stat().st_mode & 0o777 == 0o600
    second = Store(path)
    assert second.session_of_key("digest-1") is not None
    second.close()
    database = sqlite3.connect(path)
    database.execute("PRAGMA user_version = 99")
    database.close()
    with pytest.raises(ValueError, match="version 99"):
        Store(path)
