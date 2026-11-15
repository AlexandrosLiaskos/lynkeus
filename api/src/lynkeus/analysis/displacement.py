# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""The tools of the group Surface displacement. They read layers of GUNW products.

The layer ``unwrappedPhase`` is the unwrapped interferometric phase of one pair of dates, in radians. The layer
``connectedComponents`` holds, for each cell, the number of the region in which the phase was unwrapped
consistently, or 0 where it could not be unwrapped reliably. The method sheets are
``docs/methods/displacement-state.md`` and ``docs/methods/displacement-series.md``.
"""

import math
import re
from collections.abc import Iterable, Sequence
from datetime import date

import numpy as np
from numpy.typing import NDArray

from lynkeus.analysis.inputs import check_inputs
from lynkeus.analysis.series import LEAST_LAYERS, _descriptions
from lynkeus.layers import AnalysisResult, LayerDescription, SeriesEntry, SeriesResult
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

_READS = "the layers unwrappedPhase and connectedComponents"
"""The layers that Surface displacement, Series reads, in the words that end the sentence of a refusal."""

_NO_VALUES: NDArray[np.float32] = np.empty((0, 0), np.float32)
"""Stands in the place of the array of a layer while only the descriptions of the layers are checked."""

RCOND = 1e-5
"""The share of the largest singular value of the design matrix below which a singular value counts as zero.

It is the value of ``rcond`` of the function ``estimate_timeseries`` in ``mintpy/ifgram_inversion.py`` of MintPy
1.6.4, the function with which the source program inverts the network of pairs.
"""

DAYS_PER_YEAR = 365.25
"""The days of a year, with which the spans between the dates are written in years, as MintPy 1.6.4 writes them."""

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


_SERIES_METHOD = (
    "Small-baseline inversion of the unwrapped phase of the pairs at the cell of the point, each pair referenced to "
    "the cell of the reference point, with equal weights and the minimum-norm velocity, the first date being zero, "
    "times -wavelength/(4*pi); relative to the reference point, not corrected for the ionosphere, the troposphere or "
    "the solid Earth tides (Berardino et al., 2002, https://doi.org/10.1109/TGRS.2002.803792; Yunjun et al., 2019, "
    "https://doi.org/10.1016/j.cageo.2019.104331; MintPy 1.6.4, reference_point and ifgram_inversion with "
    "--weight-func no and --mask-dset connectComponent)"
)


def _linked(days: Sequence[date], pairs: Iterable[tuple[date, date]]) -> bool:
    """Tell whether pairs of dates link all the dates into one network, through pairs that share a date."""
    group = {day: day for day in days}

    def root(day: date) -> date:
        while group[day] != day:
            day = group[day]
        return day

    for first, second in pairs:
        group[root(first)] = root(second)
    return len({root(day) for day in days}) == 1


def _invert(days: Sequence[date], pairs: Sequence[tuple[date, date]], phases: Sequence[float]) -> NDArray[np.float64]:
    """Return the phase of each date relative to the first date, from the phases of pairs of dates.

    This is the small-baseline inversion with the minimum-norm velocity and equal weights (Berardino et al.,
    2002). The unknowns are the mean velocities of the phase between consecutive dates. Each pair gives one
    equation: the sum of the velocities of the spans between its two dates, each times its span in years, equals
    its phase. The solution of least norm of the least-squares problem is found by the singular value
    decomposition (``numpy.linalg.lstsq``, the routine ``gelsd`` of LAPACK), in which a singular value below
    ``RCOND`` times the largest counts as zero. The phase of a date is the sum of the velocities times the spans
    up to the date, so the phase of the first date is zero. The computation is made in 64-bit numbers.
    """
    years = np.array([(day - days[0]).days for day in days], np.float64) / DAYS_PER_YEAR
    spans = np.diff(years)
    order = {day: number for number, day in enumerate(days)}
    design = np.zeros((len(pairs), len(days) - 1), np.float64)
    for row, (first, second) in enumerate(pairs):
        design[row, order[first] : order[second]] = spans[order[first] : order[second]]
    velocities = np.linalg.lstsq(design, np.asarray(phases, np.float64), rcond=RCOND)[0]
    return np.concatenate(([0.0], np.cumsum(velocities * spans)))


def displacement_series(
    arrays: Iterable[NDArray[np.float32]],
    layers: Sequence[LayerDescription],
    cell: tuple[int, int] | None = None,
    reference: tuple[int, int] | None = None,
) -> SeriesResult:
    """Give the movement of the ground at a point on many dates, relative to a reference point, from GUNW pairs.

    Parameters
    ----------
    arrays : iterable of numpy.ndarray
        The arrays of the layers on one grid, in the order of ``layers``: for each pair of dates, the layer
        ``unwrappedPhase`` (unit ``rad``) and the layer ``connectedComponents`` (unit ``1``) of one GUNW product,
        in any order. The products are of the same instrument, track, direction and frame. The function takes
        the arrays one after another and keeps only the values of the cell of the point and of the reference.
    layers : sequence of LayerDescription
        The descriptions of the layers, in the same order. The description of each phase carries the centre
        frequency of the radar band of its product, in hertz (field ``frequency``).
    cell : tuple of int
        Row and column of the cell of the point, counted from 0.
    reference : tuple of int
        Row and column of the cell of the reference point, counted from 0.

    Returns
    -------
    SeriesResult
        One entry for each date of the pairs, the earliest first, with 1 cell: the displacement of the ground at
        the point along the line of sight of the radar since the first date, relative to the reference point, in
        metres (m). A positive value is a movement toward the radar. The value of the first date is 0. The phase
        of the reference is subtracted from the phase of the point in each pair, in 32-bit numbers. A pair is
        used at the point when the point holds a finite phase and a connected component above 0 that is the
        component of the reference in that pair; the other pairs are left out. The phase of each date comes
        from the small-baseline inversion of the pairs used (``_invert``), and the displacement is
        ``-wavelength / (4 * pi)`` times it, with the wavelength from the centre frequency of the products. The
        inputs of the result are the product files of the pairs used, the earliest pair first. The ionosphere,
        the troposphere and the solid Earth tides are not removed. The reduction is ``mean`` and the series has
        no fixed range.

    Raises
    ------
    LayerError
        If the point or the reference point is missing, or both lie in the same cell; if a layer is not a layer
        ``unwrappedPhase`` or ``connectedComponents`` of a GUNW product with its unit and two dates (see
        ``check_inputs``); if the pairs are fewer than two; if the phases are not the same layer of their
        products, are not of the same instrument, track, direction and frame or of the same major release of
        the processing software, or two of them have the same dates; if a phase and the layer of connected
        components of its product file are not both given, or are of two polarisation channels; if a phase
        does not carry its centre frequency, or two phases carry different ones; if the name of a product file
        does not give a reference acquisition that is earlier than the secondary one; if the pairs do not link
        all their dates into one network; if the grids differ in size; if a layer of connected components holds
        a value that is not a whole number from 0; if the reference has no finite phase or no connected
        component above 0 in a pair; or if the pairs used at the point do not link all the dates into one
        network.
    ValueError
        If the arrays and the descriptions differ in number, an array is not two-dimensional 32-bit floating
        point, or a cell lies outside the grid. These are faults of the caller.
    """
    if cell is None:
        raise LayerError("The tool gives the series of a point, and no point was given.")
    if reference is None:
        raise LayerError("The tool gives the series relative to a reference point, and no reference point was given.")
    if cell == reference:
        raise LayerError("The point and the reference point lie in the same cell of the layers.")
    phases = [layer for layer in layers if not _COMPONENTS.fullmatch(layer.layer or "")]
    labels = [layer for layer in layers if _COMPONENTS.fullmatch(layer.layer or "")]
    # A layer that is neither of the two is refused with the sentence of the first check that it fails.
    check_inputs(
        [_NO_VALUES] * len(phases),
        phases,
        count=len(phases),
        product="GUNW",
        names=_PHASE,
        reads=_READS,
        dates=2,
        unit="rad",
    )
    check_inputs(
        [_NO_VALUES] * len(labels),
        labels,
        count=len(labels),
        product="GUNW",
        names=_COMPONENTS,
        reads=_READS,
        dates=2,
    )
    if len(phases) < LEAST_LAYERS:
        raise LayerError(f"A series needs at least {LEAST_LAYERS} pairs of dates, and it has {len(phases)}.")
    _descriptions(phases, product="GUNW", names=_PHASE, reads=_READS, dates=2, unit="rad")
    partners: dict[str, LayerDescription] = {}
    for label in labels:
        other = partners.setdefault(label.inputs[0], label)
        if other is not label:
            raise LayerError(f'The layers "{other.title}" and "{label.title}" are of the same product file.')
    frequencies: list[float] = []
    for phase in phases:
        partner = partners.pop(phase.inputs[0]) if phase.inputs[0] in partners else None
        if partner is None:
            raise LayerError(
                f'The layer of connected components of the product of the layer "{phase.title}" is missing.'
            )
        channel, other_channel = _PHASE.fullmatch(phase.layer or ""), _COMPONENTS.fullmatch(partner.layer or "")
        if channel is None or other_channel is None or channel[1] != other_channel[1]:
            raise LayerError(
                f"The two layers are not of the same polarisation channel: "
                f"the first is {phase.layer} and the second is {partner.layer}."
            )
        if phase.frequency is None:
            raise LayerError(
                f'The layer "{phase.title}" does not record the centre frequency of its radar band; '
                "receive it again with Get layer."
            )
        frequencies.append(phase.frequency)
        if phase.frequency != frequencies[0]:
            raise LayerError(
                f'The layers "{phases[0].title}" and "{phase.title}" have different centre frequencies of their '
                "radar band, so their phases cannot be combined."
            )
        times = _TIMES.search(phase.inputs[0])
        if times is None or not times[1] < times[2] or not phase.dates[0] < phase.dates[1]:
            raise LayerError(
                f'The name of the product file of the layer "{phase.title}" does not give a reference date '
                "that is earlier than the secondary date."
            )
    if partners:
        label = next(iter(partners.values()))
        raise LayerError(f'The layer "{label.title}" is not of the product of any layer unwrappedPhase of the series.')
    pairs = {phase.inputs[0]: (phase.dates[0], phase.dates[1]) for phase in phases}
    days = sorted({day for pair in pairs.values() for day in pair})
    if not _linked(days, pairs.values()):
        raise LayerError(
            "The pairs do not link all their dates into one network, so the movement between the separate "
            "groups of dates is unknown."
        )
    # The values of the point and of the reference in each layer, by the product file and the kind of the layer.
    shape: tuple[int, ...] | None = None
    held: dict[tuple[str, bool], tuple[np.float32, np.float32]] = {}
    for array, layer in zip(arrays, layers, strict=True):
        if array.ndim != 2 or array.dtype != np.float32:
            raise ValueError(f'The array of the layer "{layer.title}" is not two-dimensional 32-bit floating point.')
        if shape is None:
            shape = array.shape
            for row, column in (cell, reference):
                if not (0 <= row < shape[0] and 0 <= column < shape[1]):
                    raise ValueError("The cell of a point lies outside the grid of the layers.")
        elif array.shape != shape:
            raise LayerError("The input layers do not have the same grid.")
        is_phase = not _COMPONENTS.fullmatch(layer.layer or "")
        if not is_phase:
            known = array[~np.isnan(array)]
            if known.size and (known.min() < 0 or np.isinf(known).any() or (known != np.floor(known)).any()):
                raise LayerError(
                    f'The layer "{layer.title}" holds values that are not whole numbers from 0, '
                    "so it is not a layer of connected components."
                )
        held[(layer.inputs[0], is_phase)] = (array[cell], array[reference])
    used: list[tuple[tuple[date, date], float, str]] = []
    for phase in phases:
        name = phase.inputs[0]
        (value, base), (label_value, base_label) = held[(name, True)], held[(name, False)]
        if not (np.isfinite(base) and base_label > 0):
            raise LayerError(
                f'The reference point has no reliable phase in the layer "{phase.title}", so choose a reference '
                "point with one in every pair."
            )
        if np.isfinite(value) and label_value == base_label:
            # The difference of two 32-bit numbers is a 32-bit number, as in the source program.
            used.append((pairs[name], float(np.float32(value) - np.float32(base)), name))
    used.sort()
    if not _linked(days, (dates for dates, _, _ in used)):
        raise LayerError(
            f"At the point, the phase of {len(phases) - len(used)} of the {len(phases)} pairs is not reliable "
            "relative to the reference point, and the other pairs do not link all the dates into one network."
        )
    phase_of_days = _invert(days, [dates for dates, _, _ in used], [value for _, value, _ in used])
    factor = -(SPEED_OF_LIGHT / frequencies[0]) / (4 * math.pi)
    entries = tuple(
        SeriesEntry(dates=(day,), value=float(factor * phase) + 0.0, cells=1)
        for day, phase in zip(days, phase_of_days, strict=True)
    )
    return SeriesResult(
        entries,
        tuple(name for _, _, name in used),
        str(phases[0].layer),
        "Displacement along the line of sight, relative to the reference point",
        "m",
        _SERIES_METHOD,
        "mean",
        None,
    )
