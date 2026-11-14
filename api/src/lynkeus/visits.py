"""Count page visits and serve the total over HTTP.

The service stores one number, the total of recorded visits, in a JSON
file. A ``GET`` request to ``/api/visit`` returns the total and a ``POST``
request adds one visit and returns the new total. Nothing about a visitor
is stored.
"""

from __future__ import annotations

import argparse
import json
import threading
from collections.abc import Sequence
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

VISIT_PATH = "/api/visit"
HEALTH_PATH = "/healthz"


class VisitCounter:
    """A total of visits kept in a JSON file.

    Parameters
    ----------
    path : Path
        The file that holds the total. It is created with the first visit.
    """

    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.Lock()

    def _read(self) -> int:
        try:
            payload = json.loads(self._path.read_text(encoding="utf-8"))
            return max(0, int(payload["count"]))
        except (OSError, ValueError, KeyError, TypeError):
            return 0

    def current(self) -> int:
        """Return the total of recorded visits.

        Returns
        -------
        int
            The total; 0 if the file is missing or cannot be read.
        """
        with self._lock:
            return self._read()

    def increment(self) -> int:
        """Add one visit and return the new total.

        Returns
        -------
        int
            The total after the visit has been added.

        Raises
        ------
        OSError
            If the file cannot be written.
        """
        with self._lock:
            count = self._read() + 1
            self._path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self._path.with_name(self._path.name + ".tmp")
            temporary.write_text(json.dumps({"count": count}), encoding="utf-8")
            temporary.replace(self._path)
            return count


class VisitServer(ThreadingHTTPServer):
    """An HTTP server that holds the visit counter.

    Parameters
    ----------
    address : tuple[str, int]
        Host and port to listen on.
    counter : VisitCounter
        The counter that the requests read and change.
    """

    allow_reuse_address = True

    def __init__(self, address: tuple[str, int], counter: VisitCounter) -> None:
        super().__init__(address, VisitRequestHandler)
        self.counter = counter


class VisitRequestHandler(BaseHTTPRequestHandler):
    """Answer the requests for the visit total."""

    server: VisitServer
    server_version = "LynkeusVisits"
    sys_version = ""

    def do_GET(self) -> None:
        """Return the total, or the state of the service."""
        self._answer_read(with_body=True)

    def do_HEAD(self) -> None:
        """Return the headers of the answer to the same ``GET`` request."""
        self._answer_read(with_body=False)

    def do_POST(self) -> None:
        """Add one visit and return the new total."""
        if urlparse(self.path).path != VISIT_PATH:
            self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
            return
        try:
            count = self.server.counter.increment()
        except OSError:
            self._send_json({"error": "the visit could not be recorded"}, HTTPStatus.SERVICE_UNAVAILABLE)
            return
        self._send_json({"count": count})

    def _answer_read(self, *, with_body: bool) -> None:
        path = urlparse(self.path).path
        if path == VISIT_PATH:
            self._send_json({"count": self.server.counter.current()}, with_body=with_body)
        elif path == HEALTH_PATH:
            self._send_json({"status": "ok"}, with_body=with_body)
        else:
            self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND, with_body=with_body)

    def _send_json(
        self, payload: dict[str, object], status: HTTPStatus = HTTPStatus.OK, *, with_body: bool = True
    ) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if with_body:
            self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 - name set by the standard library
        """Write no access log, so that no address of a visitor is kept."""


def main(arguments: Sequence[str] | None = None) -> int:
    """Run the service from the command line.

    Parameters
    ----------
    arguments : Sequence[str] or None, optional
        Command-line arguments; the arguments of the process if ``None``.

    Returns
    -------
    int
        The exit status: 0 after the service has been stopped.
    """
    parser = argparse.ArgumentParser(description="Serve the total of recorded page visits.")
    parser.add_argument("--host", default="127.0.0.1", help="address to listen on")
    parser.add_argument("--port", type=int, default=8766, help="port to listen on")
    parser.add_argument("--count-file", type=Path, required=True, help="JSON file that holds the total")
    options = parser.parse_args(arguments)
    server = VisitServer((options.host, options.port), VisitCounter(options.count_file))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
