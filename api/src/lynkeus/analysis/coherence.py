# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""The tools of the group Coherence. They read the layer ``coherenceMagnitude`` of GUNW products.

The method sheets are ``docs/methods/coherence-state.md`` and ``docs/methods/coherence-change.md``.
"""

import re
from collections.abc import Sequence

import numpy as np
from numpy.typing import NDArray

from lynkeus.analysis.inputs import check_inputs
from lynkeus.layers import AnalysisResult, LayerDescription
from lynkeus.writing import LayerError

_READS = "the layer coherenceMagnitude"

# The name of a product file of a pair of dates up to the bandwidth mode code of its primary and secondary bands,
# four digits after the second cycle number (SDS Product File Naming Conventions, JPL D-102255 Rev C, section 3.8).
_PAIR_FILE = re.compile(r"NISAR_[LS]\d_[A-Z]{2}_[A-Z0-9]{4}_\d{3}_\d{3}_[AD]_\d{3}_\d{3}_(?P<mode>\d{4})_")

# The four layers coherenceMagnitude of a GUNW product, by their paths inside the group ``frequencyA`` (NASA SDS
# Product Specification, L2 GUNW, JPL D-102272 Rev E, pages 35 to 37), which are the names that
# ``lynkeus.harmony.layers_of`` gives them.
_COHERENCE = re.compile(r"(?:unwrappedInterferogram|wrappedInterferogram)/(?:HH|VV)/coherenceMagnitude")

_STATE_METHOD = (
    "Layer coherenceMagnitude of the product, unchanged "
    "(NASA SDS Product Specification, L2 GUNW, JPL D-102272 Rev E; "
    "Touzi et al., 1999, https://doi.org/10.1109/36.739146)"
)
_CHANGE_METHOD = (
    "Difference of the coherence magnitude of two pairs of dates, later pair minus earlier pair "
    "(Fielding et al., 2005, https://doi.org/10.1029/2004JB003299; "
    "Stephenson et al., 2022, https://doi.org/10.1109/TGRS.2021.3084209)"
)


def _bandwidth_mode(layer: LayerDescription) -> str:
    """Return the bandwidth mode code of the product of a layer, read from the name of its product file.

    Raises
    ------
    LayerError
        If the name of the product file does not hold the code.
    """
    found = _PAIR_FILE.match(layer.inputs[0])
    if found is None:
        raise LayerError(f'The name of the product of the layer "{layer.title}" does not hold its bandwidth mode.')
    return found["mode"]


def _is_coherence(values: NDArray[np.float32]) -> bool:
    """Return whether every value of a layer lies between 0 and 1. A layer without any value passes."""
    valid = values[~np.isnan(values)]
    return valid.size == 0 or bool(valid.min() >= 0 and valid.max() <= 1)


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
        If the input is not one layer ``coherenceMagnitude`` of a GUNW product (see ``check_inputs``), holds
        no value, or holds a value outside 0 to 1.
    """
    check_inputs(
        arrays, layers, count=1, product="GUNW", names=_COHERENCE, reads="the layer coherenceMagnitude", dates=2
    )
    coherence = arrays[0]
    valid = coherence[~np.isnan(coherence)]
    if valid.size == 0:
        raise LayerError("The input layer holds no value in any cell.")
    if valid.min() < 0 or valid.max() > 1:
        raise LayerError("The input layer holds values outside 0 to 1, so it is not a coherence magnitude.")
    return AnalysisResult(coherence, "Interferometric coherence (magnitude)", "1", (0.0, 1.0), "grey", _STATE_METHOD)


def coherence_change(arrays: Sequence[NDArray[np.float32]], layers: Sequence[LayerDescription]) -> AnalysisResult:
    """Map the change of the interferometric coherence between two pairs of dates.

    Parameters
    ----------
    arrays : sequence of numpy.ndarray
        Two arrays on the same grid: the same layer ``coherenceMagnitude`` (the same interferogram group, 20 m
        or 80 m, and the same channel) of two GUNW products of the same instrument, track, direction and
        frame, acquired in the same bandwidth mode, between 0 and 1 (unit ``1``). The earlier pair of dates
        comes first.
    layers : sequence of LayerDescription
        The descriptions of the two layers, in the same order.

    Returns
    -------
    AnalysisResult
        Change of the magnitude of the coherence (unit ``1``): the later pair minus the earlier pair, between
        -1 and 1. A positive value is an increase. A cell holds ``nan`` where either input is ``nan``. The
        legend runs from -1 to 1 on the diverging scale ``RdBu``. The words of its two ends are "decrease"
        for the lowest value and "increase" for the highest. The reduced copies of the result are means of
        its values.

    Raises
    ------
    LayerError
        If the inputs are not two layers ``coherenceMagnitude`` of GUNW products (see ``check_inputs``), are
        not the same layer of their products, or are not of the same instrument, track, direction and frame;
        if the name of a product file does not hold its bandwidth mode, or the two modes differ; if the two
        dates of a layer are the same day; if the pair of the first layer does not end on or
        before the first date of the pair of the second layer; if the two pairs do not span the same number
        of days; if a layer holds a value outside 0 to 1; or if no cell holds a value in both layers.
    """
    earlier, later = check_inputs(arrays, layers, count=2, product="GUNW", names=_COHERENCE, reads=_READS, dates=2)
    if layers[0].layer != layers[1].layer:
        raise LayerError(
            f"The two layers are not the same coherence layer: "
            f"the first is {layers[0].layer} and the second is {layers[1].layer}."
        )
    if earlier != later:
        raise LayerError("The two layers are not of the same instrument, track, direction and frame.")
    first_mode, second_mode = _bandwidth_mode(layers[0]), _bandwidth_mode(layers[1])
    if first_mode != second_mode:
        raise LayerError(
            f"The two layers are not of the same bandwidth mode: "
            f"the first is {first_mode} and the second is {second_mode}."
        )
    spans = []
    for layer in layers:
        days = (max(layer.dates) - min(layer.dates)).days
        if days == 0:
            raise LayerError(f'The two dates of the layer "{layer.title}" are the same day.')
        spans.append(days)
    if max(layers[0].dates) > min(layers[1].dates):
        raise LayerError("The pair of the first layer must end on or before the first date of the pair of the second.")
    if spans[0] != spans[1]:
        raise LayerError(
            f"The two pairs do not span the same number of days: "
            f"the first spans {spans[0]} days and the second {spans[1]} days."
        )
    before, after = arrays
    for values, layer in zip(arrays, layers, strict=True):
        if not _is_coherence(values):
            raise LayerError(
                f'The layer "{layer.title}" holds values outside 0 to 1, so it is not a coherence magnitude.'
            )
    change = after - before
    if np.isnan(change).all():
        raise LayerError("The result would hold no value in any cell.")
    return AnalysisResult(
        change,
        "Change of interferometric coherence (magnitude)",
        "1",
        (-1.0, 1.0),
        "RdBu",
        _CHANGE_METHOD,
        "mean",
        ("decrease", "increase"),
    )
