# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
# The description of the packed program Lynkeus Server for PyInstaller. ``pack.py`` uses it.
#
# The program is packed as a folder, which starts in a few seconds; one file would unpack itself at
# every start (docs/research/servers.md). rasterio is collected whole, because PyInstaller does not
# find its module ``rasterio.serde`` and the data files of GDAL and PROJ by itself. earthaccess and
# harmony-py read their version from the record of their installation, which is therefore packed.
#
# The licence and the notice of Lynkeus, LICENSE and NOTICE, go with every download. PyInstaller puts the
# data files of a folder into its subfolder _internal, so the two files are copied to the top of the
# folder, beside the program. The program for macOS is a bundle, and there they are data files of the
# bundle, which PyInstaller puts into its resources, Contents/Resources.

import shutil
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, copy_metadata

from lynkeus import __version__

# PyInstaller gives the names Analysis, PYZ, EXE, COLLECT, BUNDLE and SPECPATH to this file.

NAME = "Lynkeus Server"
TERMINAL = "lynkeus-server"
NOTICES = [Path(SPECPATH).parent.parent / name for name in ("LICENSE", "NOTICE")]

datas, binaries, hidden = collect_all("rasterio")
for distribution in ("earthaccess", "harmony-py"):
    datas += copy_metadata(distribution)
if sys.platform == "darwin":
    datas += [(str(path), ".") for path in NOTICES]

analysis = Analysis(
    [str(Path(SPECPATH) / "lynkeus_server.py")],
    binaries=binaries,
    datas=datas,
    hiddenimports=hidden,
)
archive = PYZ(analysis.pure)


def program(name: str, console: bool) -> object:
    """Describe a program file of the folder: with a window, or one that writes on the terminal."""
    return EXE(archive, analysis.scripts, [], exclude_binaries=True, name=name, console=console, upx=False)


if sys.platform == "win32":
    # A program with a window has no terminal on Windows, so the folder holds a second program that
    # writes on the terminal, for ``--no-window``.
    programs = [program(NAME, console=False), program(TERMINAL, console=True)]
elif sys.platform == "darwin":
    programs = [program(NAME, console=False)]
else:
    programs = [program(TERMINAL, console=True)]

folder = COLLECT(
    *programs, analysis.binaries, analysis.datas, name=TERMINAL if sys.platform.startswith("linux") else NAME, upx=False
)

if sys.platform == "darwin":
    BUNDLE(
        folder,
        name=f"{NAME}.app",
        bundle_identifier="cloud.nkua.lynkeus.server",
        version=__version__,
        info_plist={"NSHighResolutionCapable": True, "CFBundleShortVersionString": __version__},
    )
else:
    for path in NOTICES:
        shutil.copy2(path, Path(folder.name) / path.name)
