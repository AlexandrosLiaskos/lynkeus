# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""The sessions of the visitors.

A session is the link of one browser to the project server. It is named by a
key that the browser holds in a cookie. The key is random and carries no
meaning. The store holds its SHA-256 digest only. A session is made when a
visitor signs in to Earthdata, and by nothing else. It records the account,
which is the Earthdata user name. The jobs, the layers and the series belong to
the account and not to the session. A session may hold the Earthdata token
with which the visitor signed in. The token is kept in the
memory of the server only, and it is forgotten when the visitor signs out,
when it is not used for some time, and when the server stops. The loss of the
token ends no session and removes nothing.

The values follow the Session Management Cheat Sheet of OWASP: a key of at
least 64 bits from a secure random generator, a new key when the visitor
signs in, an end of the session on the server when he signs out, and a limit
on the time without use. The token, which is the secret that NASA accepts,
has the two short limits of the sheet: a time without use and a whole time.
The sources of each value are in ``docs/research/storage.md``.
"""

import hashlib
import re
import secrets
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass

from lynkeus.earthdata import EarthdataUser, TokenChecker
from lynkeus.jobs import KEEP_TIME
from lynkeus.store import SessionRecord, Store

COOKIE = "lynkeus_session"
"""The name of the cookie that holds the key of a session."""

COOKIE_PATH = "/api"
"""The part of the site to which the browser sends the cookie."""

SESSION_IDLE_TIME = KEEP_TIME
"""The time without use after which a session ends, in seconds. It is the keeping time (``lynkeus.jobs.KEEP_TIME``).

Whatever the project server still keeps for an account can therefore be reached from the browser that made
it without a new sign-in. The cookie lives for the same time, and it is given again whenever the page opens.
"""

EARTHDATA_IDLE_TIME = 30 * 60.0
"""The time without use after which the Earthdata token of a session is forgotten, in seconds."""

EARTHDATA_TIME = 8 * 3600.0
"""The longest time for which the Earthdata token of a session is kept, in seconds."""

MAX_SESSIONS = 5000
"""The largest number of sessions. Beyond it, the session unused for the longest time that holds no token ends."""

MAX_ACCOUNT_SESSIONS = 10
"""The largest number of sessions of one account, which are its signed-in browsers.

Beyond it, a sign-in ends the session of the account that was unused for the longest time, so that one account
cannot fill the sessions of the server.
"""

USE_PAUSE = 60.0
"""The shortest time between two records of the last use of a session, in seconds."""

_KEY = re.compile(r"^[A-Za-z0-9_-]{43}$")


class TooManySessionsError(Exception):
    """The server holds the largest number of sessions, and each of them holds a token or content of its own."""


@dataclass
class _SignIn:
    user: EarthdataUser
    token: str
    start: float
    used: float


def _digest(key: str) -> str:
    return hashlib.sha256(key.encode("ascii")).hexdigest()


class Sessions:
    """Creates, finds and ends sessions, and holds their Earthdata tokens.

    Parameters
    ----------
    store : Store
        Record of the sessions.
    checker : TokenChecker
        Checks an Earthdata token.
    end : callable
        Ends a session: removes it, with what it holds itself when it has no account.
    """

    def __init__(self, store: Store, checker: TokenChecker, end: Callable[[str], None]) -> None:
        self._store = store
        self._checker = checker
        self._end = end
        self._lock = threading.RLock()
        self._sign_ins: dict[str, _SignIn] = {}

    def find(self, key: str | None) -> SessionRecord | None:
        """Return the session that a key names, and record that it was used.

        Returns
        -------
        SessionRecord or None
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
        return record

    def _create(self, account: str) -> tuple[str, str]:
        """Create a session of an account, and return its name and its key.

        Raises
        ------
        TooManySessionsError
            When the server holds ``MAX_SESSIONS`` sessions and each of them
            holds an Earthdata token, or a job, a layer or a series of its own.
        """
        earlier = self._store.sessions_of(account)
        for session in earlier[: max(0, len(earlier) - MAX_ACCOUNT_SESSIONS + 1)]:
            self.remove(session)
        if self._store.count_sessions() >= MAX_SESSIONS:
            free = [session for session in self._store.sessions_without_content() if session not in self._sign_ins]
            if not free:
                raise TooManySessionsError
            self.remove(free[0])
        session, key = secrets.token_hex(16), secrets.token_urlsafe(32)
        self._store.add_session(session, _digest(key), time.time(), account)
        return session, key

    def renew_key(self, session: str) -> str:
        """Give a session a new key, so that the key used before a sign-in names nothing."""
        key = secrets.token_urlsafe(32)
        self._store.set_key(session, _digest(key))
        return key

    def remove(self, session: str) -> None:
        """Forget the Earthdata token of a session and end the session. What its account holds stays."""
        with self._lock:
            self._sign_ins.pop(session, None)
        self._end(session)

    def remove_unused(self) -> None:
        """End the sessions that were not used for longer than ``SESSION_IDLE_TIME`` and forget expired tokens."""
        for session in self._store.sessions_unused_since(time.time() - SESSION_IDLE_TIME):
            self.remove(session)
        with self._lock:
            for session in list(self._sign_ins):
                self._current_sign_in(session)

    def sign_in(self, session: SessionRecord | None, token: str) -> tuple[str, str, EarthdataUser]:
        """Check an Earthdata token, and sign its user in.

        The session of the request is kept when it has no account or the account of the token: a
        session without an account, which a record file of an earlier version holds, receives the
        account, and the account receives what the session holds. A session of another account is
        ended, so that nothing of the first account passes to the second, and a new session is made,
        as it is for a request without a session. The session has a new key in every case.

        Parameters
        ----------
        session : SessionRecord or None
            The session of the request.
        token : str
            The Earthdata user token.

        Returns
        -------
        session : str
            Name of the session of the user inside the server.
        key : str
            New key of the session, for the cookie.
        user : EarthdataUser
            The user that the token names.

        Raises
        ------
        lynkeus.earthdata.TokenRefusedError
            When Earthdata Login does not accept the token. Nothing is changed then.
        lynkeus.earthdata.KeysUnavailableError
            When the token could not be checked. Nothing is changed then.
        TooManySessionsError
            When a session is needed and the server can hold no more.
        """
        user = self._checker.check(token)
        now = time.monotonic()
        with self._lock:
            if session is not None and session.account not in (None, user.name):
                self.remove(session.id)
                session = None
            if session is None:
                name, key = self._create(user.name)
            else:
                name = session.id
                if session.account is None:
                    self._store.give_to_account(name, user.name)
                key = self.renew_key(name)
            self._sign_ins[name] = _SignIn(user=user, token=token, start=now, used=now)
        return name, key, user

    def sign_out(self, session: SessionRecord) -> bool:
        """Forget the Earthdata token of a session and end the session. What its account holds stays.

        Returns
        -------
        bool
            False for a session without an account, in which no visitor is signed in. It is left as it
            is, because ending it would remove the layers that it holds itself.
        """
        if session.account is None:
            return False
        self.remove(session.id)
        return True

    def token(self, session: str) -> str | None:
        """Return the Earthdata token of a session, or None when the server does not hold it."""
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
