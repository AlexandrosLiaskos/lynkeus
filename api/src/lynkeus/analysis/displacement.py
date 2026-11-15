# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""The tools of the group Surface displacement. They read layers of GUNW products.

The layer ``unwrappedPhase`` is the unwrapped interferometric phase of one pair of dates, in radians. The layer
``connectedComponents`` holds, for each cell, the number of the region in which the phase was unwrapped
consistently, or 0 where it could not be unwrapped reliably. The method sheet is
``docs/methods/displacement-state.md``.
"""

import math
import re
from collections.abc import Sequence

import numpy as np
from numpy.typing import NDArray

from lynkeus.analysis.inputs import check_inputs
from lynkeus.layers import AnalysisResult, LayerDescription
from lynkeus.writing import HIGHEST_PERCENT, LOWEST_PERCENT, LayerError

SPEED_OF_LIGHT = 299_792_458.0
"""The speed of light in vacuum, in metres per second.

It is the value of ``speed_of_light`` in ISCE3 (``cxx/isce3/core/Constants.h``, line 50, version 0.25.21), with
which the mission turns the centre frequency of a product into its wavelength.
"""

# The two layers of the group ``unwrappedInterferogram`` that the tool reads, by their paths inside the group
# ``frequencyA`` (NASA SDS Product Specification, L2 GUNW, JPL D-102272 Rev E, pages 34 and 35), which are the
# names that ``lynkeus.harmony.layers_of`` gives them.
_PHASE = re.compile(r"unwrappedInterferogram/(HH|VV)/unwrappedPhase")
_COMPONENTS = re.compile(r"unwrappedInterferogram/(HH|VV)/connectedComponents")

# The start times of the reference and of the secondary acquisition in the name of the file of a pair (SDS
# Product File Naming Conventions, JPL D-102255 Rev C, section 3.8): the first and the third of four times.
_TIMES = re.compile(r"_(\d{8}T\d{6})_\d{8}T\d{6}_(\d{8}T\d{6})_\d{8}T\d{6}_")

_STATE_METHOD = (
    "Unwrapped phase times -wavelength/(4*pi), with the wavelength from the centre frequency of the product, "
    "in the cells of a connected component above 0; relative values, not corrected for the ionosphere, the "
    "troposphere or the solid Earth tides (NISAR L1 and L2 Algorithm Theoretical Basis Document, "
    "JPL D-95677 Rev A, sections 5.9 and 5.9.1.7; NASA SDS Product Specification, L2 GUNW, JPL D-102272 Rev E)"
)


def displacement_state(arrays: Sequence[NDArray[np.float32]], layers: Sequence[LayerDescription]) -> AnalysisResult:
    """Convert the unwrapped phase of one pair of dates to displacement along the line of sight of the radar.

    Parameters
    ----------
    arrays : sequence of numpy.ndarray
        Two arrays on the same grid, of one GUNW product and one polarisation channel. The first is the layer
        ``unwrappedPhase``, in radians (unit ``rad``). The second is the layer ``connectedComponents``
        (unit ``1``): whole numbers, 0 where the phase could not be unwrapped reliably.
    layers : sequence of LayerDescription
        The descriptions of the two layers, in the same order. The description of the phase carries the
        centre frequency of the radar band of the product, in hertz (field ``frequency``).

    Returns
    -------
    AnalysisResult
        Displacement of the ground along the line of sight between the reference date and the secondary date
        of the pair, in metres (m): ``-wavelength / (4 * pi) * phase``, where the wavelength is the speed of
        light divided by the centre frequency. A positive value is a movement toward the radar. The values
        are relative: the product gives the phase of each connected component from its own unknown starting
        value, and the ionosphere, the troposphere and the solid Earth tides are not removed. A cell holds
        ``nan`` where the phase is ``nan`` or infinite and where the connected component is 0 or ``nan``. The
        legend runs from the 2nd to the 98th percentile of the result, in metres, on the scale ``RdBu``; it
        is not centred on zero, because the zero of the values is arbitrary. The words of its two ends are
        "away from the radar" for the lowest value and "toward the radar" for the highest. The reduced copies
        of the result are means of its values.

    Raises
    ------
    LayerError
        If the number of layers is not two; if the first is not a layer ``unwrappedPhase`` and the second not
        a layer ``connectedComponents`` of a GUNW product (see ``check_inputs``); if the two layers do not
        have the same grid, are not of the same product file or are not of the same polarisation channel; if
        the description of the phase does not carry the centre frequency; if the name of the product file
        does not give a reference acquisition that is earlier than the secondary acquisition; if the layer
        of the connected components holds a value that is not a whole number from 0; if no cell holds a
        phase in a connected component above 0; or if the legend has no range.
    ValueError
        If the arrays and the descriptions differ in number, or an array is not two-dimensional 32-bit
        floating point. These are faults of the caller.
    """
    if len(arrays) != len(layers):
        raise ValueError("The arrays and the descriptions of the input layers differ in number.")
    if len(layers) != 2:
        raise LayerError(f"The number of input layers must be 2, and it is {len(layers)}.")
    check_inputs(
        arrays[:1],
        layers[:1],
        count=1,
        product="GUNW",
        names=_PHASE,
        reads="the layer unwrappedPhase",
        dates=2,
        unit="rad",
    )
    check_inputs(
        arrays[1:],
        layers[1:],
        count=1,
        product="GUNW",
        names=_COMPONENTS,
        reads="the layer connectedComponents",
        dates=2,
    )
    phase, components = arrays
    described, labelled = layers
    if components.shape != phase.shape:
        raise LayerError("The input layers do not have the same grid.")
    if described.inputs != labelled.inputs:
        raise LayerError("The two layers are not of the same product file.")
    channel, other = _PHASE.fullmatch(described.layer or ""), _COMPONENTS.fullmatch(labelled.layer or "")
    if channel is None or other is None or channel[1] != other[1]:
        raise LayerError(
            f"The two layers are not of the same polarisation channel: "
            f"the first is {described.layer} and the second is {labelled.layer}."
        )
    if described.frequency is None:
        raise LayerError(
            f'The layer "{described.title}" does not record the centre frequency of its radar band; '
            "receive it again with Get layer."
        )
    times = _TIMES.search(described.inputs[0])
    if times is None or not times[1] < times[2]:
        raise LayerError(
            f'The name of the product file of the layer "{described.title}" does not give a reference date '
            "that is earlier than the secondary date."
        )
    labels = components[~np.isnan(components)]
    if labels.size and (labels.min() < 0 or np.isinf(labels).any() or (labels != np.floor(labels)).any()):
        raise LayerError(
            f'The layer "{labelled.title}" holds values that are not whole numbers from 0, '
            "so it is not a layer of connected components."
        )
    # The product of a 32-bit array and a Python number is computed in 32-bit numbers, as the source program does.
    factor = -(SPEED_OF_LIGHT / described.frequency) / (4 * math.pi)
    displacement = np.full(phase.shape, np.nan, np.float32)
    np.multiply(phase, factor, out=displacement, where=(components > 0) & np.isfinite(phase))
    valid = displacement[~np.isnan(displacement)]
    if valid.size == 0:
        raise LayerError("The result would hold no value in any cell.")
    # The percentiles with which Lynkeus draws a layer that it receives (``legend_range``, rule ``percentiles``).
    lowest, highest = (float(value) for value in np.percentile(valid, (LOWEST_PERCENT, HIGHEST_PERCENT)))
    if not lowest < highest:
        raise LayerError("The values of the result are too alike to give the legend a range.")
    return AnalysisResult(
        displacement,
        "Relative displacement along the line of sight",
        "m",
        (lowest, highest),
        "RdBu",
        _STATE_METHOD,
        "mean",
        ("away from the radar", "toward the radar"),
    )
