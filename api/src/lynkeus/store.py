# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""The record of the sessions, jobs, layers and series, and of the own servers, kept in one SQLite file.

The file outlives a restart of the server, so an account keeps its layers, its
series and its finished jobs, and an Earthdata user keeps his own servers
with their jobs and layers. It holds the SHA-256 digest of a session key, of
the key of an own server and of the device code of a pairing, and never the
secret itself. It never holds an Earthdata token.

A job, a layer and a series have one holder (``Holder``): an account, which is
the name of an Earthdata user, or a session that has no account. The project
server records the account (``docs/Storage.md``). The program Lynkeus Server
records one session for its pairing, and that session holds its jobs and layers.

The tables of version 1 (sessions, jobs and layers) are unchanged in version 2,
which adds the tables of the own servers (``docs/Own_Servers.md``). The tables
of version 2 are unchanged in version 3, which adds the table of the series.
Version 4 adds the account of a session, the owner of a job, of a layer and of
a series, the moment until which a layer and a series are kept, and the request
that made a layer. A file of version 1, 2 or 3 is brought to version 4 when it
is opened, in one change that is written whole or not at all, and keeps every row.
"""

import json
import sqlite3
import threading
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

type Status = Literal["accepted", "running", "successful", "failed", "dismissed"]

VERSION = 4
"""The version of the tables.

A file of version 1, 2 or 3 is brought to this version; a file of a later one is not opened. A program of an
earlier version must not open a file of this version: it would read the layers of an account as layers of
no session.
"""

EARLIER_VERSIONS = (1, 2, 3)
"""The versions of the tables that are brought to ``VERSION`` when their file is opened."""

_HELD = "CHECK ((session IS NULL) != (owner IS NULL))"
"""A job, a layer and a series have a session or an owner, and never both."""

_BODIES = {
    "jobs": f"""(
    id TEXT PRIMARY KEY,
    session TEXT REFERENCES sessions (id) ON DELETE CASCADE,
    owner TEXT,
    process TEXT NOT NULL,
    title TEXT NOT NULL,
    inputs TEXT NOT NULL,
    response TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT NOT NULL,
    progress INTEGER NOT NULL,
    created REAL NOT NULL,
    started REAL,
    finished REAL,
    updated REAL NOT NULL,
    layer TEXT,
    {_HELD}
)""",
    "layers": f"""(
    id TEXT PRIMARY KEY,
    session TEXT REFERENCES sessions (id) ON DELETE CASCADE,
    owner TEXT,
    description TEXT NOT NULL,
    size INTEGER NOT NULL,
    created REAL NOT NULL,
    kept_until REAL,
    source TEXT,
    {_HELD}
)""",
    "series": f"""(
    id TEXT PRIMARY KEY,
    session TEXT REFERENCES sessions (id) ON DELETE CASCADE,
    owner TEXT,
    description TEXT NOT NULL,
    created REAL NOT NULL,
    kept_until REAL,
    {_HELD}
)""",
}
"""The columns of the three tables that version 4 writes anew, by the name of the table."""

_TABLES = f"""
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    key_digest TEXT NOT NULL UNIQUE,
    created REAL NOT NULL,
    used REAL NOT NULL,
    account TEXT
);
CREATE INDEX IF NOT EXISTS sessions_of_account ON sessions (account, used);
CREATE TABLE IF NOT EXISTS jobs {_BODIES["jobs"]};
CREATE INDEX IF NOT EXISTS jobs_of_session ON jobs (session, created);
CREATE INDEX IF NOT EXISTS jobs_of_owner ON jobs (owner, created);
CREATE TABLE IF NOT EXISTS layers {_BODIES["layers"]};
CREATE INDEX IF NOT EXISTS layers_of_session ON layers (session, created);
CREATE INDEX IF NOT EXISTS layers_of_owner ON layers (owner, created);
CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    user TEXT NOT NULL,
    name TEXT NOT NULL,
    key_digest TEXT UNIQUE,
    paired REAL NOT NULL,
    seen REAL,
    reported REAL,
    state TEXT,
    limits TEXT
);
CREATE INDEX IF NOT EXISTS servers_of_user ON servers (user, paired);
CREATE TABLE IF NOT EXISTS pairings (
    device_digest TEXT PRIMARY KEY,
    user_code TEXT NOT NULL UNIQUE,
    machine TEXT NOT NULL,
    created REAL NOT NULL,
    asked REAL,
    server TEXT
);
CREATE TABLE IF NOT EXISTS server_jobs (
    id TEXT PRIMARY KEY,
    server TEXT NOT NULL REFERENCES servers (id) ON DELETE CASCADE,
    process TEXT NOT NULL,
    title TEXT NOT NULL,
    inputs TEXT NOT NULL,
    response TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT NOT NULL,
    progress INTEGER NOT NULL,
    created REAL NOT NULL,
    started REAL,
    finished REAL,
    updated REAL NOT NULL,
    layer TEXT,
    taken REAL
);
CREATE INDEX IF NOT EXISTS server_jobs_of_server ON server_jobs (server, created);
CREATE TABLE IF NOT EXISTS server_layers (
    id TEXT NOT NULL,
    server TEXT NOT NULL REFERENCES servers (id) ON DELETE CASCADE,
    owner TEXT NOT NULL,
    description TEXT NOT NULL,
    size INTEGER NOT NULL,
    created REAL NOT NULL,
    source TEXT,
    PRIMARY KEY (server, id)
);
CREATE INDEX IF NOT EXISTS server_layers_of_owner ON server_layers (owner, created);
CREATE TABLE IF NOT EXISTS series {_BODIES["series"]};
CREATE INDEX IF NOT EXISTS series_of_session ON series (session, created);
CREATE INDEX IF NOT EXISTS series_of_owner ON series (owner, created);
"""

_EARLIER_COLUMNS = {
    "jobs": "id, session, process, title, inputs, response, status, message, progress, created, started, finished,"
    " updated, layer",
    "layers": "id, session, description, size, created",
    "series": "id, session, description, created",
}
"""The columns of the three tables in the versions before 4, which a file of such a version holds."""

_JOB = (
    "id, session, process, title, inputs, response, status, message, progress, created, started, finished,"
    " updated, layer, owner"
)

_LAYER = "id, session, description, size, created, owner, kept_until, source"

_SERIES = "id, session, description, created, owner, kept_until"

_SERVER = "id, user, name, key_digest, paired, seen, reported, state, limits"

_PAIRING = "device_digest, user_code, machine, created, asked, server"

_SERVER_JOB = (
    "id, server, process, title, inputs, response, status, message, progress, created, started, finished,"
    " updated, layer, taken"
)

_SERVER_LAYER = "id, server, owner, description, size, created, source"


def source_of(process: str, inputs: str) -> str:
    """Return the request that made a layer, as JSON: the name of the process and the inputs of the job.

    Parameters
    ----------
    process : str
        Name of the process that the job ran.
    inputs : str
        Inputs of the job, as JSON.
    """
    return json.dumps({"process": process, "inputs": json.loads(inputs)}, ensure_ascii=False)


@dataclass(frozen=True)
class Holder:
    """Who holds a job, a layer or a series: an account, or a session that has no account.

    Exactly one of the two is given.

    Attributes
    ----------
    account : str or None
        Name of the Earthdata user.
    session : str or None
        Name of a session without an account: a session that a record file of an earlier version
        holds, or the session of the pairing of Lynkeus Server.
    """

    account: str | None = None
    session: str | None = None

    def __post_init__(self) -> None:
        """Check that exactly one of the two is given."""
        if (self.account is None) == (self.session is None):
            raise ValueError("a holder is an account or a session, and not both")

    @property
    def condition(self) -> tuple[str, str]:
        """The condition that selects the rows of the holder, and its value."""
        if self.account is not None:
            return "owner = ?", self.account
        return "session = ?", str(self.session)


@dataclass(frozen=True)
class SessionRecord:
    """A session.

    Attributes
    ----------
    id : str
        Name of the session inside the server.
    created, used : float
        Times of creation and of the last use, in seconds since 1 January 1970 (UTC).
    account : str or None
        Name of the Earthdata user who signed in to the session, or None for a session without an account.
    """

    id: str
    created: float
    used: float
    account: str | None = None


@dataclass(frozen=True)
class JobRecord:
    """A job.

    Attributes
    ----------
    id : str
        Name of the job.
    session : str or None
        Name of the session that holds the job, when no account does.
    process : str
        Name of the process that the job runs.
    title : str
        Name of the job for the visitor.
    inputs : str
        Inputs of the process, as JSON.
    response : {"raw", "document"}
        Form of the results that the request chose.
    status : {"accepted", "running", "successful", "failed", "dismissed"}
        State of the job.
    message : str
        One sentence about the state, for the visitor.
    progress : int
        Part of the work that is done, in percent.
    created, updated : float
        Times of creation and of the last change, in seconds since 1 January 1970 (UTC).
    started, finished : float or None
        Times at which the work started and ended.
    layer : str or None
        Name of the layer, or of the series, that a successful job produced.
    owner : str or None
        Name of the account that holds the job, when an account does.
    """

    id: str
    session: str | None
    process: str
    title: str
    inputs: str
    response: str
    status: Status
    message: str
    progress: int
    created: float
    started: float | None
    finished: float | None
    updated: float
    layer: str | None
    owner: str | None = None

    @property
    def holder(self) -> Holder:
        """The account or the session that holds the job."""
        return Holder(account=self.owner, session=self.session)


@dataclass(frozen=True)
class LayerRecord:
    """A layer of an account or of a session.

    Attributes
    ----------
    id : str
        Name of the layer, which is also the name of the folder of its files.
    session : str or None
        Name of the session that holds the layer, when no account does.
    description : str
        Layer description, as JSON.
    size : int
        Total size of the files of the layer, in bytes.
    created : float
        Time of creation, in seconds since 1 January 1970 (UTC).
    owner : str or None
        Name of the account that holds the layer, when an account does.
    kept_until : float or None
        Moment after which the layer is removed, in seconds since 1 January 1970 (UTC), or None for a
        layer that is kept without an end.
    source : str or None
        The request that made the layer, as JSON (``source_of``), or None when it is not known.
    """

    id: str
    session: str | None
    description: str
    size: int
    created: float
    owner: str | None = None
    kept_until: float | None = None
    source: str | None = None

    @property
    def holder(self) -> Holder:
        """The account or the session that holds the layer."""
        return Holder(account=self.owner, session=self.session)


@dataclass(frozen=True)
class ServerRecord:
    """An own server of an Earthdata user.

    Attributes
    ----------
    id : str
        Name of the server.
    user : str
        Name of the Earthdata user who owns the server.
    name : str
        Name that the owner gave it, at first the name of the computer.
    key_digest : str or None
        SHA-256 digest of the key of the server, or None until the program has received the key.
    paired : float
        Time at which the owner confirmed the pairing, in seconds since 1 January 1970 (UTC).
    seen, reported : float or None
        Times of the last message and of the last report of the server.
    state : str or None
        Last state that the server reported, as JSON.
    limits : str or None
        Limits that the owner set on the site, as JSON.
    """

    id: str
    user: str
    name: str
    key_digest: str | None
    paired: float
    seen: float | None
    reported: float | None
    state: str | None
    limits: str | None


@dataclass(frozen=True)
class PairingRecord:
    """A pairing in progress.

    Attributes
    ----------
    device_digest : str
        SHA-256 digest of the device code, with which the program asks.
    user_code : str
        Code that the visitor compares.
    machine : str
        What the computer stated about itself, as JSON.
    created : float
        Time of the request for the pairing, in seconds since 1 January 1970 (UTC).
    asked : float or None
        Time of the last question of the program that was answered.
    server : str or None
        Name of the server that the confirmation created, or None before it.
    """

    device_digest: str
    user_code: str
    machine: str
    created: float
    asked: float | None
    server: str | None


@dataclass(frozen=True)
class ServerJobRecord:
    """A job that runs on an own server. The fields that it shares with ``JobRecord`` have the same meaning.

    Attributes
    ----------
    server : str
        Name of the own server on which the job runs.
    taken : float or None
        Time at which the server confirmed that it had recorded the job, or None before that.
    """

    id: str
    server: str
    process: str
    title: str
    inputs: str
    response: str
    status: Status
    message: str
    progress: int
    created: float
    started: float | None
    finished: float | None
    updated: float
    layer: str | None
    taken: float | None


@dataclass(frozen=True)
class ServerLayerRecord:
    """A layer that an own server keeps.

    Attributes
    ----------
    id : str
        Name of the layer on its server.
    server : str
        Name of the own server that keeps the files of the layer.
    owner : str
        Name of the Earthdata user who owns the server and the layer.
    description : str
        Layer description, as JSON.
    size : int
        Total size of the files of the layer, in bytes.
    created : float
        Time of creation, in seconds since 1 January 1970 (UTC).
    source : str or None
        The request that made the layer, as JSON (``source_of``), or None when it is not known.
    """

    id: str
    server: str
    owner: str
    description: str
    size: int
    created: float
    source: str | None = None


@dataclass(frozen=True)
class SeriesRecord:
    """A series of an account or of a session. A series has no files.

    Attributes
    ----------
    id : str
        Name of the series.
    session : str or None
        Name of the session that holds the series, when no account does.
    description : str
        Series description, as JSON.
    created : float
        Time of creation, in seconds since 1 January 1970 (UTC).
    owner : str or None
        Name of the account that holds the series, when an account does.
    kept_until : float or None
        Moment after which the series is removed, in seconds since 1 January 1970 (UTC), or None for a
        series that is kept without an end.
    """

    id: str
    session: str | None
    description: str
    created: float
    owner: str | None = None
    kept_until: float | None = None

    @property
    def holder(self) -> Holder:
        """The account or the session that holds the series."""
        return Holder(account=self.owner, session=self.session)


class Store:
    """The sessions, jobs, layers and series, and the own servers, in one SQLite file.

    Every method may be called from any thread.
    """

    def __init__(self, path: Path) -> None:
        self._lock = threading.RLock()
        # Only the user of the server may read the file.
        path.touch(mode=0o600, exist_ok=True)
        self._database = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        version = self._database.execute("PRAGMA user_version").fetchone()[0]
        if version not in (0, *EARLIER_VERSIONS, VERSION):
            self._database.close()
            raise ValueError(f"the file {path.name} holds tables of version {version}, and version {VERSION} is needed")
        if version in EARLIER_VERSIONS:
            try:
                self._bring_forward()
            except BaseException:
                self._database.close()
                raise
        self._database.execute("PRAGMA foreign_keys = ON")
        # Every statement creates a table or an index that is missing: all of them in a new file, and in a
        # file of an earlier version the tables that its version did not have.
        self._database.executescript(_TABLES)
        self._database.execute(f"PRAGMA user_version = {VERSION}")

    def _bring_forward(self) -> None:
        """Bring the tables of a file of version 1, 2 or 3 to version 4 without the loss of a row.

        SQLite cannot change the constraints of a column, so the tables of the jobs, the layers and the
        series are written anew and filled from the earlier ones, in the way that the documentation of
        SQLite gives for such a change ("ALTER TABLE", section 7): with the foreign keys off, inside one
        transaction, and with a check of the foreign keys before the transaction is written. A file
        that is closed in the middle of the change is therefore still a whole file of its earlier
        version. Every job, layer and series keeps its session, and has no owner. A layer receives
        the request of the job that made it, while the record still holds that job.
        """
        database = self._database
        database.execute("PRAGMA foreign_keys = OFF")
        database.execute("BEGIN IMMEDIATE")
        try:
            existing = {str(name) for [name] in database.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
            database.execute("ALTER TABLE sessions ADD COLUMN account TEXT")
            for table, columns in _EARLIER_COLUMNS.items():
                if table not in existing:
                    continue
                database.execute(f"CREATE TABLE new_{table} {_BODIES[table]}")
                # A row keeps its number, which gives the order of two rows of the same time of creation.
                database.execute(
                    f"INSERT INTO new_{table} (rowid, {columns}) SELECT rowid, {columns} FROM {table}"  # noqa: S608 - the text holds names of this module only
                )
                database.execute(f"DROP TABLE {table}")
                database.execute(f"ALTER TABLE new_{table} RENAME TO {table}")
            made = database.execute(
                "SELECT layers.id, jobs.process, jobs.inputs FROM layers JOIN jobs ON jobs.layer = layers.id"
            ).fetchall()
            for layer, process, inputs in made:
                database.execute("UPDATE layers SET source = ? WHERE id = ?", (source_of(process, inputs), layer))
            if "server_layers" in existing:
                database.execute("ALTER TABLE server_layers ADD COLUMN source TEXT")
                made = database.execute(
                    "SELECT server_layers.server, server_layers.id, server_jobs.process, server_jobs.inputs"
                    " FROM server_layers JOIN server_jobs"
                    " ON server_jobs.server = server_layers.server AND server_jobs.layer = server_layers.id"
                ).fetchall()
                for server, layer, process, inputs in made:
                    database.execute(
                        "UPDATE server_layers SET source = ? WHERE server = ? AND id = ?",
                        (source_of(process, inputs), server, layer),
                    )
            if database.execute("PRAGMA foreign_key_check").fetchall():
                raise ValueError("the record file names a session or a server that it does not hold")
            database.execute(f"PRAGMA user_version = {VERSION}")
        except BaseException:
            database.execute("ROLLBACK")
            raise
        database.execute("COMMIT")

    def close(self) -> None:
        """Close the file."""
        with self._lock:
            self._database.close()

    @contextmanager
    def _change(self) -> Iterator[sqlite3.Connection]:
        """Make several changes that are written together or not at all."""
        with self._lock:
            self._database.execute("BEGIN IMMEDIATE")
            try:
                yield self._database
            except BaseException:
                self._database.execute("ROLLBACK")
                raise
            self._database.execute("COMMIT")

    def _rows(self, statement: str, values: Sequence[object] = ()) -> list[Any]:
        with self._lock:
            return self._database.execute(statement, values).fetchall()

    def _number(self, statement: str, values: Sequence[object] = ()) -> int:
        [[number]] = self._rows(statement, values)
        return int(number)

    # Sessions

    def add_session(self, session: str, key_digest: str, now: float, account: str | None = None) -> None:
        """Record a new session under the digest of its key, with the account that signed in to it."""
        self._rows(
            "INSERT INTO sessions (id, key_digest, created, used, account) VALUES (?, ?, ?, ?, ?)",
            (session, key_digest, now, now, account),
        )

    def session_of_key(self, key_digest: str) -> SessionRecord | None:
        """Return the session whose key has this digest."""
        rows = self._rows("SELECT id, created, used, account FROM sessions WHERE key_digest = ?", (key_digest,))
        return SessionRecord(*rows[0]) if rows else None

    def use_session(self, session: str, now: float) -> None:
        """Record the time of the last use of a session."""
        self._rows("UPDATE sessions SET used = ? WHERE id = ?", (now, session))

    def set_key(self, session: str, key_digest: str) -> None:
        """Replace the digest of the key of a session."""
        self._rows("UPDATE sessions SET key_digest = ? WHERE id = ?", (key_digest, session))

    def give_to_account(self, session: str, account: str) -> None:
        """Record the account of a session, and give the account what the session holds.

        The jobs, the layers and the series of the session then have the account as their owner and
        no session, so they stay when the session ends.
        """
        with self._change() as database:
            database.execute("UPDATE sessions SET account = ? WHERE id = ?", (account, session))
            for table in ("jobs", "layers", "series"):
                database.execute(f"UPDATE {table} SET owner = ?, session = NULL WHERE session = ?", (account, session))  # noqa: S608 - the text holds names of this module only

    def remove_session(self, session: str) -> None:
        """Remove a session with the records of the jobs, layers and series that it holds itself.

        What the account of the session holds stays.
        """
        self._rows("DELETE FROM sessions WHERE id = ?", (session,))

    def count_sessions(self) -> int:
        """Return the number of sessions."""
        return self._number("SELECT COUNT(*) FROM sessions")

    def sessions_of(self, account: str) -> list[str]:
        """Return the sessions of an account, the one unused for the longest time first."""
        rows = self._rows("SELECT id FROM sessions WHERE account = ? ORDER BY used, rowid", (account,))
        return [str(session) for [session] in rows]

    def sessions_unused_since(self, time: float) -> list[str]:
        """Return the sessions that were last used before a time."""
        return [str(session) for [session] in self._rows("SELECT id FROM sessions WHERE used < ?", (time,))]

    def sessions_without_content(self) -> list[str]:
        """Return the sessions that hold no layer, no series and no job themselves, the longest unused first.

        What the account of a session holds is not counted: it stays when the session ends.
        """
        rows = self._rows(
            "SELECT id FROM sessions WHERE id NOT IN (SELECT session FROM layers WHERE session IS NOT NULL)"
            " AND id NOT IN (SELECT session FROM series WHERE session IS NOT NULL)"
            " AND id NOT IN (SELECT session FROM jobs WHERE session IS NOT NULL AND status != 'dismissed')"
            " ORDER BY used"
        )
        return [str(session) for [session] in rows]

    # Jobs

    def add_job(self, job: JobRecord) -> None:
        """Record a new job."""
        values = (
            job.id,
            job.session,
            job.process,
            job.title,
            job.inputs,
            job.response,
            job.status,
            job.message,
            job.progress,
            job.created,
            job.started,
            job.finished,
            job.updated,
            job.layer,
            job.owner,
        )
        marks = ", ".join("?" * len(values))
        self._rows(f"INSERT INTO jobs ({_JOB}) VALUES ({marks})", values)  # noqa: S608 - the text holds column names only

    def _jobs(self, condition: str, values: Sequence[object] = ()) -> list[JobRecord]:
        rows = self._rows(f"SELECT {_JOB} FROM jobs WHERE {condition}", values)  # noqa: S608 - the text holds no value of a request
        return [JobRecord(*row) for row in rows]

    def job(self, job: str) -> JobRecord | None:
        """Return a job, or None when no job has this name."""
        jobs = self._jobs("id = ?", (job,))
        return jobs[0] if jobs else None

    def jobs_of(self, holder: Holder) -> list[JobRecord]:
        """Return the jobs of an account or of a session that were not dismissed, the newest first."""
        whose, value = holder.condition
        return self._jobs(f"{whose} AND status != 'dismissed' ORDER BY created DESC, rowid DESC", (value,))

    def unfinished_jobs(self) -> list[JobRecord]:
        """Return the jobs that wait or run."""
        return self._jobs("status IN ('accepted', 'running')")

    def next_waiting_job(self) -> JobRecord | None:
        """Return the job that has waited for the longest time."""
        jobs = self._jobs("status = 'accepted' ORDER BY created, rowid LIMIT 1")
        return jobs[0] if jobs else None

    def count_unfinished_jobs(self, holder: Holder) -> int:
        """Return the number of jobs of an account or of a session that wait or run."""
        whose, value = holder.condition
        return self._number(
            f"SELECT COUNT(*) FROM jobs WHERE {whose} AND status IN ('accepted', 'running')",  # noqa: S608 - the text holds no value of a request
            (value,),
        )

    def count_waiting_jobs(self) -> int:
        """Return the number of jobs of all accounts and sessions that wait."""
        return self._number("SELECT COUNT(*) FROM jobs WHERE status = 'accepted'")

    def start_job(self, job: str, message: str, now: float) -> None:
        """Record that a waiting job runs."""
        self._rows(
            "UPDATE jobs SET status = 'running', message = ?, started = ?, updated = ?"
            " WHERE id = ? AND status = 'accepted'",
            (message, now, now, job),
        )

    def report_job(self, job: str, progress: int, message: str, now: float) -> None:
        """Record the progress and the message of a running job."""
        self._rows(
            "UPDATE jobs SET progress = ?, message = ?, updated = ? WHERE id = ? AND status = 'running'",
            (progress, message, now, job),
        )

    def fail_job(self, job: str, message: str, now: float) -> None:
        """Record that a waiting or running job failed."""
        self._rows(
            "UPDATE jobs SET status = 'failed', message = ?, finished = ?, updated = ?"
            " WHERE id = ? AND status IN ('accepted', 'running')",
            (message, now, now, job),
        )

    def succeed_job(self, job: str, message: str, layer: LayerRecord) -> bool:
        """Record that a running job produced a layer, and record the layer.

        The layer is recorded with the request of the job (``source_of``), which therefore stays
        when the record of the job is removed.

        Returns
        -------
        bool
            False when the job no longer runs, for example because it was
            dismissed. Nothing is recorded then.
        """
        with self._change() as database:
            changed = database.execute(
                "UPDATE jobs SET status = 'successful', message = ?, progress = 100, finished = ?, updated = ?,"
                " layer = ? WHERE id = ? AND status = 'running'",
                (message, layer.created, layer.created, layer.id, job),
            ).rowcount
            if changed:
                [[process, inputs]] = database.execute("SELECT process, inputs FROM jobs WHERE id = ?", (job,))
                values = (
                    layer.id,
                    layer.session,
                    layer.description,
                    layer.size,
                    layer.created,
                    layer.owner,
                    layer.kept_until,
                    source_of(process, inputs),
                )
                database.execute(f"INSERT INTO layers ({_LAYER}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", values)  # noqa: S608 - the text holds column names only
        return bool(changed)

    def succeed_job_with_series(self, job: str, message: str, series: SeriesRecord) -> bool:
        """Record that a running job produced a series, and record the series.

        Returns
        -------
        bool
            False when the job no longer runs, for example because it was
            dismissed. Nothing is recorded then.
        """
        with self._change() as database:
            changed = database.execute(
                "UPDATE jobs SET status = 'successful', message = ?, progress = 100, finished = ?, updated = ?,"
                " layer = ? WHERE id = ? AND status = 'running'",
                (message, series.created, series.created, series.id, job),
            ).rowcount
            if changed:
                values = (
                    series.id,
                    series.session,
                    series.description,
                    series.created,
                    series.owner,
                    series.kept_until,
                )
                database.execute(f"INSERT INTO series ({_SERIES}) VALUES (?, ?, ?, ?, ?, ?)", values)  # noqa: S608 - the text holds column names only
        return bool(changed)

    def dismiss_job(self, job: str, message: str, now: float) -> None:
        """Record that a job was dismissed."""
        self._rows(
            "UPDATE jobs SET status = 'dismissed', message = ?, finished = COALESCE(finished, ?), updated = ?"
            " WHERE id = ?",
            (message, now, now, job),
        )

    def keep_latest_jobs(self, holder: Holder, finished: int, dismissed: int) -> None:
        """Remove the oldest records of finished and of dismissed jobs of a holder beyond two numbers."""
        whose, value = holder.condition
        with self._change() as database:
            for condition, number in (
                ("status IN ('successful', 'failed')", finished),
                ("status = 'dismissed'", dismissed),
            ):
                database.execute(
                    f"DELETE FROM jobs WHERE {whose} AND {condition} AND id NOT IN (SELECT id FROM jobs"  # noqa: S608 - the text holds no value of a request
                    f" WHERE {whose} AND {condition} ORDER BY created DESC, rowid DESC LIMIT ?)",
                    (value, value, number),
                )

    def remove_jobs_ended_before(self, time: float) -> None:
        """Remove the records of the failed and of the dismissed jobs that last changed before a time."""
        self._rows("DELETE FROM jobs WHERE status IN ('failed', 'dismissed') AND updated < ?", (time,))

    def remove_content(self, holder: Holder) -> list[str]:
        """Remove the records of all jobs, layers and series of an account or of a session.

        Returns
        -------
        list of str
            The names of the layers whose records were removed, so that their files can be removed.
        """
        whose, value = holder.condition
        with self._change() as database:
            layers = [str(layer) for [layer] in database.execute(f"SELECT id FROM layers WHERE {whose}", (value,))]  # noqa: S608 - the text holds no value of a request
            for table in ("jobs", "layers", "series"):
                database.execute(f"DELETE FROM {table} WHERE {whose}", (value,))  # noqa: S608 - the text holds no value of a request
        return layers

    # Layers

    def _layers(self, condition: str, values: Sequence[object] = ()) -> list[LayerRecord]:
        rows = self._rows(f"SELECT {_LAYER} FROM layers WHERE {condition}", values)  # noqa: S608 - the text holds no value of a request
        return [LayerRecord(*row) for row in rows]

    def layer(self, layer: str) -> LayerRecord | None:
        """Return a layer, or None when no layer has this name."""
        layers = self._layers("id = ?", (layer,))
        return layers[0] if layers else None

    def layers_of(self, holder: Holder) -> list[LayerRecord]:
        """Return the layers of an account or of a session, the newest first."""
        whose, value = holder.condition
        return self._layers(f"{whose} ORDER BY created DESC, rowid DESC", (value,))

    def layers_kept_until(self, time: float) -> list[LayerRecord]:
        """Return the layers whose moment of removal lies before a time."""
        return self._layers("kept_until IS NOT NULL AND kept_until < ?", (time,))

    def change_layer(self, layer: str, description: str, size: int) -> None:
        """Replace the description and the size of a layer."""
        self._rows("UPDATE layers SET description = ?, size = ? WHERE id = ?", (description, size, layer))

    def keep_layer(self, layer: str, until: float) -> None:
        """Record the moment until which a layer is kept."""
        self._rows("UPDATE layers SET kept_until = ? WHERE id = ?", (until, layer))

    def layer_names(self) -> set[str]:
        """Return the names of the layers of all accounts and sessions."""
        return {str(layer) for [layer] in self._rows("SELECT id FROM layers")}

    def remove_layer(self, layer: str) -> None:
        """Remove the record of a layer and of the job that produced it."""
        with self._change() as database:
            database.execute("DELETE FROM jobs WHERE layer = ?", (layer,))
            database.execute("DELETE FROM layers WHERE id = ?", (layer,))

    def size_of_layers(self, holder: Holder | None = None) -> int:
        """Return the total size of the layers of one account or session, or of all of them, in bytes."""
        if holder is None:
            return self._number("SELECT COALESCE(SUM(size), 0) FROM layers")
        whose, value = holder.condition
        return self._number(f"SELECT COALESCE(SUM(size), 0) FROM layers WHERE {whose}", (value,))  # noqa: S608 - the text holds no value of a request

    # Series

    def _series(self, condition: str, values: Sequence[object] = ()) -> list[SeriesRecord]:
        rows = self._rows(f"SELECT {_SERIES} FROM series WHERE {condition}", values)  # noqa: S608 - the text holds no value of a request
        return [SeriesRecord(*row) for row in rows]

    def series(self, series: str) -> SeriesRecord | None:
        """Return a series, or None when no series has this name."""
        found = self._series("id = ?", (series,))
        return found[0] if found else None

    def series_of(self, holder: Holder) -> list[SeriesRecord]:
        """Return the series of an account or of a session, the newest first."""
        whose, value = holder.condition
        return self._series(f"{whose} ORDER BY created DESC, rowid DESC", (value,))

    def series_kept_until(self, time: float) -> list[SeriesRecord]:
        """Return the series whose moment of removal lies before a time."""
        return self._series("kept_until IS NOT NULL AND kept_until < ?", (time,))

    def change_series(self, series: str, description: str) -> None:
        """Replace the description of a series."""
        self._rows("UPDATE series SET description = ? WHERE id = ?", (description, series))

    def keep_series(self, series: str, until: float) -> None:
        """Record the moment until which a series is kept."""
        self._rows("UPDATE series SET kept_until = ? WHERE id = ?", (until, series))

    def remove_series(self, series: str) -> None:
        """Remove the record of a series and of the job that produced it."""
        with self._change() as database:
            database.execute("DELETE FROM jobs WHERE layer = ?", (series,))
            database.execute("DELETE FROM series WHERE id = ?", (series,))

    # The keeping time

    def keep_all(self, holder: Holder, until: float) -> None:
        """Record one moment until which every layer and series of an account or of a session is kept."""
        whose, value = holder.condition
        with self._change() as database:
            for table in ("layers", "series"):
                database.execute(f"UPDATE {table} SET kept_until = ? WHERE {whose}", (until, value))  # noqa: S608 - the text holds no value of a request

    def keep_unset(self, until: float, now: float) -> None:
        """Record a moment of removal for every layer and series that has none.

        The project server calls it when it starts, so that what a record file of an earlier version
        holds is kept for the keeping time from that moment. A session that holds such a layer or
        series itself counts as used at that moment, so that it lasts as long as what it holds and
        can still give it to the account that signs in.

        Parameters
        ----------
        until : float
            The moment of removal, in seconds since 1 January 1970 (UTC).
        now : float
            Present time, in seconds since 1 January 1970 (UTC).
        """
        with self._change() as database:
            database.execute(
                "UPDATE sessions SET used = ? WHERE used < ? AND ("
                "id IN (SELECT session FROM layers WHERE session IS NOT NULL AND kept_until IS NULL)"
                " OR id IN (SELECT session FROM series WHERE session IS NOT NULL AND kept_until IS NULL))",
                (now, now),
            )
            for table in ("layers", "series"):
                database.execute(f"UPDATE {table} SET kept_until = ? WHERE kept_until IS NULL", (until,))  # noqa: S608 - the text holds names of this module only

    # Pairings of own servers

    def add_pairing(self, pairing: PairingRecord) -> bool:
        """Record a new pairing.

        Returns
        -------
        bool
            False when another pairing holds the same user code or the same device code. Nothing is recorded then.
        """
        values = (
            pairing.device_digest,
            pairing.user_code,
            pairing.machine,
            pairing.created,
            pairing.asked,
            pairing.server,
        )
        try:
            self._rows(f"INSERT INTO pairings ({_PAIRING}) VALUES (?, ?, ?, ?, ?, ?)", values)  # noqa: S608 - the text holds column names only
        except sqlite3.IntegrityError:
            return False
        return True

    def _pairings(self, condition: str, values: Sequence[object]) -> list[PairingRecord]:
        rows = self._rows(f"SELECT {_PAIRING} FROM pairings WHERE {condition}", values)  # noqa: S608 - the text holds no value of a request
        return [PairingRecord(*row) for row in rows]

    def pairing_of_code(self, user_code: str) -> PairingRecord | None:
        """Return the pairing with this user code."""
        pairings = self._pairings("user_code = ?", (user_code,))
        return pairings[0] if pairings else None

    def pairing_of_device(self, device_digest: str) -> PairingRecord | None:
        """Return the pairing whose device code has this digest."""
        pairings = self._pairings("device_digest = ?", (device_digest,))
        return pairings[0] if pairings else None

    def count_pairings(self) -> int:
        """Return the number of pairings in progress."""
        return self._number("SELECT COUNT(*) FROM pairings")

    def ask_pairing(self, device_digest: str, now: float) -> None:
        """Record the time of a question of the program about a pairing."""
        self._rows("UPDATE pairings SET asked = ? WHERE device_digest = ?", (now, device_digest))

    def remove_pairing(self, device_digest: str) -> None:
        """Remove a pairing."""
        self._rows("DELETE FROM pairings WHERE device_digest = ?", (device_digest,))

    def remove_pairings_before(self, time: float) -> None:
        """Remove the pairings that were asked for before a time, and the servers that can no longer receive a key.

        A server without a key belongs to a confirmed pairing whose program has not asked for the key yet.
        Once that pairing is removed, no program can receive the key, so the server is removed too.
        """
        with self._change() as database:
            database.execute("DELETE FROM pairings WHERE created < ?", (time,))
            database.execute(
                "DELETE FROM servers WHERE key_digest IS NULL"
                " AND id NOT IN (SELECT server FROM pairings WHERE server IS NOT NULL)"
            )

    def confirm_pairing(self, user_code: str, server: ServerRecord, most: int, since: float) -> str:
        """Record the server of a pairing that its owner confirmed.

        Parameters
        ----------
        user_code : str
            User code of the pairing.
        server : ServerRecord
            The new server, without a key.
        most : int
            Most servers that one user may have.
        since : float
            Time before which a pairing was asked for too long ago to be confirmed.

        Returns
        -------
        {"confirmed", "unknown", "full"}
            ``unknown`` when no pairing that can still be confirmed has this code, and ``full`` when the user
            has ``most`` servers. Nothing is recorded in these two cases.
        """
        with self._change() as database:
            found = database.execute(
                "SELECT device_digest FROM pairings WHERE user_code = ? AND server IS NULL AND created >= ?",
                (user_code, since),
            ).fetchall()
            if not found:
                return "unknown"
            [[servers]] = database.execute("SELECT COUNT(*) FROM servers WHERE user = ?", (server.user,)).fetchall()
            if servers >= most:
                return "full"
            database.execute(
                f"INSERT INTO servers ({_SERVER}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",  # noqa: S608 - the text holds column names only
                (
                    server.id,
                    server.user,
                    server.name,
                    server.key_digest,
                    server.paired,
                    server.seen,
                    server.reported,
                    server.state,
                    server.limits,
                ),
            )
            database.execute("UPDATE pairings SET server = ? WHERE device_digest = ?", (server.id, found[0][0]))
        return "confirmed"

    def give_key(self, device_digest: str, key_digest: str, now: float) -> str | None:
        """Record the digest of the key of the server of a confirmed pairing, and remove the pairing.

        Returns
        -------
        str or None
            Name of the server, or None when the pairing has no server that waits for a key. The pairing
            is kept then.
        """
        with self._change() as database:
            found = database.execute(
                "SELECT servers.id FROM pairings JOIN servers ON servers.id = pairings.server"
                " WHERE pairings.device_digest = ? AND servers.key_digest IS NULL",
                (device_digest,),
            ).fetchall()
            if not found:
                return None
            [[server]] = found
            database.execute("UPDATE servers SET key_digest = ?, seen = ? WHERE id = ?", (key_digest, now, server))
            database.execute("DELETE FROM pairings WHERE device_digest = ?", (device_digest,))
        return str(server)

    # Own servers

    def _servers(self, condition: str, values: Sequence[object]) -> list[ServerRecord]:
        rows = self._rows(f"SELECT {_SERVER} FROM servers WHERE {condition}", values)  # noqa: S608 - the text holds no value of a request
        return [ServerRecord(*row) for row in rows]

    def server(self, server: str) -> ServerRecord | None:
        """Return an own server, or None when no server has this name."""
        servers = self._servers("id = ?", (server,))
        return servers[0] if servers else None

    def server_of_key(self, key_digest: str) -> ServerRecord | None:
        """Return the own server whose key has this digest."""
        servers = self._servers("key_digest = ?", (key_digest,))
        return servers[0] if servers else None

    def servers_of(self, user: str) -> list[ServerRecord]:
        """Return the own servers of an Earthdata user, the one paired first at the head."""
        return self._servers("user = ? ORDER BY paired, rowid", (user,))

    def see_server(self, server: str, now: float) -> None:
        """Record the time of the last message of an own server."""
        self._rows("UPDATE servers SET seen = ? WHERE id = ?", (now, server))

    def set_server_state(self, server: str, state: str, now: float) -> None:
        """Record the state that an own server reported, and the time of the report."""
        self._rows("UPDATE servers SET state = ?, reported = ?, seen = ? WHERE id = ?", (state, now, now, server))

    def change_server_state(self, server: str, state: str) -> None:
        """Replace the recorded state of an own server without recording a report."""
        self._rows("UPDATE servers SET state = ? WHERE id = ?", (state, server))

    def rename_server(self, server: str, name: str) -> None:
        """Give an own server another name."""
        self._rows("UPDATE servers SET name = ? WHERE id = ?", (name, server))

    def set_server_limits(self, server: str, limits: str | None) -> None:
        """Record the limits that the owner set on the site for an own server, or that he set none."""
        self._rows("UPDATE servers SET limits = ? WHERE id = ?", (limits, server))

    def remove_server(self, server: str) -> None:
        """Remove an own server with the records of its jobs and layers.

        A pairing whose program has not received the key keeps the name of the server, so that the
        program can be told that its owner removed the server.
        """
        self._rows("DELETE FROM servers WHERE id = ?", (server,))

    # Jobs of own servers

    def add_server_job(self, job: ServerJobRecord) -> None:
        """Record a new job of an own server."""
        values = (
            job.id,
            job.server,
            job.process,
            job.title,
            job.inputs,
            job.response,
            job.status,
            job.message,
            job.progress,
            job.created,
            job.started,
            job.finished,
            job.updated,
            job.layer,
            job.taken,
        )
        marks = ", ".join("?" * len(values))
        self._rows(f"INSERT INTO server_jobs ({_SERVER_JOB}) VALUES ({marks})", values)  # noqa: S608 - the text holds column names only

    def _server_jobs(self, condition: str, values: Sequence[object] = ()) -> list[ServerJobRecord]:
        rows = self._rows(f"SELECT {_SERVER_JOB} FROM server_jobs WHERE {condition}", values)  # noqa: S608 - the text holds no value of a request
        return [ServerJobRecord(*row) for row in rows]

    def server_job(self, job: str) -> ServerJobRecord | None:
        """Return a job of an own server, or None when no such job has this name."""
        jobs = self._server_jobs("id = ?", (job,))
        return jobs[0] if jobs else None

    def server_jobs_of(self, server: str) -> list[ServerJobRecord]:
        """Return the jobs of an own server that were not dismissed, the newest first."""
        return self._server_jobs("server = ? AND status != 'dismissed' ORDER BY created DESC, rowid DESC", (server,))

    def unfinished_server_jobs(self, server: str | None = None) -> list[ServerJobRecord]:
        """Return the jobs of one own server, or of all own servers, that wait or run."""
        if server is None:
            return self._server_jobs("status IN ('accepted', 'running')")
        return self._server_jobs("server = ? AND status IN ('accepted', 'running')", (server,))

    def count_unfinished_server_jobs(self, server: str) -> int:
        """Return the number of jobs of an own server that wait or run."""
        return self._number(
            "SELECT COUNT(*) FROM server_jobs WHERE server = ? AND status IN ('accepted', 'running')", (server,)
        )

    def take_server_job(self, job: str, now: float) -> None:
        """Record that the own server of a job confirmed that it had recorded the job."""
        self._rows("UPDATE server_jobs SET taken = ? WHERE id = ? AND taken IS NULL", (now, job))

    def report_server_job(
        self, job: str, status: Status, progress: int, message: str, started: float | None, now: float
    ) -> None:
        """Record the state that an own server reported for a job that waits or runs."""
        self._rows(
            "UPDATE server_jobs SET status = ?, progress = ?, message = ?, started = ?, updated = ?,"
            " taken = COALESCE(taken, ?) WHERE id = ? AND status IN ('accepted', 'running')",
            (status, progress, message, started, now, now, job),
        )

    def fail_server_job(self, job: str, message: str, now: float) -> None:
        """Record that a waiting or running job of an own server failed."""
        self._rows(
            "UPDATE server_jobs SET status = 'failed', message = ?, finished = ?, updated = ?"
            " WHERE id = ? AND status IN ('accepted', 'running')",
            (message, now, now, job),
        )

    def succeed_server_job(
        self, job: str, message: str, started: float, finished: float, now: float, layer: ServerLayerRecord
    ) -> bool:
        """Record that a job of an own server produced a layer, and record the layer.

        Returns
        -------
        bool
            False when the job no longer waits or runs, or its server already keeps a layer of this name.
            Nothing is recorded then.
        """
        try:
            with self._change() as database:
                changed = database.execute(
                    "UPDATE server_jobs SET status = 'successful', message = ?, progress = 100, started = ?,"
                    " finished = ?, updated = ?, layer = ?, taken = COALESCE(taken, ?)"
                    " WHERE id = ? AND status IN ('accepted', 'running')",
                    (message, started, finished, now, layer.id, now, job),
                ).rowcount
                if changed:
                    [[process, inputs]] = database.execute(
                        "SELECT process, inputs FROM server_jobs WHERE id = ?", (job,)
                    )
                    values = (
                        layer.id,
                        layer.server,
                        layer.owner,
                        layer.description,
                        layer.size,
                        layer.created,
                        source_of(process, inputs),
                    )
                    marks = ", ".join("?" * len(values))
                    database.execute(f"INSERT INTO server_layers ({_SERVER_LAYER}) VALUES ({marks})", values)  # noqa: S608 - the text holds column names only
        except sqlite3.IntegrityError:
            return False
        return bool(changed)

    def dismiss_server_job(self, job: str, message: str, now: float) -> None:
        """Record that a job of an own server was dismissed."""
        self._rows(
            "UPDATE server_jobs SET status = 'dismissed', message = ?, finished = COALESCE(finished, ?), updated = ?"
            " WHERE id = ?",
            (message, now, now, job),
        )

    def keep_latest_server_jobs(self, server: str, finished: int, dismissed: int) -> None:
        """Remove the oldest records of finished and of dismissed jobs of an own server beyond two numbers."""
        with self._change() as database:
            for condition, number in (
                ("status IN ('successful', 'failed')", finished),
                ("status = 'dismissed'", dismissed),
            ):
                database.execute(
                    f"DELETE FROM server_jobs WHERE server = ? AND {condition} AND id NOT IN (SELECT id FROM"  # noqa: S608 - the text holds no value of a request
                    f" server_jobs WHERE server = ? AND {condition} ORDER BY created DESC, rowid DESC LIMIT ?)",
                    (server, server, number),
                )

    # Layers of own servers

    def _server_layers(self, condition: str, values: Sequence[object]) -> list[ServerLayerRecord]:
        rows = self._rows(f"SELECT {_SERVER_LAYER} FROM server_layers WHERE {condition}", values)  # noqa: S608 - the text holds no value of a request
        return [ServerLayerRecord(*row) for row in rows]

    def server_layer(self, server: str, layer: str) -> ServerLayerRecord | None:
        """Return a layer that an own server keeps, or None when it keeps no layer of this name."""
        layers = self._server_layers("server = ? AND id = ?", (server, layer))
        return layers[0] if layers else None

    def server_layers_of(self, owner: str) -> list[ServerLayerRecord]:
        """Return the layers that the own servers of an Earthdata user keep, the newest first."""
        return self._server_layers("owner = ? ORDER BY created DESC, rowid DESC", (owner,))

    def count_server_layers(self, server: str) -> int:
        """Return the number of layers that an own server keeps."""
        return self._number("SELECT COUNT(*) FROM server_layers WHERE server = ?", (server,))

    def change_server_layer(self, server: str, layer: str, description: str) -> None:
        """Replace the description of a layer that an own server keeps."""
        self._rows("UPDATE server_layers SET description = ? WHERE server = ? AND id = ?", (description, server, layer))

    def remove_server_layer(self, server: str, layer: str) -> None:
        """Remove the record of a layer that an own server keeps, and of the job that produced it."""
        with self._change() as database:
            database.execute("DELETE FROM server_jobs WHERE server = ? AND layer = ?", (server, layer))
            database.execute("DELETE FROM server_layers WHERE server = ? AND id = ?", (server, layer))
