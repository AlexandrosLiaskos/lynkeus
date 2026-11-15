# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""The reading of an input value that a request gives by reference.

OGC API - Processes lets a request give an input value as a link instead of
the value. The server then reads the address of the link, so a request could
make it read an address inside its own network. A link is therefore read
only when it uses HTTPS and its host name stands for public addresses, the
connection goes to one of the addresses that were checked, a redirect is not
followed, and the answer is JSON of a limited size.
"""

import http.client
import ipaddress
import json
import socket
import ssl
from collections.abc import Callable
from urllib.parse import urlsplit

REFERENCE_TIME = 10.0
"""The longest time to wait for the value of a link, in seconds."""

MAX_REFERENCE_SIZE = 65536
"""The largest size of the value of a link, in bytes. It equals the largest size of a request body."""

type Reader = Callable[[str], object]


class UnreadableReferenceError(Exception):
    """The value of a link could not be read. The message is a sentence for the visitor."""


REFUSED = "This server does not read an input value given as a link. Give the value itself."
"""The sentence for a request that gives an input value as a link to a server that reads no link."""


def refuse_reference(_address: str) -> object:
    """Refuse the link of an input value without opening a connection.

    The web service installs this function in place of :func:`read_reference`. A request reaches the
    reading of its links before its sign-in is checked, and the reading has a time limit for each step
    of the exchange but none for the whole of it. A host that answers very slowly therefore holds a
    thread for as long as it likes, and the sign-in, the search and the jobs wait for the same threads.

    Raises
    ------
    UnreadableReferenceError
        Always.
    """
    raise UnreadableReferenceError(REFUSED)


def _is_public(text: str) -> bool:
    """Tell whether an address, and an IPv4 address that an IPv6 address carries inside it, is public."""
    address = ipaddress.ip_address(text.split("%")[0])
    parts: list[ipaddress.IPv4Address | ipaddress.IPv6Address | None] = [address]
    if isinstance(address, ipaddress.IPv6Address):
        parts += [address.ipv4_mapped, address.sixtofour, *(address.teredo or ())]
    return all(part.is_global and not part.is_multicast for part in parts if part is not None)


def _public_address(host: str, port: int) -> str:
    """Return one address of a host, after checking that all its addresses are public."""
    try:
        found = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError as error:
        raise UnreadableReferenceError("The host of a link given as an input value was not found.") from error
    addresses = [str(entry[4][0]) for entry in found]
    if not addresses or not all(_is_public(address) for address in addresses):
        raise UnreadableReferenceError("A link given as an input value must lead to a public address.")
    return addresses[0]


class _Connection(http.client.HTTPSConnection):
    """An HTTPS connection to a fixed address, which checks the certificate against the host name."""

    def __init__(self, host: str, port: int, address: str) -> None:
        self._security = ssl.create_default_context()
        super().__init__(host, port, timeout=REFERENCE_TIME, context=self._security)
        self._address = address

    def connect(self) -> None:
        connection = socket.create_connection((self._address, self.port), self.timeout)
        self.sock = self._security.wrap_socket(connection, server_hostname=self.host)


def read_reference(address: str) -> object:
    """Return the JSON value at the address of a link.

    Raises
    ------
    UnreadableReferenceError
        When the address is not allowed or its value could not be read.
    """
    try:
        parts = urlsplit(address)
        host, port = parts.hostname, parts.port or 443
    except ValueError as error:
        raise UnreadableReferenceError("A link given as an input value is not a valid address.") from error
    if parts.scheme != "https" or not host or parts.username is not None:
        raise UnreadableReferenceError("A link given as an input value must start with https:// and name a host.")
    connection = _Connection(host, port, _public_address(host, port))
    try:
        target = (parts.path or "/") + (f"?{parts.query}" if parts.query else "")
        connection.request("GET", target, headers={"Accept": "application/json"})
        answer = connection.getresponse()
        if answer.status != http.client.OK:
            raise UnreadableReferenceError(f"A link given as an input value was answered with status {answer.status}.")
        text = answer.read(MAX_REFERENCE_SIZE + 1)
    except (OSError, http.client.HTTPException) as error:
        raise UnreadableReferenceError("A link given as an input value could not be read.") from error
    finally:
        connection.close()
    if len(text) > MAX_REFERENCE_SIZE:
        raise UnreadableReferenceError(f"The value of a link is larger than {MAX_REFERENCE_SIZE} bytes.")
    try:
        return json.loads(text)
    except ValueError as error:
        raise UnreadableReferenceError("The value of a link given as an input value is not JSON.") from error
