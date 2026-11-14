"""The record of the sessions, jobs and layers, kept in one SQLite file.

The file outlives a restart of the server, so a visitor keeps the layers and
the finished jobs of a session. It holds the SHA-256 digest of a session key
and not the key, and it never holds an Earthdata token.
"""

import sqlite3
import threading
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

type Status = Literal["accepted", "running", "successful", "failed", "dismissed"]

VERSION = 1
"""The version of the tables. A file of another version is not opened."""

_TABLES = """
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    key_digest TEXT NOT NULL UNIQUE,
    created REAL NOT NULL,
    used REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    session TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
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
    layer TEXT
);
CREATE INDEX IF NOT EXISTS jobs_of_session ON jobs (session, created);
CREATE TABLE IF NOT EXISTS layers (
    id TEXT PRIMARY KEY,
    session TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    size INTEGER NOT NULL,
    created REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS layers_of_session ON layers (session, created);
"""

_JOB = (
    "id, session, process, title, inputs, response, status, message, progress, created, started, finished,"
    " updated, layer"
)


@dataclass(frozen=True)
class SessionRecord:
    """A session.

    Attributes
    ----------
    id : str
        Name of the session inside the server.
    created, used : float
        Times of creation and of the last use, in seconds since 1 January 1970 (UTC).
    """

    id: str
    created: float
    used: float


@dataclass(frozen=True)
class JobRecord:
    """A job.

    Attributes
    ----------
    id : str
        Name of the job.
    session : str
        Name of the session that started the job.
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
        Name of the layer that a successful job produced.
    """

    id: str
    session: str
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


@dataclass(frozen=True)
class LayerRecord:
    """A layer of a session.

    Attributes
    ----------
    id : str
        Name of the layer, which is also the name of the folder of its files.
    session : str
        Name of the session that owns the layer.
    description : str
        Layer description, as JSON.
    size : int
        Total size of the files of the layer, in bytes.
    created : float
        Time of creation, in seconds since 1 January 1970 (UTC).
    """

    id: str
    session: str
    description: str
    size: int
    created: float


class Store:
    """The sessions, jobs and layers, in one SQLite file.

    Every method may be called from any thread.
    """

    def __init__(self, path: Path) -> None:
        self._lock = threading.RLock()
        # Only the user of the server may read the file.
        path.touch(mode=0o600, exist_ok=True)
        self._database = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._database.execute("PRAGMA foreign_keys = ON")
        version = self._database.execute("PRAGMA user_version").fetchone()[0]
        if version not in (0, VERSION):
            self._database.close()
            raise ValueError(f"the file {path.name} holds tables of version {version}, and version {VERSION} is needed")
        self._database.executescript(_TABLES)
        self._database.execute(f"PRAGMA user_version = {VERSION}")

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

    def add_session(self, session: str, key_digest: str, now: float) -> None:
        """Record a new session under the digest of its key."""
        self._rows(
            "INSERT INTO sessions (id, key_digest, created, used) VALUES (?, ?, ?, ?)", (session, key_digest, now, now)
        )

    def session_of_key(self, key_digest: str) -> SessionRecord | None:
        """Return the session whose key has this digest."""
        rows = self._rows("SELECT id, created, used FROM sessions WHERE key_digest = ?", (key_digest,))
        return SessionRecord(*rows[0]) if rows else None

    def use_session(self, session: str, now: float) -> None:
        """Record the time of the last use of a session."""
        self._rows("UPDATE sessions SET used = ? WHERE id = ?", (now, session))

    def set_key(self, session: str, key_digest: str) -> None:
        """Replace the digest of the key of a session."""
        self._rows("UPDATE sessions SET key_digest = ? WHERE id = ?", (key_digest, session))

    def remove_session(self, session: str) -> None:
        """Remove a session with the records of its jobs and layers."""
        self._rows("DELETE FROM sessions WHERE id = ?", (session,))

    def count_sessions(self) -> int:
        """Return the number of sessions."""
        return self._number("SELECT COUNT(*) FROM sessions")

    def sessions_unused_since(self, time: float) -> list[str]:
        """Return the sessions that were last used before a time."""
        return [str(session) for [session] in self._rows("SELECT id FROM sessions WHERE used < ?", (time,))]

    def sessions_without_content(self) -> list[str]:
        """Return the sessions that hold no layer and no job, the one unused for the longest time first."""
        rows = self._rows(
            "SELECT id FROM sessions WHERE id NOT IN (SELECT session FROM layers)"
            " AND id NOT IN (SELECT session FROM jobs WHERE status != 'dismissed') ORDER BY used"
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
        )
        self._rows(f"INSERT INTO jobs ({_JOB}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", values)  # noqa: S608 - the text holds column names only

    def _jobs(self, condition: str, values: Sequence[object] = ()) -> list[JobRecord]:
        rows = self._rows(f"SELECT {_JOB} FROM jobs WHERE {condition}", values)  # noqa: S608 - the text holds no value of a request
        return [JobRecord(*row) for row in rows]

    def job(self, job: str) -> JobRecord | None:
        """Return a job, or None when no job has this name."""
        jobs = self._jobs("id = ?", (job,))
        return jobs[0] if jobs else None

    def jobs_of(self, session: str) -> list[JobRecord]:
        """Return the jobs of a session that were not dismissed, the newest first."""
        return self._jobs("session = ? AND status != 'dismissed' ORDER BY created DESC, rowid DESC", (session,))

    def unfinished_jobs(self) -> list[JobRecord]:
        """Return the jobs that wait or run."""
        return self._jobs("status IN ('accepted', 'running')")

    def next_waiting_job(self) -> JobRecord | None:
        """Return the job that has waited for the longest time."""
        jobs = self._jobs("status = 'accepted' ORDER BY created, rowid LIMIT 1")
        return jobs[0] if jobs else None

    def count_unfinished_jobs(self, session: str) -> int:
        """Return the number of jobs of a session that wait or run."""
        return self._number(
            "SELECT COUNT(*) FROM jobs WHERE session = ? AND status IN ('accepted', 'running')", (session,)
        )

    def count_waiting_jobs(self) -> int:
        """Return the number of jobs of all sessions that wait."""
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
                database.execute(
                    "INSERT INTO layers (id, session, description, size, created) VALUES (?, ?, ?, ?, ?)",
                    (layer.id, layer.session, layer.description, layer.size, layer.created),
                )
        return bool(changed)

    def dismiss_job(self, job: str, message: str, now: float) -> None:
        """Record that a job was dismissed."""
        self._rows(
            "UPDATE jobs SET status = 'dismissed', message = ?, finished = COALESCE(finished, ?), updated = ?"
            " WHERE id = ?",
            (message, now, now, job),
        )

    def keep_latest_jobs(self, session: str, finished: int, dismissed: int) -> None:
        """Remove the oldest records of finished and of dismissed jobs of a session beyond two numbers."""
        with self._change() as database:
            for condition, number in (
                ("status IN ('successful', 'failed')", finished),
                ("status = 'dismissed'", dismissed),
            ):
                database.execute(
                    f"DELETE FROM jobs WHERE session = ? AND {condition} AND id NOT IN (SELECT id FROM jobs"  # noqa: S608 - the text holds no value of a request
                    f" WHERE session = ? AND {condition} ORDER BY created DESC, rowid DESC LIMIT ?)",
                    (session, session, number),
                )

    # Layers

    def layer(self, layer: str) -> LayerRecord | None:
        """Return a layer, or None when no layer has this name."""
        rows = self._rows("SELECT id, session, description, size, created FROM layers WHERE id = ?", (layer,))
        return LayerRecord(*rows[0]) if rows else None

    def layers_of(self, session: str) -> list[LayerRecord]:
        """Return the layers of a session, the newest first."""
        rows = self._rows(
            "SELECT id, session, description, size, created FROM layers WHERE session = ?"
            " ORDER BY created DESC, rowid DESC",
            (session,),
        )
        return [LayerRecord(*row) for row in rows]

    def change_layer(self, layer: str, description: str, size: int) -> None:
        """Replace the description and the size of a layer."""
        self._rows("UPDATE layers SET description = ?, size = ? WHERE id = ?", (description, size, layer))

    def layer_names(self) -> set[str]:
        """Return the names of the layers of all sessions."""
        return {str(layer) for [layer] in self._rows("SELECT id FROM layers")}

    def remove_layer(self, layer: str) -> None:
        """Remove the record of a layer and of the job that produced it."""
        with self._change() as database:
            database.execute("DELETE FROM jobs WHERE layer = ?", (layer,))
            database.execute("DELETE FROM layers WHERE id = ?", (layer,))

    def size_of_layers(self, session: str | None = None) -> int:
        """Return the total size of the layers of one session, or of all sessions, in bytes."""
        if session is None:
            return self._number("SELECT COALESCE(SUM(size), 0) FROM layers")
        return self._number("SELECT COALESCE(SUM(size), 0) FROM layers WHERE session = ?", (session,))
