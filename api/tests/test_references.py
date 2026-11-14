"""Tests of the reading of an input value that a request gives by reference."""

import socket
import ssl
import threading
from collections.abc import Callable, Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import pytest

from lynkeus import references
from lynkeus.references import UnreadableReferenceError, read_reference
from tests.standin import DATA

CERTIFICATE = DATA / "reference.test.pem"
"""A certificate for the host name reference.test, with its private key, made for the tests."""


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        status, headers, body = {
            "/value.json?x=1": (200, {}, b'{"a": [1, 2]}'),
            "/text": (200, {}, b"not JSON"),
            "/large": (200, {}, b"1" * (references.MAX_REFERENCE_SIZE + 1)),
            "/moved": (302, {"Location": "/value.json?x=1"}, b""),
        }.get(self.path, (404, {}, b""))
        self.send_response(status)
        for name, value in {**headers, "Content-Length": str(len(body))}.items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 - name set by the standard library
        pass


@pytest.fixture
def port(monkeypatch: pytest.MonkeyPatch) -> Iterator[int]:
    """Serve HTTPS on this machine under the certificate of reference.test, and let the reading trust it."""
    security = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    security.load_cert_chain(CERTIFICATE)
    with ThreadingHTTPServer(("127.0.0.1", 0), _Handler) as server:
        server.socket = security.wrap_socket(server.socket, server_side=True)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        trusting = ssl.create_default_context(cafile=str(CERTIFICATE))
        monkeypatch.setattr(ssl, "create_default_context", lambda: trusting)
        yield server.server_address[1]
        server.shutdown()
        thread.join()


def _resolves_to(*addresses: str) -> Callable[..., list[Any]]:
    def getaddrinfo(host: str, port: int, **_: object) -> list[Any]:
        return [
            (socket.AF_INET6 if ":" in address else socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, port))
            for address in addresses
        ]

    return getaddrinfo


def test_value_is_read_from_the_address_that_was_checked(port: int, monkeypatch: pytest.MonkeyPatch) -> None:
    # The name reference.test has no address. The reading succeeds because it
    # connects to the address that the check returned and does not look the name up again.
    monkeypatch.setattr(references, "_public_address", lambda host, port: "127.0.0.1")
    assert read_reference(f"https://reference.test:{port}/value.json?x=1") == {"a": [1, 2]}


def test_certificate_must_match_the_host_name(port: int, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(references, "_public_address", lambda host, port: "127.0.0.1")
    with pytest.raises(UnreadableReferenceError, match="could not be read"):
        read_reference(f"https://other.test:{port}/value.json?x=1")


@pytest.mark.parametrize(
    ("path", "reason"),
    [
        ("/moved", "status 302"),
        ("/missing", "status 404"),
        ("/text", "is not JSON"),
        ("/large", "is larger than 65536 bytes"),
    ],
)
def test_redirect_error_other_text_and_large_value_are_refused(
    port: int, monkeypatch: pytest.MonkeyPatch, path: str, reason: str
) -> None:
    monkeypatch.setattr(references, "_public_address", lambda host, port: "127.0.0.1")
    with pytest.raises(UnreadableReferenceError, match=reason):
        read_reference(f"https://reference.test:{port}{path}")


def test_answer_that_does_not_come_in_time_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(references, "REFERENCE_TIME", 0.2)
    monkeypatch.setattr(references, "_public_address", lambda host, port: "127.0.0.1")
    with (
        socket.create_server(("127.0.0.1", 0)) as silent,
        pytest.raises(UnreadableReferenceError, match="could not be read"),
    ):
        read_reference(f"https://reference.test:{silent.getsockname()[1]}/value.json")


@pytest.mark.parametrize(
    "address",
    [
        "http://example.org/value.json",
        "ftp://example.org/value.json",
        "file:///etc/passwd",
        "https:///value.json",
        "https://user:word@example.org/value.json",
        "https://example.org:port/value.json",
        "value.json",
    ],
)
def test_address_that_is_not_https_with_a_host_is_refused(address: str) -> None:
    with pytest.raises(UnreadableReferenceError, match=r"https://|not a valid address"):
        read_reference(address)


@pytest.mark.parametrize(
    "host",
    [
        "127.0.0.1",
        "localhost",
        "10.0.0.5",
        "172.16.0.1",
        "192.168.1.1",
        "169.254.169.254",
        "100.64.0.1",
        "0.0.0.0",  # noqa: S104 - an address that must be refused
        "192.0.2.1",
        "224.0.0.1",
        "240.0.0.1",
        "[::1]",
        "[fc00::1]",
        "[fe80::1]",
        "[::ffff:127.0.0.1]",
        "[2001:db8::1]",
        "[ff02::1]",
        "[2002:7f00:1::1]",
        "[2002:a00:5::1]",
    ],
)
def test_address_that_is_not_public_is_refused_before_any_connection(
    host: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    def no_connection(*_: object, **__: object) -> None:
        raise AssertionError("a connection was opened")

    monkeypatch.setattr(socket, "create_connection", no_connection)
    with pytest.raises(UnreadableReferenceError, match="public address"):
        read_reference(f"https://{host}/value.json")


def test_host_is_refused_when_one_of_its_addresses_is_not_public(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(socket, "getaddrinfo", _resolves_to("93.184.215.14", "10.0.0.5"))
    with pytest.raises(UnreadableReferenceError, match="public address"):
        references._public_address("example.org", 443)
    monkeypatch.setattr(socket, "getaddrinfo", _resolves_to("2606:4700::6810:84e5", "fe80::1%eth0"))
    with pytest.raises(UnreadableReferenceError, match="public address"):
        references._public_address("example.org", 443)


def test_public_host_gives_its_first_address_and_an_unknown_host_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(socket, "getaddrinfo", _resolves_to("93.184.215.14", "2606:4700::6810:84e5"))
    assert references._public_address("example.org", 443) == "93.184.215.14"

    def unknown(*_: object, **__: object) -> list[Any]:
        raise socket.gaierror("no such host")

    monkeypatch.setattr(socket, "getaddrinfo", unknown)
    with pytest.raises(UnreadableReferenceError, match="was not found"):
        references._public_address("example.org", 443)
