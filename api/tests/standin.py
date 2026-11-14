"""A stand-in process and stand-in services for the tests of the sessions, processes and jobs."""

import base64
import hashlib
import json
import os
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Literal

from pydantic import Field

from lynkeus.layers import Format, LayerDescription, Text
from lynkeus.processes import Binary, BoundingBox, Process, ProcessError, Work

DATA = Path(__file__).parent / "data"
KEY = json.loads((DATA / "token-key.json").read_text(encoding="utf-8"))
"""An RSA key made for the tests, with its private part. It protects nothing."""


class StandInInputs(Format):
    """The inputs of the stand-in process."""

    name: Text = Field(pattern=r"^[a-z0-9-]+$", description="Name of the layer and of its files.")
    seconds: float = Field(default=0.0, ge=0, le=60)
    size: int = Field(default=2000, ge=1)
    area: BoundingBox | None = None
    data: Binary | None = None
    uses: tuple[Text, ...] = ()
    end: Literal["layer", "sentence", "fault", "token", "exit", "other-name", "no-file", "long"] = "layer"


def run(inputs: StandInInputs, work: Work) -> LayerDescription:
    """Write two small files after a pause, or end in the way that the inputs ask for."""
    work.report(5, f"The stand-in has started with the token {work.token}.")
    start = time.monotonic()
    while (passed := time.monotonic() - start) < inputs.seconds:
        work.report(int(5 + 90 * passed / inputs.seconds), "The stand-in waits.")
        time.sleep(0.05)
    if inputs.end == "sentence":
        raise ProcessError("The stand-in was asked to fail.")
    if inputs.end == "long":
        raise ProcessError("The stand-in fails with many words. " * 40)
    if inputs.end == "fault":
        raise KeyError("a detail that the visitor must not see")
    if inputs.end == "token":
        raise ProcessError(f"NASA refused the token {work.token}.")
    if inputs.end == "exit":
        os._exit(3)
    for layer in inputs.uses:
        description, path = work.layers[layer]
        if not path.is_file() or description.id != layer:
            raise ProcessError("An input layer has no file.")
    if inputs.end != "no-file":
        (work.folder / f"{inputs.name}.tif").write_bytes(bytes(index % 251 for index in range(inputs.size)))
    record = {"type": "Feature", "properties": {"title": inputs.name}}
    (work.folder / f"{inputs.name}.json").write_text(json.dumps(record), encoding="utf-8")
    (work.folder / "rest.tmp").write_bytes(b"rest")
    return LayerDescription(
        id="other" if inputs.end == "other-name" else work.layer_id,
        title=inputs.name,
        kind="layer",
        url=f"{work.address}/{inputs.name}.tif",
        quantity="Stand-in",
        unit="1",
        range=(0.0, 1.0),
        colours="grey",
        dates=(date(2026, 11, 14),),
        inputs=inputs.uses or ("stand-in",),
        program="stand-in",
        record=f"{work.address}/{inputs.name}.json",
    )


def job_title(inputs: StandInInputs) -> str:
    return f"Stand-in {inputs.name}"


STAND_IN = Process(
    id="stand-in",
    title="Stand-in",
    description="Writes two small files after a pause.",
    inputs=StandInInputs,
    run=run,
    job_title=job_title,
)

SIGNED_IN = Process(
    id="signed-in",
    title="Stand-in for a signed-in visitor",
    description="Writes two small files after a pause, for a visitor who is signed in to Earthdata.",
    inputs=StandInInputs,
    run=run,
    job_title=job_title,
    needs_earthdata=True,
    parameters={"most-seconds": [60], "kinds": ["layer", "result"]},
)


def _part(value: object) -> str:
    text = value if isinstance(value, bytes) else json.dumps(value).encode()
    return base64.urlsafe_b64encode(text).rstrip(b"=").decode()


def _number(name: str) -> int:
    return int.from_bytes(base64.urlsafe_b64decode(KEY[name] + "=="), "big")


def token(user: str = "test_user", expires: float | None = None, algorithm: str = "RS256", **claims: object) -> str:
    """Return a user token in the form of Earthdata Login, signed with the key of the tests."""
    header = {"typ": "JWT", "origin": "Earthdata Login", "sig": "edljwtpubkey_ops", "alg": algorithm}
    body = {
        "type": "User",
        "uid": user,
        "exp": int(time.time() + 3600 if expires is None else expires),
        "iss": "Earthdata Login",
    }
    signed = f"{_part(header)}.{_part({**body, **claims})}"
    modulus = _number("n")
    size = (modulus.bit_length() + 7) // 8
    digest = bytes.fromhex("3031300d060960864801650304020105000420") + hashlib.sha256(signed.encode()).digest()
    encoded = b"\x00\x01" + b"\xff" * (size - len(digest) - 3) + b"\x00" + digest
    signature = pow(int.from_bytes(encoded, "big"), _number("d"), modulus).to_bytes(size, "big")
    return f"{signed}.{_part(signature)}"


class KeyServer(ThreadingHTTPServer):
    """A stand-in for Earthdata Login that serves the public part of the key of the tests."""

    def __init__(self) -> None:
        super().__init__(("127.0.0.1", 0), _KeyHandler)
        self.requests = 0
        self.status = HTTPStatus.OK
        self.keys = [{name: KEY[name] for name in ("kty", "kid", "n", "e")}]

    @property
    def address(self) -> str:
        return f"http://127.0.0.1:{self.server_address[1]}/keys.json"


class _KeyHandler(BaseHTTPRequestHandler):
    server: KeyServer

    def do_GET(self) -> None:
        self.server.requests += 1
        body = json.dumps({"keys": self.server.keys}).encode()
        self.send_response(self.server.status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 - name set by the standard library
        pass


@contextmanager
def key_server() -> Iterator[KeyServer]:
    """Run the stand-in for Earthdata Login until the block ends."""
    with KeyServer() as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield server
        finally:
            server.shutdown()
            thread.join()
