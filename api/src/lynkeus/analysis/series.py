# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""The tools of the kind Series: the value of one quantity on many dates, at a point or for the area.

A tool of this kind receives the arrays of its input layers one after another, with their layer descriptions,
the cell of the point of the request, or no cell for the whole area, and the cell of the reference point of the
request, or no cell. The two tools of this file return one value for each layer with the number of cells from
which the value was made, and they take no reference point. It reads no file, writes no file and contacts no
service. The method sheets are ``docs/methods/backscatter-series.md`` and ``docs/methods/coherence-series.md``.
The tool Surface displacement, Series, which takes a reference point, is in ``lynkeus.analysis.displacement``.
"""

import math
import re
from collections.abc import Callable, Iterable, Sequence

import numpy as np
from numpy.typing import NDArray

from lynkeus.analysis.inputs import check_inputs
from lynkeus.layers import LayerDescription, ProductType, Reduction, SeriesEntry, SeriesResult
from lynkeus.writing import LayerError

type Measure = Callable[[NDArray[np.float32], LayerDescription, tuple[int, int] | None], tuple[float | None, int]]
"""Returns the value of one layer and the number of cells from which it was made."""

# The diagonal terms of the covariance matrix that a GCOV product can hold (NASA SDS Product Specification, L2 GCOV,
# JPL D-102274 Rev F, Table 5-3).
_TERMS = re.compile(r"HHHH|HVHV|VHVH|VVVV|RHRH|RVRV")

# The four layers coherenceMagnitude of a GUNW product, by their paths inside the group ``frequencyA`` (NASA SDS
# Product Specification, L2 GUNW, JPL D-102272 Rev E, pages 35 to 37).
_COHERENCE = re.compile(r"(?:unwrappedInterferogram|wrappedInterferogram)/(?:HH|VV)/coherenceMagnitude")

# The end of the name of a NISAR product file: the composite release identifier (CRID), the accuracy, the
# coverage, the location of the data system and the product counter. The CRID has the form EMMmmp: environment,
# major release, minor release and patch (SDS Product File Naming Conventions, JPL D-102255 Rev C, sections
# 3.7, 3.8 and 4.1).
_RELEASE = re.compile(r"_(?P<crid>(?P<major>[A-Z]\d{2})\d{3})_[A-Z]_[A-Z]_[A-Z]_\d{3}(?:\.h5)?$")

_NO_VALUES: NDArray[np.float32] = np.empty((0, 0), np.float32)
"""Stands in the place of the array of a layer while only the descriptions of the layers are checked."""

LEAST_LAYERS = 2
"""The smallest number of layers of a series."""

_BACKSCATTER_METHOD = (
    "Mean of the backscatter in linear power over the cells that hold a value, converted to decibels with "
    "10*log10 (ASF NISAR Cookbook, notebook NISAR_GCOV_Time_Series_Example, section 8, commit 17b69c8; "
    "NASA SDS Product Specification, L2 GCOV, JPL D-102274 Rev F, Table 5-7)"
)
_COHERENCE_METHOD = (
    "Mean of the layer coherenceMagnitude of the product over the cells that hold a value "
    "(NASA SDS Product Specification, L2 GUNW, JPL D-102272 Rev E; "
    "Touzi et al., 1999, https://doi.org/10.1109/36.739146)"
)


def _descriptions(
    layers: Sequence[LayerDescription],
    *,
    product: ProductType,
    names: re.Pattern[str],
    reads: str,
    dates: int,
    unit: str = "1",
) -> None:
    """Check the descriptions of the layers of a series.

    Raises
    ------
    LayerError
        If the layers are fewer than two; if a layer is not one that the tool reads, with the unit ``unit``
        (see ``check_inputs``); if the layers are not the same layer of their products, are not of the same
        instrument, track, direction and frame, or are not of the same major release of the processing
        software; or if two layers have the same date or dates.
    """
    if len(layers) < LEAST_LAYERS:
        raise LayerError(f"A series needs at least {LEAST_LAYERS} layers, and it has {len(layers)}.")
    # The values are not needed here, so an empty array stands in the place of each.
    acquisitions = check_inputs(
        [_NO_VALUES] * len(layers),
        layers,
        count=len(layers),
        product=product,
        names=names,
        reads=reads,
        dates=dates,
        unit=unit,
    )
    first = layers[0]
    for layer in layers[1:]:
        if layer.layer != first.layer:
            raise LayerError(
                f"The layers are not the same layer of their products: "
                f'"{first.title}" is {first.layer} and "{layer.title}" is {layer.layer}.'
            )
    if len(set(acquisitions)) != 1:
        raise LayerError("The layers are not of the same instrument, track, direction and frame.")
    releases = []
    for layer in layers:
        found = _RELEASE.search(layer.inputs[0])
        if found is None:
            raise LayerError(
                f'The name of the product file of the layer "{layer.title}" does not hold the release of the '
                "processing software."
            )
        releases.append(found)
    for layer, release in zip(layers[1:], releases[1:], strict=True):
        if release["major"] != releases[0]["major"]:
            raise LayerError(
                f"The layers are not of the same major release of the processing software: "
                f'"{first.title}" is of the release {releases[0]["crid"]} and "{layer.title}" of {release["crid"]}.'
            )
    seen: dict[tuple[object, ...], LayerDescription] = {}
    for layer in layers:
        if layer.dates in seen:
            raise LayerError(f'The layers "{seen[layer.dates].title}" and "{layer.title}" have the same dates.')
        seen[layer.dates] = layer


def _no_reference(reference: tuple[int, int] | None) -> None:
    """Refuse the cell of a reference point, which the tools of this file do not take.

    Raises
    ------
    LayerError
        If a cell is given.
    """
    if reference is not None:
        raise LayerError("The tool takes no reference point.")


def _series(
    arrays: Iterable[NDArray[np.float32]],
    layers: Sequence[LayerDescription],
    cell: tuple[int, int] | None,
    measure: Measure,
) -> tuple[tuple[SeriesEntry, ...], tuple[str, ...]]:
    """Return the entries of a series, the earliest first, and the product files in the same order.

    The arrays are taken one after another and none is kept, so the caller may read each file only when its
    array is asked for.

    Raises
    ------
    LayerError
        If the grids of the layers differ in size, or no layer gives a value.
    ValueError
        If the arrays and the descriptions differ in number, an array is not two-dimensional 32-bit floating
        point, or the cell lies outside the grid. These are faults of the caller.
    """
    shape: tuple[int, ...] | None = None
    made: list[tuple[SeriesEntry, str]] = []
    for array, layer in zip(arrays, layers, strict=True):
        if array.ndim != 2 or array.dtype != np.float32:
            raise ValueError(f'The array of the layer "{layer.title}" is not two-dimensional 32-bit floating point.')
        if shape is None:
            shape = array.shape
            if cell is not None and not (0 <= cell[0] < shape[0] and 0 <= cell[1] < shape[1]):
                raise ValueError("The cell of the point lies outside the grid of the layers.")
        elif array.shape != shape:
            raise LayerError("The input layers do not have the same grid.")
        value, cells = measure(array, layer, cell)
        made.append((SeriesEntry(dates=layer.dates, value=value, cells=cells), layer.inputs[0]))
    if all(entry.cells == 0 for entry, _ in made):
        where = "at the point" if cell is not None else "in any cell"
        raise LayerError(f"No layer of the series holds a value {where}.")
    made.sort(key=lambda pair: pair[0].dates)
    return tuple(entry for entry, _ in made), tuple(name for _, name in made)


def _mean(values: NDArray[np.float32], valid: NDArray[np.bool_]) -> tuple[float | None, int]:
    """Return the mean of the values of the cells marked valid, in 64-bit numbers, and the number of those cells."""
    cells = int(np.count_nonzero(valid))
    if cells == 0:
        return None, 0
    return float(np.sum(values, where=valid, dtype=np.float64)) / cells, cells


def _mean_backscatter(
    power: NDArray[np.float32], _: LayerDescription, cell: tuple[int, int] | None
) -> tuple[float | None, int]:
    """Return the decibels of the mean power of the cells that hold a finite value above zero."""
    values = power if cell is None else power[cell[0] : cell[0] + 1, cell[1] : cell[1] + 1]
    mean, cells = _mean(values, (values > 0) & (values < np.inf))
    if mean is None or not 0 < mean < math.inf:
        return None, 0
    return 10 * math.log10(mean), cells


def _mean_coherence(
    coherence: NDArray[np.float32], layer: LayerDescription, cell: tuple[int, int] | None
) -> tuple[float | None, int]:
    """Return the mean coherence of the cells that hold a value.

    Raises
    ------
    LayerError
        If a cell of the layer holds a value outside 0 to 1.
    """
    held = ~np.isnan(coherence)
    if held.any() and (
        float(np.min(coherence, where=held, initial=np.inf)) < 0
        or float(np.max(coherence, where=held, initial=-np.inf)) > 1
    ):
        raise LayerError(f'The layer "{layer.title}" holds values outside 0 to 1, so it is not a coherence magnitude.')
    if cell is None:
        return _mean(coherence, held)
    one = slice(cell[0], cell[0] + 1), slice(cell[1], cell[1] + 1)
    return _mean(coherence[one], held[one])


def backscatter_series(
    arrays: Iterable[NDArray[np.float32]],
    layers: Sequence[LayerDescription],
    cell: tuple[int, int] | None = None,
    reference: tuple[int, int] | None = None,
) -> SeriesResult:
    """Give the radar backscatter of many dates, at a point or as the mean of the area, in decibels.

    Parameters
    ----------
    arrays : iterable of numpy.ndarray
        Two or more arrays on the same grid: the same diagonal covariance term of GCOV products of the same
        instrument, track, direction and frame, gamma0 in linear power (unit ``1``), in any order of dates.
        The function takes the arrays one after another and keeps none.
    layers : sequence of LayerDescription
        The descriptions of the layers, in the same order.
    cell : tuple of int, optional
        Row and column of the cell of the point, counted from 0. Without it the series is that of the whole
        area of the layers.
    reference : None
        The tool takes no reference point, so the cell of one is refused.

    Returns
    -------
    SeriesResult
        One entry for each layer, the earliest date first, with the product files in the same order. The value
        of an entry is ``10 * log10`` of the mean of the linear power, in dB, taken over the cells of that date
        that hold a finite value above zero; ``cells`` is the number of those cells. At a point the mean is
        the value of the one cell, and an entry whose cell holds ``nan``, zero, a negative or an infinite value
        has no value and 0 cells. The mean is computed in 64-bit numbers. The reduction is ``mean-power`` and
        the series has no fixed range.

    Raises
    ------
    LayerError
        If the cell of a reference point is given; if the layers are fewer than two; if a layer is not one
        diagonal covariance term of a GCOV product with the unit ``1`` and one date (see ``check_inputs``); if
        the layers are not the same term, are not of the same instrument, track, direction and frame, or are
        not of the same major release of the processing software; if two layers have the same date; if the
        grids differ in size; or if no layer holds a value above zero, at the point or in any cell.
    ValueError
        If the arrays and the descriptions differ in number, an array is not two-dimensional 32-bit floating
        point, or the cell lies outside the grid. These are faults of the caller.
    """
    _no_reference(reference)
    _descriptions(
        layers,
        product="GCOV",
        names=_TERMS,
        reads="a diagonal covariance term (HHHH, HVHV, VHVH, VVVV, RHRH or RVRV)",
        dates=1,
    )
    entries, inputs = _series(arrays, layers, cell, _mean_backscatter)
    return _result(entries, inputs, layers, "Radar backscatter gamma0", "dB", _BACKSCATTER_METHOD, "mean-power", None)


def coherence_series(
    arrays: Iterable[NDArray[np.float32]],
    layers: Sequence[LayerDescription],
    cell: tuple[int, int] | None = None,
    reference: tuple[int, int] | None = None,
) -> SeriesResult:
    """Give the interferometric coherence of many pairs of dates, at a point or as the mean of the area.

    Parameters
    ----------
    arrays : iterable of numpy.ndarray
        Two or more arrays on the same grid: the same layer ``coherenceMagnitude`` of GUNW products of the same
        instrument, track, direction and frame, between 0 and 1 (unit ``1``), in any order of dates. The
        function takes the arrays one after another and keeps none.
    layers : sequence of LayerDescription
        The descriptions of the layers, in the same order.
    cell : tuple of int, optional
        Row and column of the cell of the point, counted from 0. Without it the series is that of the whole
        area of the layers.
    reference : None
        The tool takes no reference point, so the cell of one is refused.

    Returns
    -------
    SeriesResult
        One entry for each layer, the pair with the earliest dates first, with the product files in the same
        order. The value of an entry is the mean of the coherence magnitude, without unit (``1``), taken over
        the cells of that pair that hold a value; ``cells`` is the number of those cells. At a point the mean
        is the value of the one cell, and an entry whose cell holds ``nan`` has no value and 0 cells. The mean
        is computed in 64-bit numbers. The reduction is ``mean`` and the range is 0 to 1.

    Raises
    ------
    LayerError
        If the cell of a reference point is given; if the layers are fewer than two; if a layer is not a layer
        ``coherenceMagnitude`` of a GUNW product with the unit ``1`` and two dates (see ``check_inputs``); if
        the layers are not the same layer of their products, are not of the same instrument, track, direction
        and frame, or are not of the same major release of the processing software; if two layers have the
        same two dates; if the grids differ in size; if a layer holds a value outside 0 to 1; or if no layer
        holds a value, at the point or in any cell.
    ValueError
        If the arrays and the descriptions differ in number, an array is not two-dimensional 32-bit floating
        point, or the cell lies outside the grid. These are faults of the caller.
    """
    _no_reference(reference)
    _descriptions(layers, product="GUNW", names=_COHERENCE, reads="the layer coherenceMagnitude", dates=2)
    entries, inputs = _series(arrays, layers, cell, _mean_coherence)
    return _result(
        entries, inputs, layers, "Interferometric coherence (magnitude)", "1", _COHERENCE_METHOD, "mean", (0.0, 1.0)
    )


def _result(
    entries: tuple[SeriesEntry, ...],
    inputs: tuple[str, ...],
    layers: Sequence[LayerDescription],
    quantity: str,
    unit: str,
    method: str,
    reduction: Reduction,
    limits: tuple[float, float] | None,
) -> SeriesResult:
    """Return the result of a series whose layers all carry the name of the first."""
    return SeriesResult(entries, inputs, str(layers[0].layer), quantity, unit, method, reduction, limits)
