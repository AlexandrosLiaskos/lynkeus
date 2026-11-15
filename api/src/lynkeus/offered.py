# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""The processes that the server offers.

``get-layer`` receives one layer of a NISAR product through NASA Harmony.
Every analysis tool of ``lynkeus.analysis.TOOLS`` is a process under the name
of the tool. ``processes`` lists them, and ``lynkeus.server`` installs the
list, so a tool that enters ``TOOLS`` is offered without a change here.
Every tool of ``lynkeus.analysis.SERIES_TOOLS`` is offered in the same way,
as a process whose one output is ``series`` and not ``layer``.

The server runs the function of a process in the operating-system process of
a job, in its main thread.
"""

import inspect
import os
from functools import partial
from typing import Annotated, Any

from pydantic import Field, StringConstraints, field_validator

from lynkeus.analysis import SERIES_TOOLS, TOOLS, AnalysisFunction, SeriesFunction
from lynkeus.harmony import MOST_CELLS, get_layer, layers_of
from lynkeus.jobs import MAX_ACCOUNT_LAYERS
from lynkeus.layers import (
    Format,
    LayerDescription,
    LayerRequest,
    Point,
    SeriesDescription,
    SeriesRun,
    Text,
    ToolRun,
)
from lynkeus.processes import CELLS_PARAMETER, SERIES_OUTPUT, Process, Work
from lynkeus.routes import MAX_TITLE_LENGTH
from lynkeus.tools import run_series, run_tool
from lynkeus.writing import LayerError

_CHANNELS = ("HH", "HV", "VH", "VV")
"""The polarisation channels for which ``lynkeus.harmony.layers_of`` lists layers."""


class ToolInputs(Format):
    """The inputs of the process of an analysis tool.

    Attributes
    ----------
    inputs : tuple of str
        The ``id`` of each input layer, in the order that the method sheet of the tool gives.
    title : str
        Name of the result.
    """

    inputs: tuple[Text, ...] = Field(
        min_length=1,
        max_length=MAX_ACCOUNT_LAYERS,
        title="Input layers",
        description=(
            "The id of each input layer, in the order that the method sheet of the tool gives. A layer is given once."
        ),
    )
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_TITLE_LENGTH)] = Field(
        description="Name of the result."
    )

    @field_validator("inputs")
    @classmethod
    def _gives_each_layer_once(cls, inputs: tuple[str, ...]) -> tuple[str, ...]:
        if len(set(inputs)) != len(inputs):
            raise ValueError("a layer is given more than once")
        return inputs


class SeriesInputs(Format):
    """The inputs of the process of an analysis tool of the kind Series.

    Attributes
    ----------
    inputs : tuple of str
        The ``id`` of each input layer, in any order.
    title : str
        Name of the series.
    point : Point or None
        The point of the series, in degrees of longitude and latitude
        (WGS 84). Without it the series is that of the whole area of the
        layers.
    """

    inputs: tuple[Text, ...] = Field(
        min_length=2,
        max_length=MAX_ACCOUNT_LAYERS,
        title="Input layers",
        description="The id of each input layer, in any order. A layer is given once.",
    )
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_TITLE_LENGTH)] = Field(
        description="Name of the series."
    )
    point: Point | None = Field(
        default=None,
        description=(
            "The point of the series, in degrees of longitude and latitude (WGS 84). "
            "Without it the series is that of the whole area of the layers."
        ),
    )

    @field_validator("inputs")
    @classmethod
    def _gives_each_layer_once(cls, inputs: tuple[str, ...]) -> tuple[str, ...]:
        if len(set(inputs)) != len(inputs):
            raise ValueError("a layer is given more than once")
        return inputs


def receive_layer(inputs: LayerRequest, work: Work) -> LayerDescription:
    """Receive a layer of a NISAR product for a job. This is the function of the process ``get-layer``."""
    # harmony-py prints the path of every file that it fetches, unless this environment variable is
    # FALSE. The output of a job is the log of the server, and the path names the folder of the layer.
    os.environ["VERBOSE"] = "FALSE"
    return get_layer(
        inputs,
        token=work.token,
        layer_id=work.layer_id,
        folder=work.folder,
        address=work.address,
        report=work.report,
        most_cells=work.layer_cells,
    )


def layer_job_title(inputs: LayerRequest) -> str:
    """Return the name of a job of ``get-layer``: the layer, by its name for the visitor, and the product file."""
    titles = {layer.name: layer.title for layer in layers_of(inputs.product, _CHANNELS)}
    return f"{titles.get(inputs.layer, inputs.layer)} of {inputs.granule.removesuffix('.h5')}"


def run_analysis(tool: str, inputs: ToolInputs, work: Work) -> LayerDescription:
    """Run an analysis tool on layers of the account for a job. This is the function of the process of a tool."""
    return run_tool(
        ToolRun(tool=tool, inputs=inputs.inputs, title=inputs.title),
        layers=work.layers,
        layer_id=work.layer_id,
        folder=work.folder,
        address=work.address,
        report=work.report,
    )


def result_job_title(inputs: ToolInputs) -> str:
    """Return the name of a job of an analysis tool, which is the name of its result."""
    return inputs.title


def input_layers(inputs: ToolInputs) -> tuple[str, ...]:
    """Return the names of the layers that a job of an analysis tool reads."""
    return inputs.inputs


def run_series_analysis(tool: str, inputs: SeriesInputs, work: Work) -> SeriesDescription:
    """Run an analysis tool of the kind Series on layers of the account for a job.

    This is the function of the process of such a tool. The series receives the ``id`` that the work gives.
    """
    return run_series(
        SeriesRun(tool=tool, inputs=inputs.inputs, title=inputs.title, point=inputs.point),
        layers=work.layers,
        series_id=work.layer_id,
        report=work.report,
    )


def series_job_title(inputs: SeriesInputs) -> str:
    """Return the name of a job of an analysis tool of the kind Series, which is the name of its series."""
    return inputs.title


def series_layers(inputs: SeriesInputs) -> tuple[str, ...]:
    """Return the names of the layers that a job of an analysis tool of the kind Series reads."""
    return inputs.inputs


GET_LAYER = Process(
    id="get-layer",
    title="Get layer",
    description=(
        "Receives one layer of a NISAR product from NASA Harmony, clipped to an area, "
        "and writes it as a Cloud Optimized GeoTIFF with a STAC record."
    ),
    inputs=LayerRequest,
    run=receive_layer,
    job_title=layer_job_title,
    needs_earthdata=True,
    errors=(LayerError,),
    parameters={CELLS_PARAMETER: [MOST_CELLS]},
)
"""The process that receives a layer.

Its parameter ``most-cells`` is the largest number of cells of a layer on the project server. The
description of the process for an own server gives the limit of that server in its place.
"""


def tool_process(name: str, function: AnalysisFunction) -> Process[ToolInputs]:
    """Return the process of an analysis tool.

    Parameters
    ----------
    name : str
        Name of the tool in ``lynkeus.analysis.TOOLS``. It is the name of the
        process, and with spaces for its hyphens it is the title of the process.
    function : callable
        Function of the tool. The first paragraph of its documentation
        string is the description of the process.

    Raises
    ------
    ValueError
        When the name holds other characters than lower-case letters, digits
        and hyphens, or the function has no documentation string.
    """
    words = inspect.getdoc(function)
    if not words:
        raise ValueError(f"the function of the analysis tool {name} has no documentation string")
    return Process(
        id=name,
        title=name.replace("-", " ").capitalize(),
        description=" ".join(words.split("\n\n")[0].split()),
        inputs=ToolInputs,
        run=partial(run_analysis, name),
        job_title=result_job_title,
        errors=(LayerError,),
        layers=input_layers,
    )


def series_process(name: str, function: SeriesFunction) -> Process[SeriesInputs]:
    """Return the process of an analysis tool of the kind Series.

    Parameters
    ----------
    name : str
        Name of the tool in ``lynkeus.analysis.SERIES_TOOLS``. It is the name
        of the process, and with spaces for its hyphens it is the title of
        the process.
    function : callable
        Function of the tool. The first paragraph of its documentation
        string is the description of the process.

    Raises
    ------
    ValueError
        When the name holds other characters than lower-case letters, digits
        and hyphens, or the function has no documentation string.
    """
    words = inspect.getdoc(function)
    if not words:
        raise ValueError(f"the function of the analysis tool {name} has no documentation string")
    return Process(
        id=name,
        title=name.replace("-", " ").capitalize(),
        description=" ".join(words.split("\n\n")[0].split()),
        inputs=SeriesInputs,
        run=partial(run_series_analysis, name),
        job_title=series_job_title,
        errors=(LayerError,),
        layers=series_layers,
        output=SERIES_OUTPUT,
    )


def processes() -> list[Process[Any]]:
    """Return the processes that the server offers.

    They are ``get-layer``, then one for every tool of ``TOOLS``, then one for every tool of ``SERIES_TOOLS``.
    """
    return [
        GET_LAYER,
        *(tool_process(name, function) for name, function in TOOLS.items()),
        *(series_process(name, function) for name, function in SERIES_TOOLS.items()),
    ]
