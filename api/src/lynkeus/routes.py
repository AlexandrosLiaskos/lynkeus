"""The addresses of the sessions, the processes, the jobs, the layers and the series.

The processes and the jobs follow OGC API - Processes, Part 1: Core
(OGC 18-062r2), with the requirement classes Core, JSON, OGC Process
Description, Job list and Dismiss. Every process is executed
asynchronously: a request creates a job, and the result of the job is the
description of one layer or, for a process whose output is ``series``, the
description of one series. The files of a layer are served by the web server
of the site, not by these addresses. A series has no files.

An error is answered with the problem details of RFC 7807, as the standard
recommends. Their field ``detail`` holds one plain sentence for the visitor.
"""

import asyncio
import json
import os
import tempfile
import threading
import time
from collections.abc import AsyncIterator, Mapping, Sequence
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from http import HTTPStatus
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, FastAPI, Request, Response
from fastapi.responses import JSONResponse

from lynkeus.earthdata import KEYS_ADDRESS, KeysUnavailableError, TokenChecker, TokenRefusedError
from lynkeus.jobs import Jobs, LimitError
from lynkeus.processes import JSON, OUTPUT, SERIES_OUTPUT, InputError, OutputName, Process
from lynkeus.references import Reader, UnreadableReferenceError, read_reference
from lynkeus.sessions import COOKIE, COOKIE_PATH, SESSION_IDLE_TIME, Sessions, TooManySessionsError
from lynkeus.store import JobRecord, LayerRecord, SeriesRecord, Store

FOLDER_SETTING = "LYNKEUS_DATA_FOLDER"
"""The environment variable that names the folder of the record file and of the files of the layers.

Without it the server uses a temporary folder, which is removed when the server stops.
"""

KEYS_SETTING = "LYNKEUS_EARTHDATA_KEYS"
"""The environment variable that gives another address of the public keys of Earthdata Login, for tests."""

COOKIE_SETTING = "LYNKEUS_COOKIE_SECURE"
"""The environment variable that, with the value ``false``, lets the cookie pass over plain HTTP, for tests."""

MAX_BODY_SIZE = 65536
"""The largest size of a request body, in bytes. An Earthdata token has about 1000 characters."""

MAX_TITLE_LENGTH = 200
"""The largest length of the title of a layer or of a series, in characters."""

DEFAULT_LIMIT = 100
"""The number of processes or jobs in one answer when the request names none."""

MAX_LIMIT = 1000
"""The largest number of processes or jobs in one answer."""

REMOVAL_PAUSE = 300.0
"""The time between two removals of unused sessions, in seconds."""

PROBLEM = "application/problem+json"
"""The media type of an error answer (RFC 7807)."""

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

type Link = dict[str, str]


class RefusedError(Exception):
    """A request that the server does not carry out.

    Parameters
    ----------
    status : http.HTTPStatus
        Status code of the answer.
    detail : str
        One plain sentence for the visitor.
    kind : str
        Address that names the kind of the error (field ``type`` of RFC 7807).
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
    """

    def __init__(
        self, folder: Path, processes: Sequence[Process[Any]], keys_address: str, secure_cookie: bool, read: Reader
    ) -> None:
        self.processes = {process.id: process for process in processes}
        if len(self.processes) != len(processes):
            raise ValueError("two processes have the same name")
        self.secure_cookie = secure_cookie
        self.read = read
        files = folder / "files"
        files.mkdir(parents=True, exist_ok=True)
        self.store = Store(folder / "lynkeus.sqlite3")
        self.jobs = Jobs(self.store, files, self.processes)
        self.sessions = Sessions(self.store, TokenChecker(keys_address), self.jobs.end_session)
        self._stop = threading.Event()
        self._remover = threading.Thread(target=self._remove_unused, name="lynkeus-sessions", daemon=True)

    def start(self) -> None:
        """Bring the record in order after a stop of the server, and start the removal of unused sessions."""
        self.jobs.start()
        self._remover.start()

    def stop(self) -> None:
        """End the running jobs and close the record."""
        self._stop.set()
        self._remover.join()
        self.jobs.stop()
        self.store.close()

    def _remove_unused(self) -> None:
        while True:
            self.sessions.remove_unused()
            if self._stop.wait(REMOVAL_PAUSE):
                return


def _service(request: Request) -> Service:
    service: Service = request.app.state.lynkeus
    return service


def _answer(
    request: Request, content: object, status: int = HTTPStatus.OK, headers: Mapping[str, str] | None = None
) -> Response:
    """Return a JSON answer, with the cookie of the session when the session received a key during the request."""
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
    return response


def _refused(request: Request, refusal: Exception) -> Response:
    """Return the answer to a refused request, as problem details."""
    if not isinstance(refusal, RefusedError):
        raise refusal
    status = HTTPStatus(refusal.status)
    problem = {"type": refusal.kind, "title": status.phrase, "status": status.value, "detail": refusal.detail}
    return _answer(request, problem, status, refusal.headers)


def _session(request: Request) -> str | None:
    """Return the session of a request, or None when the request names none."""
    return _service(request).sessions.find(request.cookies.get(COOKIE))


def _session_or_new(request: Request) -> str:
    """Return the session of a request, after creating one when the request names none."""
    session = _session(request)
    if session is None:
        try:
            session, request.state.session_key = _service(request).sessions.create()
        except TooManySessionsError as error:
            detail = "The server holds the largest number of sessions at present. Try again in a few minutes."
            raise RefusedError(HTTPStatus.SERVICE_UNAVAILABLE, detail, headers={"Retry-After": "300"}) from error
    return session


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


def _status_info(job: JobRecord, output: OutputName = OUTPUT) -> dict[str, Any]:
    """Return the state of a job (statusInfo.yaml).

    Three fields are added to those of the standard: ``title`` names the job
    for the visitor, ``inputs`` holds the inputs with which the job was
    started, and ``layer`` holds the name of the layer of a successful job.
    A successful job of a process whose output is ``series`` has the field
    ``series``, with the name of its series, in the place of ``layer``.

    Parameters
    ----------
    job : JobRecord
        The job.
    output : {"layer", "series"}
        Name of the one output of the process of the job.
    """
    address = f"/api/jobs/{job.id}"
    if job.status == "dismissed":
        links = [_link("/api/jobs", "up", "Jobs of the session")]
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
        "links": links,
    }


def _layer_entry(layer: LayerRecord) -> dict[str, Any]:
    """Return a layer of a session: its description, the size of its files in bytes and its time of creation."""
    return {"layer": json.loads(layer.description), "size": layer.size, "created": _time(layer.created)}


def _series_entry(series: SeriesRecord) -> dict[str, Any]:
    """Return a series of a session: its description and its time of creation."""
    return {"series": json.loads(series.description), "created": _time(series.created)}


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


def _selected_jobs(request: Request, jobs: Sequence[JobRecord]) -> list[JobRecord]:
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
            )
            service.start()
            app.state.lynkeus = service
            try:
                yield
            finally:
                await asyncio.to_thread(service.stop)

    router = APIRouter(prefix="/api", lifespan=lifespan)

    def session_state(request: Request, session: str) -> dict[str, Any]:
        user = _service(request).sessions.user(session)
        return {"earthdata": {"user": user.name} if user else None}

    @router.get("/session")
    def session(request: Request) -> Response:
        """Report whether the visitor is signed in to Earthdata, and create the session when there is none."""
        name = _session_or_new(request)
        if getattr(request.state, "session_key", None) is None:
            # The cookie is sent again, so that its time starts again with every opening of the page.
            request.state.session_key = request.cookies[COOKIE]
        return _answer(request, session_state(request, name))

    @router.post("/session/earthdata")
    async def sign_in(request: Request) -> Response:
        """Sign the visitor in to Earthdata with a user token."""
        body = await _body(request)
        token = body.get("token")
        if set(body) != {"token"} or not isinstance(token, str):
            raise RefusedError(
                HTTPStatus.BAD_REQUEST, 'The request body must be {"token": "..."} with an Earthdata Login user token.'
            )
        sessions = _service(request).sessions
        name = _session_or_new(request)
        try:
            await asyncio.to_thread(sessions.sign_in, name, token.strip())
        except TokenRefusedError:
            detail = (
                "Earthdata Login does not accept this token. Check that the whole token was copied and has not expired."
            )
            raise RefusedError(HTTPStatus.UNAUTHORIZED, detail, headers=_SIGN_IN) from None
        except KeysUnavailableError as error:
            detail = "Earthdata Login did not answer, so the token could not be checked. Try again in a few minutes."
            raise RefusedError(HTTPStatus.BAD_GATEWAY, detail) from error
        request.state.session_key = sessions.renew_key(name)
        return _answer(request, session_state(request, name))

    @router.delete("/session/earthdata")
    def sign_out(request: Request) -> Response:
        """Sign the visitor out of Earthdata. The server forgets the token."""
        sessions = _service(request).sessions
        name = _session(request)
        if name is not None:
            sessions.sign_out(name)
            request.state.session_key = sessions.renew_key(name)
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
            _link("/api/jobs", f"{_RELATION}job-list", "Jobs of the session"),
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

    @router.get("/processes/{name}")
    def process_description(request: Request, name: str) -> Response:
        """Return the description of a process, with its inputs and its output."""
        links = process_links(name)
        return _answer(request, {**process_of(request, name).describe(), "links": links}, headers=_link_header(links))

    @router.post("/processes/{name}/execution")
    async def execution(request: Request, name: str) -> Response:
        """Create a job that runs a process with the inputs of the request."""
        service = _service(request)
        process = process_of(request, name)
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
        token = None
        if process.needs_earthdata:
            known = _session(request)
            token = service.sessions.token(known) if known else None
            if token is None:
                raise RefusedError(HTTPStatus.UNAUTHORIZED, "Sign in to Earthdata to start this job.", headers=_SIGN_IN)
        try:
            job = service.jobs.submit(_session_or_new(request), process, inputs, form, token)
        except LimitError as error:
            headers = {"Retry-After": str(error.wait)} if error.wait else {}
            raise RefusedError(error.status, str(error), headers=headers) from None
        headers = {"Location": f"/api/jobs/{job.id}"}
        preferences = {part.split(";")[0].strip().lower() for part in request.headers.get("prefer", "").split(",")}
        if "respond-async" in preferences:
            headers["Preference-Applied"] = "respond-async"
        return _answer(request, _status_info(job, output), HTTPStatus.CREATED, headers)

    def output_of(request: Request, job: JobRecord) -> OutputName:
        """Return the name of the one output of the process of a job."""
        process = _service(request).processes.get(job.process)
        return process.output if process is not None else OUTPUT

    def state_of(request: Request, job: JobRecord) -> dict[str, Any]:
        return _status_info(job, output_of(request, job))

    def job_of(request: Request, name: str) -> JobRecord:
        """Return a job of the session of the request. A job of another session counts as a job that does not exist."""
        session = _session(request)
        job = _service(request).store.job(name)
        if session is None or job is None or job.session != session:
            raise RefusedError(
                HTTPStatus.NOT_FOUND, "Your session has no job of this name.", f"{_EXCEPTION}no-such-job"
            )
        if job.status == "dismissed":
            raise RefusedError(HTTPStatus.GONE, "The job was dismissed.")
        return job

    @router.get("/jobs")
    def job_list(request: Request) -> Response:
        """Return the jobs of the session, the newest first."""
        session = _session(request)
        jobs = _selected_jobs(request, _service(request).store.jobs_of(session) if session else [])
        page, links = _page(request, jobs, "Jobs of the session")
        return _answer(
            request, {"jobs": [state_of(request, job) for job in page], "links": links}, headers=_link_header(links)
        )

    @router.get("/jobs/{name}")
    def job_status(request: Request, name: str) -> Response:
        """Return the state of a job."""
        info = state_of(request, job_of(request, name))
        return _answer(request, info, headers=_link_header(info["links"]))

    @router.get("/jobs/{name}/results")
    def job_results(request: Request, name: str) -> Response:
        """Return the description of the layer, or of the series, that a successful job produced."""
        job = job_of(request, name)
        if job.status in ("accepted", "running"):
            raise RefusedError(HTTPStatus.NOT_FOUND, "The job has not finished yet.", f"{_EXCEPTION}result-not-ready")
        if job.status == "failed":
            raise RefusedError(HTTPStatus.INTERNAL_SERVER_ERROR, job.message)
        output, store = output_of(request, job), _service(request).store
        result = store.series(job.layer or "") if output == SERIES_OUTPUT else store.layer(job.layer or "")
        if result is None:
            raise RefusedError(HTTPStatus.GONE, f"The {output} of this job was removed.")
        description = json.loads(result.description)
        return _answer(request, description if job.response == "raw" else {output: {"value": description}})

    @router.delete("/jobs/{name}")
    def job_dismissal(request: Request, name: str) -> Response:
        """End a job that waits or runs, or remove the record of a finished job."""
        job = _service(request).jobs.dismiss(job_of(request, name))
        return _answer(request, state_of(request, job))

    @router.get("/layers")
    def layer_list(request: Request) -> Response:
        """Return the layers of the session, the newest first, each with its description, size and time of creation."""
        session = _session(request)
        layers = _service(request).store.layers_of(session) if session else []
        return _answer(request, {"layers": [_layer_entry(layer) for layer in layers]})

    @router.patch("/layers/{name}")
    async def layer_renaming(request: Request, name: str) -> Response:
        """Give a layer of the session a new title."""
        body = await _body(request)
        title = body.get("title")
        if set(body) != {"title"} or not isinstance(title, str) or not 0 < len(title.strip()) <= MAX_TITLE_LENGTH:
            detail = f'The request body must be {{"title": "..."}} with a title of 1 to {MAX_TITLE_LENGTH} characters.'
            raise RefusedError(HTTPStatus.BAD_REQUEST, detail)
        session = _session(request)
        layer = _service(request).jobs.rename_layer(session, name, title.strip()) if session else None
        if layer is None:
            raise RefusedError(HTTPStatus.NOT_FOUND, "Your session has no layer of this name.")
        return _answer(request, _layer_entry(layer))

    @router.delete("/layers/{name}")
    def layer_removal(request: Request, name: str) -> Response:
        """Remove a layer of the session with its files."""
        session = _session(request)
        if session is None or not _service(request).jobs.remove_layer(session, name):
            raise RefusedError(HTTPStatus.NOT_FOUND, "Your session has no layer of this name.")
        return _answer(request, None, HTTPStatus.NO_CONTENT)

    @router.get("/series")
    def series_list(request: Request) -> Response:
        """Return the series of the session, the newest first, each with its description and time of creation."""
        session = _session(request)
        series = _service(request).store.series_of(session) if session else []
        return _answer(request, {"series": [_series_entry(entry) for entry in series]})

    @router.patch("/series/{name}")
    async def series_renaming(request: Request, name: str) -> Response:
        """Give a series of the session a new title."""
        body = await _body(request)
        title = body.get("title")
        if set(body) != {"title"} or not isinstance(title, str) or not 0 < len(title.strip()) <= MAX_TITLE_LENGTH:
            detail = f'The request body must be {{"title": "..."}} with a title of 1 to {MAX_TITLE_LENGTH} characters.'
            raise RefusedError(HTTPStatus.BAD_REQUEST, detail)
        session = _session(request)
        series = _service(request).jobs.rename_series(session, name, title.strip()) if session else None
        if series is None:
            raise RefusedError(HTTPStatus.NOT_FOUND, "Your session has no series of this name.")
        return _answer(request, _series_entry(series))

    @router.delete("/series/{name}")
    def series_removal(request: Request, name: str) -> Response:
        """Remove a series of the session."""
        session = _session(request)
        if session is None or not _service(request).jobs.remove_series(session, name):
            raise RefusedError(HTTPStatus.NOT_FOUND, "Your session has no series of this name.")
        return _answer(request, None, HTTPStatus.NO_CONTENT)

    app.include_router(router)
    app.add_exception_handler(RefusedError, _refused)
