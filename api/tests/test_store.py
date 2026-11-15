# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""Tests of the record of the sessions, jobs, layers and series, and of the own servers."""

import shutil
import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest

from lynkeus.store import (
    VERSION,
    JobRecord,
    LayerRecord,
    PairingRecord,
    SeriesRecord,
    ServerJobRecord,
    ServerLayerRecord,
    ServerRecord,
    Store,
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


def _rows(path: Path, table: str) -> list[tuple[object, ...]]:
    database = sqlite3.connect(path)
    try:
        return database.execute(f"SELECT * FROM {table} ORDER BY rowid").fetchall()  # noqa: S608 - the names are fixed
    finally:
        database.close()


def _version(path: Path) -> int:
    database = sqlite3.connect(path)
    try:
        return int(database.execute("PRAGMA user_version").fetchone()[0])
    finally:
        database.close()


def test_file_of_version_1_is_brought_to_the_new_version_with_every_row(tmp_path: Path) -> None:
    path = tmp_path / "lynkeus.sqlite3"
    shutil.copyfile(VERSION_1, path)
    assert _version(path) == 1
    before = {table: _rows(path, table) for table in ("sessions", "jobs", "layers")}
    assert [len(rows) for rows in before.values()] == [2, 3, 2]
    store = Store(path)
    try:
        assert VERSION == 3
        assert _version(path) == 3
        assert {table: _rows(path, table) for table in before} == before
        # The content is read through the store as before.
        [session] = {str(row[1]) for row in before["jobs"]}
        assert sorted(job.status for job in store.jobs_of(session)) == ["failed", "successful"]
        assert len(store.layers_of(session)) == 2
        assert sorted(str(row[6]) for row in before["jobs"]) == ["dismissed", "failed", "successful"]
        # The tables of the own servers exist and are empty, and they take rows.
        assert store.servers_of("a_user") == []
        assert store.count_pairings() == 0
        assert store.unfinished_server_jobs() == []
        assert store.server_layers_of("a_user") == []
        _confirmed(store, "sv1")
        assert [server.id for server in store.servers_of("a_user")] == ["sv1"]
    finally:
        store.close()
    # A second opening changes nothing.
    again = Store(path)
    again.close()
    assert {table: _rows(path, table) for table in before} == before
    assert len(_rows(path, "servers")) == 1


def test_file_of_version_2_is_brought_to_the_new_version_with_every_row(tmp_path: Path) -> None:
    path = tmp_path / "lynkeus.sqlite3"
    shutil.copyfile(VERSION_2, path)
    assert _version(path) == 2
    tables = ("sessions", "jobs", "layers", "servers", "pairings", "server_jobs", "server_layers")
    before = {table: _rows(path, table) for table in tables}
    assert [len(rows) for rows in before.values()] == [2, 3, 2, 1, 1, 2, 1]
    store = Store(path)
    try:
        assert VERSION == 3
        assert _version(path) == 3
        assert {table: _rows(path, table) for table in before} == before
        # The content is read through the store as before.
        [session] = {str(row[1]) for row in before["jobs"]}
        assert len(store.layers_of(session)) == 2
        [server] = store.servers_of("a_user")
        assert sorted(job.status for job in store.server_jobs_of(server.id)) == ["accepted", "successful"]
        assert [layer.id for layer in store.server_layers_of("a_user")] == ["sl1"]
        assert store.count_pairings() == 1
        # The table of the series exists and is empty, and it takes a row.
        assert store.series_of(session) == []
        store.add_job(_job("j9", session, 2000.0))
        store.start_job("j9", "Started.", 2001.0)
        assert store.succeed_job_with_series("j9", "Ready.", SeriesRecord("e1", session, "{}", 2002.0))
        assert [series.id for series in store.series_of(session)] == ["e1"]
    finally:
        store.close()
    # A second opening changes nothing.
    again = Store(path)
    again.close()
    assert {table: _rows(path, table) for table in tables if table != "jobs"} == {
        table: rows for table, rows in before.items() if table != "jobs"
    }
    assert len(_rows(path, "jobs")) == 4
    assert len(_rows(path, "series")) == 1


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
