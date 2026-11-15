# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""The formats that connect the parts of Lynkeus.

A layer description is what the interface receives for every layer, whether
the layer was received from NASA or computed by an analysis tool. A layer
request and a tool run are what the interface sends to the server; the answer
to each is a job, whose result is a layer description. An analysis result is
what the function of a tool returns to the server.

A series is the value of one quantity on many dates, at a point or for an
area. It is not a layer: it has no grid and no file. A series run is what the
interface sends to the server to start a tool of the kind Series; the answer
is a job, whose result is a series description. A series result is what the
function of such a tool returns to the server.

An area drawn on the map is a rectangle or a polygon in the coordinates of
the map. A tool run may carry one, and the description of its result then
holds the statistics of the cells of the result inside the area. A series run
may carry one in the place of a point, and the series is then that of the
cells inside the area.

The interface holds the formats of the layers as TypeScript types, in
``web/src/shared/layer.ts``. It holds the formats of the series in
``web/src/shared/series.ts``.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from typing import Annotated, Literal, Self

import numpy as np
from numpy.typing import NDArray
from pydantic import BaseModel, ConfigDict, Field, model_validator

type ProductType = Literal["GCOV", "GUNW", "GOFF", "SME2"]

MOST_CORNERS = 250
"""The largest number of corners of an area drawn on the map. The interface holds the same number."""

type Text = Annotated[str, Field(min_length=1)]

type Reduction = Literal["mean", "mean-power"]
"""How the reduced copies (overviews) of a result are made from its values.

``mean`` takes the mean of the values. ``mean-power`` is for values in decibels
of a power: it takes the mean of the linear power and gives it in decibels.

A series uses the same two words for how the value of a date is made from the
cells of its layer.
"""

type ResultReduction = Literal["mean", "mean-power", "mode"]
"""How the reduced copies (overviews) of a result are made from its values.

``mean`` and ``mean-power`` are those of ``Reduction``. ``mode`` is for a
result of classes: a cell of a reduced copy takes the most frequent value of
the cells that it covers, so that it holds a class and not a value between
classes.
"""


class Format(BaseModel):
    """A format that accepts no unknown field and cannot be changed after it is made."""

    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)


class Area(Format):
    """A rectangle on the Earth, in degrees of longitude and latitude (WGS 84).

    West is smaller than east and south smaller than north, so an area does
    not cross the meridian of 180 degrees.
    """

    west: float = Field(ge=-180, le=180)
    south: float = Field(ge=-90, le=90)
    east: float = Field(ge=-180, le=180)
    north: float = Field(ge=-90, le=90)

    @model_validator(mode="after")
    def _has_extent(self) -> Self:
        if self.west >= self.east:
            raise ValueError("west must be smaller than east")
        if self.south >= self.north:
            raise ValueError("south must be smaller than north")
        return self


class LayerClass(Format):
    """A class of a layer of classes.

    Attributes
    ----------
    value : int
        Value of the cells of the class in the file of the layer, a whole
        number from 0.
    name : str
        Name of the class for the visitor, for example ``Open water``.
    colour : str
        Colour of the class, as ``#`` and six hexadecimal digits in lower case,
        for example ``#151b73``.
    """

    value: int = Field(ge=0, strict=True)
    name: Text
    colour: str = Field(pattern=r"^#[0-9a-f]{6}$")


type Corner = tuple[float, float]


def _turn(a: Corner, b: Corner, c: Corner) -> float:
    """Return a number whose sign is that of the turn from a through b to c: positive to the left, zero on a line."""
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _between(a: Corner, b: Corner, c: Corner) -> bool:
    """Tell whether the point c, which lies on the line through a and b, lies between a and b."""
    return min(a[0], b[0]) <= c[0] <= max(a[0], b[0]) and min(a[1], b[1]) <= c[1] <= max(a[1], b[1])


def _meet(a: Corner, b: Corner, c: Corner, d: Corner) -> bool:
    """Tell whether the side from a to b and the side from c to d have a point in common."""
    one, two, three, four = _turn(a, b, c), _turn(a, b, d), _turn(c, d, a), _turn(c, d, b)
    if one * two < 0 and three * four < 0:
        return True
    return (
        (one == 0 and _between(a, b, c))
        or (two == 0 and _between(a, b, d))
        or (three == 0 and _between(c, d, a))
        or (four == 0 and _between(c, d, b))
    )


def _folds_back(a: Corner, b: Corner, c: Corner) -> bool:
    """Tell whether the side from b to c turns back along the side from a to b."""
    return _turn(a, b, c) == 0 and (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) < 0


def corners_of(points: Sequence[Corner]) -> list[Corner]:
    """Return the corners of a closed ring of points, moved so that the first lies at the origin.

    The last point, which repeats the first, and a point that repeats the one before it are left out. The move
    keeps the numbers of the checks of ``Shape`` small, so that their signs are exact for simple corners on one
    line.
    """
    x0, y0 = points[0]
    corners: list[Corner] = []
    for x, y in points[:-1]:
        corner = (x - x0, y - y0)
        if not corners or corner != corners[-1]:
            corners.append(corner)
    if len(corners) > 1 and corners[-1] == corners[0]:
        corners.pop()
    return corners


def crosses_itself(corners: Sequence[Corner]) -> bool:
    """Tell whether two sides of a polygon meet anywhere but at the corner that joins two neighbouring sides.

    Two neighbouring sides cross when the second turns back along the first.
    """
    count = len(corners)
    sides = [(corners[index], corners[(index + 1) % count]) for index in range(count)]
    for first in range(count):
        for second in range(first + 1, count):
            (a, b), (c, d) = sides[first], sides[second]
            if second == first + 1:
                if _folds_back(a, b, d):
                    return True
            elif first == 0 and second == count - 1:
                if _folds_back(c, a, b):
                    return True
            elif _meet(a, b, c, d):
                return True
    return False


class Shape(Format):
    """An area that the visitor drew on the map: a rectangle or a polygon, in the coordinates of the map.

    Attributes
    ----------
    crs : str
        Coordinate reference system of the points, as an EPSG code: ``EPSG:3857`` for the map of Lynkeus.
    kind : {"rectangle", "polygon"}
        ``rectangle`` for a rectangle whose sides run along the axes of ``crs``, ``polygon`` for any other shape.
    points : tuple of tuple of float
        The corners in their order around the area, each as x and y, with the first repeated at the end. The
        sides are straight lines in ``crs``. A rectangle has four corners on two values of x and two of y.
    """

    crs: str = Field(pattern=r"^EPSG:[0-9]{1,6}$")
    kind: Literal["rectangle", "polygon"]
    points: tuple[tuple[float, float], ...] = Field(min_length=4, max_length=MOST_CORNERS + 1)

    @model_validator(mode="after")
    def _is_one_area(self) -> Self:
        if self.points[0] != self.points[-1]:
            raise ValueError("the last point of an area must repeat its first")
        corners = corners_of(self.points)
        if len(corners) < 3:
            raise ValueError("an area needs at least three different corners")
        if self.kind == "rectangle" and (
            len(corners) != 4 or len({x for x, _ in corners}) != 2 or len({y for _, y in corners}) != 2
        ):
            raise ValueError("a rectangle has four corners on two values of x and two values of y")
        # Corners on one line make sides that turn back along each other, so an area that passes has a size.
        if crosses_itself(corners):
            raise ValueError("the sides of the area cross or overlap each other")
        return self


class AreaStatistics(Format):
    """The statistics of a result inside an area that the visitor drew on the map.

    A cell of the result is counted when its centre lies inside the area and it holds a value, which is the rule
    of GDAL for a polygon that is rasterized without the option ALL_TOUCHED.

    Attributes
    ----------
    area : Shape
        The area, as the visitor drew it.
    cells : int
        Number of the cells that are counted.
    mean, deviation, minimum, median, maximum : float or None
        Mean, standard deviation, lowest value, median and highest value of the values of those cells, in the
        unit of the result. They are computed in 64-bit numbers. The standard deviation is that of the
        population: the square root of the mean of the squared differences from the mean. The median of an even
        number of values is the mean of the two in the middle. Each is None when no cell is counted.
    """

    area: Shape
    cells: int = Field(ge=0)
    mean: float | None = None
    deviation: float | None = Field(default=None, ge=0)
    minimum: float | None = None
    median: float | None = None
    maximum: float | None = None

    @model_validator(mode="after")
    def _has_values_when_it_has_cells(self) -> Self:
        values = (self.mean, self.deviation, self.minimum, self.median, self.maximum)
        if self.cells == 0 and any(value is not None for value in values):
            raise ValueError("statistics without cells have no values")
        if self.cells > 0 and any(value is None for value in values):
            raise ValueError("statistics of cells have every value")
        if (
            self.minimum is not None
            and self.median is not None
            and self.maximum is not None
            and not self.minimum <= self.median <= self.maximum
        ):
            raise ValueError("the median lies between the lowest and the highest value")
        return self


class LayerDescription(Format):
    """The description of a layer.

    Attributes
    ----------
    id : str
        Unique name of the layer, in lower-case letters, digits and hyphens.
    title : str
        Name shown in the panes.
    kind : {"layer", "result"}
        ``layer`` for data received, ``result`` for the output of a tool.
    url : str
        Address of the Cloud Optimized GeoTIFF.
    quantity : str
        What the values are.
    unit : str
        Unit of the values.
    range : tuple of float
        Lowest and highest value of the legend, in ``unit``.
    colours : str
        Name of the colour scale.
    dates : tuple of datetime.date
        Date or dates of the data.
    inputs : tuple of str
        Names of the product files used.
    layer : str or None
        Name of the layer inside the product, as the layer request gave it,
        for example ``HHHH``. A layer received from NASA has one. A result
        has none, and a layer stored before this field existed has none.
    ends : tuple of str or None
        Words that name the lowest and the highest end of the legend, for
        example ``("decrease", "increase")``. Only a result may have them,
        when its tool gives them. A layer has none, and a description stored
        before this field existed has none.
    classes : tuple of LayerClass or None
        The classes of a layer of classes, in the order of their values: the
        value of the cells of each class in the file, its name and its colour.
        Only a result may have them, when its tool gives classes. The range of
        such a result runs from the lowest to the highest value of its classes,
        and its cells are drawn in the colours of their classes. A layer has
        none, and a description stored before this field existed has none.
    frequency : float or None
        Centre frequency of the radar band of the layer, in hertz, as the
        product states it. The layer ``unwrappedPhase`` of a GUNW product has
        one when it was received from NASA and the product states the
        frequency. Every other layer has none, a result has none, and a
        description stored before this field existed has none.
    program : str
        Program and version that produced the file.
    method : str or None
        Reference of the method. A result has one, and a layer has none.
    record : str
        Address of the STAC record.
    statistics : AreaStatistics or None
        The statistics of the result inside the area that the visitor drew
        on the map, when the tool was run with one. A layer has none, and so
        has a description stored before this field existed.
    """

    id: str = Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")
    title: Text
    kind: Literal["layer", "result"]
    url: Text
    quantity: Text
    unit: Text
    range: tuple[float, float]
    colours: Text
    dates: tuple[date, ...] = Field(min_length=1)
    inputs: tuple[Text, ...] = Field(min_length=1)
    layer: Text | None = None
    ends: tuple[Text, Text] | None = None
    classes: tuple[LayerClass, ...] | None = None
    frequency: float | None = Field(default=None, gt=0)
    program: Text
    method: Text | None = None
    record: Text
    statistics: AreaStatistics | None = None

    @model_validator(mode="after")
    def _is_consistent(self) -> Self:
        lowest, highest = self.range
        if lowest >= highest:
            raise ValueError("the lowest value of the range must be smaller than the highest")
        if self.kind == "result" and self.method is None:
            raise ValueError("a result needs the reference of its method")
        if self.kind == "layer" and self.method is not None:
            raise ValueError("a layer received from NASA has no method")
        if self.kind == "result" and self.layer is not None:
            raise ValueError("a result is not a layer of a product, so it has no name of one")
        if self.kind == "layer" and self.ends is not None:
            raise ValueError("only the legend of a result has words for its two ends")
        if self.kind == "result" and self.frequency is not None:
            raise ValueError("a result is not a layer of a product, so it has no centre frequency of a radar band")
        if self.classes is not None:
            values = [entry.value for entry in self.classes]
            if self.kind == "layer":
                raise ValueError("only a result may have classes")
            if len(values) < 2 or values != sorted(set(values)):
                raise ValueError(
                    "a layer of classes has at least two classes, with different values in increasing order"
                )
            if self.range != (values[0], values[-1]):
                raise ValueError(
                    "the range of a layer of classes runs from the lowest to the highest value of its classes"
                )
        if self.kind == "layer" and self.statistics is not None:
            raise ValueError("only a result has statistics in an area")
        return self


class LayerRequest(Format):
    """What a dialog sends to the server to receive a layer.

    Attributes
    ----------
    product : {"GCOV", "GUNW", "GOFF", "SME2"}
        Product type.
    granule : str
        Name of the product file, from the search.
    layer : str
        Name of the layer inside the product.
    area : Area
        Area to which the layer is clipped.
    """

    product: ProductType
    granule: Text
    layer: Text
    area: Area


class ToolRun(Format):
    """What the tool dialog sends to the server to start an analysis.

    Attributes
    ----------
    tool : str
        Name of the button of the tool, for example ``backscatter-change``.
    inputs : tuple of str
        The ``id`` of each input layer, in the order that the method sheet gives.
    title : str
        Name of the result.
    area : Shape or None
        An area drawn on the map. The description of the result then holds
        the statistics of the result inside it.
    """

    tool: Text
    inputs: tuple[Text, ...] = Field(min_length=1)
    title: Text
    area: Shape | None = None


class Point(Format):
    """A point on the Earth, in degrees of longitude and latitude (WGS 84).

    Attributes
    ----------
    longitude : float
        Longitude, from -180 to 180 degrees, positive to the east.
    latitude : float
        Latitude, from -90 to 90 degrees, positive to the north.
    """

    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)


class Cell(Format):
    """A cell of the grid of a layer.

    Attributes
    ----------
    row : int
        Number of the row, counted from 0 at the first row of the file.
    column : int
        Number of the column, counted from 0 at the first column of the file.
    longitude, latitude : float
        Centre of the cell, in degrees (WGS 84).
    """

    row: int = Field(ge=0)
    column: int = Field(ge=0)
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)


class SeriesEntry(Format):
    """One date of a series: the value of one input layer.

    Attributes
    ----------
    dates : tuple of datetime.date
        Date or dates of the layer: one date for an acquisition, two for a
        pair.
    value : float or None
        Value of the quantity on that date, in the unit of the series. It is
        None when no cell holds a value: at a point, when the cell holds no
        data on that date.
    cells : int
        Number of cells from which the value was made: 0 or 1 at a point; for
        an area, the number of cells that hold a value on that date.
    """

    dates: tuple[date, ...] = Field(min_length=1)
    value: float | None
    cells: int = Field(ge=0)

    @model_validator(mode="after")
    def _has_a_value_when_it_has_cells(self) -> Self:
        if (self.value is None) != (self.cells == 0):
            raise ValueError("an entry has a value when, and only when, it was made from at least one cell")
        return self


class SeriesDescription(Format):
    """The description of a series: the result of a tool of the kind Series.

    The description holds the whole series. A series has no file.

    Attributes
    ----------
    id : str
        Unique name of the series, in lower-case letters, digits and hyphens.
    title : str
        Name shown in the panes.
    kind : {"series"}
        Always ``series``. It tells a series from a layer description.
    quantity : str
        What the values are.
    unit : str
        Unit of the values.
    reduction : {"mean", "mean-power"}
        How the value of a date is made from the cells of its layer:
        ``mean`` is the mean of the values of the cells; ``mean-power`` is
        for decibels of a power, the decibels of the mean of the linear
        power of the cells. At a point the value is made from one cell.
    range : tuple of float or None
        Lowest and highest value of the axis of the values, in ``unit``,
        when the quantity has fixed limits, for example ``(0, 1)`` for a
        coherence. None when it has none.
    point : Point or None
        The point of the request, for a series at a point. None for a series
        of an area.
    cell : Cell or None
        The cell of the grid of the layers that holds the point. It is given
        when, and only when, ``point`` is.
    shape : Shape or None
        The area drawn on the map, for a series of the cells inside it. None
        for a series at a point and for a series of the whole area of the
        layers, and for a description stored before this field existed.
    area : Area
        The smallest rectangle in longitude and latitude that holds the grid
        of the input layers.
    entries : tuple of SeriesEntry
        The dates of the series with their values, the earliest first.
    inputs : tuple of str
        Names of the product files used, in the order of ``entries``: the
        file of the first entry comes first.
    layer : str
        Name of the layer inside each product, for example ``HHHH``. All
        input layers of a series have the same name.
    program : str
        Program and version that produced the series.
    method : str
        Reference of the method.
    """

    id: str = Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")
    title: Text
    kind: Literal["series"]
    quantity: Text
    unit: Text
    reduction: Reduction
    range: tuple[float, float] | None = None
    point: Point | None = None
    cell: Cell | None = None
    shape: Shape | None = None
    area: Area
    entries: tuple[SeriesEntry, ...] = Field(min_length=1)
    inputs: tuple[Text, ...] = Field(min_length=1)
    layer: Text
    program: Text
    method: Text

    @model_validator(mode="after")
    def _is_consistent(self) -> Self:
        if self.range is not None and self.range[0] >= self.range[1]:
            raise ValueError("the lowest value of the range must be smaller than the highest")
        if (self.point is None) != (self.cell is None):
            raise ValueError("a series at a point has its point and its cell, and a series of an area has neither")
        if self.point is not None and self.shape is not None:
            raise ValueError("a series is made at a point or for an area drawn on the map, not for both")
        if len(self.inputs) != len(self.entries):
            raise ValueError("a series has one product file for each of its entries")
        days = [entry.dates for entry in self.entries]
        if days != sorted(set(days)):
            raise ValueError("the entries of a series have different dates, the earliest first")
        return self


class SeriesRun(Format):
    """What a dialog sends to the server to start a tool of the kind Series.

    Attributes
    ----------
    tool : str
        Name of the button of the tool, for example ``backscatter-series``.
    inputs : tuple of str
        The ``id`` of each input layer, in any order.
    title : str
        Name of the series.
    point : Point or None
        The point of the series. None asks for the series of an area.
    area : Shape or None
        The area drawn on the map, for a series of the cells inside it. None,
        with no point, asks for the series of the whole area of the layers.
    """

    tool: Text
    inputs: tuple[Text, ...] = Field(min_length=2)
    title: Text
    point: Point | None = None
    area: Shape | None = None

    @model_validator(mode="after")
    def _has_one_place(self) -> Self:
        if self.point is not None and self.area is not None:
            raise ValueError("a series is made at a point or for an area drawn on the map, not for both")
        return self


@dataclass(frozen=True)
class AnalysisResult:
    """What the function of an analysis tool returns.

    Attributes
    ----------
    values : numpy.ndarray
        Array of the result, on the grid of the input layers. A cell without
        data holds ``nan``.
    quantity : str
        What the values are.
    unit : str
        Unit of the values.
    range : tuple of float
        Lowest and highest value of the legend, in ``unit``.
    colours : str
        Name of the colour scale.
    method : str
        Reference of the method.
    reduction : {"mean", "mean-power", "mode"}
        How the reduced copies of the result are made from ``values``: the
        mean of the values; for decibels of a power, the decibels of the mean
        of the linear power; for classes, the most frequent value.
    ends : tuple of str or None
        Words that name the lowest and the highest end of the legend, for
        example ``("decrease", "increase")``, or None when the two values of
        ``range`` say enough.
    classes : tuple of LayerClass or None
        The classes of a result of classes, in the order of their values, or
        None for a result of a quantity. The cells of each class hold its
        value in ``values``. A result has classes when, and only when, its
        reduction is ``mode``.

    Raises
    ------
    ValueError
        If the result has classes and another reduction than ``mode``, or the
        reduction ``mode`` without classes.
    """

    values: NDArray[np.float32]
    quantity: str
    unit: str
    range: tuple[float, float]
    colours: str
    method: str
    reduction: ResultReduction = "mean"
    ends: tuple[str, str] | None = None
    classes: tuple[LayerClass, ...] | None = None

    def __post_init__(self) -> None:
        """Check that the classes and the reduction agree."""
        if (self.classes is None) == (self.reduction == "mode"):
            raise ValueError("a result has classes when, and only when, its reduced copies are made by the mode")


@dataclass(frozen=True)
class SeriesResult:
    """What the function of a tool of the kind Series returns.

    Attributes
    ----------
    entries : tuple of SeriesEntry
        The dates of the series with their values, the earliest first.
    inputs : tuple of str
        Names of the product files used, in the order of ``entries``.
    layer : str
        Name of the layer inside each product.
    quantity : str
        What the values are.
    unit : str
        Unit of the values.
    method : str
        Reference of the method.
    reduction : {"mean", "mean-power"}
        How the value of a date is made from the cells of its layer.
    range : tuple of float or None
        Lowest and highest value of the axis of the values, in ``unit``, when
        the quantity has fixed limits, or None.
    """

    entries: tuple[SeriesEntry, ...]
    inputs: tuple[str, ...]
    layer: str
    quantity: str
    unit: str
    method: str
    reduction: Reduction = "mean"
    range: tuple[float, float] | None = None
