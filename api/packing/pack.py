# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""Pack Lynkeus Server for the operating system that runs, and make its download.

Run in ``api/`` with the packages of the group ``pack``::

    uv sync --frozen --group pack
    uv run python packing/pack.py

PyInstaller packs the program as a folder in ``dist/``. The download is made from that folder: an
installer for Windows (Inno Setup 6 or 7, whose compiler ``ISCC.exe`` must be installed), a disk image
with the program for macOS, and a ``.tar.gz`` file for Linux. The file ``dist/packed.json`` names the
download, its size, the program files and the places of LICENSE and NOTICE, which every download
carries, for the check of ``tests/journey.py``.
"""

import json
import shutil
import subprocess
import sys
import tarfile
import time
from pathlib import Path

import PyInstaller.__main__

from lynkeus import __version__

API = Path(__file__).resolve().parent.parent
DIST = API / "dist"
NAME = "Lynkeus Server"
TERMINAL = "lynkeus-server"
NOTICES = ("LICENSE", "NOTICE")
"""The licence and the notice of Lynkeus, which every download carries."""
INNO_SETUP = tuple(
    Path(folder) / f"Inno Setup {version}" / "ISCC.exe"
    for version in (7, 6)
    for folder in (r"C:\Program Files (x86)", r"C:\Program Files")
)
"""The places of the compiler of Inno Setup 7 or 6, when it is not on the search path."""


def _run(*command: str) -> None:
    """Run a program of the operating system that the packing needs, and stop when it fails."""
    subprocess.run(command, check=True, cwd=API)  # noqa: S603 - the commands are those of this file


def _folder_size(folder: Path) -> tuple[int, int]:
    """Return the size of the files of a folder, in bytes, and their number."""
    files = [path for path in folder.rglob("*") if path.is_file() and not path.is_symlink()]
    return sum(path.stat().st_size for path in files), len(files)


def pack() -> dict[str, object]:
    """Pack the program and make the download. Return the facts that ``dist/packed.json`` holds."""
    for old in (DIST, API / "build"):
        shutil.rmtree(old, ignore_errors=True)
    started = time.monotonic()
    PyInstaller.__main__.run(
        [
            str(API / "packing" / "lynkeus-server.spec"),
            "--noconfirm",
            "--distpath",
            str(DIST),
            "--workpath",
            str(API / "build"),
        ]
    )
    # The bundle for macOS keeps the two files among its resources, and the other folders at their top.
    if sys.platform == "darwin":
        notices = DIST / f"{NAME}.app" / "Contents" / "Resources"
    else:
        notices = DIST / (NAME if sys.platform == "win32" else TERMINAL)
    missing = [name for name in NOTICES if not (notices / name).is_file()]
    if missing:
        raise SystemExit(f"The packed folder lacks {', '.join(missing)} in {notices}.")
    if sys.platform == "win32":
        folder = DIST / NAME
        terminal, window = folder / f"{TERMINAL}.exe", folder / f"{NAME}.exe"
        download = DIST / f"Lynkeus-Server-{__version__}-Windows.exe"
        compiler = shutil.which("ISCC") or next((str(path) for path in INNO_SETUP if path.is_file()), None)
        if compiler is None:
            raise SystemExit("The compiler of Inno Setup (ISCC.exe) was not found. Install Inno Setup 6 or 7.")
        _run(compiler, f"/DVersion={__version__}", "/Qp", str(API / "packing" / "lynkeus-server.iss"))
    elif sys.platform == "darwin":
        folder = DIST / f"{NAME}.app"
        terminal = window = folder / "Contents" / "MacOS" / NAME
        download = DIST / f"Lynkeus-Server-{__version__}-macOS.dmg"
        _run("hdiutil", "create", "-volname", NAME, "-srcfolder", str(folder), "-ov", "-format", "UDZO", str(download))
    else:
        folder = DIST / TERMINAL
        terminal = window = folder / TERMINAL
        download = DIST / f"Lynkeus-Server-{__version__}-Linux.tar.gz"
        with tarfile.open(download, "w:gz") as archive:
            archive.add(folder, arcname=TERMINAL)
    size, files = _folder_size(folder)
    facts: dict[str, object] = {
        "version": __version__,
        "system": sys.platform,
        "download": download.name,
        "download_size": download.stat().st_size,
        "folder_size": size,
        "folder_files": files,
        "terminal": str(terminal.relative_to(DIST)),
        "window": str(window.relative_to(DIST)),
        "notices": [str((notices / name).relative_to(DIST)) for name in NOTICES],
        "packing_time": round(time.monotonic() - started),
    }
    (DIST / "packed.json").write_text(json.dumps(facts, indent=2) + "\n", encoding="utf-8")
    return facts


if __name__ == "__main__":
    sys.stdout.write(json.dumps(pack(), indent=2) + "\n")
