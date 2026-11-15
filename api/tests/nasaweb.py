"""A stand-in for NASA's catalogue and for NASA Harmony on the network, for the checks of the whole program.

Lynkeus Server is checked as it is delivered, in a process of its own and also as a packed program,
so no stand-in can be put inside it as ``tests/nasa.py`` does for a job of the tests. Its requests to
NASA are led to this stand-in instead. The environment variable ``HTTPS_PROXY`` names the stand-in
as the proxy of the program, and ``REQUESTS_CA_BUNDLE`` names the authority of the tests
(``tests/data/nasa-stand-in/ca.pem``), whose certificate for the host names of NASA the stand-in
shows. The program then asks its questions over HTTPS as it does to NASA, and the stand-in answers
them: the catalogue with the record of a real product (``tests/data/granule-gcov.json``), and Harmony
with a job that follows ``states`` and hands over a file of ``tests/data/layers``.

The key of the certificate is in ``server.pem``. It was made for the tests and protects nothing.
"""

import json
import socket
import ssl
import threading
import uuid
from collections.abc import Iterator
from contextlib import contextmanager, suppress
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote_plus, urlsplit

from tests.records import DATA

CERTIFICATES = DATA / "nasa-stand-in"
CATALOGUE = "cmr.earthdata.nasa.gov"
HARMONY = "harmony.earthdata.nasa.gov"
RUNNING = {"status": "running", "progress": 40, "message": "The job is being processed"}
DONE = {"status": "successful", "progress": 100, "message": "The job has completed successfully"}


class Nasa(ThreadingHTTPServer):
    """The stand-in, as the proxy through which the program reaches NASA.

    Parameters
    ----------
    file : pathlib.Path
        The GeoTIFF that the stand-in for Harmony hands over.

    Attributes
    ----------
    states : list of dict
        The answers to the questions about a job of Harmony, one after the other; the last is repeated.
    events : list of dict
        What the stand-in was asked, in order. Each event has a name under ``event``.
    """

    daemon_threads = True

    def __init__(self, file: Path) -> None:
        super().__init__(("127.0.0.1", 0), _Proxy)
        self.file = file
        self.states: list[dict[str, Any]] = [DONE]
        self.events: list[dict[str, Any]] = []
        self.asked: dict[str, int] = {}
        self.changed = threading.Condition()
        self.connections: list[socket.socket] = []
        self.context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        self.context.load_cert_chain(CERTIFICATES / "server.pem")

    def environment(self) -> dict[str, str]:
        """Return the environment variables that lead the requests of a program to NASA to the stand-in."""
        proxy = f"http://127.0.0.1:{self.server_address[1]}"
        local = "127.0.0.1,localhost"
        return {
            "HTTPS_PROXY": proxy,
            "https_proxy": proxy,
            "NO_PROXY": local,
            "no_proxy": local,
            "REQUESTS_CA_BUNDLE": str(CERTIFICATES / "ca.pem"),
        }

    def note(self, event: str, **facts: object) -> None:
        with self.changed:
            self.events.append({"event": event, **facts})
            self.changed.notify_all()

    def seen(self, event: str) -> list[dict[str, Any]]:
        with self.changed:
            return [entry for entry in self.events if entry["event"] == event]

    def handle_error(self, request: Any, client_address: Any) -> None:
        # A connection that the program closes, for example when a job is ended, is not a fault of the stand-in.
        pass


class _Proxy(BaseHTTPRequestHandler):
    """Takes the request of the program for a tunnel to a host of NASA, and answers inside it as that host."""

    server: Nasa

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 - name set by the standard library
        pass

    def do_CONNECT(self) -> None:
        host = self.path.rsplit(":", 1)[0]
        self.send_response(HTTPStatus.OK, "Connection established")
        self.end_headers()
        self.close_connection = True
        try:
            secure = self.server.context.wrap_socket(self.connection, server_side=True)
        except OSError as error:
            self.server.note("refused", host=host, reason=str(error))
            return
        with self.server.changed:
            self.server.connections.append(secure)
        try:
            _Host(secure, self.client_address, self.server)
        finally:
            with suppress(OSError):
                secure.close()


class _Host(BaseHTTPRequestHandler):
    """Answers the requests inside a tunnel as NASA's catalogue or as NASA Harmony."""

    server: Nasa
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 - name set by the standard library
        pass

    def _send(self, status: int, body: bytes, kind: str = "application/json", **headers: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        for name, value in headers.items():
            self.send_header(name.replace("_", "-"), value)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, value: object, status: int = HTTPStatus.OK, **headers: str) -> None:
        self._send(status, json.dumps(value).encode(), **headers)

    def do_GET(self) -> None:
        self._answer()

    def do_POST(self) -> None:
        self._answer()

    def _answer(self) -> None:
        nasa = self.server
        host = self.headers.get("Host", "").split(":")[0]
        address = urlsplit(self.path)
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        asked = unquote_plus(address.query) + body.decode(errors="replace")
        path = address.path
        if host == CATALOGUE and path == "/search/granules.umm_json":
            # The catalogue gives the records in pages, and names the place of the next page in a header.
            further = "CMR-Search-After" in self.headers
            nasa.note("catalogue", asked=asked, further=further)
            if further:
                self._json({"hits": 1, "took": 1, "items": []}, CMR_Hits="1")
            else:
                record = (DATA / "granule-gcov.json").read_bytes()
                self._send(HTTPStatus.OK, record, CMR_Hits="1", CMR_Search_After='["after"]')
        elif host == HARMONY and path.endswith("/coverage/rangeset"):
            job = str(uuid.uuid4())
            nasa.note("submit", job=job, collection=path.split("/")[1], asked=asked, signed=self._signed())
            self._json({"jobID": job, "status": "accepted", "progress": 0, "message": "The job is being processed"})
        elif host == HARMONY and path == "/jobs/status":
            # The states of several jobs at once, which the client asks for before it lists the files of a job.
            with nasa.changed:
                latest = {
                    job: nasa.states[min(max(nasa.asked.get(job, 0) - 1, 0), len(nasa.states) - 1)]
                    for job in json.loads(body)["jobIDs"]
                }
            states = [
                {"jobID": job, "status": state["status"], "progress": state["progress"]}
                for job, state in latest.items()
            ]
            self._json({"jobStatuses": states, "notFoundJobIDs": []})
        elif host == HARMONY and path.startswith("/jobs/") and path.endswith("/cancel"):
            nasa.note("cancel", job=path.split("/")[2], signed=self._signed())
            self._json({"jobID": path.split("/")[2], "status": "canceled"})
        elif host == HARMONY and path.startswith("/jobs/"):
            self._state(path.split("/")[2])
        elif host == HARMONY and path.startswith("/service-results/") and path.endswith(".tif"):
            nasa.note("download", path=path, signed=self._signed())
            self._send(HTTPStatus.OK, nasa.file.read_bytes(), "image/tiff")
        else:
            nasa.note("unknown", host=host, path=path)
            self._json({"description": "The stand-in has no such address."}, HTTPStatus.NOT_FOUND)

    def _signed(self) -> str | None:
        """Return the token with which the request is signed."""
        return (self.headers.get("Authorization") or "").removeprefix("Bearer ") or None

    def _state(self, job: str) -> None:
        nasa = self.server
        with nasa.changed:
            number = nasa.asked.get(job, 0)
            nasa.asked[job] = number + 1
            state = nasa.states[min(number, len(nasa.states) - 1)]
        nasa.note("status", job=job, status=state["status"], signed=self._signed())
        file = f"https://{HARMONY}/service-results/harmony-prod-staging/public/{job}/1/layer.tif"
        self._json(
            {
                "jobID": job,
                **state,
                "createdAt": "2026-11-15T08:00:00.000Z",
                "updatedAt": "2026-11-15T08:00:05.000Z",
                "dataExpiration": "2026-12-15T08:00:00.000Z",
                "request": f"https://{HARMONY}/",
                "numInputGranules": 1,
                "links": [{"rel": "data", "href": file, "type": "image/tiff", "title": "layer.tif"}]
                if state["status"] == "successful"
                else [],
            }
        )


@contextmanager
def nasa(file: Path) -> Iterator[Nasa]:
    """Run the stand-in for NASA until the block ends."""
    with Nasa(file) as server:
        thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True)
        thread.start()
        try:
            yield server
        finally:
            server.shutdown()
            thread.join()
            for connection in server.connections:
                with suppress(OSError):
                    connection.shutdown(socket.SHUT_RDWR)
