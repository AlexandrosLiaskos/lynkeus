"""The tools of the group Coherence. They read the layer ``coherenceMagnitude`` of GUNW products.

The method sheet is ``docs/methods/coherence-state.md``.
"""

from collections.abc import Sequence

import numpy as np
from numpy.typing import NDArray

from lynkeus.analysis.inputs import check_inputs
from lynkeus.layers import AnalysisResult, LayerDescription
from lynkeus.writing import LayerError

_STATE_METHOD = (
    "Layer coherenceMagnitude of the product, unchanged "
    "(NASA SDS Product Specification, L2 GUNW, JPL D-102272 Rev E; "
    "Touzi et al., 1999, https://doi.org/10.1109/36.739146)"
)


def coherence_state(arrays: Sequence[NDArray[np.float32]], layers: Sequence[LayerDescription]) -> AnalysisResult:
    """Map the interferometric coherence of one pair of dates.

    Parameters
    ----------
    arrays : sequence of numpy.ndarray
        One array: the layer ``coherenceMagnitude`` of a GUNW product, between 0 and 1 (unit ``1``).
    layers : sequence of LayerDescription
        The description of that layer.

    Returns
    -------
    AnalysisResult
        The input array itself, not a copy: the magnitude of the coherence, between 0 and 1 (unit ``1``). The
        legend runs from 0 to 1 on the grey scale.

    Raises
    ------
    LayerError
        If the input is not one layer of a GUNW product (see ``check_inputs``), holds no value, or holds a
        value outside 0 to 1.
    """
    check_inputs(arrays, layers, count=1, product="GUNW", dates=2)
    coherence = arrays[0]
    valid = coherence[~np.isnan(coherence)]
    if valid.size == 0:
        raise LayerError("The input layer holds no value in any cell.")
    if valid.min() < 0 or valid.max() > 1:
        raise LayerError("The input layer holds values outside 0 to 1, so it is not a coherence magnitude.")
    return AnalysisResult(coherence, "Interferometric coherence (magnitude)", "1", (0.0, 1.0), "grey", _STATE_METHOD)
