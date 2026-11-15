# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""The tools of the kind Series: the value of one quantity on many dates, at a point or for an area.

A tool of this kind receives the arrays of its input layers one after another, with their layer descriptions,
and the place of the request: the cell of a point, the cells inside an area drawn on the map, or no place for
the whole area of the layers. It returns one value for each layer with the number of cells from which the
value was made. It reads no file, writes no file and contacts no
service. The method sheets are ``docs/methods/backscatter-series.md``, ``docs/methods/coherence-series.md`` and
``docs/methods/soil-moisture-series.md``.
"""

import math
import re
from collections.abc import Callable, Iterable, Iterator, Sequence

import numpy as np
from numpy.typing import NDArray

from lynkeus.analysis.inputs import check_inputs
from lynkeus.analysis.soil_moisture import check_flag, check_moisture, recommended
from lynkeus.layers import LayerDescription, ProductType, Reduction, SeriesEntry, SeriesResult
from lynkeus.writing import LayerError

type Place = tuple[int, int] | NDArray[np.bool_] | None
"""Where a series is made: the row and the column of the cell of a point, counted from 0; an array of the shape
of the grid that is True for the cells inside an area drawn on the map; or None for every cell of the grid."""

type Measure = Callable[[NDArray[np.float32], LayerDescription, Place], tuple[float | None, int]]
"""Returns the value of one layer at a place and the number of cells from which it was made."""

# The diagonal terms of the covariance matrix that a GCOV product can hold (NASA SDS Product Specification, L2 GCOV,
# JPL D-102274 Rev F, Table 5-3).
_TERMS = re.compile(r"HHHH|HVHV|VHVH|VVVV|RHRH|RVRV")

# The four layers coherenceMagnitude of a GUNW product, by their paths inside the group ``frequencyA`` (NASA SDS
# Product Specification, L2 GUNW, JPL D-102272 Rev E, pages 35 to 37).
_COHERENCE = re.compile(r"(?:unwrappedInterferogram|wrappedInterferogram)/(?:HH|VV)/coherenceMagnitude")

# The two layers of an SME2 product that Soil moisture, Series reads (NASA SDS Product Specification, L3 SME2,
# JPL D-107677 Rev C, page 37), and the unit of the soil moisture as ``lynkeus.harmony.layers_of`` writes it.
_MOISTURE = re.compile(r"soilMoisture")
_FLAG = re.compile(r"retrievalQualityFlag")
_MOISTURE_UNIT = "m3 m-3"

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
_MOISTURE_METHOD = (
    "Mean of the layer soilMoisture of the product over the cells whose retrieval the layer retrievalQualityFlag "
    "of the same product does not mark as not recommended (bit 0 is 0) (ASF NISAR Cookbook, notebook "
    "NISAR_GCOV_Time_Series_Example, section 8, commit 17b69c8, applied to the soil moisture; "
    "NASA SDS Product Specification, L3 SME2, JPL D-107677 Rev C)"
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
        If the layers are fewer than two; if a layer is not one that the tool reads (see ``check_inputs``); if
        the layers are not the same layer of their products, are not of the same instrument, track, direction
        and frame, or are not of the same major release of the processing software; or if two layers have the
        same date or dates.
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


def _series(
    arrays: Iterable[NDArray[np.float32]],
    layers: Sequence[LayerDescription],
    place: Place,
    measure: Measure,
    empty: Callable[[], str | None] = lambda: None,
) -> tuple[tuple[SeriesEntry, ...], tuple[str, ...]]:
    """Return the entries of a series, the earliest first, and the product files in the same order.

    The arrays are taken one after another and none is kept, so the caller may read each file only when its
    array is asked for. ``empty`` gives the sentence of the refusal when no layer gives a value, or None for the
    sentence that names the point or the area.

    Raises
    ------
    LayerError
        If the grids of the layers differ in size, or no layer gives a value.
    ValueError
        If the arrays and the descriptions differ in number, an array is not two-dimensional 32-bit floating
        point, the cell lies outside the grid, or the cells of an area are not on the grid. These are faults of
        the caller.
    """
    shape: tuple[int, ...] | None = None
    made: list[tuple[SeriesEntry, str]] = []
    for array, layer in zip(arrays, layers, strict=True):
        if array.ndim != 2 or array.dtype != np.float32:
            raise ValueError(f'The array of the layer "{layer.title}" is not two-dimensional 32-bit floating point.')
        if shape is None:
            shape = array.shape
            if isinstance(place, tuple) and not (0 <= place[0] < shape[0] and 0 <= place[1] < shape[1]):
                raise ValueError("The cell of the point lies outside the grid of the layers.")
            if isinstance(place, np.ndarray) and (place.shape != shape or place.dtype != np.bool_):
                raise ValueError("The cells of the area are not marked on the grid of the layers.")
        elif array.shape != shape:
            raise LayerError("The input layers do not have the same grid.")
        value, cells = measure(array, layer, place)
        made.append((SeriesEntry(dates=layer.dates, value=value, cells=cells), layer.inputs[0]))
    if all(entry.cells == 0 for entry, _ in made):
        where = "at the point" if isinstance(place, tuple) else "in any cell" if place is None else "in the area"
        raise LayerError(empty() or f"No layer of the series holds a value {where}.")
    made.sort(key=lambda pair: pair[0].dates)
    return tuple(entry for entry, _ in made), tuple(name for _, name in made)


def _mean(values: NDArray[np.float32], valid: NDArray[np.bool_]) -> tuple[float | None, int]:
    """Return the mean of the values of the cells marked valid, in 64-bit numbers, and the number of those cells."""
    cells = int(np.count_nonzero(valid))
    if cells == 0:
        return None, 0
    return float(np.sum(values, where=valid, dtype=np.float64)) / cells, cells


def _cells(values: NDArray[np.float32], place: Place) -> NDArray[np.float32]:
    """Return the values of the cells of a place: every cell, the one cell of a point, or the cells of an area."""
    if place is None:
        return values
    if isinstance(place, tuple):
        return values[place[0] : place[0] + 1, place[1] : place[1] + 1]
    return values[place]


def _mean_backscatter(power: NDArray[np.float32], _: LayerDescription, place: Place) -> tuple[float | None, int]:
    """Return the decibels of the mean power of the cells of the place that hold a finite value above zero."""
    values = _cells(power, place)
    mean, cells = _mean(values, (values > 0) & (values < np.inf))
    if mean is None or not 0 < mean < math.inf:
        return None, 0
    return 10 * math.log10(mean), cells


def _mean_coherence(coherence: NDArray[np.float32], layer: LayerDescription, place: Place) -> tuple[float | None, int]:
    """Return the mean coherence of the cells of the place that hold a value.

    Raises
    ------
    LayerError
        If a cell of the layer, inside the place or not, holds a value outside 0 to 1.
    """
    held = ~np.isnan(coherence)
    if held.any() and (
        float(np.min(coherence, where=held, initial=np.inf)) < 0
        or float(np.max(coherence, where=held, initial=-np.inf)) > 1
    ):
        raise LayerError(f'The layer "{layer.title}" holds values outside 0 to 1, so it is not a coherence magnitude.')
    values = _cells(coherence, place)
    return _mean(values, ~np.isnan(values))


def backscatter_series(
    arrays: Iterable[NDArray[np.float32]],
    layers: Sequence[LayerDescription],
    place: Place = None,
) -> SeriesResult:
    """Give the radar backscatter of many dates, at a point or as the mean of an area, in decibels.

    Parameters
    ----------
    arrays : iterable of numpy.ndarray
        Two or more arrays on the same grid: the same diagonal covariance term of GCOV products of the same
        instrument, track, direction and frame, gamma0 in linear power (unit ``1``), in any order of dates.
        The function takes the arrays one after another and keeps none.
    layers : sequence of LayerDescription
        The descriptions of the layers, in the same order.
    place : tuple of int or numpy.ndarray, optional
        Row and column of the cell of the point, counted from 0, or an array of the shape of the grid that is
        True for the cells inside an area drawn on the map. Without it the series is that of the whole area of
        the layers.

    Returns
    -------
    SeriesResult
        One entry for each layer, the earliest date first, with the product files in the same order. The value
        of an entry is ``10 * log10`` of the mean of the linear power, in dB, taken over the cells of the place
        on that date that hold a finite value above zero; ``cells`` is the number of those cells. At a point the
        mean is
        the value of the one cell, and an entry whose cell holds ``nan``, zero, a negative or an infinite value
        has no value and 0 cells. The mean is computed in 64-bit numbers. The reduction is ``mean-power`` and
        the series has no fixed range.

    Raises
    ------
    LayerError
        If the layers are fewer than two; if a layer is not one diagonal covariance term of a GCOV product
        with the unit ``1`` and one date (see ``check_inputs``); if the layers are not the same term, are not
        of the same instrument, track, direction and frame, or are not of the same major release of the
        processing software; if two layers have the same date; if the grids differ in size; or if no layer
        holds a value above zero, at the point, in the area or in any cell.
    ValueError
        If the arrays and the descriptions differ in number, an array is not two-dimensional 32-bit floating
        point, the cell lies outside the grid, or the cells of an area are not on the grid. These are faults of
        the caller.
    """
    _descriptions(
        layers,
        product="GCOV",
        names=_TERMS,
        reads="a diagonal covariance term (HHHH, HVHV, VHVH, VVVV, RHRH or RVRV)",
        dates=1,
    )
    entries, inputs = _series(arrays, layers, place, _mean_backscatter)
    return _result(entries, inputs, layers, "Radar backscatter gamma0", "dB", _BACKSCATTER_METHOD, "mean-power", None)


def coherence_series(
    arrays: Iterable[NDArray[np.float32]],
    layers: Sequence[LayerDescription],
    place: Place = None,
) -> SeriesResult:
    """Give the interferometric coherence of many pairs of dates, at a point or as the mean of an area.

    Parameters
    ----------
    arrays : iterable of numpy.ndarray
        Two or more arrays on the same grid: the same layer ``coherenceMagnitude`` of GUNW products of the same
        instrument, track, direction and frame, between 0 and 1 (unit ``1``), in any order of dates. The
        function takes the arrays one after another and keeps none.
    layers : sequence of LayerDescription
        The descriptions of the layers, in the same order.
    place : tuple of int or numpy.ndarray, optional
        Row and column of the cell of the point, counted from 0, or an array of the shape of the grid that is
        True for the cells inside an area drawn on the map. Without it the series is that of the whole area of
        the layers.

    Returns
    -------
    SeriesResult
        One entry for each layer, the pair with the earliest dates first, with the product files in the same
        order. The value of an entry is the mean of the coherence magnitude, without unit (``1``), taken over
        the cells of the place in that pair that hold a value; ``cells`` is the number of those cells. At a
        point the mean
        is the value of the one cell, and an entry whose cell holds ``nan`` has no value and 0 cells. The mean
        is computed in 64-bit numbers. The reduction is ``mean`` and the range is 0 to 1.

    Raises
    ------
    LayerError
        If the layers are fewer than two; if a layer is not a layer ``coherenceMagnitude`` of a GUNW product
        with the unit ``1`` and two dates (see ``check_inputs``); if the layers are not the same layer of
        their products, are not of the same instrument, track, direction and frame, or are not of the same
        major release of the processing software; if two layers have the same two dates; if the grids differ
        in size; if a layer holds a value outside 0 to 1; or if no layer holds a value, at the point, in the
        area or in any cell.
    ValueError
        If the arrays and the descriptions differ in number, an array is not two-dimensional 32-bit floating
        point, the cell lies outside the grid, or the cells of an area are not on the grid. These are faults of
        the caller.
    """
    _descriptions(layers, product="GUNW", names=_COHERENCE, reads="the layer coherenceMagnitude", dates=2)
    entries, inputs = _series(arrays, layers, place, _mean_coherence)
    return _result(
        entries, inputs, layers, "Interferometric coherence (magnitude)", "1", _COHERENCE_METHOD, "mean", (0.0, 1.0)
    )


def _mean_moisture(moisture: NDArray[np.float32], _: LayerDescription, place: Place) -> tuple[float | None, int]:
    """Return the mean soil moisture of the cells of the place that hold a value."""
    values = _cells(moisture, place)
    return _mean(values, ~np.isnan(values))


def _percent(part: int, whole: int) -> str:
    """Write a share in percent with one decimal, never as 0.0 for a part above 0 or as 100.0 for a part below all."""
    share = 100 * part / whole
    if 0 < share < 0.05:
        return "0.1 %"
    if 99.95 <= share < 100:
        return "99.9 %"
    return f"{share:.1f} %"


def _moisture_note(counts: Sequence[tuple[int, int]], at_point: bool) -> str:
    """Say in one sentence for the visitor which cells of the series were left out.

    ``counts`` holds, for each date, the number of cells with a soil moisture and the number of them that were left
    out, at the point or in the whole area.
    """
    left = [out for _, out in counts]
    if at_point:
        flagged = sum(1 for out in left if out)
        if flagged == 0:
            return "NISAR marks the retrieval at the point as recommended on every date that holds a soil moisture."
        verb = "has" if flagged == 1 else "have"
        return (
            f"NISAR marks the retrieval at the point as not recommended on {flagged} of the {len(counts)} dates, "
            f"which {verb} no value."
        )
    if not any(left):
        return "NISAR marks the retrieval of every cell with a soil moisture as recommended on every date."
    shares = [100 * out / held for held, out in counts]
    lowest = counts[shares.index(min(shares))]
    highest = counts[shares.index(max(shares))]
    span = (
        _percent(lowest[1], lowest[0])
        if min(shares) == max(shares)
        else f"from {_percent(lowest[1], lowest[0])} to {_percent(highest[1], highest[0])}"
    )
    return (
        "On each date the cells whose retrieval NISAR marks as not recommended are left out: "
        f"{span} of the cells with a soil moisture."
    )


def soil_moisture_series(
    arrays: Iterable[NDArray[np.float32]],
    layers: Sequence[LayerDescription],
    place: Place = None,
) -> SeriesResult:
    """Give the soil moisture of many dates, at a point or as the mean of the area, in the cells NISAR recommends.

    Parameters
    ----------
    arrays : iterable of numpy.ndarray
        Four or more arrays on the same grid: for each date, the layer ``soilMoisture`` of an SME2 product (unit
        ``m3 m-3``) and then the layer ``retrievalQualityFlag`` of the same product (unit ``1``), whose lowest bit
        is set where the mission does not recommend the retrieval. The products are of the same instrument, track,
        direction and frame, and the dates stand in any order. The function takes the arrays one after another
        and keeps the two arrays of one date at a time.
    layers : sequence of LayerDescription
        The descriptions of the layers, in the same order.
    place : tuple of int or numpy.ndarray, optional
        Row and column of the cell of the point, counted from 0, or an array of the shape of the grid that is
        True for the cells inside an area drawn on the map. Without it the series is that of the whole area of
        the layers.

    Returns
    -------
    SeriesResult
        One entry for each date, the earliest first, with the product files in the same order. The value of an entry
        is the mean of the soil moisture, in m3 m-3, taken over the cells of the place on that date that hold a
        value and whose flag holds a value with the lowest bit 0; ``cells`` is the number of those cells. At a point
        the mean is the value of the one cell, and an entry whose cell holds no value, or is marked as not
        recommended, has no value and 0 cells. The mean is computed in 64-bit numbers. The reduction is ``mean`` and
        the series has no fixed range. The layer is ``soilMoisture``. The note says which cells were left out.

    Raises
    ------
    LayerError
        If the number of layers is odd or the dates are fewer than two; if a layer of the soil moisture is not
        a layer ``soilMoisture`` of an SME2 product with the unit ``m3 m-3`` and one date, or a layer of the flag
        is not a layer ``retrievalQualityFlag`` of an SME2 product with one date (see ``check_inputs``); if the
        two layers of a date are not of the same product file; if the products are not of the same instrument,
        track, direction and frame, or of the same major release of the processing software; if two dates are
        the same; if the grids differ in size; if a soil moisture holds no value, or a value below 0 or above 1;
        if a flag holds no value, or a value that is not a whole number from 0 to 32767; or if no date keeps a
        value, at the point, in the area or in any cell.
    ValueError
        If the arrays and the descriptions differ in number, an array is not two-dimensional 32-bit floating
        point, the cell lies outside the grid, or the cells of an area are not on the grid. These are faults of
        the caller.
    """
    if len(layers) % 2:
        raise LayerError(f"The number of input layers must be even, two for each date, and it is {len(layers)}.")
    moistures, flags = layers[0::2], layers[1::2]
    _descriptions(
        moistures, product="SME2", names=_MOISTURE, reads="the layer soilMoisture", dates=1, unit=_MOISTURE_UNIT
    )
    check_inputs(
        [_NO_VALUES] * len(flags),
        flags,
        count=len(flags),
        product="SME2",
        names=_FLAG,
        reads="the layer retrievalQualityFlag",
        dates=1,
    )
    for moisture, flag in zip(moistures, flags, strict=True):
        if flag.inputs != moisture.inputs:
            raise LayerError(f'The layers "{moisture.title}" and "{flag.title}" are not of the same product file.')
    counts: list[tuple[int, int]] = []

    def kept() -> Iterator[NDArray[np.float32]]:
        """Give, date after date, the soil moisture of the cells that the flag of the date does not mark."""
        given = iter(arrays)
        for moisture_layer, flag_layer in zip(moistures, flags, strict=True):
            moisture, marks = next(given, None), next(given, None)
            if moisture is None or marks is None:
                raise ValueError("The arrays and the descriptions of the input layers differ in number.")
            for array, layer in ((moisture, moisture_layer), (marks, flag_layer)):
                if array.ndim != 2 or array.dtype != np.float32:
                    raise ValueError(
                        f'The array of the layer "{layer.title}" is not two-dimensional 32-bit floating point.'
                    )
            if marks.shape != moisture.shape:
                raise LayerError("The input layers do not have the same grid.")
            check_moisture(moisture, moisture_layer)
            check_flag(marks, flag_layer)
            values = recommended(moisture, marks)
            rows, columns = moisture.shape
            on_grid = (
                place is None
                or (isinstance(place, tuple) and 0 <= place[0] < rows and 0 <= place[1] < columns)
                or (isinstance(place, np.ndarray) and place.shape == moisture.shape and place.dtype == np.bool_)
            )
            if on_grid:
                held = int(np.count_nonzero(~np.isnan(_cells(moisture, place))))
                counts.append((held, held - int(np.count_nonzero(~np.isnan(_cells(values, place))))))
            else:
                # _series refuses a place that is not on the grid, with the sentence for the caller.
                counts.append((0, 0))
            yield values
        if next(given, None) is not None:
            raise ValueError("The arrays and the descriptions of the input layers differ in number.")

    def empty() -> str | None:
        """Say why no date keeps a value, when the flags left out every value."""
        if not any(out for _, out in counts):
            return None
        if isinstance(place, tuple):
            return (
                "NISAR marks the retrieval at the point as not recommended on every date that holds a soil "
                "moisture, so the series has no value."
            )
        where = "" if place is None else " of the area"
        return (
            f"NISAR marks the retrieval of every cell{where} as not recommended on every date, so the series has "
            "no value."
        )

    entries, inputs = _series(kept(), moistures, place, _mean_moisture, empty)
    return _result(
        entries,
        inputs,
        moistures,
        "Soil moisture",
        _MOISTURE_UNIT,
        _MOISTURE_METHOD,
        "mean",
        None,
        _moisture_note(counts, isinstance(place, tuple)),
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
    note: str | None = None,
) -> SeriesResult:
    """Return the result of a series whose layers all carry the name of the first."""
    return SeriesResult(entries, inputs, str(layers[0].layer), quantity, unit, method, reduction, limits, note)
