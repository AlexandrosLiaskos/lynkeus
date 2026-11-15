# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""Tests of the log of the web server and of the logs of the containers, as ``docs/Storage.md`` states them.

The settings are ``web/nginx.conf`` and ``compose.yaml``. The tests read them as text. They apply the two
maps of the web server to request lines with the regular expressions of the settings, which nginx reads in
the same syntax (PCRE) except for the form of a named group. The web server itself was run with these
settings on 15 November 2026 (``docs/research/records/storage/web_server_log.txt``).
"""

import re
from pathlib import Path

import pytest

REPOSITORY = Path(__file__).parents[2]
SETTINGS = (REPOSITORY / "web" / "nginx.conf").read_text(encoding="utf-8")
CONTAINERS = (REPOSITORY / "compose.yaml").read_text(encoding="utf-8")
STORAGE = (REPOSITORY / "docs" / "Storage.md").read_text(encoding="utf-8")

MAIN = (
    """'$remote_addr - $remote_user [$time_local] "$request" '"""
    """ '$status $body_bytes_sent "$http_referer" '"""
    """ '"$http_user_agent" "$http_x_forwarded_for"'"""
)
"""The format ``main`` of the settings that the image nginx:1.27-alpine carries, which the web server wrote before."""

FOLDER = "0123456789abcdef0123456789abcdef"
SERVER = "0123456789abcdef"


def _map(source: str, name: str) -> list[tuple[str, str]]:
    """Return the entries of a map of the settings, in their order: the value or the pattern, and the result."""
    found = re.search(rf"^map \${source} \${name} \{{\n(.*?)^\}}", SETTINGS, re.MULTILINE | re.DOTALL)
    assert found is not None
    entries = []
    for line in found.group(1).splitlines():
        entry = re.fullmatch(r'\s+(default|"[^"]*") ("[^"]*"|\S+);', line)
        assert entry is not None, line
        entries.append((entry.group(1).strip('"'), entry.group(2).strip('"')))
    return entries


def _written(source: str, name: str, value: str) -> str:
    """Return what a map of the settings gives for a value, as nginx does: the first pattern that matches."""
    entries = _map(source, name)
    assert ("default", f"${source}") in entries
    for pattern, replacement in entries:
        if pattern == value:
            return replacement
    for pattern, replacement in entries:
        found = re.search(pattern[1:].replace("(?<", "(?P<"), value) if pattern.startswith("~") else None
        if found is not None:
            return _filled(replacement, found.groupdict())
    return value


def _filled(replacement: str, groups: dict[str, str]) -> str:
    """Return the result of an entry of a map, with the value of each named group in the place of its variable."""
    return re.sub(r"\$(\w+)", lambda variable: groups[variable.group(1)], replacement)


@pytest.mark.parametrize(
    ("request_line", "written"),
    [
        ("GET / HTTP/1.1", "GET / HTTP/1.1"),
        ("GET /api/layers HTTP/1.1", "GET /api/layers HTTP/1.1"),
        (f"GET /files/{FOLDER}/gcov-hhhh-20261021.tif HTTP/1.1", "GET /files/-/gcov-hhhh-20261021.tif HTTP/1.1"),
        (f"HEAD /files/{FOLDER}/a.json?x=1 HTTP/2.0", "HEAD /files/-/a.json?x=1 HTTP/2.0"),
        (f"GET /files/{FOLDER} HTTP/1.1", "GET /files/- HTTP/1.1"),
        (f"GET /files/{FOLDER}?x HTTP/1.1", "GET /files/-?x HTTP/1.1"),
        ("GET /files/short/a.tif HTTP/1.1", "GET /files/short/a.tif HTTP/1.1"),
        (
            f"GET /api/servers/{SERVER}/files/{FOLDER}/a.tif HTTP/1.1",
            "GET /api/servers/-/files/-/a.tif HTTP/1.1",
        ),
        (f"GET /api/servers/{SERVER}/files/{FOLDER} HTTP/1.1", "GET /api/servers/-/files/- HTTP/1.1"),
        (f"PATCH /api/servers/{SERVER} HTTP/1.1", f"PATCH /api/servers/{SERVER} HTTP/1.1"),
        # The name of a layer is the name of the folder of its files, so it is left out of these addresses too.
        (f"DELETE /api/layers/{FOLDER} HTTP/1.1", "DELETE /api/layers/- HTTP/1.1"),
        (f"POST /api/layers/{FOLDER}/extension HTTP/1.1", "POST /api/layers/-/extension HTTP/1.1"),
        ("GET /api/layers HTTP/1.1", "GET /api/layers HTTP/1.1"),
        (f"GET /api/jobs/{FOLDER[::-1]} HTTP/1.1", f"GET /api/jobs/{FOLDER[::-1]} HTTP/1.1"),
        ("", ""),
    ],
)
def test_log_leaves_out_the_name_of_a_layer_folder_and_the_names_of_a_server_and_its_layer_in_a_file_address(
    request_line: str, written: str
) -> None:
    assert _written("request", "lynkeus_request", request_line) == written
    assert f"/{FOLDER}" not in written


@pytest.mark.parametrize(
    ("page", "written"),
    [
        ("", "-"),
        ("https://lynkeus.nkua.cloud/", "https://lynkeus.nkua.cloud/"),
        ("https://lynkeus.nkua.cloud/?area=1", "https://lynkeus.nkua.cloud/?area=1"),
        (f"https://lynkeus.nkua.cloud/files/{FOLDER}/a.json", "https://lynkeus.nkua.cloud/files/-/a.json"),
        (f"https://lynkeus.nkua.cloud/files/{FOLDER}", "https://lynkeus.nkua.cloud/files/-"),
        (
            f"https://lynkeus.nkua.cloud/api/servers/{SERVER}/files/{FOLDER}/a.json",
            "https://lynkeus.nkua.cloud/api/servers/-/files/-/a.json",
        ),
    ],
)
def test_log_writes_the_page_that_led_to_a_request_in_the_same_way(page: str, written: str) -> None:
    assert _written("http_referer", "lynkeus_referer", page) == written


def test_line_of_the_log_is_otherwise_the_line_that_the_web_server_wrote_before() -> None:
    found = re.search(r"^log_format lynkeus (.*?);$", SETTINGS, re.MULTILINE | re.DOTALL)
    assert found is not None
    form = " ".join(part.strip() for part in found.group(1).splitlines())
    assert form == MAIN.replace("$request", "$lynkeus_request").replace("$http_referer", "$lynkeus_referer")
    # What docs/Storage.md says a line holds: the address of the visitor, the time, the request, the page
    # that led to it and the name of the browser.
    for part in ("$remote_addr", "$time_local", "$lynkeus_request", "$lynkeus_referer", "$http_user_agent"):
        assert part in form
    assert "the address of the visitor, the time, the request, the page that led to it and the name of the browser" in (
        " ".join(STORAGE.split())
    )


def test_web_server_writes_one_log_of_the_requests_and_none_for_the_counter_of_visits() -> None:
    lines = [line.strip() for line in re.findall(r"^\s*access_log\b.*$", SETTINGS, re.MULTILINE)]
    assert lines == ["access_log /var/log/nginx/access.log lynkeus;", "access_log off;"]
    # The log is named inside the server, where it takes the place of the log in the format "main" that
    # nginx writes by itself. Named beside the server, it would be a second log with the whole address.
    server = SETTINGS[SETTINGS.index("\nserver {") :]
    assert "    access_log /var/log/nginx/access.log lynkeus;\n" in server
    assert re.search(r"location = /api/visit \{\s*access_log off;", server) is not None
    assert "access_log" not in SETTINGS[: SETTINGS.index("\nserver {")].replace("# ", "")


def test_missing_file_of_a_layer_is_not_written_in_the_log_of_the_errors() -> None:
    files = SETTINGS[SETTINGS.index('location ~ "^/files/[0-9a-f]{32}/[^/]+\\.(tif|json)$" {') :]
    assert "        log_not_found off;\n" in files[: files.index("\n    }\n")]


def test_log_of_each_container_holds_at_most_three_files_of_ten_megabytes() -> None:
    limits = 'x-logging: &logging\n  driver: json-file\n  options:\n    max-size: "10m"\n    max-file: "3"\n'
    assert limits in CONTAINERS
    services = re.split(
        r"^  (?=\w+:\n)",
        CONTAINERS[CONTAINERS.index("\nservices:\n") : CONTAINERS.index("\nnetworks:\n")],
        flags=re.MULTILINE,
    )[1:]
    assert [service.split(":")[0] for service in services] == ["web", "api", "visits"]
    for service in services:
        assert service.count("    logging: *logging\n") == 1
    # 3 files of 10 megabytes are the 30 megabytes of docs/Storage.md.
    assert "it keeps at most 30 megabytes of log" in " ".join(STORAGE.split())
