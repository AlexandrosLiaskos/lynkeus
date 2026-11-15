# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""What several test files share."""

import json
from pathlib import Path

import pytest

from lynkeus.products import ProductDetail, detail_from_record


@pytest.fixture
def detail() -> ProductDetail:
    """Everything that the record of a real backscatter product states."""
    records = json.loads((Path(__file__).parent / "data" / "granule-gcov.json").read_text(encoding="utf-8"))
    return detail_from_record(records["items"][0])
