# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""The areas that a visitor draws on the map.

An area is drawn on the map, so its sides are straight lines in the coordinates of the map. ``outline_on`` gives
its outline in the coordinates of the grid of a layer, ``cells_inside`` marks the cells of the grid whose centre
lies inside the outline, and ``statistics_inside`` gives the statistics of a result over those cells.

A cell lies inside an area when its centre does. This is the rule of GDAL for a polygon that is rasterized
without the option ALL_TOUCHED, and the cells are marked by that rasterizer itself, through
``rasterio.features.geometry_mask``. A centre that lies exactly on a side is decided by the rasterizer.
"""

import math

import numpy as np
from numpy.typing import NDArray
from rasterio.crs import CRS
from rasterio.errors import CRSError
from rasterio.features import geometry_mask
from rasterio.transform import Affine
from rasterio.warp import transform

from lynkeus.layers import AreaStatistics, Shape
from lynkeus.writing import Grid, LayerError

MOST_OUTLINE_POINTS = 100_000
"""The largest number of points of the outline of an area in the coordinates of a grid."""


_TOO_FAR = "A part of the area lies too far from the layers to be placed on their grid."

FARTHEST_LONGITUDE = 80.0
"""The largest difference of longitude between a point of an area and the centre of the grid, in degrees.

A projection of one zone, such as UTM, gives finite numbers that return to the point also for a point on the other
side of the Earth, where they have no meaning, so such a point is refused before it is transformed."""

ROUND_TRIP = 0.01
"""The largest difference between a point of an area and the same point transformed to the coordinates of a
grid and back, in the units of the map. A point far from the zone of a projection is transformed to numbers that
do not return to it."""


def _placed(source: CRS, target: CRS, xs: list[float], ys: list[float]) -> tuple[list[float], list[float]]:
    """Transform points from the coordinates of the map to those of a grid, and check them by the way back.

    Raises
    ------
    LayerError
        If a point cannot be transformed, or does not return to itself within ``ROUND_TRIP``.
    """
    try:
        placed_x, placed_y = transform(source, target, xs, ys)
        back_x, back_y = transform(target, source, placed_x, placed_y)
    except Exception as error:
        raise LayerError(_TOO_FAR) from error
    for x, y, x_back, y_back in zip(xs, ys, back_x, back_y, strict=True):
        if not (abs(x_back - x) <= ROUND_TRIP and abs(y_back - y) <= ROUND_TRIP):
            raise LayerError(_TOO_FAR)
    return list(placed_x), list(placed_y)


def _near(source: CRS, target: CRS, grid: Grid, xs: list[float], ys: list[float]) -> None:
    """Check that every corner of an area lies within ``FARTHEST_LONGITUDE`` of the centre of a grid.

    Raises
    ------
    LayerError
        If a corner lies farther, or a longitude cannot be found.
    """
    degrees = CRS.from_epsg(4326)
    a, b, c, d, e, f = grid.transform
    centre = (a * grid.width / 2 + b * grid.height / 2 + c, d * grid.width / 2 + e * grid.height / 2 + f)
    try:
        (middle,), _ = transform(target, degrees, [centre[0]], [centre[1]])
        longitudes, _ = transform(source, degrees, xs, ys)
    except Exception as error:
        raise LayerError(_TOO_FAR) from error
    for longitude in longitudes:
        if not math.isfinite(longitude) or abs((longitude - middle + 180) % 360 - 180) > FARTHEST_LONGITUDE:
            raise LayerError(_TOO_FAR)


def outline_on(shape: Shape, grid: Grid) -> list[tuple[float, float]]:
    """Return the outline of an area drawn on the map in the coordinates of the grid of a layer.

    A side of the area is a straight line on the map and, in general, a curve in the coordinates of the grid.
    Each side is therefore divided into equal pieces, by points on the straight line of the map, before the
    points are transformed. A piece is at most as long as the side of a cell of the grid, or longer when the
    outline would otherwise have more than ``MOST_OUTLINE_POINTS`` pieces. When the map and the grid have the
    same coordinate reference system, the outline is the corners of the area. A corner farther than
    ``FARTHEST_LONGITUDE`` from the centre of the grid, and a point that does not return to itself within
    ``ROUND_TRIP`` when it is transformed back, are refused.

    Parameters
    ----------
    shape : Shape
        The area, in the coordinates of the map.
    grid : Grid
        The grid of the layer.

    Returns
    -------
    list of tuple of float
        The points of the outline, x and y in the coordinate reference system of the grid, the first repeated at
        the end.

    Raises
    ------
    LayerError
        If the coordinate reference system of the area is not known, or a point of the area cannot be placed
        in the coordinates of the grid.
    """
    try:
        source = CRS.from_string(shape.crs)
    except CRSError as error:
        raise LayerError("The area is drawn in coordinates that Lynkeus does not know.") from error
    target = CRS.from_string(grid.crs)
    if source == target:
        return [(x, y) for x, y in shape.points]
    xs = [x for x, _ in shape.points]
    ys = [y for _, y in shape.points]
    _near(source, target, grid, xs, ys)
    corners_x, corners_y = _placed(source, target, xs, ys)
    a, b, _, d, e, _ = grid.transform
    side = min(math.hypot(a, d), math.hypot(b, e))
    lengths = [
        math.hypot(corners_x[index + 1] - corners_x[index], corners_y[index + 1] - corners_y[index])
        for index in range(len(xs) - 1)
    ]
    step = max(side, sum(lengths) / MOST_OUTLINE_POINTS)
    dense_x: list[float] = []
    dense_y: list[float] = []
    for index, length in enumerate(lengths):
        pieces = max(1, math.ceil(length / step))
        for piece in range(pieces):
            share = piece / pieces
            dense_x.append(xs[index] + (xs[index + 1] - xs[index]) * share)
            dense_y.append(ys[index] + (ys[index + 1] - ys[index]) * share)
    dense_x.append(xs[-1])
    dense_y.append(ys[-1])
    outline_x, outline_y = _placed(source, target, dense_x, dense_y)
    return list(zip(outline_x, outline_y, strict=True))


def cells_inside(shape: Shape, grid: Grid) -> NDArray[np.bool_]:
    """Mark the cells of a grid whose centre lies inside an area drawn on the map.

    Parameters
    ----------
    shape : Shape
        The area, in the coordinates of the map.
    grid : Grid
        The grid of the layer.

    Returns
    -------
    numpy.ndarray
        One value for each cell of the grid, in its rows and columns: True where the centre of the cell lies
        inside the outline of the area (``outline_on``). The rasterizer of GDAL marks the cells, without the
        option ALL_TOUCHED.

    Raises
    ------
    LayerError
        As ``outline_on`` does.
    """
    outline = outline_on(shape, grid)
    inside: NDArray[np.bool_] = geometry_mask(
        [{"type": "Polygon", "coordinates": [outline]}],
        out_shape=(grid.height, grid.width),
        transform=Affine(*grid.transform),
        all_touched=False,
        invert=True,
    )
    return inside


def statistics_inside(values: NDArray[np.float32], inside: NDArray[np.bool_], shape: Shape) -> AreaStatistics:
    """Compute the statistics of the cells of a result that lie inside an area and hold a value.

    Parameters
    ----------
    values : numpy.ndarray
        The values of the result. A cell without data holds ``nan``.
    inside : numpy.ndarray
        The cells inside the area, as ``cells_inside`` marks them, on the grid of ``values``.
    shape : Shape
        The area, which the statistics name.

    Returns
    -------
    AreaStatistics
        The number of the cells inside the area that hold a finite value, and their mean, standard deviation of
        the population, lowest value, median and highest value, computed in 64-bit numbers. Without such a cell
        the number is 0 and there are no values.

    Raises
    ------
    ValueError
        If ``inside`` is not on the grid of ``values``. This is a fault of the caller.
    """
    if inside.shape != values.shape:
        raise ValueError("the cells inside the area are not on the grid of the values")
    held = values[inside & np.isfinite(values)].astype(np.float64)
    if held.size == 0:
        return AreaStatistics(area=shape, cells=0)
    return AreaStatistics(
        area=shape,
        cells=int(held.size),
        mean=float(held.mean()),
        deviation=float(held.std()),
        minimum=float(held.min()),
        median=float(np.median(held)),
        maximum=float(held.max()),
    )
