# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""Tests of the map data that Lynkeus names for its libraries, so that the data of no other program is used."""

import os
import subprocess
import sys
from pathlib import Path

import pytest
import rasterio

from lynkeus import mapdata
from tests.journey import CARRIES_MAP_DATA, other_map_data


def _package(folder: Path, *, proj: bool = True, gdal: bool = True) -> Path:
    """Make the folder of a package rasterio with the map data that the arguments name, and return it."""
    if proj:
        (folder / "proj_data").mkdir(parents=True)
        (folder / "proj_data" / "proj.db").write_bytes(b"")
    if gdal:
        (folder / "gdal_data").mkdir(parents=True)
        (folder / "gdal_data" / "gdalvrt.xsd").write_bytes(b"")
    return folder


def test_program_names_the_map_data_that_came_with_it_in_place_of_that_of_the_computer(tmp_path: Path) -> None:
    package = _package(tmp_path / "rasterio")
    postgis = r"C:\Program Files\PostgreSQL\16\share\contrib\postgis-3.6\proj"
    environment = {"PROJ_LIB": postgis, "GDAL_DATA": str(package / "gdal_data"), "PATH": "a-path"}
    assert mapdata.use_own_map_data(environment, package) == ["PROJ_LIB"]
    assert environment == {
        "PROJ_DATA": str(package / "proj_data"),
        "PROJ_LIB": str(package / "proj_data"),
        "GDAL_DATA": str(package / "gdal_data"),
        "PATH": "a-path",
    }
    # A variable that was not set is set without being counted, and a second call finds nothing to correct.
    assert mapdata.use_own_map_data(environment, package) == []


def test_program_leaves_the_map_data_of_the_computer_where_its_package_carries_none(tmp_path: Path) -> None:
    environment = {"PROJ_LIB": "/usr/share/proj", "GDAL_DATA": "/usr/share/gdal"}
    assert mapdata.use_own_map_data(environment, _package(tmp_path / "none", proj=False, gdal=False)) == []
    assert environment == {"PROJ_LIB": "/usr/share/proj", "GDAL_DATA": "/usr/share/gdal"}
    # The data of PROJ and that of GDAL are judged one by one.
    assert mapdata.use_own_map_data(environment, _package(tmp_path / "gdal", proj=False)) == ["GDAL_DATA"]
    assert environment == {"PROJ_LIB": "/usr/share/proj", "GDAL_DATA": str(tmp_path / "gdal" / "gdal_data")}


def test_package_of_rasterio_is_found_without_importing_it() -> None:
    assert mapdata.package_of_rasterio() == Path(rasterio.__file__).parent
    # The module of the package that names the data is read before rasterio is, so it must not import rasterio.
    code = "import sys\nimport lynkeus\nprint('rasterio' in sys.modules)\n"
    imported = subprocess.run(  # noqa: S603 - the interpreter that runs the tests
        [sys.executable, "-c", code], capture_output=True, text=True, timeout=120, check=True
    )
    assert imported.stdout.strip() == "False"


@pytest.mark.skipif(not CARRIES_MAP_DATA, reason="this rasterio carries no map data of its own")
def test_coordinate_systems_are_found_although_the_computer_names_other_map_data(tmp_path: Path) -> None:
    environment = {**os.environ, **other_map_data(tmp_path / "postgis")}

    def run(program: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(  # noqa: S603 - the interpreter that runs the tests
            [sys.executable, "-c", program], env=environment, capture_output=True, text=True, timeout=120, check=False
        )

    system = "from rasterio.crs import CRS\nprint(CRS.from_epsg(4326).to_epsg(), end=' ')\n"
    # Without the package PROJ reads the database of the other program and refuses it, as on the computer with PostGIS.
    refused = run(system)
    assert refused.returncode != 0
    assert "another PROJ installation" in refused.stderr
    named = run("import lynkeus\n" + system + "print(*lynkeus.OTHER_MAP_DATA)\n")
    assert named.returncode == 0, named.stderr
    assert named.stdout.split() == ["4326", "PROJ_DATA", "PROJ_LIB", "GDAL_DATA"]
