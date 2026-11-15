"""The formats that connect the parts of Lynkeus.

A layer description is what the interface receives for every layer, whether
the layer was received from NASA or computed by an analysis tool. A layer
request and a tool run are what the interface sends to the server; the answer
to each is a job, whose result is a layer description. An analysis result is
what the function of a tool returns to the server.

The interface holds the same formats as TypeScript types, in
``web/src/shared/layer.ts``.
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
        product states it. A layer received from NASA has one when its values
        are a phase and the product states the frequency. Every other layer
        has none, a result has none, and a description stored before this
        field existed has none.
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
    """

    values: NDArray[np.float32]
    quantity: str
    unit: str
    range: tuple[float, float]
    colours: str
    method: str
    reduction: Reduction = "mean"
    ends: tuple[str, str] | None = None
