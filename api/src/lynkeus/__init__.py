"""Lynkeus: analysis of surface change with NISAR radar data."""

from lynkeus import mapdata

__version__ = "0.1.1"

OTHER_MAP_DATA = mapdata.use_own_map_data()
"""The variables of the environment that named the map data of another program, before the package named its own.

This runs here, before any module of the package imports rasterio, because rasterio reads the variables when it is
imported (``lynkeus.mapdata``).
"""
