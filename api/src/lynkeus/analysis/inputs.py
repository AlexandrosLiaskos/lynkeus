"""The checks that every analysis tool makes on its input layers."""

import re
from collections.abc import Sequence
from typing import NamedTuple

import numpy as np
from numpy.typing import NDArray

from lynkeus.layers import LayerDescription, ProductType
from lynkeus.writing import LayerError

# The start of the name of a NISAR product file: instrument and level, processing type, product type, cycle,
# track, direction and frame (SDS Product File Naming Conventions, JPL D-102255 Rev C, sections 3.7 and 3.8).
_PRODUCT_FILE = re.compile(
    r"NISAR_(?P<instrument>[LS])\d_(?:PR|UR|OD)_(?P<product>[A-Z0-9]{4})_\d{3}_"
    r"(?P<track>\d{3})_(?P<direction>[AD])_(?P<frame>\d{3})_"
)


class Acquisition(NamedTuple):
    """How a product was acquired: its instrument (``L`` or ``S``), track, direction (``A`` or ``D``) and frame."""

    instrument: str
    track: int
    direction: str
    frame: int


def check_inputs(
    arrays: Sequence[NDArray[np.float32]],
    layers: Sequence[LayerDescription],
    *,
    count: int,
    product: ProductType,
    names: re.Pattern[str],
    reads: str,
    dates: int,
    unit: str = "1",
) -> tuple[Acquisition, ...]:
    """Check the input layers of a tool.

    Parameters
    ----------
    arrays : sequence of numpy.ndarray
        Arrays of the input layers: two dimensions, 32-bit floating point.
    layers : sequence of LayerDescription
        Descriptions of the input layers, in the same order.
    count : int
        Number of layers that the tool takes.
    product : {"GCOV", "GUNW", "GOFF", "SME2"}
        Product type that the tool reads.
    names : re.Pattern
        Pattern that the whole name of a layer inside its product (``LayerDescription.layer``) must match.
    reads : str
        The layers that ``names`` accepts, in words that end the sentence of a refusal.
    dates : int
        Number of dates of each layer: 1 for an acquisition, 2 for a pair.
    unit : str
        Unit that the product declares for the layers that ``names`` accepts. It is ``1`` unless given.

    Returns
    -------
    tuple of Acquisition
        How the product of each layer was acquired, read from the name of its product file.

    Raises
    ------
    LayerError
        If the number of layers is not ``count``; if the grids differ in size; if a layer was not received from
        one product file of the type ``product``, does not record the name of its layer inside the product,
        records a name that ``names`` does not match, does not carry the unit ``unit`` that the product
        declares,
        or does not have ``dates`` dates.
    ValueError
        If the arrays and the descriptions differ in number, or an array is not as described above. These are
        faults of the caller.
    """
    if len(arrays) != len(layers):
        raise ValueError("The arrays and the descriptions of the input layers differ in number.")
    if len(layers) != count:
        raise LayerError(f"The number of input layers must be {count}, and it is {len(layers)}.")
    acquisitions = []
    for array, layer in zip(arrays, layers, strict=True):
        if array.ndim != 2 or array.dtype != np.float32:
            raise ValueError(f'The array of the layer "{layer.title}" is not two-dimensional 32-bit floating point.')
        if array.shape != arrays[0].shape:
            raise LayerError("The input layers do not have the same grid.")
        name = layer.inputs[0] if layer.kind == "layer" and len(layer.inputs) == 1 else ""
        found = _PRODUCT_FILE.match(name)
        if found is None or found["product"] != product:
            raise LayerError(f'The layer "{layer.title}" is not a layer received from one NISAR {product} product.')
        if layer.layer is None:
            raise LayerError(
                f'The layer "{layer.title}" does not record which layer of its product it is; '
                "receive it again with Get layer."
            )
        if not names.fullmatch(layer.layer):
            raise LayerError(
                f'The layer "{layer.title}" is the layer {layer.layer} of its product, and the tool reads {reads}.'
            )
        if layer.unit != unit:
            raise LayerError(
                f'The layer "{layer.title}" has the unit {layer.unit}, and the tool reads the unit {unit}.'
            )
        if len(layer.dates) != dates:
            raise LayerError(
                f'The number of dates of the layer "{layer.title}" must be {dates}, and it is {len(layer.dates)}.'
            )
        acquisitions.append(
            Acquisition(found["instrument"], int(found["track"]), found["direction"], int(found["frame"]))
        )
    return tuple(acquisitions)
