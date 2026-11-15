# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""The addresses of the sessions, the processes, the jobs, the layers, the series and the storage.

The processes and the jobs follow OGC API - Processes, Part 1: Core
(OGC 18-062r2), with the requirement classes Core, JSON, OGC Process
Description, Job list and Dismiss. Every process is executed
asynchronously: a request creates a job, and the result of the job is the
description of one layer or, for a process whose output is ``series``, the
description of one series. The files of a layer are served by the web server
of the site, not by these addresses. A series has no files.

A job runs on the project server or on an own server of the visitor
(``docs/Own_Servers.md``). The state of a job and every entry of the list of
layers name that server in the member ``server``, which is ``null`` for the
project server. The addresses of the own servers themselves are in
``lynkeus.server_routes``.

A visitor is known by his session, which a sign-in to Earthdata makes
(``lynkeus.sessions``). The jobs, the layers and the series belong to the
account of the session, so every browser that is signed in to the account
reaches them. No address other than the sign-in makes a session or sets a
cookie. A request whose cookie names no session is answered as a request of a
visitor who is not signed in, and the answer removes the cookie. The server
holds the Earthdata token for a shorter time than the session lasts. Without
the token everything works that sends no request to NASA, and the start of a
job that needs the token is answered with 401 and the sentence ``ENTER_AGAIN``
(``docs/Storage.md``).

An error is answered with the problem details of RFC 9457, as the standard
recommends. Their field ``detail`` holds one plain sentence for the visitor.
"""

import asyncio
import json
import logging
import os
import re
import signal
import tempfile
import threading
import time
from collections.abc import AsyncIterator, Callable, Iterator, Mapping, Sequence
from contextlib import asynccontextmanager, contextmanager
from datetime import UTC, datetime
from http import HTTPStatus
from pathlib import Path
from types import FrameType
from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, FastAPI, Request, Response
from fastapi.responses import JSONResponse

from lynkeus.earthdata import KEYS_ADDRESS, KeysUnavailableError, TokenChecker, TokenRefusedError
from lynkeus.jobs import Jobs, LimitError
from lynkeus.processes import CELLS_PARAMETER, JSON, OUTPUT, SERIES_OUTPUT, InputError, OutputName, Process
from lynkeus.references import Reader, UnreadableReferenceError, read_reference
from lynkeus.servers import SITE, ServerRefusedError, Servers, layer_cells, name_of
from lynkeus.sessions import COOKIE, COOKIE_PATH, SESSION_IDLE_TIME, Sessions, TooManySessionsError
from lynkeus.store import (
    Holder,
    JobRecord,
    LayerRecord,
    SeriesRecord,
    ServerJobRecord,
    ServerLayerRecord,
    ServerRecord,
    SessionRecord,
    Store,
)

FOLDER_SETTING = "LYNKEUS_DATA_FOLDER"
"""The environment variable that names the folder of the record file and of the files of the layers.

Without it the server uses a temporary folder, which is removed when the server stops.
"""

KEYS_SETTING = "LYNKEUS_EARTHDATA_KEYS"
"""The environment variable that gives another address of the public keys of Earthdata Login, for tests."""

COOKIE_SETTING = "LYNKEUS_COOKIE_SECURE"
"""The environment variable that, with the value ``false``, lets the cookie pass over plain HTTP, for tests."""

SITE_SETTING = "LYNKEUS_SITE"
"""The environment variable that gives another address of the site for the pairing of own servers, for tests."""

MAX_BODY_SIZE = 65536
"""The largest size of a request body, in bytes. An Earthdata token has about 1000 characters."""

MAX_TITLE_LENGTH = 200
"""The largest length of the title of a layer or of a series, in characters."""

DEFAULT_LIMIT = 100
"""The number of processes or jobs in one answer when the request names none."""

MAX_LIMIT = 1000
"""The largest number of processes or jobs in one answer."""

REMOVAL_PAUSE = 300.0
"""The time between two removal runs, in seconds.

A removal run ends the sessions that were not used for the keeping time, and removes the layers and the
series that have passed the moment until which they are kept, and the records of the failed and of the
dismissed jobs that ended more than the keeping time ago.
"""

PROBLEM = "application/problem+json"
"""The media type of an error answer (RFC 9457)."""

SIGN_IN_NEEDED = "Sign in to Earthdata to start this job."
"""The sentence of the answer 401 to a visitor who is not signed in and starts a job."""

ENTER_AGAIN = "Enter your Earthdata token again to start this job, because the server no longer holds it."
"""The sentence of the answer 401 to a signed-in visitor whose token is not held, for a job that needs it."""

NO_LAYER = "You have no layer of this name."
NO_SERIES = "You have no series of this name."

STORAGE_NEEDS_SIGN_IN = "Sign in to Earthdata to keep or remove what the project server keeps for your account."
"""The sentence of the answer 401 of the addresses under ``/api/storage`` to a visitor who is not signed in."""

CONFORMANCE = (
    "http://www.opengis.net/spec/ogcapi-processes-1/1.0/conf/core",
    "http://www.opengis.net/spec/ogcapi-processes-1/1.0/conf/json",
    "http://www.opengis.net/spec/ogcapi-processes-1/1.0/conf/ogc-process-description",
    "http://www.opengis.net/spec/ogcapi-processes-1/1.0/conf/job-list",
    "http://www.opengis.net/spec/ogcapi-processes-1/1.0/conf/dismiss",
)
"""The conformance classes of OGC API - Processes, Part 1, that the server implements."""

_RELATION = "http://www.opengis.net/def/rel/ogc/1.0/"
_EXCEPTION = "http://www.opengis.net/def/exceptions/ogcapi-processes-1/1.0/"
_SIGN_IN = {"WWW-Authenticate": 'Bearer realm="Earthdata Login"'}
_SERVER = re.compile(r"^(project|[0-9a-f]{16})$")

type Link = dict[str, str]

logger = logging.getLogger(__name__)


class RefusedError(Exception):
    """A request that the server does not carry out.

    Parameters
    ----------
    status : http.HTTPStatus
        Status code of the answer.
    detail : str
        One plain sentence for the visitor.
    kind : str
        Address that names the kind of the error (field ``type`` of RFC 9457).
    headers : mapping of str to str, optional
        Headers of the answer.
    """

    def __init__(
        self, status: HTTPStatus, detail: str, kind: str = "about:blank", headers: Mapping[str, str] | None = None
    ) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail
        self.kind = kind
        self.headers = dict(headers or {})


class Service:
    """The parts that the addresses use: the store, the sessions, the jobs and the processes.

    Parameters
    ----------
    folder : pathlib.Path
        Folder of the record file ``lynkeus.sqlite3`` and of the folder ``files`` with the files of the layers.
    processes : sequence of Process
        The processes that the server offers.
    keys_address : str
        Address of the public keys of Earthdata Login.
    secure_cookie : bool
        Whether the browser may send the cookie over HTTPS only.
    read : callable
        Returns the JSON value at the address of a link.
    site : str
        Address of the site, at which a visitor confirms the pairing of an own server.
    """

    def __init__(
        self,
        folder: Path,
        processes: Sequence[Process[Any]],
        keys_address: str,
        secure_cookie: bool,
        read: Reader,
        site: str = SITE,
    ) -> None:
        self.processes = {process.id: process for process in processes}
        if len(self.processes) != len(processes):
            raise ValueError("two processes have the same name")
        self.secure_cookie = secure_cookie
        self.read = read
        self.folder = folder
        files = folder / "files"
        files.mkdir(parents=True, exist_ok=True)
        self.store = Store(folder / "lynkeus.sqlite3")
        self.jobs = Jobs(self.store, files, self.processes)
        self.servers = Servers(self.store, site)
        self.sessions = Sessions(self.store, TokenChecker(keys_address), self.jobs.end_session)
        self._stop = threading.Event()
        self._remover = threading.Thread(target=self._remove_unused, name="lynkeus-removal", daemon=True)

    def start(self) -> None:
        """Bring the record in order after a stop of the server, and start the removal runs."""
        self.jobs.start()
        self.servers.start()
        self._remover.start()

    def stop(self) -> None:
        """End the running jobs and close the record."""
        self._stop.set()
        self._remover.join()
        self.jobs.stop()
        self.store.close()

    def remove_passed(self) -> None:
        """Carry out one removal run (``REMOVAL_PAUSE``)."""
        self.sessions.remove_unused()
        self.jobs.remove_passed()

    def _remove_unused(self) -> None:
        while True:
            try:
                self.remove_passed()
            except Exception:
                # The next run tries again: one fault must not end the removal for as long as the service runs.
                logger.exception("A removal run failed.")
            if self._stop.wait(REMOVAL_PAUSE):
                return


@contextmanager
def stop_signals(action: Callable[[], None]) -> Iterator[None]:
    """Call ``action`` when the process is told to stop, before the web server learns of it.

    The web server learns of a stop through the signals SIGINT and SIGTERM. It then takes no new
    request and waits until the open ones are answered. A question of an own server for tasks stays
    open for up to 25 seconds, so ``action`` ends such requests first, and the handler that the web
    server had set is called after it. Python handles a signal in the main thread only: in another
    thread, as in a test that runs the service beside itself, nothing is set.
    """
    if threading.current_thread() is not threading.main_thread():
        yield
        return
    earlier: dict[int, Any] = {}

    def stop(number: int, frame: FrameType | None) -> None:
        action()
        handler = earlier[number]
        if callable(handler):
            handler(number, frame)
        elif handler == signal.SIG_DFL:
            # No handler was set: the signal ends the process, as it would have without this function.
            signal.signal(number, signal.SIG_DFL)
            signal.raise_signal(number)

    for sign in (signal.SIGINT, signal.SIGTERM):
        earlier[sign] = signal.signal(sign, stop)
    try:
        yield
    finally:
        for number, handler in earlier.items():
            if signal.getsignal(number) is stop and handler is not None:
                signal.signal(number, handler)


def _service(request: Request) -> Service:
    service: Service = request.app.state.lynkeus
    return service


def _answer(
    request: Request, content: object, status: int = HTTPStatus.OK, headers: Mapping[str, str] | None = None
) -> Response:
    """Return a JSON answer, which sets or removes the cookie of the session when the request changed it.

    The cookie is set when the session received a key during the request. It is removed when the
    request carried a key that names no session, or that named the session which the request ended.
    """
    kind = PROBLEM if status >= HTTPStatus.BAD_REQUEST else JSON
    if content is None:
        response = Response(status_code=status, headers=dict(headers or {}))
    else:
        response = JSONResponse(content, status, dict(headers or {}), kind)
    key = getattr(request.state, "session_key", None)
    if key is not None:
        response.set_cookie(
            COOKIE,
            key,
            max_age=int(SESSION_IDLE_TIME),
            path=COOKIE_PATH,
            secure=_service(request).secure_cookie,
            httponly=True,
            samesite="strict",
        )
    elif getattr(request.state, "ended_key", False):
        response.delete_cookie(
            COOKIE,
            path=COOKIE_PATH,
            secure=_service(request).secure_cookie,
            httponly=True,
            samesite="strict",
        )
    return response


def _refused(request: Request, refusal: Exception) -> Response:
    """Return the answer to a refused request, as problem details."""
    if not isinstance(refusal, RefusedError):
        raise refusal
    status = HTTPStatus(refusal.status)
    problem = {"type": refusal.kind, "title": status.phrase, "status": status.value, "detail": refusal.detail}
    return _answer(request, problem, status, refusal.headers)


def session_of(request: Request) -> SessionRecord | None:
    """Return the session of a request, or None when the request names none.

    The session is looked up once for a request. A key that names no session is noted, so that the
    answer removes the cookie.
    """
    state = request.state
    if not hasattr(state, "session"):
        key = request.cookies.get(COOKIE)
        state.session = _service(request).sessions.find(key)
        state.ended_key = key is not None and state.session is None
    found: SessionRecord | None = state.session
    return found


def account_of(request: Request) -> str | None:
    """Return the account of a request: the name of the Earthdata user, or None when the visitor is not signed in.

    The account is known for as long as the session lasts, also while the server does not hold the token.
    """
    session = session_of(request)
    return session.account if session else None


def _holder(request: Request) -> Holder | None:
    """Return who holds the jobs, the layers and the series of a request, or None for a request without a session.

    It is the account of the session. A session without an account, which a record file of an earlier
    version holds, holds its content itself until its next sign-in.
    """
    session = session_of(request)
    if session is None:
        return None
    return Holder(account=session.account) if session.account else Holder(session=session.id)


def _own_servers(request: Request) -> dict[str, ServerRecord]:
    """Return the own servers of the account of a request, by name."""
    account = account_of(request)
    return {server.id: server for server in _service(request).store.servers_of(account)} if account else {}


def _with_cells(described: dict[str, Any], cells: int) -> dict[str, Any]:
    """Return the description of a process with the most cells of a layer of an own server.

    A description that does not state the most cells of a layer is returned as it is.
    """
    parameters = described.get("additionalParameters", {}).get("parameters", [])
    if not any(parameter["name"] == CELLS_PARAMETER for parameter in parameters):
        return described
    changed = [
        {**parameter, "value": [cells]} if parameter["name"] == CELLS_PARAMETER else parameter
        for parameter in parameters
    ]
    return {**described, "additionalParameters": {"parameters": changed}}


def refusal_of(refusal: ServerRefusedError) -> RefusedError:
    """Return the answer to a request that an own server, or the rules of the own servers, do not allow."""
    headers = {"Retry-After": str(refusal.wait)} if refusal.wait else {}
    return RefusedError(refusal.status, str(refusal), headers=headers)


async def _body(request: Request) -> dict[str, Any]:
    """Return the JSON object of a request body of at most ``MAX_BODY_SIZE`` bytes."""
    if request.headers.get("content-type", "").split(";")[0].strip().lower() != JSON:
        raise RefusedError(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, f"The request body must be of the type {JSON}.")
    too_large = RefusedError(HTTPStatus.CONTENT_TOO_LARGE, f"The request body is larger than {MAX_BODY_SIZE} bytes.")
    declared = request.headers.get("content-length", "0")
    if not _is_whole(declared) or int(declared) > MAX_BODY_SIZE:
        raise too_large
    text = bytearray()
    async for part in request.stream():
        text += part
        if len(text) > MAX_BODY_SIZE:
            raise too_large
    try:
        body = json.loads(text)
    except ValueError:
        raise RefusedError(HTTPStatus.BAD_REQUEST, "The request body is not valid JSON.") from None
    if not isinstance(body, dict):
        raise RefusedError(HTTPStatus.BAD_REQUEST, "The request body must be a JSON object.")
    return body


def _is_whole(text: str) -> bool:
    """Tell whether a text is a whole number written with the digits 0 to 9."""
    return text.isascii() and text.isdigit()


def _number(request: Request, name: str, default: int, least: int, most: int) -> int:
    """Return a whole number of the address, not larger than ``most``."""
    text = request.query_params.get(name)
    if text is None:
        return default
    if not _is_whole(text) or int(text) < least:
        raise RefusedError(HTTPStatus.BAD_REQUEST, f"The parameter {name} must be a whole number of at least {least}.")
    return min(int(text), most)


def _values(request: Request, name: str) -> list[str] | None:
    """Return the values of a parameter that takes a list, or None when the address does not hold it."""
    given = request.query_params.getlist(name)
    return [value for text in given for value in text.split(",") if value] if given else None


def _link(address: str, relation: str, title: str, kind: str = JSON) -> Link:
    return {"href": address, "rel": relation, "type": kind, "title": title}


def _link_header(links: Sequence[Link]) -> dict[str, str]:
    """Return the links of an answer as a Link header (RFC 8288)."""
    return {"Link": ", ".join(f'<{link["href"]}>; rel="{link["rel"]}"; type="{link["type"]}"' for link in links)}


def _page(request: Request, items: Sequence[Any], title: str) -> tuple[Sequence[Any], list[Link]]:
    """Return the items of one page, with the links to this page and to its neighbours."""
    limit = _number(request, "limit", DEFAULT_LIMIT, 1, MAX_LIMIT)
    offset = _number(request, "offset", 0, 0, len(items))
    others = [(name, value) for name, value in request.query_params.multi_items() if name not in ("limit", "offset")]

    def address(start: int) -> str:
        return f"{request.url.path}?{urlencode([*others, ('limit', limit), ('offset', start)], safe=',:/')}"

    links = [_link(address(offset), "self", title)]
    if offset + limit < len(items):
        links.append(_link(address(offset + limit), "next", "Next page"))
    if offset > 0:
        links.append(_link(address(max(0, offset - limit)), "prev", "Previous page"))
    return items[offset : offset + limit], links


def _time(seconds: float) -> str:
    """Return a time as a date-time of RFC 3339, in Coordinated Universal Time."""
    return datetime.fromtimestamp(int(seconds), UTC).isoformat().replace("+00:00", "Z")


def _status_info(
    job: JobRecord | ServerJobRecord, server: ServerRecord | None = None, output: OutputName = OUTPUT
) -> dict[str, Any]:
    """Return the state of a job (statusInfo.yaml).

    Four fields are added to those of the standard: ``title`` names the job
    for the visitor, ``inputs`` holds the inputs with which the job was
    started, ``layer`` holds the name of the layer of a successful job, and
    ``server`` names the own server on which the job runs, or is ``null``
    for the project server. A successful job of a process whose output is
    ``series`` has the field ``series``, with the name of its series, in the
    place of ``layer``.

    Parameters
    ----------
    job : JobRecord or ServerJobRecord
        The job.
    server : ServerRecord or None
        The own server on which the job runs, or None for the project server.
    output : {"layer", "series"}
        Name of the one output of the process of the job.
    """
    address = f"/api/jobs/{job.id}"
    if job.status == "dismissed":
        links = [_link("/api/jobs", "up", "Jobs of the account")]
    else:
        links = [_link(address, "self", "State of the job")]
        if job.status == "successful":
            links.append(_link(f"{address}/results", f"{_RELATION}results", "Results of the job"))
    times = {"started": job.started, "finished": job.finished}
    return {
        "processID": job.process,
        "type": "process",
        "jobID": job.id,
        "title": job.title,
        "status": job.status,
        "message": job.message,
        "created": _time(job.created),
        **{name: _time(value) for name, value in times.items() if value is not None},
        "updated": _time(job.updated),
        "progress": job.progress,
        "inputs": json.loads(job.inputs),
        **({output: job.layer} if job.status == "successful" and job.layer else {}),
        "server": _server_name(server),
        "links": links,
    }


def _server_name(server: ServerRecord | None) -> dict[str, str] | None:
    """Return the member ``server`` of a job or of a layer: ``null`` for the project server."""
    return None if server is None else name_of(server).model_dump()


def _kept_until(moment: float | None) -> str | None:
    """Return the moment until which a layer or a series is kept, or None when it is kept without an end."""
    return None if moment is None else _time(moment)


def _layer_entry(layer: LayerRecord | ServerLayerRecord, server: ServerRecord | None = None) -> dict[str, Any]:
    """Return a layer of a visitor.

    The entry holds the description of the layer, the size of its files, its time of creation, its
    server, the moment until which the project server keeps it and the request that made it. The
    member ``kept_until`` is ``null`` for a layer of an own server, which that server keeps without
    an end. The member ``source`` is ``{"process": ..., "inputs": {...}}``: the name of the process and
    the inputs of the job that made the layer, with which the same request can be sent again. It is
    ``null`` when the record does not hold them.
    """
    return {
        "layer": json.loads(layer.description),
        "size": layer.size,
        "created": _time(layer.created),
        "server": _server_name(server),
        "kept_until": _kept_until(layer.kept_until) if isinstance(layer, LayerRecord) else None,
        "source": json.loads(layer.source) if layer.source is not None else None,
    }


def _series_entry(series: SeriesRecord) -> dict[str, Any]:
    """Return a series of a visitor: its description, its time of creation and the moment until which it is kept."""
    return {
        "series": json.loads(series.description),
        "created": _time(series.created),
        "kept_until": _kept_until(series.kept_until),
    }


def _instant(text: str) -> float:
    """Return a date-time of RFC 3339 in seconds since 1 January 1970 (UTC)."""
    try:
        instant = datetime.fromisoformat(text)
    except ValueError:
        instant = None
    if instant is None or instant.tzinfo is None or "T" not in text.upper():
        detail = "The parameter datetime must be a date-time such as 2026-11-14T12:00:00Z, or two with a slash between."
        raise RefusedError(HTTPStatus.BAD_REQUEST, detail)
    return instant.timestamp()


def _selected_jobs(request: Request, jobs: Sequence[JobRecord | ServerJobRecord]) -> list[JobRecord | ServerJobRecord]:
    """Return the jobs that the parameters of the address select (clause 11.2 of the standard)."""
    kinds, processes, states = _values(request, "type"), _values(request, "processID"), _values(request, "status")
    shortest, longest = _values(request, "minDuration"), _values(request, "maxDuration")
    for durations in (shortest, longest):
        if durations is not None and not all(_is_whole(text) for text in durations):
            raise RefusedError(
                HTTPStatus.BAD_REQUEST, "The parameters minDuration and maxDuration must be whole numbers of seconds."
            )
    start, end = float("-inf"), float("inf")
    period = request.query_params.get("datetime")
    if period is not None:
        first, slash, last = period.partition("/")
        if not slash:
            start = end = _instant(first)
        else:
            start = start if first in ("", "..") else _instant(first)
            end = end if last in ("", "..") else _instant(last)
    now = time.time()
    selected = []
    for job in jobs:
        if kinds is not None and "process" not in kinds:
            continue
        if processes is not None and job.process not in processes:
            continue
        if states is not None and job.status not in states:
            continue
        if not start <= int(job.created) <= end:
            continue
        if shortest is not None or longest is not None:
            # A job that has not started has no duration (requirement 75, parts E to G).
            if job.started is None:
                continue
            duration = (job.finished or now) - job.started
            if shortest is not None and duration < max(int(text) for text in shortest):
                continue
            if longest is not None and duration > min(int(text) for text in longest):
                continue
        selected.append(job)
    return selected


def install(
    app: FastAPI,
    processes: Sequence[Process[Any]] = (),
    *,
    folder: Path | None = None,
    keys_address: str | None = None,
    secure_cookie: bool | None = None,
    read: Reader = read_reference,
    site: str | None = None,
) -> None:
    """Add the addresses of the sessions, the processes, the jobs, the layers and the series to the web service.

    Parameters
    ----------
    app : fastapi.FastAPI
        The web service.
    processes : sequence of Process
        The processes that the server offers.
    folder : pathlib.Path, optional
        Folder of the record file and of the files of the layers. Without it,
        the folder that the environment variable ``LYNKEUS_DATA_FOLDER`` names,
        or a temporary folder.
    keys_address : str, optional
        Address of the public keys of Earthdata Login. Without it, the address
        in the environment variable ``LYNKEUS_EARTHDATA_KEYS``, or the address
        of Earthdata Login.
    secure_cookie : bool, optional
        Whether the browser may send the cookie over HTTPS only. Without it,
        true unless the environment variable ``LYNKEUS_COOKIE_SECURE`` is ``false``.
    read : callable
        Returns the JSON value at the address of a link that a request gives as an input value.
    site : str, optional
        Address of the site, at which a visitor confirms the pairing of an own server. Without it, the
        address in the environment variable ``LYNKEUS_SITE``, or ``https://lynkeus.nkua.cloud``.
    """

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        with tempfile.TemporaryDirectory(prefix="lynkeus-") as temporary:
            named = os.environ.get(FOLDER_SETTING)
            service = Service(
                folder=folder or Path(named or temporary),
                processes=processes,
                keys_address=keys_address or os.environ.get(KEYS_SETTING) or KEYS_ADDRESS,
                secure_cookie=os.environ.get(COOKIE_SETTING, "true") != "false"
                if secure_cookie is None
                else secure_cookie,
                read=read,
                site=site or os.environ.get(SITE_SETTING) or SITE,
            )
            service.start()
            app.state.lynkeus = service
            try:
                with stop_signals(service.servers.stop):
                    yield
            finally:
                await asyncio.to_thread(service.stop)

    router = APIRouter(prefix="/api", lifespan=lifespan)

    def session_state(request: Request, session: SessionRecord | None) -> dict[str, Any]:
        """Return the sign-in state of a session (``docs/Storage.md``, Sign-in states)."""
        if session is None or session.account is None:
            return {"earthdata": None}
        held = _service(request).sessions.token(session.id) is not None
        return {"earthdata": {"user": session.account, "token": held}}

    @router.get("/session")
    def session(request: Request) -> Response:
        """Report whether the visitor is signed in to Earthdata, and whether the server holds his token.

        The address makes no session. A visitor who is not signed in receives no cookie.
        """
        found = session_of(request)
        if found is not None:
            # The cookie is sent again, so that its time starts again with every opening of the page.
            request.state.session_key = request.cookies[COOKIE]
        return _answer(request, session_state(request, found))

    @router.post("/session/earthdata")
    async def sign_in(request: Request) -> Response:
        """Sign the visitor in to Earthdata with a user token.

        The sign-in makes the session when the request names none, and records the account. A session
        without an account gives what it holds to the account. A sign-in as another account ends the
        session of the first (``lynkeus.sessions.Sessions.sign_in``).
        """
        body = await _body(request)
        token = body.get("token")
        if set(body) != {"token"} or not isinstance(token, str):
            raise RefusedError(
                HTTPStatus.BAD_REQUEST, 'The request body must be {"token": "..."} with an Earthdata Login user token.'
            )
        sessions = _service(request).sessions
        try:
            _, key, user = await asyncio.to_thread(sessions.sign_in, session_of(request), token.strip())
        except TokenRefusedError:
            detail = (
                "Earthdata Login does not accept this token. Check that the whole token was copied and has not expired."
            )
            raise RefusedError(HTTPStatus.UNAUTHORIZED, detail, headers=_SIGN_IN) from None
        except KeysUnavailableError as error:
            detail = "Earthdata Login did not answer, so the token could not be checked. Try again in a few minutes."
            raise RefusedError(HTTPStatus.BAD_GATEWAY, detail) from error
        except TooManySessionsError as error:
            detail = "The server holds the largest number of sessions at present. Try again in a few minutes."
            raise RefusedError(HTTPStatus.SERVICE_UNAVAILABLE, detail, headers={"Retry-After": "300"}) from error
        request.state.session_key = key
        return _answer(request, {"earthdata": {"user": user.name, "token": True}})

    @router.delete("/session/earthdata")
    def sign_out(request: Request) -> Response:
        """Sign the visitor out of Earthdata.

        The server forgets the token and ends the session, and the answer removes the cookie. What the
        account keeps on the project server stays until its date.
        """
        found = session_of(request)
        if found is not None and _service(request).sessions.sign_out(found):
            request.state.ended_key = True
        return _answer(request, None, HTTPStatus.NO_CONTENT)

    @router.get("")
    @router.get("/")
    def landing_page(request: Request) -> Response:
        """Return the landing page of OGC API - Processes, with the links to the other addresses."""
        links = [
            _link("/api/", "self", "This document"),
            _link("/api/openapi.json", "service-desc", "Definition of the addresses, in the form of OpenAPI"),
            _link("/api/conformance", f"{_RELATION}conformance", "Conformance classes that the server implements"),
            _link("/api/processes", f"{_RELATION}processes", "Processes that the server offers"),
            _link("/api/jobs", f"{_RELATION}job-list", "Jobs of the account"),
        ]
        description = "Receives layers of NISAR products from NASA and runs analysis tools on them, as jobs."
        return _answer(
            request, {"title": "Lynkeus", "description": description, "links": links}, headers=_link_header(links)
        )

    @router.get("/conformance")
    def conformance(request: Request) -> Response:
        """Return the conformance classes of OGC API - Processes that the server implements."""
        return _answer(request, {"conformsTo": list(CONFORMANCE)})

    def process_of(request: Request, name: str) -> Process[Any]:
        process = _service(request).processes.get(name)
        if process is None:
            raise RefusedError(
                HTTPStatus.NOT_FOUND, "The server offers no process of this name.", f"{_EXCEPTION}no-such-process"
            )
        return process

    def process_links(name: str) -> list[Link]:
        address = f"/api/processes/{name}"
        return [
            _link(address, "self", "Description of the process"),
            _link(f"{address}/execution", f"{_RELATION}execute", "Execution of the process"),
        ]

    @router.get("/processes")
    def process_list(request: Request) -> Response:
        """Return the summaries of the processes that the server offers."""
        processes, links = _page(
            request, list(_service(request).processes.values()), "Processes that the server offers"
        )
        summaries = [{**process.summary(), "links": process_links(process.id)} for process in processes]
        return _answer(request, {"processes": summaries, "links": links}, headers=_link_header(links))

    def wanted_server(request: Request) -> str | None:
        """Return the parameter ``server`` of the address: the name of an own server, ``project``, or None."""
        wanted = request.query_params.get("server")
        if wanted is not None and not _SERVER.fullmatch(wanted):
            detail = "The parameter server must be the name of one of your servers or the word project."
            raise RefusedError(HTTPStatus.BAD_REQUEST, detail)
        return wanted

    @router.get("/processes/{name}")
    def process_description(request: Request, name: str) -> Response:
        """Return the description of a process, with its inputs and its output.

        The parameter ``most-cells`` of a description is the number of the project server. With the
        parameter ``server`` of the address, which names an own server of the visitor, it is the limit
        on the cells of a layer that this server last reported, because the number of the project
        server does not apply to a job of an own server.
        """
        links = process_links(name)
        described = process_of(request, name).describe()
        wanted = wanted_server(request)
        if wanted is not None and wanted != "project":
            server = _service(request).servers.owned(account_of(request), wanted)
            if server is None:
                raise RefusedError(HTTPStatus.NOT_FOUND, "You have no server of this name.")
            described = _with_cells(described, layer_cells(server))
        return _answer(request, {**described, "links": links}, headers=_link_header(links))

    @router.post("/processes/{name}/execution")
    async def execution(request: Request, name: str) -> Response:
        """Create a job that runs a process with the inputs of the request.

        The parameter ``server`` of the address is the name of an own server of the visitor, the word
        ``project``, or absent. When it is absent, the job goes to the connected own server of the
        visitor with the fewest unfinished jobs that keeps every input layer, and to the project
        server when there is none. The limits of the project server are applied to its own jobs only:
        the inputs of a job of an own server are checked against their format here, and the limit on
        the cells of a layer is applied by the server that runs the job.

        A job belongs to the account of the visitor, so a visitor who is not signed in is answered
        with 401. A process that needs Earthdata is answered with 401 and the sentence
        ``ENTER_AGAIN`` while the server does not hold the token of the signed-in visitor; a process
        that sends no request to NASA starts without the token.
        """
        service = _service(request)
        process = process_of(request, name)
        wanted = wanted_server(request)
        body = await _body(request)
        form = body.get("response", "raw")
        if not set(body) <= {"inputs", "outputs", "response", "subscriber"} or form not in ("raw", "document"):
            detail = "The request body holds the fields inputs, outputs, response and subscriber only."
            detail += ' The field response is "raw" or "document".'
            raise RefusedError(HTTPStatus.BAD_REQUEST, detail)
        output = process.output
        outputs = body.get("outputs", {output: {}})
        if not isinstance(outputs, dict) or set(outputs) != {output} or not isinstance(outputs[output], dict):
            raise RefusedError(
                HTTPStatus.BAD_REQUEST,
                f"The field outputs, when given, must name the one output of the process, which is {output}.",
            )
        chosen = outputs[output]
        if chosen.get("transmissionMode", "value") != "value" or chosen.get("format", {"mediaType": JSON}) != {
            "mediaType": JSON
        }:
            raise RefusedError(HTTPStatus.BAD_REQUEST, f"The output {output} is given by value only, as {JSON}.")
        try:
            inputs = await asyncio.to_thread(process.read_inputs, body.get("inputs", {}), service.read)
        except (InputError, UnreadableReferenceError) as error:
            raise RefusedError(HTTPStatus.BAD_REQUEST, str(error)) from None
        session, holder = session_of(request), _holder(request)
        if session is None or holder is None:
            raise RefusedError(HTTPStatus.UNAUTHORIZED, SIGN_IN_NEEDED, headers=_SIGN_IN)
        token = None
        if process.needs_earthdata:
            token = service.sessions.token(session.id)
            if token is None:
                detail = SIGN_IN_NEEDED if session.account is None else ENTER_AGAIN
                raise RefusedError(HTTPStatus.UNAUTHORIZED, detail, headers=_SIGN_IN)
        if output == SERIES_OUTPUT:
            # A report of an own server carries the description of a layer and no other result
            # (lynkeus.linking.JobState), so a series is computed on the project server, from its layers.
            if wanted not in (None, "project"):
                detail = "A series is computed on the project server only, so the parameter server must be absent"
                raise RefusedError(HTTPStatus.UNPROCESSABLE_CONTENT, f"{detail} or the word project.")
            wanted = "project"
        kept = [layer.id for layer in service.store.layers_of(holder)]
        job: JobRecord | ServerJobRecord
        try:
            own = service.servers.place(session.account, wanted, process.layers(inputs), kept, time.time())
            if own is not None:
                job = service.servers.submit(own, process, inputs, form, token)
        except ServerRefusedError as error:
            raise refusal_of(error) from None
        if own is None:
            try:
                job = service.jobs.submit(holder, process, inputs, form, token)
            except LimitError as error:
                headers = {"Retry-After": str(error.wait)} if error.wait else {}
                raise RefusedError(error.status, str(error), headers=headers) from None
        headers = {"Location": f"/api/jobs/{job.id}"}
        preferences = {part.split(";")[0].strip().lower() for part in request.headers.get("prefer", "").split(",")}
        if "respond-async" in preferences:
            headers["Preference-Applied"] = "respond-async"
        return _answer(request, _status_info(job, own, output), HTTPStatus.CREATED, headers)

    def output_of(request: Request, job: JobRecord | ServerJobRecord) -> OutputName:
        """Return the name of the one output of the process of a job."""
        process = _service(request).processes.get(job.process)
        return process.output if process is not None else OUTPUT

    def job_of(request: Request, name: str) -> tuple[JobRecord | ServerJobRecord, ServerRecord | None]:
        """Return a job of the visitor of the request, and its own server when it runs on one.

        A job of the project server belongs to the account that started it, and a job of an own server
        to the account that owns that server. Any other job counts as a job that does not exist.
        """
        service = _service(request)
        holder = _holder(request)
        found: tuple[JobRecord | ServerJobRecord, ServerRecord | None] | None = None
        job = service.store.job(name)
        if holder is not None and job is not None and job.holder == holder:
            found = job, None
        else:
            sent = service.store.server_job(name)
            server = service.servers.owned(account_of(request), sent.server) if sent is not None else None
            if sent is not None and server is not None:
                found = sent, server
        if found is None:
            raise RefusedError(HTTPStatus.NOT_FOUND, "You have no job of this name.", f"{_EXCEPTION}no-such-job")
        if found[0].status == "dismissed":
            raise RefusedError(HTTPStatus.GONE, "The job was dismissed.")
        return found

    @router.get("/jobs")
    def job_list(request: Request) -> Response:
        """Return the jobs of the account and of its own servers, the newest first."""
        store = _service(request).store
        holder = _holder(request)
        own = _own_servers(request)
        jobs: list[JobRecord | ServerJobRecord] = [*(store.jobs_of(holder) if holder else [])]
        for server in own:
            jobs += store.server_jobs_of(server)
        jobs.sort(key=lambda job: job.created, reverse=True)
        page, links = _page(request, _selected_jobs(request, jobs), "Jobs of the account")
        infos = [
            _status_info(job, own[job.server] if isinstance(job, ServerJobRecord) else None, output_of(request, job))
            for job in page
        ]
        return _answer(request, {"jobs": infos, "links": links}, headers=_link_header(links))

    @router.get("/jobs/{name}")
    def job_status(request: Request, name: str) -> Response:
        """Return the state of a job."""
        job, server = job_of(request, name)
        info = _status_info(job, server, output_of(request, job))
        return _answer(request, info, headers=_link_header(info["links"]))

    @router.get("/jobs/{name}/results")
    def job_results(request: Request, name: str) -> Response:
        """Return the description of the layer, or of the series, that a successful job produced."""
        job, _ = job_of(request, name)
        if job.status in ("accepted", "running"):
            raise RefusedError(HTTPStatus.NOT_FOUND, "The job has not finished yet.", f"{_EXCEPTION}result-not-ready")
        if job.status == "failed":
            raise RefusedError(HTTPStatus.INTERNAL_SERVER_ERROR, job.message)
        output, store = output_of(request, job), _service(request).store
        result: LayerRecord | ServerLayerRecord | SeriesRecord | None
        if isinstance(job, ServerJobRecord):
            result = store.server_layer(job.server, job.layer or "")
        elif output == SERIES_OUTPUT:
            result = store.series(job.layer or "")
        else:
            result = store.layer(job.layer or "")
        if result is None:
            raise RefusedError(HTTPStatus.GONE, f"The {output} of this job was removed.")
        description = json.loads(result.description)
        return _answer(request, description if job.response == "raw" else {output: {"value": description}})

    @router.delete("/jobs/{name}")
    async def job_dismissal(request: Request, name: str) -> Response:
        """End a job that waits or runs, or remove the record of a finished job.

        A job of an own server is recorded as dismissed at once, and the server receives the task to end it.
        """
        job, server = job_of(request, name)
        if isinstance(job, ServerJobRecord):
            return _answer(request, _status_info(_service(request).servers.dismiss(job), server))
        dismissed = await asyncio.to_thread(_service(request).jobs.dismiss, job)
        return _answer(request, _status_info(dismissed, None, output_of(request, dismissed)))

    @router.get("/layers")
    def layer_list(request: Request) -> Response:
        """Return the layers of the visitor, the newest first.

        They are the layers of the account, which the project server keeps, and the layers that the
        own servers of the account keep. Each entry holds the description of the layer, the size of
        its files, its time of creation, its server, the moment until which it is kept and the request
        that made it (``_layer_entry``).
        """
        store = _service(request).store
        holder, account, own = _holder(request), account_of(request), _own_servers(request)
        entries = [(layer.created, _layer_entry(layer)) for layer in (store.layers_of(holder) if holder else [])]
        for kept in store.server_layers_of(account) if account else []:
            entries.append((kept.created, _layer_entry(kept, own[kept.server])))
        entries.sort(key=lambda entry: entry[0], reverse=True)
        return _answer(request, {"layers": [entry for _, entry in entries]})

    @router.patch("/layers/{name}")
    async def layer_renaming(request: Request, name: str) -> Response:
        """Give a layer of the visitor a new title. A layer of an own server is renamed by that server."""
        body = await _body(request)
        title = body.get("title")
        if set(body) != {"title"} or not isinstance(title, str) or not 0 < len(title.strip()) <= MAX_TITLE_LENGTH:
            detail = f'The request body must be {{"title": "..."}} with a title of 1 to {MAX_TITLE_LENGTH} characters.'
            raise RefusedError(HTTPStatus.BAD_REQUEST, detail)
        service = _service(request)
        holder = _holder(request)
        layer = service.jobs.rename_layer(holder, name, title.strip()) if holder else None
        if layer is not None:
            return _answer(request, _layer_entry(layer))
        kept = service.servers.layer_of(account_of(request), name)
        if kept is None:
            raise RefusedError(HTTPStatus.NOT_FOUND, NO_LAYER)
        try:
            return _answer(request, _layer_entry(await service.servers.rename_layer(*kept, title.strip()), kept[0]))
        except ServerRefusedError as error:
            raise refusal_of(error) from None

    @router.delete("/layers/{name}")
    async def layer_removal(request: Request, name: str) -> Response:
        """Remove a layer of the visitor with its files. An own server deletes the files of a layer that it keeps."""
        service = _service(request)
        holder = _holder(request)
        if holder is not None and await asyncio.to_thread(service.jobs.remove_layer, holder, name):
            return _answer(request, None, HTTPStatus.NO_CONTENT)
        kept = service.servers.layer_of(account_of(request), name)
        if kept is None:
            raise RefusedError(HTTPStatus.NOT_FOUND, NO_LAYER)
        try:
            await service.servers.remove_layer(*kept)
        except ServerRefusedError as error:
            raise refusal_of(error) from None
        return _answer(request, None, HTTPStatus.NO_CONTENT)

    @router.post("/layers/{name}/extension")
    def layer_extension(request: Request, name: str) -> Response:
        """Keep a layer of the visitor for the keeping time from now, and return its entry.

        A layer of an own server is kept by that server without an end, so its entry is returned as it is.
        """
        service = _service(request)
        holder = _holder(request)
        layer = service.jobs.keep_layer(holder, name) if holder else None
        if layer is not None:
            return _answer(request, _layer_entry(layer))
        kept = service.servers.layer_of(account_of(request), name)
        if kept is None:
            raise RefusedError(HTTPStatus.NOT_FOUND, NO_LAYER)
        return _answer(request, _layer_entry(kept[1], kept[0]))

    @router.get("/series")
    def series_list(request: Request) -> Response:
        """Return the series of the account, the newest first (``_series_entry``)."""
        holder = _holder(request)
        series = _service(request).store.series_of(holder) if holder else []
        return _answer(request, {"series": [_series_entry(entry) for entry in series]})

    @router.patch("/series/{name}")
    async def series_renaming(request: Request, name: str) -> Response:
        """Give a series of the account a new title."""
        body = await _body(request)
        title = body.get("title")
        if set(body) != {"title"} or not isinstance(title, str) or not 0 < len(title.strip()) <= MAX_TITLE_LENGTH:
            detail = f'The request body must be {{"title": "..."}} with a title of 1 to {MAX_TITLE_LENGTH} characters.'
            raise RefusedError(HTTPStatus.BAD_REQUEST, detail)
        holder = _holder(request)
        series = _service(request).jobs.rename_series(holder, name, title.strip()) if holder else None
        if series is None:
            raise RefusedError(HTTPStatus.NOT_FOUND, NO_SERIES)
        return _answer(request, _series_entry(series))

    @router.delete("/series/{name}")
    def series_removal(request: Request, name: str) -> Response:
        """Remove a series of the account."""
        holder = _holder(request)
        if holder is None or not _service(request).jobs.remove_series(holder, name):
            raise RefusedError(HTTPStatus.NOT_FOUND, NO_SERIES)
        return _answer(request, None, HTTPStatus.NO_CONTENT)

    @router.post("/series/{name}/extension")
    def series_extension(request: Request, name: str) -> Response:
        """Keep a series of the account for the keeping time from now, and return its entry."""
        holder = _holder(request)
        series = _service(request).jobs.keep_series(holder, name) if holder else None
        if series is None:
            raise RefusedError(HTTPStatus.NOT_FOUND, NO_SERIES)
        return _answer(request, _series_entry(series))

    def storage_holder(request: Request) -> Holder:
        """Return who holds the content of a request, and refuse a visitor who is not signed in."""
        holder = _holder(request)
        if holder is None:
            raise RefusedError(HTTPStatus.UNAUTHORIZED, STORAGE_NEEDS_SIGN_IN, headers=_SIGN_IN)
        return holder

    @router.post("/storage/extension")
    def storage_extension(request: Request) -> Response:
        """Keep every layer and series of the account for the keeping time from now."""
        _service(request).jobs.keep_all(storage_holder(request))
        return _answer(request, None, HTTPStatus.NO_CONTENT)

    @router.delete("/storage")
    async def storage_removal(request: Request) -> Response:
        """End the jobs of the account and remove its layers, its series and its job records from the project server.

        The servers of the account, their jobs and their layers are not touched, and the visitor stays signed in.
        """
        await asyncio.to_thread(_service(request).jobs.remove_content, storage_holder(request))
        return _answer(request, None, HTTPStatus.NO_CONTENT)

    app.include_router(router)
    app.add_exception_handler(RefusedError, _refused)
