# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""Tests of the record of the sessions, jobs, layers and series, and of the own servers."""

import dataclasses
import json
import shutil
import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest

from lynkeus.store import (
    EARLIER_VERSIONS,
    VERSION,
    Holder,
    JobRecord,
    LayerRecord,
    PairingRecord,
    SeriesRecord,
    ServerJobRecord,
    ServerLayerRecord,
    ServerRecord,
    Store,
    source_of,
)

VERSION_1 = Path(__file__).parent / "data" / "records" / "version-1.sqlite3"
"""A record file of version 1, made on 15 November 2026 by the web service of commit 1aa6077.

A visitor ran three jobs of the stand-in process of ``tests.standin`` through the addresses: one
successful, one failed and one that was dismissed after it had finished. A second visitor opened a
session. The file holds 2 sessions, 3 jobs and 2 layers.
"""

VERSION_2 = Path(__file__).parent / "data" / "records" / "version-2.sqlite3"
"""A record file of version 2, made on 15 November 2026 by the store of commit 14ea838 from the file of version 1.

The methods of that store added one own server that received its key, one pairing in progress, and two
jobs of the server, one of them successful with its layer. The file holds 2 sessions, 3 jobs, 2 layers,
1 server, 1 pairing, 2 jobs of the server and 1 layer of the server.
"""

VERSION_3 = Path(__file__).parent / "data" / "records" / "version-3.sqlite3"
"""A record file of version 3, made on 15 November 2026 by the store of commit a34ffef from the file of version 2.

The methods of that store added one job of the first session that produced a series, with the series
description of ``tests.test_series.description``. The file holds 2 sessions, 4 jobs, 2 layers, 1 series,
1 server, 1 pairing, 2 jobs of the server and 1 layer of the server.
"""

EARLIER_COLUMNS = {
    "sessions": "id, key_digest, created, used",
    "jobs": "id, session, process, title, inputs, response, status, message, progress, created, started, finished,"
    " updated, layer",
    "layers": "id, session, description, size, created",
    "series": "id, session, description, created",
    "servers": "id, user, name, key_digest, paired, seen, reported, state, limits",
    "pairings": "device_digest, user_code, machine, created, asked, server",
    "server_jobs": "id, server, process, title, inputs, response, status, message, progress, created, started,"
    " finished, updated, layer, taken",
    "server_layers": "id, server, owner, description, size, created",
}
"""The columns of each table in the versions before 4, in the order in which those versions wrote them."""

S1, S2 = Holder(session="s1"), Holder(session="s2")


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
    assert (found.id, found.created, found.used, found.account) == ("s1", 100.0, 100.0, None)
    assert store.session_of_key("digest-3") is None
    store.set_key("s1", "digest-3")
    store.use_session("s1", 150.0)
    assert store.session_of_key("digest-1") is None
    renewed = store.session_of_key("digest-3")
    assert renewed is not None
    assert (renewed.id, renewed.used) == ("s1", 150.0)
    assert store.count_sessions() == 2
    assert store.sessions_unused_since(180.0) == ["s1"]
    assert store.sessions_of("a_user") == []


def test_job_passes_from_waiting_to_running_to_successful(store: Store) -> None:
    store.add_job(_job("j1", created=1.0))
    store.add_job(_job("j2", created=2.0))
    assert [job.id for job in store.jobs_of(S1)] == ["j2", "j1"]
    first = store.next_waiting_job()
    assert first is not None
    assert first.id == "j1"
    assert (store.count_unfinished_jobs(S1), store.count_waiting_jobs()) == (2, 2)
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
    assert [layer.id for layer in store.layers_of(S1)] == ["l1"]
    assert (store.size_of_layers(S1), store.size_of_layers(S2), store.size_of_layers()) == (500, 0, 500)
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
    assert store.jobs_of(S1) == []
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
    store.keep_latest_jobs(S1, finished=2, dismissed=1)
    assert [job.id for job in store.jobs_of(S1)] == ["j5", "j2", "j1"]
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


def _rows(path: Path, table: str) -> list[tuple[object, ...]]:
    """Return the rows of a table with their numbers, in the columns that the versions before 4 wrote."""
    database = sqlite3.connect(path)
    try:
        return database.execute(f"SELECT rowid, {EARLIER_COLUMNS[table]} FROM {table} ORDER BY rowid").fetchall()  # noqa: S608 - the names are fixed
    finally:
        database.close()


def _version(path: Path) -> int:
    database = sqlite3.connect(path)
    try:
        return int(database.execute("PRAGMA user_version").fetchone()[0])
    finally:
        database.close()


def _columns(path: Path, table: str) -> list[str]:
    database = sqlite3.connect(path)
    try:
        return [str(row[1]) for row in database.execute(f"PRAGMA table_info({table})")]
    finally:
        database.close()


FILES = {
    1: (VERSION_1, {"sessions": 2, "jobs": 3, "layers": 2}),
    2: (
        VERSION_2,
        {"sessions": 2, "jobs": 3, "layers": 2, "servers": 1, "pairings": 1, "server_jobs": 2, "server_layers": 1},
    ),
    3: (
        VERSION_3,
        {
            "sessions": 2,
            "jobs": 4,
            "layers": 2,
            "series": 1,
            "servers": 1,
            "pairings": 1,
            "server_jobs": 2,
            "server_layers": 1,
        },
    ),
}
"""The record file of each earlier version, with the number of rows of each of its tables."""


def test_there_is_a_record_file_of_every_earlier_version() -> None:
    assert VERSION == 4
    assert tuple(FILES) == EARLIER_VERSIONS


@pytest.mark.parametrize("version", EARLIER_VERSIONS)
def test_file_of_an_earlier_version_is_brought_to_the_new_version_with_every_row(tmp_path: Path, version: int) -> None:
    file, numbers = FILES[version]
    path = tmp_path / "lynkeus.sqlite3"
    shutil.copyfile(file, path)
    assert _version(path) == version
    before = {table: _rows(path, table) for table in numbers}
    assert {table: len(rows) for table, rows in before.items()} == numbers
    store = Store(path)
    try:
        assert _version(path) == VERSION
        # Every row holds what it held, under the number that it had.
        assert {table: _rows(path, table) for table in before} == before
        assert _columns(path, "sessions")[-1] == "account"
        assert _columns(path, "jobs")[:3] == ["id", "session", "owner"]
        assert _columns(path, "layers")[-2:] == ["kept_until", "source"]
        assert _columns(path, "series")[-1] == "kept_until"
        assert _columns(path, "server_layers")[-1] == "source"
        # No session has an account, and the session of each job, layer and series still holds it.
        [session] = {str(row[2]) for row in before["jobs"]}
        holder = Holder(session=session)
        jobs = store.jobs_of(holder)
        assert all(job.owner is None and job.holder == holder for job in jobs)
        assert sorted(str(row[7]) for row in before["jobs"])[:3] == ["dismissed", "failed", "successful"]
        layers = store.layers_of(holder)
        assert len(layers) == 2
        assert all(layer.owner is None and layer.kept_until is None for layer in layers)
        # A layer has the request of its job while the record holds the job. The job of one layer was
        # dismissed, and a dismissed job stays in the record.
        made = {job.layer: job for job in (store.job(str(row[1])) for row in before["jobs"]) if job is not None}
        for layer in layers:
            assert layer.source == source_of(made[layer.id].process, made[layer.id].inputs)
            assert json.loads(layer.source) == {
                "process": made[layer.id].process,
                "inputs": json.loads(made[layer.id].inputs),
            }
        # The tables that the version did not have exist and take rows.
        if version == 1:
            assert store.servers_of("a_user") == []
            assert (store.count_pairings(), store.unfinished_server_jobs()) == (0, [])
            assert _confirmed(store, "sv9") == "confirmed"
        else:
            [server] = store.servers_of("a_user")
            assert sorted(job.status for job in store.server_jobs_of(server.id)) == ["accepted", "successful"]
            [kept] = store.server_layers_of("a_user")
            done = next(job for job in store.server_jobs_of(server.id) if job.layer == kept.id)
            assert (kept.id, kept.source) == ("sl1", source_of(done.process, done.inputs))
            assert store.count_pairings() == 1
        if version == 3:
            [series] = store.series_of(holder)
            assert (series.owner, series.kept_until) == (None, None)
            assert json.loads(series.description)["kind"] == "series"
            assert sum(job.layer == series.id for job in jobs) == 1
        else:
            assert store.series_of(holder) == []
        store.add_job(_job("j9", session, 2000.0))
        store.start_job("j9", "Started.", 2001.0)
        assert store.succeed_job_with_series("j9", "Ready.", SeriesRecord("e9", session, "{}", 2002.0))
        assert "e9" in [series.id for series in store.series_of(holder)]
        # The foreign keys are in force again: the end of the session removes what it holds.
        store.remove_session(session)
        assert (store.jobs_of(holder), store.layers_of(holder), store.series_of(holder)) == ([], [], [])
    finally:
        store.close()


@pytest.mark.parametrize("version", EARLIER_VERSIONS)
def test_second_opening_of_a_file_that_was_brought_forward_changes_nothing(tmp_path: Path, version: int) -> None:
    file, numbers = FILES[version]
    path = tmp_path / "lynkeus.sqlite3"
    shutil.copyfile(file, path)
    Store(path).close()
    tables = (*numbers, *(table for table in EARLIER_COLUMNS if table not in numbers))
    first = {table: (_columns(path, table), _rows(path, table)) for table in tables}
    Store(path).close()
    assert {table: (_columns(path, table), _rows(path, table)) for table in tables} == first
    assert {table: len(_rows(path, table)) for table in numbers} == numbers
    assert _version(path) == VERSION


@pytest.mark.parametrize("version", EARLIER_VERSIONS)
def test_file_that_cannot_be_brought_forward_stays_a_whole_file_of_its_version(tmp_path: Path, version: int) -> None:
    file, numbers = FILES[version]
    path = tmp_path / "lynkeus.sqlite3"
    shutil.copyfile(file, path)
    # A job that names a session which the file does not hold fails the check of the foreign keys,
    # which is the last step of the change.
    database = sqlite3.connect(path)
    lost = "'lost', 'no-session', 'stand-in', 'T', '{}', 'raw', 'failed', 'M', 0, 1, 1, 1, 1, NULL"
    database.execute(f"INSERT INTO jobs VALUES ({lost})")  # noqa: S608 - the text is fixed
    database.commit()
    database.close()
    before = {table: _rows(path, table) for table in numbers}
    with pytest.raises(ValueError, match="names a session or a server that it does not hold"):
        Store(path)
    assert _version(path) == version
    assert {table: _rows(path, table) for table in numbers} == before
    assert "account" not in _columns(path, "sessions")
    assert "owner" not in _columns(path, "jobs")


def test_account_holds_what_its_sessions_start_and_keeps_it_when_they_end(store: Store) -> None:
    account = Holder(account="a_user")
    store.add_session("s3", "digest-3", 300.0, "a_user")
    store.add_session("s4", "digest-4", 400.0, "a_user")
    found = store.session_of_key("digest-3")
    assert found is not None
    assert found.account == "a_user"
    assert store.sessions_of("a_user") == ["s3", "s4"]
    store.use_session("s3", 500.0)
    assert store.sessions_of("a_user") == ["s4", "s3"]
    job = dataclasses.replace(_job("j1"), session=None, owner="a_user", inputs='{"name": "a"}')
    store.add_job(job)
    assert store.job("j1") == job
    assert job.holder == account
    store.start_job("j1", "Started.", 1.0)
    assert store.succeed_job("j1", "Ready.", LayerRecord("l1", None, "{}", 500, 2.0, "a_user", 902.0))
    [layer] = store.layers_of(account)
    assert (layer.holder, layer.kept_until) == (account, 902.0)
    assert layer.source == '{"process": "stand-in", "inputs": {"name": "a"}}'
    store.add_job(dataclasses.replace(_job("j2"), session=None, owner="a_user"))
    store.start_job("j2", "Started.", 3.0)
    assert store.succeed_job_with_series("j2", "Ready.", SeriesRecord("e1", None, "{}", 4.0, "a_user", 904.0))
    [series] = store.series_of(account)
    assert (series.holder, series.kept_until) == (account, 904.0)
    assert (store.count_unfinished_jobs(account), store.size_of_layers(account)) == (0, 500)
    assert [job.id for job in store.jobs_of(account)] == ["j2", "j1"]
    # Another account, and a session without an account, hold nothing of it.
    assert store.layers_of(Holder(account="another_user")) == []
    assert store.layers_of(S1) == []
    # The sessions of the account hold nothing themselves, so they may be ended at any time.
    assert store.sessions_without_content() == ["s1", "s2", "s4", "s3"]
    store.remove_session("s3")
    store.remove_session("s4")
    assert [layer.id for layer in store.layers_of(account)] == ["l1"]
    assert [series.id for series in store.series_of(account)] == ["e1"]
    assert len(store.jobs_of(account)) == 2
    # The request of the layer stays when the record of its job is removed.
    store.dismiss_job("j1", "Dismissed.", 5.0)
    store.keep_latest_jobs(account, finished=100, dismissed=0)
    assert store.job("j1") is None
    assert store.layers_of(account)[0].source == layer.source


def test_holder_is_an_account_or_a_session_and_a_record_takes_no_other(store: Store) -> None:
    for wrong in ({}, {"account": "a_user", "session": "s1"}):
        with pytest.raises(ValueError, match="an account or a session"):
            Holder(**wrong)
    with pytest.raises(sqlite3.IntegrityError):
        store.add_job(dataclasses.replace(_job("j1"), owner="a_user"))
    with pytest.raises(sqlite3.IntegrityError):
        store.add_job(dataclasses.replace(_job("j1"), session=None))
    with pytest.raises(sqlite3.IntegrityError):
        store.add_job(_job("j1", session="no-session"))


def test_session_gives_what_it_holds_to_the_account_that_signs_in(store: Store) -> None:
    for name, session in (("j1", "s1"), ("j2", "s1"), ("j3", "s2")):
        store.add_job(_job(name, session))
        store.start_job(name, "Started.", 1.0)
    assert store.succeed_job("j1", "Ready.", LayerRecord("l1", "s1", "{}", 5, 2.0))
    assert store.succeed_job_with_series("j2", "Ready.", SeriesRecord("e1", "s1", "{}", 2.0))
    assert store.succeed_job("j3", "Ready.", LayerRecord("l3", "s2", "{}", 7, 2.0))
    store.give_to_account("s1", "a_user")
    account = Holder(account="a_user")
    found = store.session_of_key("digest-1")
    assert found is not None
    assert found.account == "a_user"
    assert [layer.id for layer in store.layers_of(account)] == ["l1"]
    assert [series.id for series in store.series_of(account)] == ["e1"]
    assert sorted(job.id for job in store.jobs_of(account)) == ["j1", "j2"]
    assert (store.jobs_of(S1), store.layers_of(S1), store.series_of(S1)) == ([], [], [])
    # The other session keeps its own, and the end of the first session removes nothing of the account.
    assert [layer.id for layer in store.layers_of(S2)] == ["l3"]
    store.remove_session("s1")
    assert [layer.id for layer in store.layers_of(account)] == ["l1"]
    assert store.size_of_layers() == 12


def test_layers_and_series_are_found_and_extended_by_the_moment_until_which_they_are_kept(store: Store) -> None:
    for number, until in enumerate((100.0, 200.0, None)):
        store.add_job(_job(f"j{number}"))
        store.start_job(f"j{number}", "Started.", 1.0)
        assert store.succeed_job(f"j{number}", "Ready.", LayerRecord(f"l{number}", "s1", "{}", 5, 2.0, None, until))
        store.add_job(_job(f"k{number}", "s2"))
        store.start_job(f"k{number}", "Started.", 1.0)
        series = SeriesRecord(f"e{number}", "s2", "{}", 2.0, None, until)
        assert store.succeed_job_with_series(f"k{number}", "Ready.", series)
    assert [layer.id for layer in store.layers_kept_until(150.0)] == ["l0"]
    assert [series.id for series in store.series_kept_until(250.0)] == ["e0", "e1"]
    assert store.layers_kept_until(100.0) == []
    # What has no moment is kept without an end, until a moment is set for all such.
    assert store.layers_kept_until(1e12) != store.layers_of(S1)
    store.add_session("s3", "digest-3", 50.0)
    store.keep_unset(300.0, 250.0)
    assert sorted(layer.kept_until or 0 for layer in store.layers_of(S1)) == [100.0, 200.0, 300.0]
    assert sorted(series.kept_until or 0 for series in store.series_of(S2)) == [100.0, 200.0, 300.0]
    # The sessions that held what had no moment count as used at the present time, and no other does.
    assert store.sessions_unused_since(250.0) == ["s3"]
    store.use_session("s1", 10.0)
    store.keep_unset(400.0, 350.0)
    assert store.sessions_unused_since(250.0) == ["s1", "s3"]
    store.keep_layer("l0", 500.0)
    store.keep_series("e0", 600.0)
    kept, extended = store.layer("l0"), store.series("e0")
    assert kept is not None
    assert extended is not None
    assert (kept.kept_until, extended.kept_until) == (500.0, 600.0)
    store.keep_all(S1, 900.0)
    assert {layer.kept_until for layer in store.layers_of(S1)} == {900.0}
    assert sorted(series.kept_until or 0 for series in store.series_of(S2)) == [200.0, 300.0, 600.0]


def test_records_of_failed_and_dismissed_jobs_are_removed_by_the_time_of_their_end(store: Store) -> None:
    for number in range(5):
        store.add_job(_job(f"j{number}"))
    store.fail_job("j0", "Failed.", 10.0)
    store.fail_job("j1", "Failed.", 30.0)
    store.dismiss_job("j2", "Dismissed.", 10.0)
    store.start_job("j3", "Started.", 5.0)
    assert store.succeed_job("j3", "Ready.", LayerRecord("l3", "s1", "{}", 5, 6.0))
    store.remove_jobs_ended_before(20.0)
    assert [store.job(f"j{number}") is None for number in range(5)] == [True, False, True, False, False]
    # A finished job that was dismissed later is removed by the time of its dismissal, and its layer stays.
    store.dismiss_job("j3", "Dismissed.", 40.0)
    store.remove_jobs_ended_before(35.0)
    assert store.job("j3") is not None
    store.remove_jobs_ended_before(45.0)
    assert store.job("j3") is None
    assert store.layer("l3") is not None
    assert store.job("j4") is not None


def test_content_of_one_holder_is_removed_whole_and_no_other(store: Store) -> None:
    store.add_session("s3", "digest-3", 300.0, "a_user")
    account = Holder(account="a_user")
    for name, holder in (("j1", account), ("j2", account), ("j3", S1), ("j4", account)):
        store.add_job(dataclasses.replace(_job(name), session=holder.session, owner=holder.account))
        store.start_job(name, "Started.", 1.0)
    assert store.succeed_job("j1", "Ready.", LayerRecord("l1", None, "{}", 5, 2.0, "a_user"))
    assert store.succeed_job_with_series("j2", "Ready.", SeriesRecord("e1", None, "{}", 2.0, "a_user"))
    assert store.succeed_job("j3", "Ready.", LayerRecord("l3", "s1", "{}", 7, 2.0))
    assert store.remove_content(account) == ["l1"]
    assert (store.jobs_of(account), store.layers_of(account), store.series_of(account)) == ([], [], [])
    assert store.job("j4") is None
    assert [layer.id for layer in store.layers_of(S1)] == ["l3"]
    assert store.session_of_key("digest-3") is not None
    assert store.remove_content(account) == []


def _server(name: str, user: str = "a_user", paired: float = 10.0) -> ServerRecord:
    return ServerRecord(name, user, f"Computer {name}", None, paired, None, None, None, None)


def _confirmed(store: Store, name: str, user: str = "a_user", most: int = 8, now: float = 10.0) -> str:
    """Record a pairing and its confirmation, and return what the confirmation answered."""
    assert store.add_pairing(PairingRecord(f"device-{name}", f"CODE-{name}", "{}", now, None, None))
    return store.confirm_pairing(f"CODE-{name}", _server(name, user, now), most, since=now - 900)


def _server_job(name: str, server: str = "sv1", created: float = 0.0) -> ServerJobRecord:
    return ServerJobRecord(
        name,
        server,
        "get-layer",
        "Title",
        "{}",
        "raw",
        "accepted",
        "Waits.",
        0,
        created,
        None,
        None,
        created,
        None,
        None,
    )


def test_pairing_is_confirmed_once_and_gives_the_key_once(store: Store) -> None:
    pairing = PairingRecord("device-1", "WDJB-MJHT", '{"name": "Laptop"}', 10.0, None, None)
    assert store.add_pairing(pairing)
    assert not store.add_pairing(PairingRecord("device-2", "WDJB-MJHT", "{}", 10.0, None, None))
    assert not store.add_pairing(PairingRecord("device-1", "BBBB-BBBB", "{}", 10.0, None, None))
    assert store.count_pairings() == 1
    assert store.pairing_of_code("WDJB-MJHT") == pairing
    assert store.pairing_of_device("device-1") == pairing
    assert store.pairing_of_code("BBBB-BBBB") is None
    store.ask_pairing("device-1", 12.0)
    asked = store.pairing_of_device("device-1")
    assert asked is not None
    assert asked.asked == 12.0
    # The key is given only after the confirmation.
    assert store.give_key("device-1", "key-digest", 13.0) is None
    assert store.confirm_pairing("BBBB-BBBB", _server("sv1"), 8, since=0.0) == "unknown"
    assert store.confirm_pairing("WDJB-MJHT", _server("sv1"), 8, since=11.0) == "unknown"
    assert store.confirm_pairing("WDJB-MJHT", _server("sv1"), 0, since=0.0) == "full"
    assert store.servers_of("a_user") == []
    assert store.confirm_pairing("WDJB-MJHT", _server("sv1"), 1, since=0.0) == "confirmed"
    assert store.confirm_pairing("WDJB-MJHT", _server("sv2"), 8, since=0.0) == "unknown"
    confirmed = store.pairing_of_device("device-1")
    assert confirmed is not None
    assert confirmed.server == "sv1"
    assert store.server_of_key("key-digest") is None
    assert store.give_key("device-1", "key-digest", 13.0) == "sv1"
    assert store.give_key("device-1", "other-digest", 14.0) is None
    assert store.count_pairings() == 0
    found = store.server_of_key("key-digest")
    assert found is not None
    assert (found.id, found.user, found.name, found.paired, found.seen) == ("sv1", "a_user", "Computer sv1", 10.0, 13.0)
    assert store.server("sv1") == found
    assert store.server("sv2") is None


def test_old_pairings_are_removed_with_the_servers_that_received_no_key(store: Store) -> None:
    assert _confirmed(store, "sv1", now=10.0) == "confirmed"
    assert _confirmed(store, "sv2", now=10.0) == "confirmed"
    assert store.give_key("device-sv2", "key-2", 11.0) == "sv2"
    assert _confirmed(store, "sv3", now=20.0) == "confirmed"
    assert store.add_pairing(PairingRecord("device-4", "CODE-4", "{}", 10.0, None, None))
    store.remove_pairings_before(15.0)
    assert [server.id for server in store.servers_of("a_user")] == ["sv2", "sv3"]
    assert store.count_pairings() == 1
    assert store.pairing_of_code("CODE-4") is None
    store.remove_pairing("device-sv3")
    assert store.count_pairings() == 0


def test_servers_of_a_user_are_recorded_with_their_state_and_limits(store: Store) -> None:
    assert _confirmed(store, "sv1", now=10.0) == "confirmed"
    assert _confirmed(store, "sv2", now=5.0) == "confirmed"
    assert _confirmed(store, "sv3", user="another_user") == "confirmed"
    assert [server.id for server in store.servers_of("a_user")] == ["sv2", "sv1"]
    assert [server.id for server in store.servers_of("another_user")] == ["sv3"]
    store.see_server("sv1", 20.0)
    store.set_server_state("sv1", '{"running": 1}', 30.0)
    store.rename_server("sv1", "Office")
    store.set_server_limits("sv1", '{"running_jobs": 4}')
    server = store.server("sv1")
    assert server is not None
    assert (server.name, server.seen, server.reported, server.state, server.limits) == (
        "Office",
        30.0,
        30.0,
        '{"running": 1}',
        '{"running_jobs": 4}',
    )
    store.change_server_state("sv1", '{"running": 0}')
    store.set_server_limits("sv1", None)
    server = store.server("sv1")
    assert server is not None
    assert (server.reported, server.state, server.limits) == (30.0, '{"running": 0}', None)


def test_job_of_an_own_server_takes_the_states_that_the_server_reports(store: Store) -> None:
    _confirmed(store, "sv1")
    store.add_server_job(_server_job("j1", created=1.0))
    store.add_server_job(_server_job("j2", created=2.0))
    assert [job.id for job in store.server_jobs_of("sv1")] == ["j2", "j1"]
    assert store.count_unfinished_server_jobs("sv1") == 2
    assert [job.id for job in store.unfinished_server_jobs()] == ["j1", "j2"]
    store.take_server_job("j1", 3.0)
    store.take_server_job("j1", 9.0)
    store.report_server_job("j1", "running", 40, "Works.", 4.0, 5.0)
    running = store.server_job("j1")
    assert running is not None
    assert (running.status, running.progress, running.message, running.started, running.updated, running.taken) == (
        "running",
        40,
        "Works.",
        4.0,
        5.0,
        3.0,
    )
    layer = ServerLayerRecord("l1", "sv1", "a_user", "{}", 500, 6.0)
    assert store.succeed_server_job("j1", "Ready.", 4.0, 6.0, 7.0, layer)
    done = store.server_job("j1")
    assert done is not None
    assert (done.status, done.progress, done.finished, done.updated, done.layer) == ("successful", 100, 6.0, 7.0, "l1")
    # The layer is recorded with the request of its job.
    layer = dataclasses.replace(layer, source='{"process": "get-layer", "inputs": {}}')
    assert store.server_layer("sv1", "l1") == layer
    assert store.server_layers_of("a_user") == [layer]
    assert store.count_server_layers("sv1") == 1
    # A finished job does not change, and a server keeps one layer of a name.
    store.report_server_job("j1", "running", 50, "Works.", 4.0, 8.0)
    store.fail_server_job("j1", "Failed.", 8.0)
    assert not store.succeed_server_job(
        "j1", "Ready.", 4.0, 6.0, 7.0, ServerLayerRecord("l2", "sv1", "a_user", "{}", 1, 6.0)
    )
    assert not store.succeed_server_job("j2", "Ready.", 4.0, 6.0, 7.0, layer)
    assert store.server_job("j1") == done
    waiting = store.server_job("j2")
    assert waiting is not None
    assert (waiting.status, waiting.taken) == ("accepted", None)
    store.fail_server_job("j2", "Failed.", 9.0)
    failed = store.server_job("j2")
    assert failed is not None
    assert (failed.status, failed.message, failed.finished) == ("failed", "Failed.", 9.0)
    assert store.unfinished_server_jobs("sv1") == []
    # The layers of an own server are not layers of a session.
    assert store.size_of_layers() == 0
    assert store.layer_names() == set()
    store.change_server_layer("sv1", "l1", '{"title": "New"}')
    renamed = store.server_layer("sv1", "l1")
    assert renamed is not None
    assert (renamed.description, renamed.size) == ('{"title": "New"}', 500)
    store.remove_server_layer("sv1", "l1")
    assert store.server_layer("sv1", "l1") is None
    assert store.server_job("j1") is None
    assert store.server_job("j2") is not None


def test_dismissed_and_oldest_jobs_of_an_own_server_are_kept_as_those_of_a_session(store: Store) -> None:
    _confirmed(store, "sv1")
    for number in range(6):
        store.add_server_job(_server_job(f"j{number}", created=float(number)))
    for number in (0, 1, 2):
        store.fail_server_job(f"j{number}", "Failed.", 9.0)
    for number in (3, 4):
        store.dismiss_server_job(f"j{number}", "Dismissed.", 9.0)
    dismissed = store.server_job("j4")
    assert dismissed is not None
    assert (dismissed.status, dismissed.finished) == ("dismissed", 9.0)
    store.keep_latest_server_jobs("sv1", finished=2, dismissed=1)
    assert [job.id for job in store.server_jobs_of("sv1")] == ["j5", "j2", "j1"]
    assert store.server_job("j3") is None
    assert store.server_job("j4") is not None


def test_removing_a_server_removes_its_jobs_and_layers_and_no_others(store: Store) -> None:
    for name in ("sv1", "sv2"):
        _confirmed(store, name)
        store.add_server_job(_server_job(f"job-{name}", server=name))
        layer = ServerLayerRecord("l1", name, "a_user", "{}", 5, 2.0)
        assert store.succeed_server_job(f"job-{name}", "Ready.", 1.0, 2.0, 2.0, layer)
    store.remove_server("sv1")
    assert store.server("sv1") is None
    assert store.server_job("job-sv1") is None
    assert store.server_layer("sv1", "l1") is None
    # The pairing stays until its time has passed, and gives no key.
    assert store.pairing_of_device("device-sv1") is not None
    assert store.give_key("device-sv1", "key-1", 3.0) is None
    assert store.give_key("device-sv2", "key-2", 3.0) == "sv2"
    assert store.server_job("job-sv2") is not None
    assert [layer.server for layer in store.server_layers_of("a_user")] == ["sv2"]
    # The sessions, and the jobs and layers of the project server, are apart from the own servers.
    assert store.count_sessions() == 2
