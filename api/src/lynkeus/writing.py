"""The files of a layer.

Lynkeus keeps every layer, whether received from NASA or computed by an
analysis tool, as two files in the folder of the layer: a Cloud Optimized
GeoTIFF with the values and a STAC Item that describes them. ``write_layer``
writes the two files from an array and its grid and returns the layer
description, and ``read_layer`` reads the array and the grid of a GeoTIFF.

The values are 32-bit real numbers, and a cell without data holds ``nan``.
The file has tiles of 512 cells and reduced copies (overviews) made by
Lynkeus from the values at full resolution: by averaging for a quantity, by
the most frequent value for classes, and, for decibels of a power, as the
decibels of the mean of the linear power.
"""

import json
import math
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any, Literal

import numpy as np
import rasterio
from numpy.typing import NDArray
from rasterio.crs import CRS
from rasterio.errors import RasterioError
from rasterio.shutil import copy
from rasterio.transform import Affine
from rasterio.warp import transform

from lynkeus import __version__
from lynkeus.layers import AreaStatistics, LayerDescription

type Rule = Literal["percentiles", "symmetric", "extremes"]
"""A rule that gives the range of a legend from the values of the layer."""

BLOCK = 512
"""The side of a tile of the file, in cells."""

LOWEST_PERCENT = 2.0
HIGHEST_PERCENT = 98.0
"""The percentiles of the values at which a legend starts and ends."""

OUTLINE_POINTS = 8
"""The number of points on each side of the outline of a layer in its record."""

PROGRAM = f"Lynkeus {__version__}"
"""The program and version that the files and the descriptions name."""

STAC_VERSION = "1.1.0"
STAC_EXTENSIONS = (
    "https://stac-extensions.github.io/projection/v2.0.0/schema.json",
    "https://stac-extensions.github.io/raster/v2.0.0/schema.json",
    "https://stac-extensions.github.io/processing/v1.2.0/schema.json",
)
GEOTIFF_TYPE = "image/tiff; application=geotiff; profile=cloud-optimized"

_NAME = re.compile(r"[a-z0-9]+(-[a-z0-9]+)*")
_CODE = re.compile(r"[A-Z]+:[0-9]+")


class LayerError(Exception):
    """A layer could not be received, read, computed or written.

    The message is one sentence for the visitor.
    """


@dataclass(frozen=True)
class Grid:
    """The grid of a layer.

    Attributes
    ----------
    crs : str
        Coordinate reference system, as the code of an authority, for example
        ``EPSG:32619``, or as well-known text when it has no code.
    transform : tuple of float
        The six coefficients ``(a, b, c, d, e, f)`` that give the coordinates
        of the upper left corner of the cell in column ``i`` and row ``j``:
        ``x = a * i + b * j + c`` and ``y = d * i + e * j + f``, in the unit of
        the reference system.
    width, height : int
        Number of columns and of rows.
    """

    crs: str
    transform: tuple[float, float, float, float, float, float]
    width: int
    height: int


@dataclass(frozen=True)
class Statistics:
    """The statistics of the cells of a layer that hold data.

    Attributes
    ----------
    minimum, maximum, mean, deviation : float
        Lowest value, highest value, mean and standard deviation, in the unit
        of the layer.
    valid : float
        Share of the cells that hold data, in percent.
    """

    minimum: float
    maximum: float
    mean: float
    deviation: float
    valid: float


def grid_of(path: Path) -> Grid:
    """Read the grid of a GeoTIFF without reading its values.

    Raises
    ------
    LayerError
        If the file cannot be read or has no coordinate reference system.
    """
    try:
        with rasterio.open(path) as source:
            return _grid(source)
    except RasterioError as error:
        raise LayerError("The file of the layer could not be read.") from error


def read_layer(path: Path) -> tuple[NDArray[np.float32], Grid]:
    """Read the values and the grid of a GeoTIFF with one band.

    Parameters
    ----------
    path : pathlib.Path
        The file. It may be a file of Lynkeus or a file as NASA Harmony
        delivers it.

    Returns
    -------
    values : numpy.ndarray
        The values at full resolution, as 32-bit real numbers in the unit of
        the file. A cell without data holds ``nan``, whichever value the file
        uses for it.
    grid : Grid
        The grid of the values.

    Raises
    ------
    LayerError
        If the file cannot be read, has no coordinate reference system, or
        does not hold one band of real or whole numbers.
    """
    try:
        with rasterio.open(path) as source:
            grid = _grid(source)
            if source.count != 1 or np.dtype(source.dtypes[0]).kind not in "fiu":
                raise LayerError("The file of the layer does not hold one band of numbers.")
            values: NDArray[np.float32] = source.read(1, out_dtype="float32")
            nodata: float | None = source.nodata
    except RasterioError as error:
        raise LayerError("The file of the layer could not be read.") from error
    if nodata is not None and not math.isnan(nodata):
        values[values == np.float32(nodata)] = np.nan
    return values, grid


def statistics_of(values: NDArray[np.float32]) -> Statistics:
    """Compute the statistics of the cells that hold data.

    Parameters
    ----------
    values : numpy.ndarray
        The values of a layer. A cell without data holds ``nan``.

    Raises
    ------
    LayerError
        If no cell holds data, or a cell holds an infinite value.
    """
    valid = values[~np.isnan(values)]
    if valid.size == 0:
        raise LayerError("The layer holds no data.")
    if not np.isfinite(valid).all():
        raise LayerError("The layer holds infinite values, which Lynkeus does not write.")
    return Statistics(
        minimum=float(valid.min()),
        maximum=float(valid.max()),
        mean=float(valid.mean(dtype=np.float64)),
        deviation=float(valid.std(dtype=np.float64)),
        valid=100.0 * valid.size / values.size,
    )


def legend_range(values: NDArray[np.float32], rule: Rule) -> tuple[float, float]:
    """Choose the range of a legend from the values of a layer.

    Parameters
    ----------
    values : numpy.ndarray
        The values of a layer. A cell without data holds ``nan``, and at least
        one cell holds data.
    rule : {"percentiles", "symmetric", "extremes"}
        ``percentiles`` gives the 2nd and the 98th percentile of the values.
        ``symmetric`` gives the 98th percentile of the absolute values, below
        and above zero, for a quantity that has a sign. ``extremes`` gives the
        lowest and the highest value, for classes.

    Returns
    -------
    tuple of float
        Lowest and highest value of the legend, in the unit of the layer. When
        the rule gives one value twice, the range is the lowest and the highest
        value of the layer, and when all cells hold one value, the range runs
        from half a unit below it to half a unit above it.
    """
    valid = values[~np.isnan(values)]
    if rule == "percentiles":
        lowest, highest = (float(value) for value in np.percentile(valid, (LOWEST_PERCENT, HIGHEST_PERCENT)))
    elif rule == "symmetric":
        highest = float(np.percentile(np.abs(valid), HIGHEST_PERCENT))
        lowest = -highest
    else:
        lowest, highest = float(valid.min()), float(valid.max())
    if lowest >= highest:
        lowest, highest = float(valid.min()), float(valid.max())
    if lowest >= highest:
        lowest, highest = lowest - 0.5, lowest + 0.5
    return lowest, highest


def write_layer(
    values: NDArray[np.float32],
    grid: Grid,
    *,
    layer_id: str,
    folder: Path,
    address: str,
    name: str,
    title: str,
    kind: Literal["layer", "result"],
    quantity: str,
    unit: str,
    legend: tuple[float, float] | Rule,
    colours: str,
    dates: Sequence[date],
    inputs: Sequence[str],
    lineage: str,
    layer: str | None = None,
    method: str | None = None,
    ends: tuple[str, str] | None = None,
    frequency: float | None = None,
    level: str | None = None,
    links: Sequence[Mapping[str, str]] = (),
    averaged: bool = True,
    decibels: bool = False,
    area_statistics: AreaStatistics | None = None,
) -> LayerDescription:
    """Write the two files of a layer and return its description.

    Parameters
    ----------
    values : numpy.ndarray
        The values on the grid, in ``unit``. A cell without data holds
        ``nan``.
    grid : Grid
        The grid of the values.
    layer_id : str
        The ``id`` of the layer.
    folder : pathlib.Path
        The existing folder that receives the two files.
    address : str
        The address of the folder for the browser, for example
        ``/files/<layer_id>``.
    name : str
        The name of the two files without their endings, in lower-case
        letters, digits and hyphens.
    title : str
        Name of the layer for the visitor.
    kind : {"layer", "result"}
        ``layer`` for data received, ``result`` for the output of a tool.
    quantity : str
        What the values are.
    unit : str
        Unit of the values, written as the CF conventions write it, for
        example ``1`` for a quantity without dimension.
    legend : tuple of float, or {"percentiles", "symmetric", "extremes"}
        The lowest and the highest value of the legend, in ``unit``, or the
        rule of ``legend_range`` that gives them from the values.
    colours : str
        Name of the colour scale.
    dates : sequence of datetime.date
        Date or dates of the data, in Coordinated Universal Time.
    inputs : sequence of str
        Names of the product files used.
    lineage : str
        How the values were produced, for the record.
    layer : str, optional
        Name of the layer inside the product, as the layer request gave it,
        for example ``HHHH``. A layer received from NASA has one, and a
        result has none. The record carries it as the name of the band.
    method : str, optional
        Reference of the method. A result has one, and a layer has none.
    ends : tuple of str, optional
        Words that name the lowest and the highest end of the legend, for
        example ``("decrease", "increase")``. Only a result may have them.
        They stand in the description only, not in the two files.
    frequency : float, optional
        Centre frequency of the radar band of the layer, in hertz, as the
        product states it. Only a layer received from NASA may have one. It
        stands in the description only, not in the two files.
    level : str, optional
        Processing level of the values, for example ``L2``.
    links : sequence of Mapping, optional
        Links of the record to the records of the sources, each with ``rel``
        and ``href``.
    averaged : bool, optional
        Whether the reduced copies are made by averaging. Averaging suits a
        quantity; for a power, the values averaged must be linear, not in
        decibels. ``False`` suits classes: a cell of a reduced copy then takes
        the most frequent value.
    decibels : bool, optional
        Whether the values are decibels of a power. The reduced copies are
        then the decibels of the mean of the linear power, so that a reduced
        copy equals the conversion to decibels of the reduced copy of the
        power. It needs ``averaged``.
    area_statistics : AreaStatistics, optional
        The statistics of a result inside an area drawn on the map. Only a
        result may have them. They stand in the description and in the
        record, as ``lynkeus:area_statistics`` of its properties, and not in
        the GeoTIFF.

    Returns
    -------
    LayerDescription
        The description of the layer, with the addresses of its two files.

    Raises
    ------
    LayerError
        If no cell holds data, a cell holds an infinite value, or the files
        cannot be written.
    ValueError
        If the array does not fit the grid, ``name`` has another form,
        ``decibels`` is asked without ``averaged``, or the fields do not make
        a layer description, for example when a result is given the name of
        a layer.
    """
    if values.shape != (grid.height, grid.width):
        raise ValueError("the array does not fit the grid")
    if decibels and not averaged:
        raise ValueError("values in decibels are reduced by averaging their power")
    if not _NAME.fullmatch(name):
        raise ValueError("the name of the files must hold lower-case letters, digits and hyphens")
    values = np.asarray(values, dtype=np.float32)
    statistics = statistics_of(values)
    lowest, highest = legend if isinstance(legend, tuple) else legend_range(values, legend)
    description = LayerDescription(
        id=layer_id,
        title=title,
        kind=kind,
        url=f"{address}/{name}.tif",
        quantity=quantity,
        unit=unit,
        range=(lowest, highest),
        colours=colours,
        dates=tuple(dates),
        inputs=tuple(inputs),
        layer=layer,
        ends=ends,
        frequency=frequency,
        program=PROGRAM,
        method=method,
        record=f"{address}/{name}.json",
        statistics=area_statistics,
    )
    created = datetime.now(UTC).replace(microsecond=0)
    record = _record(description, grid, statistics, created, name, lineage, level, links)
    try:
        _write_geotiff(values, grid, folder / f"{name}.tif", description, statistics, created, averaged, decibels)
        (folder / f"{name}.json").write_text(json.dumps(record, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    except (RasterioError, OSError) as error:
        raise LayerError("The files of the layer could not be written.") from error
    return description


def _grid(source: Any) -> Grid:
    """Return the grid of an open file."""
    if source.crs is None:
        raise LayerError("The file of the layer has no coordinate reference system.")
    a, b, c, d, e, f = tuple(source.transform)[:6]
    return Grid(crs=source.crs.to_string(), transform=(a, b, c, d, e, f), width=source.width, height=source.height)


def _write_geotiff(
    values: NDArray[np.float32],
    grid: Grid,
    path: Path,
    description: LayerDescription,
    statistics: Statistics,
    created: datetime,
    averaged: bool,
    decibels: bool,
) -> None:
    """Write the values as a Cloud Optimized GeoTIFF with the metadata that a GIS program reads."""
    # The COG driver of GDAL writes a file only as a copy of another one, so the values pass through a plain file.
    plain = path.with_name(f".{path.name}")
    others: list[Path] = []
    try:
        with rasterio.open(plain, "w", **_plain(grid)) as target:
            target.write(values, 1)
            target.set_band_description(1, description.quantity)
            target.units = (description.unit,)
            target.update_tags(
                1,
                STATISTICS_MINIMUM=repr(statistics.minimum),
                STATISTICS_MAXIMUM=repr(statistics.maximum),
                STATISTICS_MEAN=repr(statistics.mean),
                STATISTICS_STDDEV=repr(statistics.deviation),
                STATISTICS_VALID_PERCENT=repr(statistics.valid),
            )
            target.update_tags(
                TIFFTAG_IMAGEDESCRIPTION=description.title,
                TIFFTAG_SOFTWARE=description.program,
                TIFFTAG_DATETIME=created.strftime("%Y:%m:%d %H:%M:%S"),
                dates=", ".join(day.isoformat() for day in description.dates),
                inputs=", ".join(description.inputs),
                **({} if description.method is None else {"method": description.method}),
            )
        source = _with_copies_of_the_mean_power(values, grid, plain, others) if decibels else None
        if source is None:
            resampling = "AVERAGE" if averaged else "MODE"
            _copy_as_cog(plain, path, OVERVIEWS="IGNORE_EXISTING", OVERVIEW_RESAMPLING=resampling)
        else:
            _copy_as_cog(source, path, OVERVIEWS="FORCE_USE_EXISTING")
    finally:
        for file in (plain, *others):
            file.unlink(missing_ok=True)


def _plain(grid: Grid) -> dict[str, Any]:
    """Return the settings of a plain GeoTIFF of 32-bit real numbers on a grid, with ``nan`` for no data."""
    return {
        "driver": "GTiff",
        "width": grid.width,
        "height": grid.height,
        "count": 1,
        "dtype": "float32",
        "nodata": math.nan,
        "crs": CRS.from_string(grid.crs),
        "transform": Affine(*grid.transform),
        "tiled": True,
        "blockxsize": BLOCK,
        "blockysize": BLOCK,
    }


def _copy_as_cog(source: Path, path: Path, **overviews: str) -> None:
    """Copy a file as a Cloud Optimized GeoTIFF, with the reduced copies that ``overviews`` asks of the COG driver."""
    copy(source, path, driver="COG", BLOCKSIZE=str(BLOCK), COMPRESS="DEFLATE", PREDICTOR="3", **overviews)


def _with_copies_of_the_mean_power(
    values: NDArray[np.float32], grid: Grid, plain: Path, others: list[Path]
) -> Path | None:
    """Prepare the reduced copies of values in decibels of a power as the decibels of the mean power.

    The linear power of the values is written as a file of its own, and the COG driver reduces it by
    averaging, as it reduces a layer of linear power. Each reduced copy is then turned into decibels and
    joined to the plain file of the values through a virtual file (VRT), which names it as an overview.

    Parameters
    ----------
    values : numpy.ndarray
        The values in decibels. A cell without data holds ``nan``.
    grid : Grid
        The grid of the values.
    plain : pathlib.Path
        The plain file that holds the values and the metadata.
    others : list of pathlib.Path
        Receives every file that this function makes, so that the caller removes them.

    Returns
    -------
    pathlib.Path or None
        The virtual file from which the COG driver copies the values with these reduced copies, or None
        when the grid is so small that the file has no reduced copy.
    """
    linear, reduced, virtual = (plain.with_name(f"{plain.name}.{part}") for part in ("power.tif", "mean.tif", "vrt"))
    others += [linear, reduced, virtual]
    with np.errstate(over="ignore"):
        power = np.power(np.float32(10), values / np.float32(10))
    with rasterio.open(linear, "w", **_plain(grid)) as target:
        target.write(power, 1)
    _copy_as_cog(linear, reduced, OVERVIEWS="IGNORE_EXISTING", OVERVIEW_RESAMPLING="AVERAGE")
    with rasterio.open(reduced) as source:
        levels = len(source.overviews(1))
    if levels == 0:
        return None
    overviews = ""
    for level in range(levels):
        with rasterio.open(reduced, overview_level=level) as source:
            mean: NDArray[np.float32] = source.read(1)
            size = _grid(source)
        copy_in_decibels = np.full(mean.shape, np.nan, np.float32)
        np.log10(mean, out=copy_in_decibels, where=(mean > 0) & (mean < np.inf))
        copy_in_decibels *= 10
        file = plain.with_name(f"{plain.name}.{level}.tif")
        others.append(file)
        with rasterio.open(file, "w", **_plain(size)) as target:
            target.write(copy_in_decibels, 1)
        overviews += (
            f'<Overview><SourceFilename relativeToVRT="1">{file.name}</SourceFilename>'
            "<SourceBand>1</SourceBand></Overview>"
        )
    copy(plain, virtual, driver="VRT")
    text = virtual.read_text(encoding="utf-8")
    if text.count("</VRTRasterBand>") != 1:
        raise RasterioError("the virtual file of the layer does not hold one band")
    virtual.write_text(text.replace("</VRTRasterBand>", f"{overviews}</VRTRasterBand>"), encoding="utf-8")
    return virtual


def _record(
    description: LayerDescription,
    grid: Grid,
    statistics: Statistics,
    created: datetime,
    name: str,
    lineage: str,
    level: str | None,
    links: Sequence[Mapping[str, str]],
) -> dict[str, Any]:
    """Return the STAC Item of a layer."""
    ring = _outline(grid)
    longitudes = [longitude for longitude, _ in ring]
    latitudes = [latitude for _, latitude in ring]
    a, b, c, d, e, f = grid.transform
    corners = [(a * i + b * j + c, d * i + e * j + f) for i in (0, grid.width) for j in (0, grid.height)]
    stamp = created.strftime("%Y-%m-%dT%H:%M:%SZ")
    properties: dict[str, Any] = {
        "title": description.title,
        "description": description.quantity,
        "datetime": None,
        "start_datetime": f"{min(description.dates).isoformat()}T00:00:00Z",
        "end_datetime": f"{max(description.dates).isoformat()}T23:59:59Z",
        "created": stamp,
        "proj:code": grid.crs if _CODE.fullmatch(grid.crs) else None,
        "proj:shape": [grid.height, grid.width],
        "proj:transform": [a, b, c, d, e, f],
        "proj:bbox": [
            min(x for x, _ in corners),
            min(y for _, y in corners),
            max(x for x, _ in corners),
            max(y for _, y in corners),
        ],
        "processing:lineage": lineage,
        "processing:datetime": stamp,
        "processing:software": {"Lynkeus": __version__, "GDAL": rasterio.__gdal_version__},
    }
    if properties["proj:code"] is None:
        properties["proj:wkt2"] = CRS.from_string(grid.crs).to_wkt(version="WKT2_2019")
    if level is not None:
        properties["processing:level"] = level
    if description.statistics is not None:
        properties["lynkeus:area_statistics"] = _area_record(description.statistics)
    band: dict[str, Any] = {
        "description": description.quantity,
        "data_type": "float32",
        "nodata": "nan",
        "unit": description.unit,
        "statistics": {
            "minimum": statistics.minimum,
            "maximum": statistics.maximum,
            "mean": statistics.mean,
            "stddev": statistics.deviation,
            "valid_percent": statistics.valid,
        },
        "raster:sampling": "area",
    }
    system = CRS.from_string(grid.crs)
    if system.is_projected and system.linear_units_factor[1] == 1.0:
        band["raster:spatial_resolution"] = math.sqrt(abs(a * e - b * d))
    if description.layer is not None:
        # The name of a band is the name that the data provider uses for it (STAC 1.1.0, common metadata, Band Object).
        band = {"name": description.layer, **band}
    return {
        "type": "Feature",
        "stac_version": STAC_VERSION,
        "stac_extensions": list(STAC_EXTENSIONS),
        "id": description.id,
        "geometry": {"type": "Polygon", "coordinates": [ring]},
        "bbox": [min(longitudes), min(latitudes), max(longitudes), max(latitudes)],
        "properties": properties,
        "links": [dict(link) for link in links],
        "assets": {
            "data": {
                "href": f"./{name}.tif",
                "type": GEOTIFF_TYPE,
                "title": description.title,
                "roles": ["data"],
                "bands": [band],
            }
        },
    }


def _area_record(statistics: AreaStatistics) -> dict[str, Any]:
    """Return the statistics of a result inside an area in the form of its record.

    The names of the statistics are those of the Statistics Object of STAC 1.1.0 (count, mean, stddev, minimum
    and maximum), with the median beside them.
    """
    area = statistics.area
    values = {
        "mean": statistics.mean,
        "stddev": statistics.deviation,
        "minimum": statistics.minimum,
        "median": statistics.median,
        "maximum": statistics.maximum,
    }
    return {
        "area": {"crs": area.crs, "kind": area.kind, "points": [list(point) for point in area.points]},
        "rule": "A cell is counted when its centre lies inside the area and it holds a value.",
        "count": statistics.cells,
        **({} if statistics.cells == 0 else values),
    }


def _outline(grid: Grid) -> list[list[float]]:
    """Return the outline of a grid in longitude and latitude (WGS 84), as a closed anticlockwise ring."""
    a, b, c, d, e, f = grid.transform
    steps = np.arange(OUTLINE_POINTS) / OUTLINE_POINTS
    full, none = np.ones(OUTLINE_POINTS), np.zeros(OUTLINE_POINTS)
    columns = np.concatenate([steps, full, 1 - steps, none]) * grid.width
    rows = np.concatenate([none, steps, full, 1 - steps]) * grid.height
    xs = a * columns + b * rows + c
    ys = d * columns + e * rows + f
    longitudes, latitudes = transform(CRS.from_string(grid.crs), CRS.from_epsg(4326), xs.tolist(), ys.tolist())
    ring = [
        [round(longitude, 7), round(latitude, 7)] for longitude, latitude in zip(longitudes, latitudes, strict=True)
    ]
    # GeoJSON asks for the outer ring anticlockwise; twice the signed area of the ring is positive in that case.
    turn = sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1], strict=True))
    if turn < 0:
        ring.reverse()
    return [*ring, ring[0]]
