# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""Tests of the check of an Earthdata Login user token."""

import base64
import hashlib
import hmac
import json
import time
from collections.abc import Iterator
from http import HTTPStatus

import pytest

from lynkeus import earthdata
from lynkeus.earthdata import KeysUnavailableError, TokenChecker, TokenRefusedError
from tests.standin import DATA, KEY, KeyServer, key_server, token


@pytest.fixture
def keys() -> Iterator[KeyServer]:
    with key_server() as server:
        yield server


def test_token_signed_with_the_published_key_names_its_user(keys: KeyServer) -> None:
    expires = int(time.time()) + 600
    user = TokenChecker(keys.address).check(token("a_user", expires))
    assert (user.name, user.expires) == ("a_user", float(expires))


def test_token_signed_by_openssl_is_accepted(keys: KeyServer) -> None:
    # The file holds a token that the program openssl signed with the key of the tests (RS256).
    signed = (DATA / "token-openssl.txt").read_text(encoding="ascii")
    assert TokenChecker(keys.address).check(signed).name == "test_user"


def _changed(text: str, part: int) -> str:
    parts = text.split(".")
    parts[part] = parts[part][:-2] + ("AA" if not parts[part].endswith("AA") else "BB")
    return ".".join(parts)


def _signed_with_the_public_key_as_a_secret(text: str) -> str:
    header = base64.urlsafe_b64encode(json.dumps({"typ": "JWT", "alg": "HS256"}).encode()).rstrip(b"=").decode()
    signed = f"{header}.{text.split('.')[1]}"
    secret = json.dumps({name: KEY[name] for name in ("kty", "n", "e")}).encode()
    signature = hmac.new(secret, signed.encode(), hashlib.sha256).digest()
    return f"{signed}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode()}"


@pytest.mark.parametrize(
    "wrong",
    [
        "",
        "not a token",
        "a.b.c",
        token() + ".more",
        ".".join(token().split(".")[:2]) + ".",
        _changed(token(), 1),
        _changed(token(), 2),
        token(expires=time.time() - 1),
        token(algorithm="none"),
        token(algorithm="HS256"),
        _signed_with_the_public_key_as_a_secret(token()),
        token(user=""),
        token(uid=7),
        token(exp="tomorrow"),
        token(exp=float("nan")),
        token() + "x" * earthdata.MAX_TOKEN_LENGTH,
    ],
)
def test_other_text_is_refused_without_repeating_it(keys: KeyServer, wrong: str) -> None:
    with pytest.raises(TokenRefusedError) as refusal:
        TokenChecker(keys.address).check(wrong)
    assert refusal.value.__cause__ is None
    assert wrong == "" or wrong not in str(refusal.value)


def test_token_of_another_key_is_refused(keys: KeyServer) -> None:
    # The stand-in publishes another modulus, so the signature of the key of the tests does not verify.
    other = int.from_bytes(base64.urlsafe_b64decode(KEY["n"] + "=="), "big") - 2
    keys.keys[0]["n"] = base64.urlsafe_b64encode(other.to_bytes(256, "big")).rstrip(b"=").decode()
    with pytest.raises(TokenRefusedError):
        TokenChecker(keys.address).check(token())


@pytest.mark.parametrize("change", [{"kty": "EC"}, {"alg": "RS512"}, {"use": "enc"}, {"n": "AQAB"}])
def test_key_of_another_kind_or_a_short_key_is_not_used(keys: KeyServer, change: dict[str, str]) -> None:
    keys.keys[0].update(change)
    with pytest.raises(KeysUnavailableError):
        TokenChecker(keys.address).check(token())


def test_keys_are_kept_and_read_again_after_their_time(keys: KeyServer, monkeypatch: pytest.MonkeyPatch) -> None:
    checker = TokenChecker(keys.address)
    checker.check(token())
    checker.check(token())
    assert keys.requests == 1
    monkeypatch.setattr(earthdata, "KEYS_AGE", 0.0)
    checker.check(token())
    assert keys.requests == 2


def test_wrong_tokens_cause_one_reading_of_the_keys_in_the_pause(
    keys: KeyServer, monkeypatch: pytest.MonkeyPatch
) -> None:
    checker = TokenChecker(keys.address)
    for _ in range(3):
        with pytest.raises(TokenRefusedError):
            checker.check(_changed(token(), 2))
    assert keys.requests == 1
    monkeypatch.setattr(earthdata, "KEYS_PAUSE", 0.0)
    with pytest.raises(TokenRefusedError):
        checker.check(_changed(token(), 2))
    assert keys.requests == 2


def test_failure_to_read_the_keys_is_reported(keys: KeyServer) -> None:
    keys.status = HTTPStatus.INTERNAL_SERVER_ERROR
    with pytest.raises(KeysUnavailableError):
        TokenChecker(keys.address).check(token())
    with pytest.raises(KeysUnavailableError):
        TokenChecker("http://127.0.0.1:9/keys.json").check(token())


def test_address_of_the_keys_must_be_a_web_address() -> None:
    with pytest.raises(ValueError, match="https://"):
        TokenChecker("file:///etc/passwd")
