# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""The sessions of the visitors.

A session is named by a key that the browser holds in a cookie. The key is
random and carries no meaning. The store holds its SHA-256 digest only. A
session owns the jobs and the layers of a visitor, and it may hold the
Earthdata token with which the visitor signed in. The token is kept in the
memory of the server only, and it is forgotten when the visitor signs out,
when the session is not used for some time, and when the server stops.

The values follow the Session Management Cheat Sheet of OWASP: a key of at
least 64 bits from a secure random generator, a new key when the visitor
signs in or out, and a limit on the time without use and on the whole time
of a sign-in.
"""

import hashlib
import re
import secrets
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass

from lynkeus.earthdata import EarthdataUser, TokenChecker
from lynkeus.store import Store

COOKIE = "lynkeus_session"
"""The name of the cookie that holds the key of a session."""

COOKIE_PATH = "/api"
"""The part of the site to which the browser sends the cookie."""

SESSION_IDLE_TIME = 7 * 24 * 3600.0
"""The time without use after which a session is removed with its jobs and layers, in seconds."""

EARTHDATA_IDLE_TIME = 30 * 60.0
"""The time without use after which the Earthdata token of a session is forgotten, in seconds."""

EARTHDATA_TIME = 8 * 3600.0
"""The longest time for which the Earthdata token of a session is kept, in seconds."""

MAX_SESSIONS = 5000
"""The largest number of sessions.

Beyond it, a session without layers and series, whose jobs all failed or were dismissed, is removed for
each new one.
"""

USE_PAUSE = 60.0
"""The shortest time between two records of the last use of a session, in seconds."""

_KEY = re.compile(r"^[A-Za-z0-9_-]{43}$")


class TooManySessionsError(Exception):
    """The server holds the largest number of sessions, and each of them holds jobs or layers."""


@dataclass
class _SignIn:
    user: EarthdataUser
    token: str
    start: float
    used: float


def _digest(key: str) -> str:
    return hashlib.sha256(key.encode("ascii")).hexdigest()


class Sessions:
    """Creates, finds and removes sessions, and holds their Earthdata tokens.

    Parameters
    ----------
    store : Store
        Record of the sessions.
    checker : TokenChecker
        Checks an Earthdata token.
    end : callable
        Ends the jobs of a session and removes the session with its layers.
    """

    def __init__(self, store: Store, checker: TokenChecker, end: Callable[[str], None]) -> None:
        self._store = store
        self._checker = checker
        self._end = end
        self._lock = threading.RLock()
        self._sign_ins: dict[str, _SignIn] = {}

    def find(self, key: str | None) -> str | None:
        """Return the session that a key names, and record that it was used.

        Returns
        -------
        str or None
            None when no session has this key or the session was not used
            for longer than ``SESSION_IDLE_TIME``.
        """
        if key is None or not _KEY.fullmatch(key):
            return None
        record = self._store.session_of_key(_digest(key))
        if record is None:
            return None
        now = time.time()
        if now - record.used > SESSION_IDLE_TIME:
            self.remove(record.id)
            return None
        if now - record.used > USE_PAUSE:
            self._store.use_session(record.id, now)
        with self._lock:
            sign_in = self._current_sign_in(record.id)
            if sign_in is not None:
                sign_in.used = time.monotonic()
        return record.id

    def create(self) -> tuple[str, str]:
        """Create a session.

        Returns
        -------
        session : str
            Name of the session inside the server.
        key : str
            Key of the session, for the cookie.

        Raises
        ------
        TooManySessionsError
            When the server holds ``MAX_SESSIONS`` sessions and each of them
            holds a layer, a series, an Earthdata token or a job that waits, runs or ended successfully.
        """
        with self._lock:
            if self._store.count_sessions() >= MAX_SESSIONS:
                empty = [session for session in self._store.sessions_without_content() if session not in self._sign_ins]
                if not empty:
                    raise TooManySessionsError
                self.remove(empty[0])
            session, key = secrets.token_hex(16), secrets.token_urlsafe(32)
            self._store.add_session(session, _digest(key), time.time())
            return session, key

    def renew_key(self, session: str) -> str:
        """Give a session a new key, so that the key used before a sign-in or a sign-out names nothing."""
        key = secrets.token_urlsafe(32)
        self._store.set_key(session, _digest(key))
        return key

    def remove(self, session: str) -> None:
        """Forget the Earthdata token of a session and remove the session with its jobs and layers."""
        with self._lock:
            self._sign_ins.pop(session, None)
        self._end(session)

    def remove_unused(self) -> None:
        """Remove the sessions that were not used for longer than ``SESSION_IDLE_TIME`` and forget expired tokens."""
        for session in self._store.sessions_unused_since(time.time() - SESSION_IDLE_TIME):
            self.remove(session)
        with self._lock:
            for session in list(self._sign_ins):
                self._current_sign_in(session)

    def sign_in(self, session: str, token: str) -> EarthdataUser:
        """Check an Earthdata token and keep it for a session.

        Raises
        ------
        lynkeus.earthdata.TokenRefusedError
            When Earthdata Login does not accept the token.
        lynkeus.earthdata.KeysUnavailableError
            When the token could not be checked.
        """
        user = self._checker.check(token)
        now = time.monotonic()
        with self._lock:
            self._sign_ins[session] = _SignIn(user=user, token=token, start=now, used=now)
        return user

    def sign_out(self, session: str) -> None:
        """Forget the Earthdata token of a session."""
        with self._lock:
            self._sign_ins.pop(session, None)

    def user(self, session: str) -> EarthdataUser | None:
        """Return the Earthdata user of a session, or None when the visitor is not signed in."""
        with self._lock:
            sign_in = self._current_sign_in(session)
            return sign_in.user if sign_in else None

    def token(self, session: str) -> str | None:
        """Return the Earthdata token of a session, or None when the visitor is not signed in."""
        with self._lock:
            sign_in = self._current_sign_in(session)
            return sign_in.token if sign_in else None

    def _current_sign_in(self, session: str) -> _SignIn | None:
        """Return the sign-in of a session, after forgetting it when one of its time limits has passed."""
        sign_in = self._sign_ins.get(session)
        if sign_in is None:
            return None
        now = time.monotonic()
        expired = (
            now - sign_in.used > EARTHDATA_IDLE_TIME
            or now - sign_in.start > EARTHDATA_TIME
            or time.time() >= sign_in.user.expires
        )
        if expired:
            del self._sign_ins[session]
            return None
        return sign_in
