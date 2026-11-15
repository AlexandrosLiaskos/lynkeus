# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""Render the team log, a Markdown file, as a static web page.

The page and a copy of the source are written to one directory. Both files
are replaced only after the page has been rendered, so a source that cannot
be rendered leaves the published page unchanged.
"""

import argparse
import html
import re
from collections.abc import Sequence
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import markdown

DOWNLOAD_NAME = "team-log.md"
TEAM_ZONE = ZoneInfo("Europe/Athens")

_HEADING = re.compile(r"^# (.+)$", re.MULTILINE)
_EMPTY_HEADER = re.compile(r"\|\s*\|\s*\|")
_ENTRY = re.compile(r"\b[DA]-\d{2,}\b")
_ROW = re.compile(r"<tr>\s*<td>([DA]-\d{2,})</td>(.*?)</tr>", re.DOTALL)
_TABLE = re.compile(r"<table>.*?</table>", re.DOTALL)

_PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} | Lynkeus</title>
<meta name="description" content="The decisions and actions of Team Lynkeus, each with its reasons.">
<link rel="icon" href="/assets/lynkeus-mark.png">
<link rel="stylesheet" href="/assets/site.css">
<link rel="alternate" type="text/markdown" href="{download}" title="Team log (Markdown)">
<script src="/assets/visits.js" defer></script>
</head>
<body>
<a class="skip-link" href="#main">Skip to main content</a>
<header class="site-header">
<a class="site-brand" href="/">
<img src="/assets/lynkeus-mark.png" alt="" width="40" height="40">
<span class="site-name">Lynkeus</span>
</a>
</header>
<main id="main">
{body}
</main>
<footer class="site-footer">
<dl class="page-details">
<dt>Maintained by</dt><dd>Team Lynkeus</dd>
<dt>Last updated</dt><dd><time datetime="{changed_iso}">{changed}</time></dd>
<dt>Source file</dt><dd><a href="{download}" download>{download}</a></dd>
<dt>Recorded page visits</dt><dd id="visit-count" data-endpoint="/api/visit">not available</dd>
</dl>
<div class="notices">
<p>Lynkeus is an independent project of Team Lynkeus, prepared for the
<a href="https://www.spaceappschallenge.org/">2026 NASA Space Apps Challenge</a>, an international hackathon
organised by <a href="https://www.nasa.gov/">NASA</a>. It is not sponsored or endorsed by the National Aeronautics
and Space Administration (NASA).</p>
<p>This page uses no cookies. It keeps one marker in the browser, so that a visit is counted once, and the server
stores only the total number of visits.</p>
</div>
</footer>
</body>
</html>
"""


def details_list(source: str) -> str:
    """Rewrite the first two-column table with an empty header row as an HTML definition list.

    The text is returned unchanged if it holds no such table.
    """
    lines = source.splitlines()
    for start, line in enumerate(lines):
        if not _EMPTY_HEADER.fullmatch(line.strip()):
            continue
        end = start
        while end < len(lines) and lines[end].lstrip().startswith("|"):
            end += 1
        items = []
        for row in lines[start + 2 : end]:
            term, _, value = row.strip().strip("|").partition("|")
            items.append(f"<dt>{html.escape(term.strip())}</dt><dd>{html.escape(value.strip())}</dd>")
        return "\n".join([*lines[:start], '<dl class="details">', *items, "</dl>", *lines[end:]])
    return source


def mark_rows(table: str) -> str:
    """Anchor each entry row of a table and link the entry numbers in its cells.

    A row whose first cell is ``D-07`` or ``A-02`` gets the anchor ``d-07`` or
    ``a-02``. The table is wrapped in a region that scrolls sideways on narrow
    screens.
    """

    def row(match: re.Match[str]) -> str:
        entry, cells = match.groups()
        cells = _ENTRY.sub(lambda m: f'<a href="#{m.group(0).lower()}">{m.group(0)}</a>', cells)
        return f'<tr id="{entry.lower()}"><th scope="row">{entry}</th>{cells}</tr>'

    marked = _ROW.sub(row, table)
    return f'<div class="table-wrap" role="region" aria-label="Log entries" tabindex="0">{marked}</div>'


def render(source: str, changed: datetime) -> str:
    """Return the web page for the Markdown text of the log.

    Raises
    ------
    ValueError
        If the log has no first-level heading, or ``changed`` has no time zone.
    """
    title = _HEADING.search(source)
    if title is None:
        raise ValueError("the log has no first-level heading")
    offset = changed.utcoffset()
    if offset is None:
        raise ValueError("the time of the last change has no time zone")
    body = markdown.markdown(details_list(source), extensions=["tables"], output_format="html")
    body = _TABLE.sub(lambda m: mark_rows(m.group(0)), body)
    link = f'<p class="download"><a href="{DOWNLOAD_NAME}" download>Download the team log (Markdown)</a></p>'
    body = body.replace("</h1>", "</h1>\n" + link, 1)
    hours = int(offset.total_seconds() // 3600)
    return _PAGE.format(
        title=html.escape(title.group(1)),
        body=body,
        download=DOWNLOAD_NAME,
        changed=f"{changed.day} {changed:%B %Y, %H:%M} {changed:%Z} (UTC{hours:+d})",
        changed_iso=changed.isoformat(timespec="minutes"),
    )


def publish(source_path: Path, output_dir: Path) -> None:
    """Write ``index.html`` and a copy of the log into ``output_dir``.

    Raises
    ------
    ValueError
        If the log cannot be rendered. No file is changed in that case.
    """
    source = source_path.read_text(encoding="utf-8")
    changed = datetime.fromtimestamp(source_path.stat().st_mtime, tz=TEAM_ZONE)
    page = render(source, changed)
    output_dir.mkdir(parents=True, exist_ok=True)
    for name, text in (("index.html", page), (DOWNLOAD_NAME, source)):
        temporary = output_dir / (name + ".tmp")
        temporary.write_text(text, encoding="utf-8", newline="\n")
        temporary.chmod(0o644)
        temporary.replace(output_dir / name)


def main(arguments: Sequence[str] | None = None) -> None:
    """Publish the log from the command line."""
    parser = argparse.ArgumentParser(description="Publish the team log as a web page.")
    parser.add_argument("source", type=Path, help="Markdown file of the log")
    parser.add_argument("output", type=Path, help="directory that receives the page")
    options = parser.parse_args(arguments)
    publish(options.source, options.output)


if __name__ == "__main__":
    main()
