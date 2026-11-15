# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""Tests of the tools of the group Soil moisture."""

from typing import Any

import numpy as np
import pytest

from lynkeus.analysis.inputs import check_inputs
from lynkeus.analysis.soil_moisture import (
    _LAYER,
    LARGEST_FLAG,
    NOT_RECOMMENDED,
    left_out_sentence,
    recommended,
    soil_moisture_change,
    soil_moisture_state,
)
from lynkeus.layers import LayerDescription
from lynkeus.writing import LayerError

from .layers import EARLIER, grid, layer

NAN = float("nan")
INF = float("inf")

# The names of two SME2 product files of the pilot area, track 141, frame 67, descending.
SME2_27_SEP = "NISAR_L3_PR_SME2_031_141_D_067_4005_DHDH_A_20260927T234330_20260927T234405_P05023_N_F_J_001"
SME2_9_OCT = "NISAR_L3_PR_SME2_032_141_D_067_4005_DHDH_A_20261009T234330_20261009T234405_P05023_N_F_J_001"

# A flag whose lowest bit is 0: the retrieval is recommended. The products of the pilot area hold 4, 8, 10, 12 and
# 14 so; 14 is the most frequent of them.
CLEAR = 14
# A flag whose lowest bit is 1: the retrieval is not recommended. The products of the pilot area hold mostly 15.
MARKED = 15


def moisture(granule: str, day: str, **changes: Any) -> LayerDescription:
    """Describe a layer ``soilMoisture`` received from an SME2 product file, unless ``changes`` say otherwise."""
    return layer(granule, day, **{"layer": "soilMoisture", "unit": "m3 m-3", **changes})


def flag(granule: str, day: str, **changes: Any) -> LayerDescription:
    """Describe a layer ``retrievalQualityFlag`` of an SME2 product file, unless ``changes`` say otherwise."""
    name = day.replace("-", "")
    described = {"id": f"flag-{name}", "title": f"Flag of {day}", "layer": "retrievalQualityFlag", "unit": "1"}
    return layer(granule, day, **{**described, **changes})


FIRST = moisture(SME2_27_SEP, "2026-09-27")
FIRST_FLAG = flag(SME2_27_SEP, "2026-09-27")
SECOND = moisture(SME2_9_OCT, "2026-10-09")
SECOND_FLAG = flag(SME2_9_OCT, "2026-10-09")
STATE = [SECOND, SECOND_FLAG]
CHANGE = [FIRST, FIRST_FLAG, SECOND, SECOND_FLAG]


def clear_like(values: Any) -> Any:
    """Return a flag that recommends the retrieval of every cell of an array."""
    return np.full(values.shape, CLEAR, np.float32)


def test_name_of_an_sme2_product_file_gives_its_acquisition() -> None:
    (acquisition,) = check_inputs(
        [grid([0.2])], [SECOND], count=1, product="SME2", names=_LAYER, reads="", dates=1, unit="m3 m-3"
    )
    assert acquisition == ("L", 141, "D", 67)


# The flag


def test_only_the_lowest_bit_of_the_flag_leaves_a_cell_out() -> None:
    assert NOT_RECOMMENDED == 1
    assert LARGEST_FLAG == 32767
    values = grid([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9])
    marks = grid([0, 1, 2, 3, 4, 5, 8, 14, 15])
    kept = recommended(values, marks)
    np.testing.assert_array_equal(kept, grid([0.1, NAN, 0.3, NAN, 0.5, NAN, 0.7, 0.8, NAN]))
    assert kept.dtype == np.float32
    np.testing.assert_array_equal(values, grid([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]))


def test_a_cell_whose_flag_holds_no_value_is_left_out() -> None:
    np.testing.assert_array_equal(recommended(grid([0.2, 0.3, NAN]), grid([NAN, 2, 2])), grid([NAN, 0.3, NAN]))


@pytest.mark.parametrize(
    ("left", "held", "sentence"),
    [
        (
            28_638,
            29_238,
            "28,638 of the 29,238 cells with a soil moisture are left out "
            "because NISAR marks their retrieval as not recommended.",
        ),
        (
            1,
            2,
            "1 of the 2 cells with a soil moisture is left out because NISAR marks their retrieval as not recommended.",
        ),
        (0, 5, "NISAR marks the retrieval of every cell with a soil moisture as recommended, so none is left out."),
    ],
)
def test_sentence_of_the_cells_left_out(left: int, held: int, sentence: str) -> None:
    assert left_out_sentence(left, held) == sentence


# Soil moisture, One date


def test_state_leaves_out_the_cells_that_the_flag_marks_as_not_recommended() -> None:
    values = grid([0.02, 0.25, 0.6], [NAN, 0, 1])
    marks = grid([CLEAR, MARKED, 4], [NAN, 13, 0])
    before = values.copy(), marks.copy()
    result = soil_moisture_state([values, marks], STATE)
    np.testing.assert_array_equal(result.values, grid([0.02, NAN, 0.6], [NAN, NAN, 1]))
    assert result.values.dtype == np.float32
    assert (result.quantity, result.unit) == ("Soil moisture", "m3 m-3")
    assert (result.range, result.colours) == ((0.02, 0.6), "YlGnBu")
    assert "D-107677" in result.method
    assert "retrievalQualityFlag" in result.method
    assert result.reduction == "mean"
    assert result.ends is None
    assert result.note == (
        "2 of the 5 cells with a soil moisture are left out because NISAR marks their retrieval as not recommended."
    )
    np.testing.assert_array_equal(values, before[0])
    np.testing.assert_array_equal(marks, before[1])


def test_state_with_every_retrieval_recommended_is_the_layer_of_the_product() -> None:
    values = grid([0.02, 0.25, 0.6], [NAN, 0, 1])
    result = soil_moisture_state([values, clear_like(values)], STATE)
    np.testing.assert_array_equal(result.values, values)
    assert result.note == (
        "NISAR marks the retrieval of every cell with a soil moisture as recommended, so none is left out."
    )


def test_state_where_every_retrieval_is_not_recommended_is_refused() -> None:
    values = grid([0.2, 0.3], [NAN, 0.4])
    with pytest.raises(LayerError) as refusal:
        soil_moisture_state([values, grid([MARKED, 1], [NAN, 3])], STATE)
    assert str(refusal.value) == (
        'NISAR marks the retrieval of every cell of the layer "Layer of 2026-10-09" as not recommended, '
        "so the result would hold no value."
    )


@pytest.mark.parametrize(
    ("values", "message"),
    [
        (grid([NAN, NAN]), '"Layer of 2026-10-09" holds no value in any cell'),
        (grid([0.25, 1.5]), "outside 0 to 1, so it is not a volumetric soil moisture"),
        (grid([-0.25, 0.25]), "outside 0 to 1"),
        (grid([-9999, 0.25]), "outside 0 to 1"),
        (grid([0.25, INF]), "outside 0 to 1"),
    ],
)
def test_state_of_a_layer_that_is_not_a_soil_moisture_is_refused(values: Any, message: str) -> None:
    with pytest.raises(LayerError, match=message):
        soil_moisture_state([values, clear_like(values)], STATE)


@pytest.mark.parametrize("marks", [grid([0.5, 2]), grid([-1, 2]), grid([32768, 2]), grid([INF, 2]), grid([-9999, 2])])
def test_state_and_change_refuse_a_flag_that_is_not_whole_numbers_from_0_to_32767(marks: Any) -> None:
    sentence = (
        'The layer "Flag of 2026-10-09" holds values that are not whole numbers from 0 to 32767, '
        "so it is not a retrieval quality flag."
    )
    values = grid([0.2, 0.3])
    with pytest.raises(LayerError) as refusal:
        soil_moisture_state([values, marks], STATE)
    assert str(refusal.value) == sentence
    with pytest.raises(LayerError) as refusal:
        soil_moisture_change([values, clear_like(values), values, marks], CHANGE)
    assert str(refusal.value) == sentence


def test_state_refuses_a_flag_without_a_value() -> None:
    with pytest.raises(LayerError) as refusal:
        soil_moisture_state([grid([0.2, 0.3]), grid([NAN, NAN])], STATE)
    assert str(refusal.value) == 'The layer "Flag of 2026-10-09" holds no value in any cell.'


@pytest.mark.parametrize("count", [1, 3])
def test_state_takes_two_layers(count: int) -> None:
    arrays = [grid([0.2]), grid([CLEAR]), grid([0.3])][:count]
    with pytest.raises(LayerError) as refusal:
        soil_moisture_state(arrays, [SECOND, SECOND_FLAG, FIRST][:count])
    assert str(refusal.value) == f"The number of input layers must be 2, and it is {count}."


def test_state_takes_the_soil_moisture_first_and_then_the_flag_of_the_same_product() -> None:
    values, marks = grid([0.2, 0.3]), grid([CLEAR, CLEAR])
    with pytest.raises(LayerError) as refusal:
        soil_moisture_state([marks, values], [SECOND_FLAG, SECOND])
    assert str(refusal.value) == (
        'The layer "Flag of 2026-10-09" is the layer retrievalQualityFlag of its product, '
        "and the tool reads the layer soilMoisture."
    )
    with pytest.raises(LayerError) as refusal:
        soil_moisture_state([values, values], [SECOND, SECOND])
    assert str(refusal.value) == (
        'The layer "Layer of 2026-10-09" is the layer soilMoisture of its product, '
        "and the tool reads the layer retrievalQualityFlag."
    )
    with pytest.raises(LayerError) as refusal:
        soil_moisture_state([values, marks], [SECOND, FIRST_FLAG])
    assert (
        str(refusal.value)
        == 'The layers "Layer of 2026-10-09" and "Flag of 2026-09-27" are not of the same product file.'
    )
    with pytest.raises(LayerError) as refusal:
        soil_moisture_state([values, marks], [SECOND, flag(SME2_9_OCT, "2026-10-09", unit="m3 m-3")])
    assert str(refusal.value) == 'The layer "Flag of 2026-10-09" has the unit m3 m-3, and the tool reads the unit 1.'
    with pytest.raises(LayerError, match="same grid"):
        soil_moisture_state([values, grid([CLEAR])], STATE)


def test_state_and_change_read_a_layer_of_an_sme2_product() -> None:
    sentence = 'The layer "Layer of 2026-10-21" is not a layer received from one NISAR SME2 product.'
    values, marks = grid([0.2]), grid([CLEAR])
    with pytest.raises(LayerError) as refusal:
        soil_moisture_state([values, marks], [EARLIER, SECOND_FLAG])
    assert str(refusal.value) == sentence
    with pytest.raises(LayerError) as refusal:
        soil_moisture_change([values, marks, values, marks], [EARLIER, FIRST_FLAG, SECOND, SECOND_FLAG])
    assert str(refusal.value) == sentence
    result = moisture(SME2_9_OCT, "2026-10-09", kind="result", layer=None, method="A method")
    with pytest.raises(LayerError, match="not a layer received from one NISAR SME2 product"):
        soil_moisture_state([values, marks], [result, SECOND_FLAG])


@pytest.mark.parametrize(
    "name",
    [
        "soilMoistureUncertainty",
        "algorithmCandidates/DSG/soilMoisture",
        "algorithmCandidates/PMI/soilMoisture",
        "algorithmCandidates/TSR/soilMoisture",
        "ancillaryData/waterbodyFraction",
        "soilmoisture",
        "HHHH",
    ],
)
def test_state_and_change_refuse_a_layer_that_is_not_the_soil_moisture(name: str) -> None:
    sentence = (
        f'The layer "Layer of 2026-10-09" is the layer {name} of its product, '
        "and the tool reads the layer soilMoisture."
    )
    other = moisture(SME2_9_OCT, "2026-10-09", layer=name)
    values, marks = grid([0.2, 0.3]), grid([CLEAR, CLEAR])
    with pytest.raises(LayerError) as refusal:
        soil_moisture_state([values, marks], [other, SECOND_FLAG])
    assert str(refusal.value) == sentence
    with pytest.raises(LayerError) as refusal:
        soil_moisture_change([values, marks, values, marks], [FIRST, FIRST_FLAG, other, SECOND_FLAG])
    assert str(refusal.value) == sentence


@pytest.mark.parametrize("name", ["surfaceQualityFlag", "algorithmCandidates/DSG/retrievalQualityFlag", "soilMoisture"])
def test_state_refuses_a_second_layer_that_is_not_the_retrieval_quality_flag(name: str) -> None:
    with pytest.raises(LayerError) as refusal:
        soil_moisture_state([grid([0.2]), grid([CLEAR])], [SECOND, flag(SME2_9_OCT, "2026-10-09", layer=name)])
    assert str(refusal.value) == (
        f'The layer "Flag of 2026-10-09" is the layer {name} of its product, '
        "and the tool reads the layer retrievalQualityFlag."
    )


def test_state_and_change_refuse_a_layer_stored_without_the_name_of_its_layer() -> None:
    sentence = (
        'The layer "Layer of 2026-10-09" does not record which layer of its product it is; '
        "receive it again with Get layer."
    )
    stored = moisture(SME2_9_OCT, "2026-10-09", layer=None)
    values, marks = grid([0.2, 0.3]), grid([CLEAR, CLEAR])
    with pytest.raises(LayerError) as refusal:
        soil_moisture_state([values, marks], [stored, SECOND_FLAG])
    assert str(refusal.value) == sentence
    with pytest.raises(LayerError) as refusal:
        soil_moisture_change([values, marks, values, marks], [FIRST, FIRST_FLAG, stored, SECOND_FLAG])
    assert str(refusal.value) == sentence


@pytest.mark.parametrize("unit", ["1", "meter^3/meter^3", "m3/m3", "%"])
def test_state_and_change_refuse_a_layer_with_another_unit(unit: str) -> None:
    sentence = f'The layer "Layer of 2026-10-09" has the unit {unit}, and the tool reads the unit m3 m-3.'
    other = moisture(SME2_9_OCT, "2026-10-09", unit=unit)
    values, marks = grid([0.2, 0.3]), grid([CLEAR, CLEAR])
    with pytest.raises(LayerError) as refusal:
        soil_moisture_state([values, marks], [other, SECOND_FLAG])
    assert str(refusal.value) == sentence
    with pytest.raises(LayerError) as refusal:
        soil_moisture_change([values, marks, values, marks], [FIRST, FIRST_FLAG, other, SECOND_FLAG])
    assert str(refusal.value) == sentence


# Soil moisture, Change


def test_change_is_the_later_date_minus_the_earlier_in_the_cells_recommended_on_both_dates() -> None:
    earlier = grid([0.25, 0.5, 0.125], [0.25, NAN, 0.5], [0, 1, NAN])
    later = grid([0.5, 0.25, 0.125], [NAN, 0.25, 0.625], [1, 0, NAN])
    earlier_marks = grid([CLEAR, CLEAR, MARKED], [CLEAR] * 3, [CLEAR] * 3)
    later_marks = grid([CLEAR, 13, CLEAR], [CLEAR] * 3, [CLEAR] * 3)
    before = [array.copy() for array in (earlier, earlier_marks, later, later_marks)]
    result = soil_moisture_change([earlier, earlier_marks, later, later_marks], CHANGE)
    np.testing.assert_array_equal(result.values, grid([0.25, NAN, NAN], [NAN, NAN, 0.125], [1, -1, NAN]))
    assert result.values.dtype == np.float32
    assert (result.quantity, result.unit, result.colours) == ("Change of soil moisture", "m3 m-3", "RdBu")
    assert "Singh" in result.method
    assert "retrievalQualityFlag" in result.method
    assert result.reduction == "mean"
    assert result.ends == ("decrease", "increase")
    assert result.note == (
        "2 of the 6 cells with a soil moisture on both dates are left out "
        "because NISAR marks their retrieval as not recommended on one date or both."
    )
    for array, copy in zip((earlier, earlier_marks, later, later_marks), before, strict=True):
        np.testing.assert_array_equal(array, copy)


def test_change_with_every_retrieval_recommended_is_the_plain_difference() -> None:
    earlier = grid([0.25, 0.5, 0.125], [0.25, NAN, 0.5], [0, 1, NAN])
    later = grid([0.5, 0.25, 0.125], [NAN, 0.25, 0.625], [1, 0, NAN])
    result = soil_moisture_change([earlier, clear_like(earlier), later, clear_like(later)], CHANGE)
    np.testing.assert_array_equal(result.values, grid([0.25, -0.25, 0], [NAN, NAN, 0.125], [1, -1, NAN]))
    assert result.note == (
        "NISAR marks the retrieval of every cell with a soil moisture on both dates as recommended, "
        "so none is left out."
    )


def test_change_legend_reaches_the_99th_percentile_of_the_absolute_values() -> None:
    # The changes are 0, -1/256, 2/256, -3/256, ... 100/256, so the 99th percentile of their absolute values is 99/256.
    steps = np.arange(101, dtype=np.float32)
    later = grid(list(steps / 256))
    earlier = grid(list(np.where(steps % 2 == 1, steps / 128, 0)))
    result = soil_moisture_change([earlier, clear_like(earlier), later, clear_like(later)], CHANGE)
    assert result.range == (-99 / 256, 99 / 256)


def pair_of(granule: str, day: str) -> list[LayerDescription]:
    """Describe the soil moisture and the flag of one product file."""
    return [moisture(granule, day), flag(granule, day)]


@pytest.mark.parametrize(
    ("layers", "message"),
    [
        ([*pair_of(SME2_9_OCT, "2026-10-09"), *pair_of(SME2_27_SEP, "2026-09-27")], "earlier date"),
        ([*pair_of(SME2_27_SEP, "2026-09-27"), *pair_of(SME2_27_SEP, "2026-09-27")], "earlier date"),
        ([*CHANGE[:2], *pair_of(SME2_9_OCT.replace("NISAR_L3_", "NISAR_S3_"), "2026-10-09")], "same instrument, track"),
        (
            [*CHANGE[:2], *pair_of(SME2_9_OCT.replace("_141_", "_069_"), "2026-10-09")],
            "same instrument, track, direction",
        ),
        ([*CHANGE[:2], *pair_of(SME2_9_OCT.replace("_D_067_", "_A_067_"), "2026-10-09")], "track, direction and frame"),
        ([*CHANGE[:2], *pair_of(SME2_9_OCT.replace("_D_067_", "_D_066_"), "2026-10-09")], "track, direction and frame"),
        # Another acquisition is reported before a wrong order of the dates.
        (
            [*pair_of(SME2_9_OCT.replace("_141_", "_069_"), "2026-10-09"), *CHANGE[:2]],
            "same instrument, track, direction",
        ),
        # The flag of a date must be of the product of the soil moisture of that date.
        ([FIRST, SECOND_FLAG, SECOND, FIRST_FLAG], "are not of the same product file"),
    ],
)
def test_change_of_unlike_layers_is_refused(layers: Any, message: str) -> None:
    values, marks = grid([0.2, 0.3]), grid([CLEAR, CLEAR])
    with pytest.raises(LayerError, match=message):
        soil_moisture_change([values, marks, grid([0.3, 0.2]), marks], layers)


@pytest.mark.parametrize(
    ("earlier", "later", "message"),
    [
        (grid([NAN, NAN, NAN]), grid([0.2, 0.3, 0.4]), '"Layer of 2026-09-27" holds no value in any cell'),
        (grid([0.2, 0.3, 0.4]), grid([NAN, NAN, NAN]), '"Layer of 2026-10-09" holds no value in any cell'),
        (grid([0.2, 0.3, 1.5]), grid([0.2, 0.3, 0.4]), '"Layer of 2026-09-27" holds values outside 0 to 1'),
        (grid([0.2, 0.3, 0.4]), grid([-9999, 0.3, 0.4]), '"Layer of 2026-10-09" holds values outside 0 to 1'),
        (grid([0.2, NAN, NAN]), grid([NAN, 0.3, 0.4]), "The result would hold no value in any cell"),
        (grid([0.2, 0.3, 0.4]), grid([0.2, 0.3, 0.4]), "too alike"),
        (grid([0.2, 0.3, 0.4]), grid([0.2, 0.3]), "same grid"),
    ],
)
def test_change_without_a_result_or_a_legend_is_refused(earlier: Any, later: Any, message: str) -> None:
    with pytest.raises(LayerError, match=message):
        soil_moisture_change([earlier, clear_like(earlier), later, clear_like(later)], CHANGE)


def test_change_where_every_retrieval_is_not_recommended_on_a_date_is_refused() -> None:
    earlier, later = grid([0.2, 0.3, NAN]), grid([0.3, 0.2, 0.4])
    with pytest.raises(LayerError) as refusal:
        soil_moisture_change([earlier, grid([CLEAR, MARKED, CLEAR]), later, grid([MARKED, CLEAR, CLEAR])], CHANGE)
    assert str(refusal.value) == (
        "NISAR marks the retrieval of every cell with a soil moisture on both dates as not recommended "
        "on one of them, so the result would hold no value."
    )


@pytest.mark.parametrize("count", [2, 3, 5])
def test_change_takes_four_layers(count: int) -> None:
    arrays = [grid([0.2]), grid([CLEAR]), grid([0.3]), grid([CLEAR]), grid([0.4])][:count]
    with pytest.raises(LayerError) as refusal:
        soil_moisture_change(arrays, [*CHANGE, FIRST][:count])
    assert str(refusal.value) == f"The number of input layers must be 4, and it is {count}."


def test_result_of_each_tool_fits_a_layer_description_and_the_grid_of_its_inputs() -> None:
    first, second = grid([0.125, 0.25], [0.375, 0.5]), grid([0.25, 0.125], [0.5, 0.375])
    marks = grid([CLEAR, MARKED], [CLEAR, CLEAR])
    runs = [
        (soil_moisture_state, [second, marks], STATE),
        (soil_moisture_change, [first, marks, second, marks], CHANGE),
    ]
    for function, arrays, layers in runs:
        result = function(arrays, layers)
        assert result.values.shape == arrays[0].shape
        description = {
            **layers[0].model_dump(),
            "kind": "result",
            "layer": None,
            "quantity": result.quantity,
            "unit": result.unit,
            "range": result.range,
            "colours": result.colours,
            "method": result.method,
            "ends": result.ends,
            "note": result.note,
        }
        assert LayerDescription.model_validate(description).note == result.note
