"""The run of an analysis tool on layers of Lynkeus.

``run_tool`` reads the input layers of a tool, calls the function of the tool
from ``lynkeus.analysis.TOOLS`` and writes the result as a layer of the kind
``result``. The function of a tool computes; it reads and writes no file.
"""

from collections.abc import Callable, Mapping
from pathlib import Path

import numpy as np

from lynkeus.analysis import TOOLS
from lynkeus.layers import LayerDescription, ToolRun
from lynkeus.writing import PROGRAM, LayerError, read_layer, write_layer


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
        The tool, the ``id`` of each input layer and the name of the result.
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
        dates and input files are those of the input layers.

    Raises
    ------
    LayerError
        If the tool or a layer does not exist, the layers do not share one
        grid, or the result cannot be written. The message is one sentence
        for the visitor.
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
    report(70, "Writing the result.")
    names = ", ".join(description.title for description in descriptions)
    description = write_layer(
        np.asarray(result.values, dtype=np.float32),
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
        lineage=f"Result of the analysis tool {run.tool} of {PROGRAM} on the layers: {names}. Method: {result.method}",
        method=result.method,
        links=[
            {"rel": "derived_from", "href": description.record, "type": "application/geo+json"}
            for description in descriptions
        ],
    )
    report(100, "The result is ready.")
    return description
