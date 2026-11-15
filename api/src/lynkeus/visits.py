# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""Count page visits and serve the total over HTTP.

``GET /api/visit`` returns the total, ``POST /api/visit`` adds one visit and
returns the new total, and ``GET /healthz`` reports that the service runs.
Only the total is stored; nothing about a visitor is kept.
"""

import argparse
import json
import threading
from collections.abc import Sequence
from contextlib import suppress
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

VISIT_PATH = "/api/visit"
HEALTH_PATH = "/healthz"


class VisitCounter:
    """Total of visits, kept in a JSON file that is created on the first visit."""

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
        """Return the total, or 0 if the file is missing or cannot be read."""
        with self._lock:
            return self._read()

    def increment(self) -> int:
        """Add one visit, replace the file atomically and return the new total."""
        with self._lock:
            count = self._read() + 1
            self._path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self._path.with_name(self._path.name + ".tmp")
            temporary.write_text(json.dumps({"count": count}), encoding="utf-8")
            temporary.replace(self._path)
            return count


class VisitServer(ThreadingHTTPServer):
    """HTTP server that gives its request handlers access to the counter."""

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
        path = urlparse(self.path).path
        if path == VISIT_PATH:
            self._send_json({"count": self.server.counter.current()})
        elif path == HEALTH_PATH:
            self._send_json({"status": "ok"})
        else:
            self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)

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

    def _send_json(self, payload: dict[str, object], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 - name set by the standard library
        """Write no access log, so that no address of a visitor is kept."""


def main(arguments: Sequence[str] | None = None) -> None:
    """Run the service until it is interrupted."""
    parser = argparse.ArgumentParser(description="Serve the total of recorded page visits.")
    parser.add_argument("--host", default="127.0.0.1", help="address to listen on")
    parser.add_argument("--port", type=int, default=8766, help="port to listen on")
    parser.add_argument("--count-file", type=Path, required=True, help="JSON file that holds the total")
    options = parser.parse_args(arguments)
    counter = VisitCounter(options.count_file)
    with VisitServer((options.host, options.port), counter) as server, suppress(KeyboardInterrupt):
        server.serve_forever()


if __name__ == "__main__":
    main()
