# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""The check of an Earthdata Login user token.

A user token is a JSON Web Token that NASA Earthdata Login signs with its
private key, with the algorithm RS256. Earthdata Login publishes the matching
public keys as a JSON Web Key Set. A token is accepted when one of these keys
verifies its signature and its time of expiry has not passed. The field
``uid`` of the token names the user.

The check does not ask Earthdata Login whether the user has revoked the
token. A revoked token is accepted until it expires, and the services of
NASA refuse it when a job uses it.

No message of an exception of this module holds a part of a token.
"""

import base64
import binascii
import hashlib
import hmac
import json
import math
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

KEYS_ADDRESS = "https://urs.earthdata.nasa.gov/.well-known/edl_ops_jwks.json"
"""The address of the public keys of Earthdata Login."""

KEYS_TIME = 10.0
"""The longest time to wait for the public keys, in seconds."""

KEYS_AGE = 3600.0
"""The time after which the public keys are read again, in seconds."""

KEYS_PAUSE = 60.0
"""The shortest time between two readings of the public keys, in seconds.

A token that no key verifies causes a new reading, because Earthdata Login
may have replaced its keys. The pause keeps wrong tokens from causing a
request to Earthdata Login each.
"""

MAX_KEYS_SIZE = 65536
"""The largest size of the answer with the public keys, in bytes."""

MAX_TOKEN_LENGTH = 4096
"""The largest length of a token, in characters."""

MIN_KEY_BITS = 2048
"""The smallest size of a public key that is used, in bits."""

_SHA256_DIGEST_INFO = bytes.fromhex("3031300d060960864801650304020105000420")
"""The bytes that precede a SHA-256 digest in a signature (RFC 8017, section 9.2, note 1)."""


class TokenRefusedError(Exception):
    """The text is not a user token that Earthdata Login accepts now."""


class KeysUnavailableError(Exception):
    """The public keys of Earthdata Login could not be read."""


@dataclass(frozen=True)
class EarthdataUser:
    """The user that a token names.

    Attributes
    ----------
    name : str
        User name at Earthdata Login.
    expires : float
        Time at which the token expires, in seconds since 1 January 1970 (UTC).
    """

    name: str
    expires: float


@dataclass(frozen=True)
class _Key:
    modulus: int
    exponent: int


def _decoded(part: str) -> bytes:
    """Decode a part of a token from base64url without padding (RFC 7515, section 2)."""
    return base64.b64decode(part + "=" * (-len(part) % 4), altchars=b"-_", validate=True)


def _verifies(key: _Key, signed: bytes, signature: bytes) -> bool:
    """Tell whether a key verifies a signature of RSASSA-PKCS1-v1_5 with SHA-256 (RFC 8017, section 8.2.2)."""
    size = (key.modulus.bit_length() + 7) // 8
    number = int.from_bytes(signature, "big")
    if len(signature) != size or number >= key.modulus:
        return False
    digest = hashlib.sha256(signed).digest()
    padding = b"\xff" * (size - len(_SHA256_DIGEST_INFO) - len(digest) - 3)
    expected = b"\x00\x01" + padding + b"\x00" + _SHA256_DIGEST_INFO + digest
    return hmac.compare_digest(pow(number, key.exponent, key.modulus).to_bytes(size, "big"), expected)


def _keys(text: bytes) -> tuple[_Key, ...]:
    """Read the RSA keys of a JSON Web Key Set (RFC 7517)."""
    keys = []
    for entry in json.loads(text)["keys"]:
        if entry.get("kty") != "RSA" or entry.get("alg", "RS256") != "RS256" or entry.get("use", "sig") != "sig":
            continue
        key = _Key(int.from_bytes(_decoded(entry["n"]), "big"), int.from_bytes(_decoded(entry["e"]), "big"))
        if key.modulus.bit_length() >= MIN_KEY_BITS and key.exponent >= 3:
            keys.append(key)
    return tuple(keys)


class TokenChecker:
    """Checks user tokens with the public keys of Earthdata Login.

    Parameters
    ----------
    address : str
        Address of the JSON Web Key Set.
    """

    def __init__(self, address: str = KEYS_ADDRESS) -> None:
        if not address.startswith(("https://", "http://")):
            raise ValueError("the address of the keys must start with https:// or http://")
        self._address = address
        self._lock = threading.Lock()
        self._keys: tuple[_Key, ...] = ()
        self._read = float("-inf")

    def _read_keys(self) -> None:
        self._read = time.monotonic()
        try:
            with urllib.request.urlopen(self._address, timeout=KEYS_TIME) as answer:  # noqa: S310 - the scheme is checked above
                keys = _keys(answer.read(MAX_KEYS_SIZE + 1)[:MAX_KEYS_SIZE])
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
            raise KeysUnavailableError("the public keys of Earthdata Login could not be read") from error
        if not keys:
            raise KeysUnavailableError("the answer of Earthdata Login holds no RSA key")
        self._keys = keys

    def _verifying_key_exists(self, signed: bytes, signature: bytes) -> bool:
        with self._lock:
            age = time.monotonic() - self._read
            if not self._keys or age > KEYS_AGE:
                self._read_keys()
                age = 0.0
            if any(_verifies(key, signed, signature) for key in self._keys):
                return True
            if age < KEYS_PAUSE:
                return False
            self._read_keys()
            return any(_verifies(key, signed, signature) for key in self._keys)

    def check(self, token: str) -> EarthdataUser:
        """Return the user that a token names.

        Raises
        ------
        TokenRefusedError
            When the text is not a token, no public key of Earthdata Login
            verifies it, or it has expired.
        KeysUnavailableError
            When the public keys could not be read.
        """
        try:
            if len(token) > MAX_TOKEN_LENGTH:
                raise ValueError
            header_part, claims_part, signature_part = token.split(".")
            header = json.loads(_decoded(header_part))
            claims = json.loads(_decoded(claims_part))
            signature = _decoded(signature_part)
            name, expires = claims["uid"], claims["exp"]
            if header["alg"] != "RS256" or not isinstance(name, str) or not 0 < len(name) <= 255:
                raise ValueError
            if isinstance(expires, bool) or not isinstance(expires, int | float) or not math.isfinite(expires):
                raise ValueError
        except (ValueError, KeyError, TypeError, AttributeError, binascii.Error):
            raise TokenRefusedError("the text is not a user token of Earthdata Login") from None
        if not self._verifying_key_exists(f"{header_part}.{claims_part}".encode("ascii"), signature):
            raise TokenRefusedError("no public key of Earthdata Login verifies the token")
        if expires <= time.time():
            raise TokenRefusedError("the token has expired")
        return EarthdataUser(name=name, expires=float(expires))
