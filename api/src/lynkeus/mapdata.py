"""The map data that the libraries of Lynkeus read, and the variables of the environment that name it.

rasterio holds PROJ and GDAL, and both read data files, among them the database of the coordinate systems of PROJ.
A variable of the environment names the folder of each. PostGIS, QGIS and other programs set these variables for
the whole computer, to the data of their own versions of the libraries, and rasterio then takes that data in place
of its own. PROJ refuses a database of another version, so that no layer can be written. ``use_own_map_data`` names
the folders that came with rasterio instead.

rasterio reads the variables at the moment when it is imported. ``lynkeus/__init__.py`` therefore runs
``use_own_map_data`` before any module of the package imports rasterio, and this module imports neither rasterio
nor a module that does.
"""

import importlib.util
import os
import sys
from collections.abc import MutableMapping
from pathlib import Path

MAP_DATA = (
    ("PROJ_DATA", "proj_data", "proj.db"),
    ("PROJ_LIB", "proj_data", "proj.db"),
    ("GDAL_DATA", "gdal_data", "gdalvrt.xsd"),
)
"""The variables of the environment that ``use_own_map_data`` sets.

Each entry holds the name of a variable that gives the folder of the data of PROJ or of GDAL, the folder of that
data in the package rasterio, and a file of the folder that shows the data is there. ``PROJ_LIB`` is the name that
PROJ used before its version 9.1.
"""


def package_of_rasterio() -> Path | None:
    """Return the folder of the package rasterio without importing it, or None when it is not installed."""
    spec = importlib.util.find_spec("rasterio")
    places = spec.submodule_search_locations if spec is not None else None
    if places:
        return Path(next(iter(places)))
    # A packed program holds its packages in the folder that PyInstaller names.
    bundle = getattr(sys, "_MEIPASS", None)
    return Path(bundle) / "rasterio" if bundle else None


def use_own_map_data(environment: MutableMapping[str, str] | None = None, package: Path | None = None) -> list[str]:
    """Make the libraries that write a layer read the map data that came with them.

    Parameters
    ----------
    environment : mutable mapping of str to str, optional
        Environment variables. Without it, those of the program. A job runs in a new process, which takes them
        from the program.
    package : pathlib.Path, optional
        Folder of the package rasterio. Without it, the folder of the package that is installed.

    Returns
    -------
    list of str
        The variables that named another folder than that of rasterio. A variable that was not set is not
        listed. A folder that rasterio does not carry, as the rasterio of conda does not, is not named, and its
        variables stay as they are.
    """
    environment = os.environ if environment is None else environment
    package = package_of_rasterio() if package is None else package
    others: list[str] = []
    if package is None:
        return others
    for variable, folder, proof in MAP_DATA:
        own = package / folder
        if not (own / proof).is_file():
            continue
        named = environment.get(variable)
        if named is not None and Path(named).resolve() != own.resolve():
            others.append(variable)
        environment[variable] = str(own)
    return others
