"""The tools of the group Soil moisture. They read the layer ``soilMoisture`` of SME2 products.

The layer is the volumetric soil moisture that the mission retrieves from the radar backscatter, in cubic metres
of water in a cubic metre of soil, on the 200 m EASE-Grid 2.0. The product computes it as the mean of the
retrievals of its algorithms. The method sheets are ``docs/methods/soil-moisture-state.md`` and
``docs/methods/soil-moisture-change.md``.
"""

import re
from collections.abc import Sequence

import numpy as np
from numpy.typing import NDArray

from lynkeus.analysis.inputs import check_inputs
from lynkeus.layers import AnalysisResult, LayerDescription
from lynkeus.writing import LayerError

# The layer of the soil moisture of an SME2 product, by its path inside the group ``/science/LSAR/SME2/grids/``
# (NASA SDS Product Specification, L3 SME2, JPL D-107677 Rev C, Table 4.2.1, page 37), which is the name that
# ``lynkeus.harmony.layers_of`` gives it.
_LAYER = re.compile(r"soilMoisture")
_READS = "the layer soilMoisture"

# The unit of the layer as ``lynkeus.harmony.layers_of`` writes it. The product writes it ``meter^3/meter^3``
# (the same specification, page 37).
_UNIT = "m3 m-3"

# The two thresholds of the soil moisture that the specification gives for the retrieval quality flags, in
# m3 m-3 (the same specification, pages 23, 25, 30 and 37, flag bit 3; NISAR L3 Soil Moisture Data Product ATBD,
# JPL D-107679 Release 3.3, Table 5.5.2).
_LOWEST, _HIGHEST = 0.02, 0.60

_STATE_METHOD = (
    "Layer soilMoisture of the product, unchanged "
    "(NASA SDS Product Specification, L3 SME2, JPL D-107677 Rev C; "
    "NISAR L3 Soil Moisture Data Product ATBD, JPL D-107679 Release 3.3)"
)
_CHANGE_METHOD = (
    "Difference of the layer soilMoisture of two dates, later minus earlier "
    "(image differencing: Singh, 1989, https://doi.org/10.1080/01431168908903939)"
)


def _check_moisture(values: NDArray[np.float32], layer: LayerDescription) -> None:
    """Check that the array of a layer holds volumetric soil moisture.

    Raises
    ------
    LayerError
        If no cell holds a value, or a cell holds a value below 0 or above 1.
    """
    valid = values[~np.isnan(values)]
    if valid.size == 0:
        raise LayerError(f'The layer "{layer.title}" holds no value in any cell.')
    if valid.min() < 0 or valid.max() > 1:
        raise LayerError(
            f'The layer "{layer.title}" holds values outside 0 to 1, so it is not a volumetric soil moisture.'
        )


def soil_moisture_state(arrays: Sequence[NDArray[np.float32]], layers: Sequence[LayerDescription]) -> AnalysisResult:
    """Map the soil moisture of one date.

    Parameters
    ----------
    arrays : sequence of numpy.ndarray
        One array: the layer ``soilMoisture`` of an SME2 product, the volumetric soil moisture in cubic metres
        of water in a cubic metre of soil (unit ``m3 m-3``).
    layers : sequence of LayerDescription
        The description of that layer.

    Returns
    -------
    AnalysisResult
        The input array itself, not a copy: the soil moisture (unit ``m3 m-3``). The legend runs from 0.02 to
        0.60 m3 m-3, the two thresholds that the product specification gives for the soil moisture in its
        retrieval quality flags, on the scale ``YlGnBu``. The reduced copies of the result are means of its
        values.

    Raises
    ------
    LayerError
        If the input is not one layer ``soilMoisture`` of an SME2 product with the unit ``m3 m-3`` and one date
        (see ``check_inputs``), holds no value, or holds a value below 0 or above 1.
    """
    check_inputs(arrays, layers, count=1, product="SME2", names=_LAYER, reads=_READS, dates=1, unit=_UNIT)
    moisture = arrays[0]
    _check_moisture(moisture, layers[0])
    return AnalysisResult(moisture, "Soil moisture", _UNIT, (_LOWEST, _HIGHEST), "YlGnBu", _STATE_METHOD)


def soil_moisture_change(arrays: Sequence[NDArray[np.float32]], layers: Sequence[LayerDescription]) -> AnalysisResult:
    """Map the change of the soil moisture between two dates.

    Parameters
    ----------
    arrays : sequence of numpy.ndarray
        Two arrays on the same grid: the layer ``soilMoisture`` of two SME2 products of the same instrument,
        track, direction and frame, the volumetric soil moisture (unit ``m3 m-3``). The earlier date comes
        first.
    layers : sequence of LayerDescription
        The descriptions of the two layers, in the same order.

    Returns
    -------
    AnalysisResult
        Change of the soil moisture (unit ``m3 m-3``): the later date minus the earlier. A positive value is
        an increase. A cell holds ``nan`` where either input is ``nan``. The legend runs from -r to +r, where
        r is the 99th percentile of the absolute values of the result, in m3 m-3, on the diverging scale
        ``RdBu``. The words of its two ends are "decrease" for the lowest value and "increase" for the
        highest. The reduced copies of the result are means of its values.

    Raises
    ------
    LayerError
        If the inputs are not two layers ``soilMoisture`` of SME2 products with the unit ``m3 m-3`` and one
        date each (see ``check_inputs``), are not of the same instrument, track, direction and frame, or do
        not have the earlier date first; if an input holds no value, or holds a value below 0 or above 1; if
        no cell holds a value on both dates; or if the legend has no range.
    """
    earlier, later = check_inputs(
        arrays, layers, count=2, product="SME2", names=_LAYER, reads=_READS, dates=1, unit=_UNIT
    )
    if earlier != later:
        raise LayerError("The two layers are not of the same instrument, track, direction and frame.")
    if not layers[0].dates[0] < layers[1].dates[0]:
        raise LayerError("The first layer must be of an earlier date than the second.")
    before, after = arrays
    _check_moisture(before, layers[0])
    _check_moisture(after, layers[1])
    change = after - before
    valid = change[~np.isnan(change)]
    if valid.size == 0:
        raise LayerError("The result would hold no value in any cell.")
    # A list of percentiles makes numpy interpolate in 64-bit numbers.
    (reach,) = np.quantile(np.abs(valid), [0.99])
    if not reach > 0:
        raise LayerError("The values of the result are too alike to give the legend a range.")
    return AnalysisResult(
        change,
        "Change of soil moisture",
        _UNIT,
        (-float(reach), float(reach)),
        "RdBu",
        _CHANGE_METHOD,
        "mean",
        ("decrease", "increase"),
    )
