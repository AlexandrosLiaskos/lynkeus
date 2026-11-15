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

The interface holds the formats of the layers as TypeScript types, in
``web/src/shared/layer.ts``. It holds the formats of the series in
``web/src/shared/series.ts``.
"""

from dataclasses import dataclass
from datetime import date
from typing import Annotated, Literal, Self

import numpy as np
from numpy.typing import NDArray
from pydantic import BaseModel, ConfigDict, Field, model_validator

type ProductType = Literal["GCOV", "GUNW", "GOFF", "SME2"]

type Text = Annotated[str, Field(min_length=1)]

type Reduction = Literal["mean", "mean-power"]
"""How the reduced copies (overviews) of a result are made from its values.

``mean`` takes the mean of the values. ``mean-power`` is for values in decibels
of a power: it takes the mean of the linear power and gives it in decibels.

A series uses the same two words for how the value of a date is made from the
cells of its layer.
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
    frequency : float or None
        Centre frequency of the radar band of the layer, in hertz, as the
        product states it. The layer ``unwrappedPhase`` of a GUNW product has
        one when it was received from NASA and the product states the
        frequency. Every other layer has none, a result has none, and a
        description stored before this field existed has none.
    note : str or None
        One sentence for the visitor that the tool gives about its result,
        for example how many cells it left out. Only a result may have one,
        when its tool gives one. A layer has none, and a description stored
        before this field existed has none.
    program : str
        Program and version that produced the file.
    method : str or None
        Reference of the method. A result has one, and a layer has none.
    record : str
        Address of the STAC record.
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
    frequency: float | None = Field(default=None, gt=0)
    note: Text | None = None
    program: Text
    method: Text | None = None
    record: Text

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
        if self.kind == "layer" and self.note is not None:
            raise ValueError("only a result has a note of its tool")
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
    """

    tool: Text
    inputs: tuple[Text, ...] = Field(min_length=1)
    title: Text


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
        of the whole area of the layers.
    cell : Cell or None
        The cell of the grid of the layers that holds the point. It is given
        when, and only when, ``point`` is.
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
    note : str or None
        One sentence for the visitor that the tool gives about the series,
        for example how many cells it left out. A series of a tool that
        gives none has none, and so has a description stored before this
        field existed.
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
    area: Area
    entries: tuple[SeriesEntry, ...] = Field(min_length=1)
    inputs: tuple[Text, ...] = Field(min_length=1)
    layer: Text
    program: Text
    method: Text
    note: Text | None = None

    @model_validator(mode="after")
    def _is_consistent(self) -> Self:
        if self.range is not None and self.range[0] >= self.range[1]:
            raise ValueError("the lowest value of the range must be smaller than the highest")
        if (self.point is None) != (self.cell is None):
            raise ValueError("a series at a point has its point and its cell, and a series of an area has neither")
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
        The ``id`` of each input layer, the dates in any order. A tool that
        reads two layers of each date takes them one after the other, in the
        order that its method sheet gives.
    title : str
        Name of the series.
    point : Point or None
        The point of the series. None asks for the series of the whole area
        of the layers.
    """

    tool: Text
    inputs: tuple[Text, ...] = Field(min_length=2)
    title: Text
    point: Point | None = None


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
    reduction : {"mean", "mean-power"}
        How the reduced copies of the result are made from ``values``: the
        mean of the values, or, for decibels of a power, the decibels of the
        mean of the linear power.
    ends : tuple of str or None
        Words that name the lowest and the highest end of the legend, for
        example ``("decrease", "increase")``, or None when the two values of
        ``range`` say enough.
    note : str or None
        One sentence for the visitor about the result, for example how many
        cells the tool left out, or None.
    """

    values: NDArray[np.float32]
    quantity: str
    unit: str
    range: tuple[float, float]
    colours: str
    method: str
    reduction: Reduction = "mean"
    ends: tuple[str, str] | None = None
    note: str | None = None


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
    note : str or None
        One sentence for the visitor about the series, for example how many
        cells the tool left out, or None.
    """

    entries: tuple[SeriesEntry, ...]
    inputs: tuple[str, ...]
    layer: str
    quantity: str
    unit: str
    method: str
    reduction: Reduction = "mean"
    range: tuple[float, float] | None = None
    note: str | None = None
