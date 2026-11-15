"""The addresses of the own servers.

``docs/Own_Servers.md`` gives every address, and ``lynkeus.linking`` the format
of every message. The addresses under ``/api/link`` are for the program
Lynkeus Server: it asks for a pairing there, and once paired it asks for its
tasks, reports its state and answers the tasks, with its key in the header
``Authorization``. The addresses under ``/api/servers`` are for the interface.
Each of them needs a session that is signed in to Earthdata, and a visitor
reaches only the servers that he owns: a server of another user is answered
as a server that does not exist.

A question for tasks waits on the event loop of the web service and holds no
thread. The bytes of a file of a layer pass through the project server in
parts of at most ``MOST_BYTES`` bytes, one after the other, so the project
server never holds a whole file.

A request of the program whose body is not in its format is answered with
422, because 400 at the pairing carries a ``PairingRefusal`` (RFC 8628,
section 3.5).
"""

import asyncio
import contextlib
import json
import re
import time
from collections.abc import AsyncIterator
from http import HTTPStatus

from fastapi import APIRouter, FastAPI, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import ValidationError

from lynkeus.layers import Format, LayerDescription
from lynkeus.linking import (
    MAX_USER_SERVERS,
    MOST_BYTES,
    MOST_WAIT,
    Done,
    LimitsTask,
    Machine,
    PairingKey,
    PairingQuestion,
    ReadFailure,
    ReadTask,
    Report,
    ServerChange,
    Tasks,
)
from lynkeus.linking import Servers as ServerList
from lynkeus.routes import RefusedError, Service, refusal_of
from lynkeus.servers import Part, ServerRefusedError, layer_files, state_of, written_tasks
from lynkeus.sessions import COOKIE
from lynkeus.store import ServerRecord

MAX_LINK_BODY = 1_048_576
"""The largest size of the body of a request under ``/api/link/``, in bytes. The front web server takes 1 megabyte."""

SIZE_HEADER = "Lynkeus-File-Size"
"""The header in which an own server states the size of the whole file whose part it sends."""

FILE_TYPES = {
    "tif": "image/tiff; application=geotiff; profile=cloud-optimized",
    "json": "application/geo+json",
}
"""The media types of the two files of a layer, by their endings."""

JSON = "application/json"
BYTES = "application/octet-stream"

_SIGN_IN = {"WWW-Authenticate": 'Bearer realm="Earthdata Login"'}
_KEY = {"WWW-Authenticate": 'Bearer realm="Lynkeus Server"'}
_BEARER = re.compile(r"^Bearer ([A-Za-z0-9_-]{43})$")
_RANGE = re.compile(r"^bytes=(\d*)-(\d*)$")
_WHOLE = re.compile(r"^[0-9]{1,18}$")
_NO_SERVER = "You have no server of this name."
_NO_FILE = "Your server keeps no such file."
_NO_TASK = "The server has no unanswered task of this name."


def _service(request: Request) -> Service:
    service: Service = request.app.state.lynkeus
    return service


def _owner(request: Request) -> str:
    """Return the name of the Earthdata user of a request, and refuse a visitor who is not signed in."""
    service = _service(request)
    session = service.sessions.find(request.cookies.get(COOKIE))
    user = service.sessions.user(session) if session else None
    if user is None:
        detail = "Sign in to Earthdata to connect and use servers of your own."
        raise RefusedError(HTTPStatus.UNAUTHORIZED, detail, headers=_SIGN_IN)
    return user.name


def _owned(request: Request, server: str) -> ServerRecord:
    """Return an own server of the signed-in visitor. A server of another user counts as one that does not exist."""
    record = _service(request).servers.owned(_owner(request), server)
    if record is None:
        raise RefusedError(HTTPStatus.NOT_FOUND, _NO_SERVER)
    return record


async def _bytes(request: Request, kind: str, most: int) -> bytes:
    """Return the body of a request of one media type and of at most ``most`` bytes."""
    if request.headers.get("content-type", "").split(";")[0].strip().lower() != kind:
        raise RefusedError(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, f"The request body must be of the type {kind}.")
    too_large = RefusedError(HTTPStatus.CONTENT_TOO_LARGE, f"The request body is larger than {most} bytes.")
    declared = request.headers.get("content-length", "0")
    if not _WHOLE.fullmatch(declared) or int(declared) > most:
        raise too_large
    body = bytearray()
    async for part in request.stream():
        body += part
        if len(body) > most:
            raise too_large
    return bytes(body)


async def _message[Message: Format](request: Request, form: type[Message], most: int, refused: HTTPStatus) -> Message:
    """Return the JSON body of a request in the format of a message, or refuse it with the status ``refused``."""
    text = await _bytes(request, JSON, most)
    try:
        return form.model_validate_json(text)
    except ValidationError as error:
        first = error.errors(include_url=False, include_input=False, include_context=False)[0]
        place = ".".join(str(part) for part in first["loc"]) or "body"
        reason = str(first["msg"]).removeprefix("Value error, ").rstrip(".")
        detail = f"The request body is not a {form.__name__}: {place}: {reason}."
        raise RefusedError(refused, detail) from None


def _key(request: Request) -> str:
    """Return the key that an own server sends in the header ``Authorization``."""
    found = _BEARER.fullmatch(request.headers.get("authorization", ""))
    if found is None:
        raise _unknown_key()
    return found[1]


def _unknown_key() -> RefusedError:
    detail = "This key names no server. Its owner removed the server, or the server was never paired."
    return RefusedError(HTTPStatus.UNAUTHORIZED, detail, headers=_KEY)


async def _server(request: Request) -> ServerRecord:
    """Return the own server whose key a request carries, and record that the server sent a message."""
    server = await asyncio.to_thread(_service(request).servers.identify, _key(request), time.time())
    if server is None:
        raise _unknown_key()
    return server


def _answer(message: Format, status: int = HTTPStatus.OK, location: str | None = None) -> Response:
    headers = {"Location": location} if location else {}
    return Response(message.model_dump_json(), status, headers, JSON)


def _nothing() -> Response:
    return Response(status_code=HTTPStatus.NO_CONTENT)


def byte_range(text: str | None) -> tuple[int | None, int | None] | None:
    """Read the header ``Range`` of a request for one range of bytes (RFC 9110, section 14.1.2).

    Parameters
    ----------
    text : str or None
        Value of the header, for example ``bytes=0-65535``, ``bytes=65536-`` or ``bytes=-512``.

    Returns
    -------
    tuple or None
        The first and the last byte of the range; the last is None when the range reaches the end
        of the file. For the last bytes of a file the first is None and the second is their number.
        None when there is no header, when it asks for several ranges or when it is not a range of
        bytes: the whole file is then the answer, as the standard allows.
    """
    found = _RANGE.fullmatch((text or "").replace(" ", ""))
    if found is None or not (found[1] or found[2]) or len(found[1]) > 18 or len(found[2]) > 18:
        return None
    if not found[1]:
        return None, int(found[2])
    first, last = int(found[1]), int(found[2]) if found[2] else None
    return None if last is not None and last < first else (first, last)


def install_servers(app: FastAPI) -> None:
    """Add the addresses of the own servers to a web service that holds the addresses of ``lynkeus.routes``."""
    router = APIRouter(prefix="/api")

    # The pairing

    @router.post("/link/pairings")
    async def pairing_request(request: Request) -> Response:
        """Record the pairing that a program asks for, and return its codes."""
        machine = await _message(request, Machine, MAX_LINK_BODY, HTTPStatus.UNPROCESSABLE_CONTENT)
        try:
            pairing = await asyncio.to_thread(_service(request).servers.begin_pairing, machine, time.time())
        except ServerRefusedError as error:
            raise refusal_of(error) from None
        return _answer(pairing)

    @router.post("/link/pairings/token")
    async def pairing_question(request: Request) -> Response:
        """Answer whether the visitor has confirmed a pairing: 400 until then, and the key afterwards, once."""
        question = await _message(request, PairingQuestion, MAX_LINK_BODY, HTTPStatus.UNPROCESSABLE_CONTENT)
        servers = _service(request).servers
        answer = await asyncio.to_thread(servers.answer_pairing, question.device_code, time.time())
        return _answer(answer, HTTPStatus.OK if isinstance(answer, PairingKey) else HTTPStatus.BAD_REQUEST)

    @router.get("/servers/pairings/{user_code}")
    def pairing_view(request: Request, user_code: str) -> Response:
        """Return the computer that asked for a pairing, so that the visitor can compare it before he confirms."""
        try:
            return _answer(_service(request).servers.view_pairing(_owner(request), user_code, time.time()))
        except ServerRefusedError as error:
            raise refusal_of(error) from None

    @router.post("/servers")
    async def pairing_confirmation(request: Request) -> Response:
        """Connect the computer of a pairing to the signed-in visitor as an own server."""
        user = _owner(request)
        try:
            body = json.loads(await _bytes(request, JSON, MAX_LINK_BODY))
        except ValueError:
            raise RefusedError(HTTPStatus.BAD_REQUEST, "The request body is not valid JSON.") from None
        code = body.get("user_code") if isinstance(body, dict) else None
        if not isinstance(body, dict) or set(body) != {"user_code"} or not isinstance(code, str):
            detail = 'The request body must be {"user_code": "..."} with the code that the program shows.'
            raise RefusedError(HTTPStatus.BAD_REQUEST, detail)
        servers = _service(request).servers
        try:
            server = await asyncio.to_thread(servers.confirm_pairing, user, code, time.time())
        except ServerRefusedError as error:
            raise refusal_of(error) from None
        return _answer(servers.described(server, time.time()), HTTPStatus.CREATED, f"/api/servers/{server.id}")

    # The connection of a paired server

    @router.post("/link/tasks")
    async def tasks(request: Request) -> Response:
        """Give an own server its tasks: at once when tasks wait, and otherwise after the wait that it names."""
        key = _key(request)
        text = request.query_params.get("wait", "0")
        if not _WHOLE.fullmatch(text):
            detail = f"The parameter wait must be a whole number of seconds, at most {MOST_WAIT}."
            raise RefusedError(HTTPStatus.BAD_REQUEST, detail)
        servers = _service(request).servers
        forget = servers.forgotten(key, time.time())
        if forget is not None:
            return _answer(Tasks(tasks=(forget,)))
        server = await _server(request)
        # The body is read to its end, so that the end of the connection can be told afterwards.
        await _bytes(request, request.headers.get("content-type", "").split(";")[0].strip().lower(), MAX_LINK_BODY)
        try:
            await servers.wait_for_tasks(server.id, min(int(text), MOST_WAIT))
        except ServerRefusedError as error:
            raise refusal_of(error) from None
        forget = servers.forgotten(key, time.time())
        if forget is not None:
            return _answer(Tasks(tasks=(forget,)))
        if servers.has_left(server.id) or await request.is_disconnected():
            # The tasks stay for the next question of the server: its program is quit, or the
            # connection of this question has ended, so this answer would hand them to nobody.
            return _answer(Tasks())
        handed, unanswered = servers.take(server.id)
        store = _service(request).store
        for job in unanswered:
            await asyncio.to_thread(store.take_server_job, job, time.time())
        if not any(isinstance(task, LimitsTask) for task in handed.tasks):
            return _answer(handed)
        # The limits are written as the program reads them. A task limits is handed out only after a report
        # that the server sent since it connected, and that report tells whether the program knows the cells.
        latest = await asyncio.to_thread(store.server, server.id)
        return Response(written_tasks(handed, state_of(latest or server)), HTTPStatus.OK, media_type=JSON)

    @router.post("/link/leave")
    async def leave(request: Request) -> Response:
        """Count an own server as not connected at once, because its program is quit, until its next message."""
        _service(request).servers.leave(await _server(request))
        return _nothing()

    @router.post("/link/report")
    async def report(request: Request) -> Response:
        """Record the state of an own server and of the jobs whose state changed."""
        server = await _server(request)
        message = await _message(request, Report, MAX_LINK_BODY, HTTPStatus.UNPROCESSABLE_CONTENT)
        servers = _service(request).servers
        servers.keep_reported(server.id, await asyncio.to_thread(servers.record_report, server, message, time.time()))
        return _nothing()

    @router.post("/link/tasks/{task}/done")
    async def task_done(request: Request, task: str) -> Response:
        """Take the answer of an own server to a task other than reading."""
        servers = _service(request).servers
        if servers.forget_answered(_key(request), task):
            return _nothing()
        server = await _server(request)
        done = await _message(request, Done, MAX_LINK_BODY, HTTPStatus.UNPROCESSABLE_CONTENT)
        found = servers.answer(server.id, task, done)
        if found is None:
            raise RefusedError(HTTPStatus.NOT_FOUND, _NO_TASK)
        await asyncio.to_thread(servers.record_done, server, found, done, time.time())
        return _nothing()

    @router.post("/link/tasks/{task}/bytes")
    async def task_bytes(request: Request, task: str) -> Response:
        """Take the part of a file that an own server sends for a task that reads."""
        server = await _server(request)
        servers = _service(request).servers
        if not isinstance(servers.handed(server.id, task), ReadTask):
            raise RefusedError(HTTPStatus.NOT_FOUND, _NO_TASK)
        size = request.headers.get(SIZE_HEADER, "")
        if not _WHOLE.fullmatch(size):
            detail = f"The header {SIZE_HEADER} must give the size of the whole file in bytes."
            raise RefusedError(HTTPStatus.UNPROCESSABLE_CONTENT, detail)
        data = await _bytes(request, BYTES, MOST_BYTES)
        if servers.answer(server.id, task, Part(data, int(size))) is None:
            raise RefusedError(HTTPStatus.NOT_FOUND, _NO_TASK)
        return _nothing()

    @router.post("/link/tasks/{task}/failure")
    async def task_failure(request: Request, task: str) -> Response:
        """Take the answer of an own server that cannot send the part of a file."""
        server = await _server(request)
        failure = await _message(request, ReadFailure, MAX_LINK_BODY, HTTPStatus.UNPROCESSABLE_CONTENT)
        if _service(request).servers.answer(server.id, task, failure) is None:
            raise RefusedError(HTTPStatus.NOT_FOUND, _NO_TASK)
        return _nothing()

    # The addresses for the interface

    @router.get("/servers")
    def server_list(request: Request) -> Response:
        """Return the own servers of the signed-in visitor, and the most that one user may connect."""
        servers = _service(request).servers
        now = time.time()
        found = tuple(servers.described(server, now) for server in servers.of_user(_owner(request)))
        return _answer(ServerList(servers=found, limit=MAX_USER_SERVERS))

    @router.patch("/servers/{server}")
    async def server_change(request: Request, server: str) -> Response:
        """Give an own server another name, or other limits, which the server receives as a task.

        Limits that need more memory than the server reported are refused with 422, and a change of the
        cells of a layer for a program that does not know that limit with 409 (``Servers.change``).
        """
        record = _owned(request, server)
        change = await _message(request, ServerChange, MAX_LINK_BODY, HTTPStatus.BAD_REQUEST)
        servers = _service(request).servers
        try:
            changed = servers.change(record, change)
        except ServerRefusedError as error:
            raise refusal_of(error) from None
        return _answer(servers.described(changed, time.time()))

    @router.delete("/servers/{server}")
    async def server_removal(request: Request, server: str) -> Response:
        """Remove an own server with the records of its jobs and layers. The files stay on the computer."""
        _service(request).servers.remove(_owned(request, server))
        return _nothing()

    @router.get("/servers/{server}/files/{layer}/{file}")
    async def layer_file(request: Request, server: str, layer: str, file: str) -> Response:
        """Return a file of a layer that an own server keeps, whole or the range of bytes that the request names.

        The bytes are read from the server by tasks of at most ``MOST_BYTES`` bytes, one after the other.
        The first of them gives the size of the file, with which the answer begins. When a later part
        fails, the answer ends before the length that it stated.
        """
        record = _owned(request, server)
        service = _service(request)
        kept = service.store.server_layer(record.id, layer)
        if kept is None or file not in layer_files(LayerDescription.model_validate_json(kept.description)):
            raise RefusedError(HTTPStatus.NOT_FOUND, _NO_FILE)
        wanted = byte_range(request.headers.get("range"))
        read = service.servers.read
        first: int = 0
        last: int | None = None
        try:
            if wanted is not None and wanted[0] is None:
                # The last bytes of the file are wanted, so its size is asked for first.
                number = wanted[1] or 0
                size = (await read(record, layer, file, 0, 1)).size
                if number == 0:
                    detail = "The range of bytes of the request holds no byte of the file."
                    raise ServerRefusedError(HTTPStatus.RANGE_NOT_SATISFIABLE, detail)
                first = max(0, size - number)
            elif wanted is not None and wanted[0] is not None:
                first, last = wanted[0], wanted[1]
            end = first + MOST_BYTES if last is None else min(first + MOST_BYTES, last + 1)
            part = await read(record, layer, file, first, end)
        except ServerRefusedError as error:
            refusal = refusal_of(error)
            if error.status == HTTPStatus.RANGE_NOT_SATISFIABLE:
                # The answer states the size of the file (RFC 9110, section 15.5.17), which a first byte gives.
                with contextlib.suppress(ServerRefusedError):
                    refusal.headers["Content-Range"] = f"bytes */{(await read(record, layer, file, 0, 1)).size}"
            raise refusal from None
        size = part.size
        stop = size if last is None else min(last + 1, size)

        async def parts() -> AsyncIterator[bytes]:
            data, position = part.data, first
            while True:
                yield data
                position += len(data)
                if position >= stop:
                    return
                following = await read(record, layer, file, position, min(position + MOST_BYTES, stop))
                if following.size != size:
                    raise ServerRefusedError(
                        HTTPStatus.BAD_GATEWAY, "The file changed on the server while it was read."
                    )
                data = following.data

        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(stop - first),
            "Cache-Control": "private, no-cache",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
        }
        if wanted is not None:
            headers["Content-Range"] = f"bytes {first}-{stop - 1}/{size}"
        status = HTTPStatus.OK if wanted is None else HTTPStatus.PARTIAL_CONTENT
        return StreamingResponse(parts(), status, headers, FILE_TYPES[file.rsplit(".", 1)[-1]])

    app.include_router(router)
