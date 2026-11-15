# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""Tests of the team-log page."""

from datetime import datetime
from pathlib import Path

import pytest

from lynkeus import team_log

LOG = """# Team Lynkeus: Team Log

| | |
|---|---|
| Event | Example <event> |
| Last updated | 14 Nov 2026 |

Introduction.

## 1. Decisions

| ID | Date | Decision | Reasons |
|---|---|---|---|
| D-01 | 29 Oct 2026 | First decision. | First reason. |
| D-02 | 30 Oct 2026 | Second decision (D-01). | It follows D-01 and policy SPD-41a. |

## 2. Actions

| ID | Date | Action | Reasons |
|---|---|---|---|
| A-01 | 31 Oct 2026 | First action (D-02). | It carries out D-02. |
"""

CHANGED = datetime(2026, 11, 14, 11, 42, tzinfo=team_log.TEAM_ZONE)


def test_details_become_a_definition_list() -> None:
    text = team_log.details_list(LOG)
    assert '<dl class="details">' in text
    assert "<dt>Event</dt><dd>Example &lt;event&gt;</dd>" in text
    assert "| Event |" not in text


def test_text_without_details_is_unchanged() -> None:
    assert team_log.details_list("# Title\n\nText.") == "# Title\n\nText."


def test_entry_rows_have_anchors_and_links() -> None:
    page = team_log.render(LOG, CHANGED)
    assert '<tr id="d-01"><th scope="row">D-01</th>' in page
    assert '<tr id="d-02"><th scope="row">D-02</th>' in page
    assert '<tr id="a-01"><th scope="row">A-01</th>' in page
    assert page.count('<a href="#d-01">D-01</a>') == 2
    assert page.count('<a href="#d-02">D-02</a>') == 2


def test_other_codes_are_not_linked() -> None:
    page = team_log.render(LOG, CHANGED)
    assert "policy SPD-41a." in page
    assert 'href="#d-41"' not in page


def test_page_states_title_time_and_download() -> None:
    page = team_log.render(LOG, CHANGED)
    assert "<title>Team Lynkeus: Team Log | Lynkeus</title>" in page
    assert '<time datetime="2026-11-14T11:42+02:00">14 November 2026, 11:42 EET (UTC+2)</time>' in page
    assert f'<a href="{team_log.DOWNLOAD_NAME}" download>' in page
    assert page.count("</footer>") == 1
    assert "not sponsored or endorsed by the National Aeronautics" in page


def test_log_without_heading_is_rejected() -> None:
    with pytest.raises(ValueError, match="first-level heading"):
        team_log.render("No heading.", CHANGED)


def test_time_without_zone_is_rejected() -> None:
    with pytest.raises(ValueError, match="time zone"):
        team_log.render(LOG, datetime(2026, 11, 14, 11, 42))


def test_publish_writes_page_and_copy(tmp_path: Path) -> None:
    source = tmp_path / "Team_Log.md"
    source.write_text(LOG, encoding="utf-8")
    output = tmp_path / "site" / "team-log"
    team_log.main([str(source), str(output)])
    assert (output / "index.html").read_text(encoding="utf-8").startswith("<!doctype html>")
    assert (output / team_log.DOWNLOAD_NAME).read_text(encoding="utf-8") == LOG
    assert not list(output.glob("*.tmp"))


def test_failed_publish_keeps_the_page(tmp_path: Path) -> None:
    source = tmp_path / "Team_Log.md"
    source.write_text(LOG, encoding="utf-8")
    team_log.publish(source, tmp_path)
    published = (tmp_path / "index.html").read_text(encoding="utf-8")
    source.write_text("No heading.", encoding="utf-8")
    with pytest.raises(ValueError, match="first-level heading"):
        team_log.publish(source, tmp_path)
    assert (tmp_path / "index.html").read_text(encoding="utf-8") == published
