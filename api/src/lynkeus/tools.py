# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""The run of an analysis tool on layers of Lynkeus.

``run_tool`` reads the input layers of a tool, calls the function of the tool
from ``lynkeus.analysis.TOOLS`` and writes the result as a layer of the kind
``result``. The function of a tool computes; it reads and writes no file.
When the run carries an area drawn on the map, the description of the result
holds the statistics of the result inside it (``lynkeus.areas``).

``run_series`` does the same for a tool of the kind Series, from
``lynkeus.analysis.SERIES_TOOLS``. It turns the point of the request into a
cell of the grid of the layers, or an area drawn on the map into the cells
inside it, gives the function the arrays one after another, and returns the
series description. A series has no file.
"""

import math
from collections.abc import Callable, Iterator, Mapping
from pathlib import Path

import numpy as np
from numpy.typing import NDArray
from rasterio.crs import CRS
from rasterio.transform import Affine
from rasterio.warp import transform, transform_bounds

from lynkeus.analysis import SERIES_TOOLS, TOOLS
from lynkeus.analysis.series import Place
from lynkeus.areas import cells_inside, statistics_inside
from lynkeus.layers import (
    Area,
    Cell,
    LayerDescription,
    Point,
    ResultReduction,
    SeriesDescription,
    SeriesRun,
    ToolRun,
)
from lynkeus.writing import PROGRAM, Grid, LayerError, grid_of, read_layer, write_layer

EDGE_POINTS = 21
"""The number of points on each side of a grid from which the rectangle around the grid is made."""

_REDUCED: dict[ResultReduction, str] = {
    "mean": "by averaging the values",
    "mean-power": "as the decibels of the mean of the linear power",
    "mode": "by taking the most frequent class",
}
"""How the reduced copies of a result are made, in the words of its record."""


def run_tool(
    run: ToolRun,
    *,
    layers: Mapping[str, tuple[LayerDescription, Path]],
    layer_id: str,
    folder: Path,
    address: str,
    report: Callable[[int, str], None],
) -> LayerDescription:
    """Run an analysis tool on layers and write its result.

    Parameters
    ----------
    run : ToolRun
        The tool, the ``id`` of each input layer, the name of the result and
        the area drawn on the map, if there is one.
    layers : Mapping
        The layers that the tool may use: for each ``id``, the description of
        the layer and the path of its GeoTIFF.
    layer_id : str
        The ``id`` that the result receives.
    folder : pathlib.Path
        The existing empty folder that receives the two files of the result.
    address : str
        The address of the folder for the browser.
    report : callable
        Called with the progress, from 0 to 100, and a sentence about it.

    Returns
    -------
    LayerDescription
        The description of the result. Its quantity, unit, legend, colour
        scale and method are those that the function of the tool returns. Its
        dates and input files are those of the input layers. The reduced
        copies of its file are made as the function of the tool declares,
        and the words of the two ends of its legend, the table of its classes
        and the note are those that the function gives. The record repeats the
        note in its lineage. With an area, its statistics are those of the
        values of the result at full resolution in the cells whose centre lies
        inside the area (``lynkeus.areas.statistics_inside``).

    Raises
    ------
    LayerError
        If the tool or a layer does not exist, the layers do not share one
        grid, the area cannot be placed on the grid, or the result cannot be
        written. The message is one sentence for the visitor.
    """
    try:
        return _run_tool(run, layers, layer_id, folder, address, report)
    except LayerError:
        raise
    except Exception as error:
        raise LayerError("Lynkeus could not compute the result because of an internal error.") from error


def _run_tool(
    run: ToolRun,
    layers: Mapping[str, tuple[LayerDescription, Path]],
    layer_id: str,
    folder: Path,
    address: str,
    report: Callable[[int, str], None],
) -> LayerDescription:
    """Read the layers, call the function of the tool and write the result."""
    if run.tool not in TOOLS:
        raise LayerError("Lynkeus has no analysis tool of this name.")
    if any(name not in layers for name in run.inputs):
        raise LayerError("A layer of the analysis no longer exists.")
    report(0, "Reading the layers.")
    descriptions = [layers[name][0] for name in run.inputs]
    arrays = []
    grids = []
    for name in run.inputs:
        values, grid = read_layer(layers[name][1])
        arrays.append(values)
        grids.append(grid)
    if any(grid != grids[0] for grid in grids):
        raise LayerError("The layers of the analysis do not have the same grid.")
    report(40, "Computing the result.")
    result = TOOLS[run.tool](arrays, descriptions)
    if result.values.shape != arrays[0].shape:
        raise LayerError("The analysis tool returned a result that is not on the grid of its layers.")
    values = np.asarray(result.values, dtype=np.float32)
    statistics = None
    if run.area is not None:
        report(60, "Computing the statistics in the area.")
        statistics = statistics_inside(values, cells_inside(run.area, grids[0]), run.area)
    report(70, "Writing the result.")
    names = ", ".join(description.title for description in descriptions)
    description = write_layer(
        values,
        grids[0],
        layer_id=layer_id,
        folder=folder,
        address=address,
        name=run.tool,
        title=run.title,
        kind="result",
        quantity=result.quantity,
        unit=result.unit,
        legend=result.range,
        colours=result.colours,
        dates=sorted({day for description in descriptions for day in description.dates}),
        inputs=list(dict.fromkeys(name for description in descriptions for name in description.inputs)),
        lineage=(
            f"Result of the analysis tool {run.tool} of {PROGRAM} on the layers: {names}. Method: {result.method}. "
            + (f"{result.note} " if result.note else "")
            + f"Reduced copies made {_REDUCED[result.reduction]}."
        ),
        method=result.method,
        ends=result.ends,
        classes=result.classes,
        note=result.note,
        averaged=result.reduction != "mode",
        decibels=result.reduction == "mean-power",
        links=[
            {"rel": "derived_from", "href": description.record, "type": "application/geo+json"}
            for description in descriptions
        ],
        area_statistics=statistics,
    )
    report(100, "The result is ready.")
    return description


def cell_of(grid: Grid, point: Point) -> Cell:
    """Return the cell of a grid that holds a point.

    The point is transformed from longitude and latitude (WGS 84) to the
    coordinate reference system of the grid. The cell is the one whose
    rectangle holds the transformed point; a point on the line between two
    cells belongs to the cell with the larger number.

    Parameters
    ----------
    grid : Grid
        The grid of a layer.
    point : Point
        The point, in degrees of longitude and latitude.

    Returns
    -------
    Cell
        The row and the column of the cell, counted from 0, and the
        longitude and latitude of its centre.

    Raises
    ------
    LayerError
        If the point lies outside the grid.
    """
    cells_to_ground = Affine(*grid.transform)
    crs, degrees = CRS.from_string(grid.crs), CRS.from_epsg(4326)
    (x,), (y,) = transform(degrees, crs, [point.longitude], [point.latitude])
    column, row = ~cells_to_ground @ (x, y)
    if not (math.isfinite(column) and math.isfinite(row) and 0 <= column < grid.width and 0 <= row < grid.height):
        raise LayerError("The point lies outside the area of the layers.")
    whole_column, whole_row = math.floor(column), math.floor(row)
    centre_x, centre_y = cells_to_ground @ (whole_column + 0.5, whole_row + 0.5)
    (longitude,), (latitude,) = transform(crs, degrees, [centre_x], [centre_y])
    return Cell(row=whole_row, column=whole_column, longitude=longitude, latitude=latitude)


def area_of(grid: Grid) -> Area:
    """Return the rectangle in longitude and latitude (WGS 84) around a grid.

    The rectangle is made from the corners of the grid and from points on
    its four sides, which are not straight lines in longitude and latitude.
    """
    cells_to_ground = Affine(*grid.transform)
    corners = [
        cells_to_ground @ corner for corner in ((0, 0), (grid.width, 0), (0, grid.height), (grid.width, grid.height))
    ]
    xs, ys = [x for x, _ in corners], [y for _, y in corners]
    west, south, east, north = transform_bounds(
        CRS.from_string(grid.crs), CRS.from_epsg(4326), min(xs), min(ys), max(xs), max(ys), densify_pts=EDGE_POINTS
    )
    return Area(west=west, south=south, east=east, north=north)


def run_series(
    run: SeriesRun,
    *,
    layers: Mapping[str, tuple[LayerDescription, Path]],
    series_id: str,
    report: Callable[[int, str], None],
) -> SeriesDescription:
    """Run an analysis tool of the kind Series on layers and return the series.

    Parameters
    ----------
    run : SeriesRun
        The tool, the ``id`` of each input layer, the name of the series and
        the point or the area drawn on the map, or neither for the whole area
        of the layers.
    layers : Mapping
        The layers that the tool may use: for each ``id``, the description of
        the layer and the path of its GeoTIFF.
    series_id : str
        The ``id`` that the series receives.
    report : callable
        Called with the progress, from 0 to 100, and a sentence about it.

    Returns
    -------
    SeriesDescription
        The description of the series. Its entries, product files, layer
        name, quantity, unit, reduction, range, method and note are those
        that the function of the tool returns. Its point is that of the run, its cell
        is the cell of the grid of the layers that holds the point, its shape
        is the area drawn on the map, and its area is the rectangle around
        that grid. An area drawn on the map gives the function the cells of
        the grid whose centre lies inside it (``lynkeus.areas.cells_inside``).
        One layer is read at a time.

    Raises
    ------
    LayerError
        If the tool or a layer does not exist, the layers do not share one
        grid, the point lies outside the grid, the area cannot be placed on
        the grid, or the tool refuses the layers. The message is one sentence
        for the visitor.
    """
    try:
        return _run_series(run, layers, series_id, report)
    except LayerError:
        raise
    except Exception as error:
        raise LayerError("Lynkeus could not compute the series because of an internal error.") from error


def _run_series(
    run: SeriesRun,
    layers: Mapping[str, tuple[LayerDescription, Path]],
    series_id: str,
    report: Callable[[int, str], None],
) -> SeriesDescription:
    """Check the grids, find the cell of the point, call the function of the tool and describe the series."""
    if run.tool not in SERIES_TOOLS:
        raise LayerError("Lynkeus has no analysis tool of this name.")
    if any(name not in layers for name in run.inputs):
        raise LayerError("A layer of the analysis no longer exists.")
    report(0, "Reading the grids of the layers.")
    descriptions = [layers[name][0] for name in run.inputs]
    paths = [layers[name][1] for name in run.inputs]
    grids = [grid_of(path) for path in paths]
    if any(grid != grids[0] for grid in grids):
        raise LayerError("The layers of the analysis do not have the same grid.")
    cell = cell_of(grids[0], run.point) if run.point is not None else None
    place: Place = None
    if cell is not None:
        place = (cell.row, cell.column)
    elif run.area is not None:
        place = cells_inside(run.area, grids[0])

    def arrays() -> Iterator[NDArray[np.float32]]:
        for number, path in enumerate(paths):
            report(5 + 90 * number // len(paths), f"Reading layer {number + 1} of {len(paths)}.")
            values, _ = read_layer(path)
            yield values

    result = SERIES_TOOLS[run.tool](arrays(), descriptions, place)
    description = SeriesDescription(
        id=series_id,
        title=run.title,
        kind="series",
        quantity=result.quantity,
        unit=result.unit,
        reduction=result.reduction,
        range=result.range,
        point=run.point,
        cell=cell,
        shape=run.area,
        area=area_of(grids[0]),
        entries=result.entries,
        inputs=result.inputs,
        layer=result.layer,
        program=PROGRAM,
        method=result.method,
        note=result.note,
    )
    report(100, "The series is ready.")
    return description
