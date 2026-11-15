# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""The tools of the group Soil moisture. They read two layers of SME2 products: the soil moisture and its flag.

The layer ``soilMoisture`` is the volumetric soil moisture that the mission retrieves from the radar backscatter, in
cubic metres of water in a cubic metre of soil, on the 200 m EASE-Grid 2.0. The product computes it as the mean of
the retrievals of its algorithms. The layer ``retrievalQualityFlag`` of the same product marks with its lowest bit
the cells whose retrieval the mission does not recommend, and every tool of the group leaves those cells out. A
tool takes the two layers of each date one after the other: the soil moisture, then the flag of the same product.
The method sheets are ``docs/methods/soil-moisture-state.md``, ``docs/methods/soil-moisture-change.md`` and
``docs/methods/soil-moisture-series.md``.
"""

import re
from collections.abc import Sequence

import numpy as np
from numpy.typing import NDArray

from lynkeus.analysis.inputs import Acquisition, check_inputs
from lynkeus.layers import AnalysisResult, LayerDescription
from lynkeus.writing import LayerError

# The two layers of an SME2 product that the tools read, by their paths inside the group ``/science/LSAR/SME2/grids/``
# (NASA SDS Product Specification, L3 SME2, JPL D-107677 Rev C, Table 4.2.1, page 37), which are the names that
# ``lynkeus.harmony.layers_of`` gives them.
_LAYER = re.compile(r"soilMoisture")
_READS = "the layer soilMoisture"
_FLAG = re.compile(r"retrievalQualityFlag")
_READS_FLAG = "the layer retrievalQualityFlag"

# The unit of the layer soilMoisture as ``lynkeus.harmony.layers_of`` writes it. The product writes it
# ``meter^3/meter^3`` (the same specification, page 37). The flag has no unit (``1``).
_UNIT = "m3 m-3"

NOT_RECOMMENDED = 1
"""The lowest bit of the layer ``retrievalQualityFlag``, set where the mission does not recommend the retrieval.

The specification gives bit 0 as the "Retrieval recommended flag" (JPL D-107677 Rev C, page 37), and the NISAR L3
Soil Moisture ATBD sets it where the surface flag is above 0 or another bit of the flag is raised (JPL D-107679
Release 3.3, Table 5.5.2, page 54). The product files describe it as "0 = recommended, 1 = not recommended".
"""

LARGEST_FLAG = 32767
"""The largest value of the layer ``retrievalQualityFlag``, which the product holds as 16-bit integers (Int16).

The specification gives the type (the same specification, page 37); the value -9999 of the product means no data.
"""

# The two thresholds of the soil moisture that the specification gives for the retrieval quality flags, in
# m3 m-3 (the same specification, pages 23, 25, 30 and 37, flag bit 3; NISAR L3 Soil Moisture Data Product ATBD,
# JPL D-107679 Release 3.3, Table 5.5.2).
_LOWEST, _HIGHEST = 0.02, 0.60

_STATE_METHOD = (
    "Layer soilMoisture of the product in the cells whose retrieval the layer retrievalQualityFlag of the same "
    "product does not mark as not recommended (bit 0 is 0); every other cell is left out "
    "(NASA SDS Product Specification, L3 SME2, JPL D-107677 Rev C; "
    "NISAR L3 Soil Moisture Data Product ATBD, JPL D-107679 Release 3.3)"
)
_CHANGE_METHOD = (
    "Difference of the layer soilMoisture of two dates, later minus earlier, in the cells whose retrieval the "
    "layer retrievalQualityFlag does not mark as not recommended on either date (bit 0 is 0) "
    "(image differencing: Singh, 1989, https://doi.org/10.1080/01431168908903939; "
    "NASA SDS Product Specification, L3 SME2, JPL D-107677 Rev C)"
)


def check_dates(
    arrays: Sequence[NDArray[np.float32]], layers: Sequence[LayerDescription], *, count: int
) -> tuple[Acquisition, ...]:
    """Check the input layers of a tool of the group Soil moisture: for each date, the soil moisture and its flag.

    Parameters
    ----------
    arrays : sequence of numpy.ndarray
        Arrays of the input layers: for each date, the layer ``soilMoisture`` of an SME2 product and then the layer
        ``retrievalQualityFlag`` of the same product file.
    layers : sequence of LayerDescription
        Descriptions of the input layers, in the same order.
    count : int
        Number of dates that the tool takes. It takes twice as many layers.

    Returns
    -------
    tuple of Acquisition
        How the product of each date was acquired, read from the name of its product file.

    Raises
    ------
    LayerError
        If the number of layers is not twice ``count``; if a layer of the soil moisture or a layer of the flag is
        not one that the tool reads (see ``check_inputs``); if the two layers of a date do not have the same grid;
        or if they are not of the same product file.
    ValueError
        If the arrays and the descriptions differ in number, or an array is not two-dimensional 32-bit floating
        point. These are faults of the caller.
    """
    if len(arrays) != len(layers):
        raise ValueError("The arrays and the descriptions of the input layers differ in number.")
    if len(layers) != 2 * count:
        raise LayerError(f"The number of input layers must be {2 * count}, and it is {len(layers)}.")
    acquisitions = check_inputs(
        arrays[0::2], layers[0::2], count=count, product="SME2", names=_LAYER, reads=_READS, dates=1, unit=_UNIT
    )
    check_inputs(arrays[1::2], layers[1::2], count=count, product="SME2", names=_FLAG, reads=_READS_FLAG, dates=1)
    for moisture, flag, values, marks in zip(layers[0::2], layers[1::2], arrays[0::2], arrays[1::2], strict=True):
        if marks.shape != values.shape:
            raise LayerError("The input layers do not have the same grid.")
        if flag.inputs != moisture.inputs:
            raise LayerError(f'The layers "{moisture.title}" and "{flag.title}" are not of the same product file.')
    return acquisitions


def check_moisture(values: NDArray[np.float32], layer: LayerDescription) -> None:
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


def check_flag(marks: NDArray[np.float32], layer: LayerDescription) -> None:
    """Check that the array of a layer holds a retrieval quality flag: whole numbers from 0 to ``LARGEST_FLAG``.

    Raises
    ------
    LayerError
        If no cell holds a value, or a cell holds a value that is not a whole number from 0 to ``LARGEST_FLAG``.
    """
    held = marks[~np.isnan(marks)]
    if held.size == 0:
        raise LayerError(f'The layer "{layer.title}" holds no value in any cell.')
    if held.min() < 0 or held.max() > LARGEST_FLAG or (held != np.floor(held)).any():
        raise LayerError(
            f'The layer "{layer.title}" holds values that are not whole numbers from 0 to {LARGEST_FLAG}, '
            "so it is not a retrieval quality flag."
        )


def recommended(moisture: NDArray[np.float32], marks: NDArray[np.float32]) -> NDArray[np.float32]:
    """Return the soil moisture of the cells whose retrieval the flag does not mark as not recommended.

    A cell keeps its value where the flag holds a value whose lowest bit (``NOT_RECOMMENDED``) is 0. Every other
    cell holds ``nan``: a cell whose flag has that bit set, and a cell whose flag holds no value. The input arrays
    are not changed.
    """
    kept = np.full(moisture.shape, np.nan, np.float32)
    flagged = ~np.isnan(marks)
    # The flag holds whole numbers from 0 to LARGEST_FLAG (``check_flag``), which 64-bit integers hold exactly.
    clear = np.zeros(moisture.shape, np.bool_)
    clear[flagged] = (marks[flagged].astype(np.int64) & NOT_RECOMMENDED) == 0
    np.copyto(kept, moisture, where=clear)
    return kept


def left_out_sentence(left: int, held: int, where: str = "", when: str = "") -> str:
    """Say in one sentence for the visitor how many cells with a soil moisture the tool left out, and why.

    ``held`` is the number of cells that hold a soil moisture and ``left`` the number of them that the tool left
    out. ``where`` names those cells further, for example `` on both dates``, and ``when`` the dates of the flag,
    for example `` on one date or both``.
    """
    if left == 0:
        return (
            f"NISAR marks the retrieval of every cell with a soil moisture{where} as recommended, so none is left out."
        )
    verb = "is" if left == 1 else "are"
    return (
        f"{left:,} of the {held:,} cells with a soil moisture{where} {verb} left out "
        f"because NISAR marks their retrieval as not recommended{when}."
    )


def soil_moisture_state(arrays: Sequence[NDArray[np.float32]], layers: Sequence[LayerDescription]) -> AnalysisResult:
    """Map the soil moisture of one date, in the cells whose retrieval NISAR recommends.

    Parameters
    ----------
    arrays : sequence of numpy.ndarray
        Two arrays on the same grid, of one SME2 product. The first is the layer ``soilMoisture``, the volumetric
        soil moisture in cubic metres of water in a cubic metre of soil (unit ``m3 m-3``). The second is the layer
        ``retrievalQualityFlag`` (unit ``1``): whole numbers whose lowest bit is set where the mission does not
        recommend the retrieval.
    layers : sequence of LayerDescription
        The descriptions of the two layers, in the same order.

    Returns
    -------
    AnalysisResult
        The soil moisture (unit ``m3 m-3``) in the cells where the flag holds a value whose lowest bit is 0, and
        ``nan`` in every other cell. The legend runs from 0.02 to 0.60 m3 m-3, the two thresholds that the
        product specification gives for the soil moisture in its retrieval quality flags, on the scale
        ``YlGnBu``. The reduced copies of the result are means of its values. The note says how many of the
        cells with a soil moisture are left out.

    Raises
    ------
    LayerError
        If the inputs are not the layer ``soilMoisture`` with the unit ``m3 m-3`` and the layer
        ``retrievalQualityFlag`` of one SME2 product file and one date, on the same grid (see ``check_dates``); if
        the soil moisture holds no value, or a value below 0 or above 1; if the flag holds no value, or a value
        that is not a whole number from 0 to 32767; or if no cell keeps a value.
    """
    check_dates(arrays, layers, count=1)
    moisture, marks = arrays
    check_moisture(moisture, layers[0])
    check_flag(marks, layers[1])
    kept = recommended(moisture, marks)
    held = int(np.count_nonzero(~np.isnan(moisture)))
    left = held - int(np.count_nonzero(~np.isnan(kept)))
    if left == held:
        raise LayerError(
            f'NISAR marks the retrieval of every cell of the layer "{layers[0].title}" as not recommended, '
            "so the result would hold no value."
        )
    return AnalysisResult(
        kept,
        "Soil moisture",
        _UNIT,
        (_LOWEST, _HIGHEST),
        "YlGnBu",
        _STATE_METHOD,
        note=left_out_sentence(left, held),
    )


def soil_moisture_change(arrays: Sequence[NDArray[np.float32]], layers: Sequence[LayerDescription]) -> AnalysisResult:
    """Map the change of the soil moisture between two dates, in the cells whose retrieval NISAR recommends on both.

    Parameters
    ----------
    arrays : sequence of numpy.ndarray
        Four arrays on the same grid: the layer ``soilMoisture`` (unit ``m3 m-3``) and the layer
        ``retrievalQualityFlag`` (unit ``1``) of the SME2 product of the earlier date, then the same two layers
        of the SME2 product of the later date, of the same instrument, track, direction and frame.
    layers : sequence of LayerDescription
        The descriptions of the four layers, in the same order.

    Returns
    -------
    AnalysisResult
        Change of the soil moisture (unit ``m3 m-3``): the later date minus the earlier. A positive value is
        an increase. A cell holds ``nan`` where either soil moisture is ``nan``, and where the flag of either
        date has its lowest bit set or holds no value. The legend runs from -r to +r, where r is the 99th
        percentile of the absolute values of the result, in m3 m-3, on the diverging scale ``RdBu``. The words of
        its two ends are "decrease" for the lowest value and "increase" for the highest. The reduced copies of
        the result are means of its values. The note says how many of the cells with a soil moisture on both
        dates are left out.

    Raises
    ------
    LayerError
        If the inputs are not, for each of two dates, the layer ``soilMoisture`` with the unit ``m3 m-3`` and the
        layer ``retrievalQualityFlag`` of one SME2 product file and one date, all on the same grid (see
        ``check_dates``); if the two products are not of the same instrument, track, direction and frame, or the
        earlier date does not come first; if a soil moisture holds no value, or a value below 0 or above 1; if a
        flag holds no value, or a value that is not a whole number from 0 to 32767; if no cell keeps a value on
        both dates; or if the legend has no range.
    """
    earlier, later = check_dates(arrays, layers, count=2)
    if earlier != later:
        raise LayerError("The two layers are not of the same instrument, track, direction and frame.")
    if not layers[0].dates[0] < layers[2].dates[0]:
        raise LayerError("The first layer must be of an earlier date than the second.")
    before, before_marks, after, after_marks = arrays
    check_moisture(before, layers[0])
    check_flag(before_marks, layers[1])
    check_moisture(after, layers[2])
    check_flag(after_marks, layers[3])
    change = recommended(after, after_marks) - recommended(before, before_marks)
    held = int(np.count_nonzero(~np.isnan(before) & ~np.isnan(after)))
    valid = change[~np.isnan(change)]
    if valid.size == 0:
        raise LayerError(
            "The result would hold no value in any cell."
            if held == 0
            else "NISAR marks the retrieval of every cell with a soil moisture on both dates as not recommended "
            "on one of them, so the result would hold no value."
        )
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
        left_out_sentence(held - valid.size, held, " on both dates", " on one date or both"),
    )
