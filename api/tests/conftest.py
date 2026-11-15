# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""What several test files share."""

import json
from pathlib import Path

import pytest

from lynkeus import jobs
from lynkeus.products import ProductDetail, detail_from_record

FREE_SPACE = 100_000_000_000
"""The free space that the disk of every test has, in bytes, unless the test sets another."""


@pytest.fixture(autouse=True)
def free_space(monkeypatch: pytest.MonkeyPatch) -> None:
    """Give the jobs a disk with free space, so that no test depends on the disk of the machine that runs it."""
    monkeypatch.setattr(jobs, "free_space", lambda folder: FREE_SPACE)


@pytest.fixture
def detail() -> ProductDetail:
    """Everything that the record of a real backscatter product states."""
    records = json.loads((Path(__file__).parent / "data" / "granule-gcov.json").read_text(encoding="utf-8"))
    return detail_from_record(records["items"][0])
