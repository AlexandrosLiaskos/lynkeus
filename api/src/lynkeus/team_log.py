"""Render the team log, a Markdown file, as a static web page.

The page and a copy of the source are written to one directory. Both files
are replaced only after the page has been rendered, so a source that cannot
be rendered leaves the published page unchanged.
"""

from __future__ import annotations

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
_ENTRY = re.compile(r"L-\d+")
_ROW = re.compile(r"<tr>\s*<td>(L-\d+)</td>(.*?)</tr>", re.DOTALL)
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
    """Replace the table of details, whose header row is empty, with a definition list.

    Parameters
    ----------
    source : str
        Markdown text of the log.

    Returns
    -------
    str
        The text with the first two-column table that has an empty header
        row rewritten as an HTML definition list. The text is returned
        unchanged if it holds no such table.
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
        block = ['<dl class="details">', *items, "</dl>"]
        return "\n".join([*lines[:start], *block, *lines[end:]])
    return source


def mark_rows(table: str) -> str:
    """Give every entry row an anchor and link the references to other entries.

    Parameters
    ----------
    table : str
        HTML of one table of log entries.

    Returns
    -------
    str
        The table, wrapped in a region that scrolls sideways on narrow
        screens. Each row whose first cell is an entry number such as
        ``L-07`` carries the anchor ``l-07``, and each such number in the
        other cells is a link to that anchor.
    """

    def row(match: re.Match[str]) -> str:
        entry, cells = match.group(1), match.group(2)
        cells = _ENTRY.sub(lambda m: f'<a href="#{m.group(0).lower()}">{m.group(0)}</a>', cells)
        return f'<tr id="{entry.lower()}"><th scope="row">{entry}</th>{cells}</tr>'

    marked = _ROW.sub(row, table)
    return f'<div class="table-wrap" role="region" aria-label="Log entries" tabindex="0">{marked}</div>'


def render(source: str, changed: datetime) -> str:
    """Return the complete web page for the Markdown text of the log.

    Parameters
    ----------
    source : str
        Markdown text of the log.
    changed : datetime
        Time of the last change of the log, with its time zone.

    Returns
    -------
    str
        The HTML page.

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
    """Write the page and a copy of the log into a directory.

    Parameters
    ----------
    source_path : Path
        The Markdown file of the log.
    output_dir : Path
        The directory that receives ``index.html`` and the copy of the log.
        It is created if it does not exist.

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


def main(arguments: Sequence[str] | None = None) -> int:
    """Publish the log from the command line.

    Parameters
    ----------
    arguments : Sequence[str] or None, optional
        Command-line arguments; the arguments of the process if ``None``.

    Returns
    -------
    int
        The exit status: 0 on success.
    """
    parser = argparse.ArgumentParser(description="Publish the team log as a web page.")
    parser.add_argument("source", type=Path, help="Markdown file of the log")
    parser.add_argument("output", type=Path, help="directory that receives the page")
    options = parser.parse_args(arguments)
    publish(options.source, options.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
