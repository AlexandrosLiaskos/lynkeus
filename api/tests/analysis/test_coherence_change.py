# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""Tests of the tool Coherence, Change."""

from typing import Any

import numpy as np
import pytest

from lynkeus.analysis import TOOLS
from lynkeus.analysis.coherence import coherence_change
from lynkeus.layers import LayerDescription
from lynkeus.writing import LayerError

from .layers import EARLIER, GUNW_9_21_OCT, grid, layer

NAN = float("nan")

# Product files of the pilot area (track 141, frame 67, descending) in the NASA catalogue on 15 Nov 2026.
GUNW_15_27_SEP = (
    "NISAR_L2_PR_GUNW_030_141_D_067_031_4000_SH_20260915T234330_20260915T234405_"
    "20260927T234330_20260927T234405_P05023_N_F_J_001"
)
GUNW_27_SEP_9_OCT = (
    "NISAR_L2_PR_GUNW_031_141_D_067_032_4000_SH_20260927T234330_20260927T234405_"
    "20261009T234330_20261009T234405_P05023_N_F_J_001"
)
GUNW_10_22_AUG = (
    "NISAR_L2_PR_GUNW_027_141_D_067_028_4000_SH_20260810T234331_20260810T234406_"
    "20260822T234330_20260822T234405_P05023_N_F_J_001"
)
GUNW_17_JUL_10_AUG = (
    "NISAR_L2_PR_GUNW_025_141_D_067_027_4000_SH_20260717T234332_20260717T234407_"
    "20260810T234331_20260810T234406_P05023_N_F_J_001"
)

WRAPPED = "wrappedInterferogram/HH/coherenceMagnitude"
UNWRAPPED = "unwrappedInterferogram/HH/coherenceMagnitude"


def pair(granule: str, first: str, second: str, name: str = WRAPPED, **changes: Any) -> LayerDescription:
    """Describe a layer ``coherenceMagnitude`` of a pair of dates."""
    return layer(granule, first, second, layer=name, **changes)


SEP = pair(GUNW_15_27_SEP, "2026-09-15", "2026-09-27")
SEP_OCT = pair(GUNW_27_SEP_9_OCT, "2026-09-27", "2026-10-09")
OCT = pair(GUNW_9_21_OCT, "2026-10-09", "2026-10-21")
AUG = pair(GUNW_10_22_AUG, "2026-08-10", "2026-08-22")
JUL_AUG = pair(GUNW_17_JUL_10_AUG, "2026-07-17", "2026-08-10")

ONE = grid([0.5, 0.5])


def refusal_of(arrays: list[Any], layers: list[LayerDescription]) -> str:
    """Return the sentence with which the tool refuses the inputs."""
    with pytest.raises(LayerError) as refusal:
        coherence_change(arrays, layers)
    return str(refusal.value)


def test_change_is_the_later_pair_minus_the_earlier_pair() -> None:
    before = grid([0.75, 0.25, 0.5], [NAN, 0.5, 1])
    after = grid([0.25, 0.75, 0.5], [0.5, NAN, 0])
    result = coherence_change([before, after], [SEP_OCT, OCT])
    expected = grid([-0.5, 0.5, 0], [NAN, NAN, -1])
    np.testing.assert_array_equal(result.values, expected)
    assert result.values.dtype == np.float32
    assert result.values.shape == before.shape
    assert (result.quantity, result.unit) == ("Change of interferometric coherence (magnitude)", "1")
    assert (result.range, result.colours) == ((-1.0, 1.0), "RdBu")
    assert result.ends == ("decrease", "increase")
    assert result.reduction == "mean"
    assert "10.1029/2004JB003299" in result.method
    assert "10.1109/TGRS.2021.3084209" in result.method


def test_change_is_computed_in_32_bit_numbers_and_leaves_its_inputs_unchanged() -> None:
    before, after = grid([0.1, 0.7]), grid([0.3, 0.2])
    kept = before.copy(), after.copy()
    result = coherence_change([before, after], [SEP_OCT, OCT])
    expected = grid([float(np.float32(0.3) - np.float32(0.1)), float(np.float32(0.2) - np.float32(0.7))])
    np.testing.assert_array_equal(result.values, expected)
    np.testing.assert_array_equal(before, kept[0])
    np.testing.assert_array_equal(after, kept[1])
    assert result.values is not before
    assert result.values is not after


def test_legend_is_the_same_for_every_result() -> None:
    small = coherence_change([grid([0.5, 0.5]), grid([0.5, 0.51])], [SEP_OCT, OCT])
    large = coherence_change([grid([0, 1]), grid([1, 0])], [SEP_OCT, OCT])
    assert small.range == large.range == (-1.0, 1.0)


def test_change_without_any_difference_is_a_result_of_zeros() -> None:
    result = coherence_change([ONE, ONE.copy()], [SEP_OCT, OCT])
    np.testing.assert_array_equal(result.values, grid([0, 0]))


def test_change_is_listed_under_the_name_of_its_button() -> None:
    assert TOOLS["coherence-change"] is coherence_change


def test_result_fits_a_layer_description() -> None:
    result = TOOLS["coherence-change"]([grid([0.2, 0.4]), grid([0.6, 0.1])], [SEP_OCT, OCT])
    description = {
        **SEP_OCT.model_dump(),
        "kind": "result",
        "layer": None,
        "quantity": result.quantity,
        "unit": result.unit,
        "range": result.range,
        "colours": result.colours,
        "method": result.method,
        "ends": result.ends,
    }
    assert LayerDescription.model_validate(description).ends == ("decrease", "increase")


def test_pairs_that_share_a_date_are_accepted() -> None:
    assert max(SEP_OCT.dates) == min(OCT.dates)
    assert coherence_change([ONE, ONE], [SEP_OCT, OCT]).values.shape == ONE.shape


def test_pairs_that_are_apart_in_time_are_accepted() -> None:
    assert max(SEP.dates) < min(OCT.dates)
    assert coherence_change([ONE, ONE], [SEP, OCT]).values.shape == ONE.shape
    assert coherence_change([ONE, ONE], [AUG, OCT]).values.shape == ONE.shape


@pytest.mark.parametrize(
    "name",
    [
        "unwrappedInterferogram/HH/coherenceMagnitude",
        "wrappedInterferogram/HH/coherenceMagnitude",
        "unwrappedInterferogram/VV/coherenceMagnitude",
        "wrappedInterferogram/VV/coherenceMagnitude",
    ],
)
def test_change_reads_the_coherence_of_each_group_and_channel(name: str) -> None:
    first = pair(GUNW_27_SEP_9_OCT, "2026-09-27", "2026-10-09", name)
    second = pair(GUNW_9_21_OCT, "2026-10-09", "2026-10-21", name)
    np.testing.assert_array_equal(coherence_change([grid([0.25]), grid([0.75])], [first, second]).values, grid([0.5]))


@pytest.mark.parametrize("count", [1, 3])
def test_change_takes_two_layers(count: int) -> None:
    layers = [SEP, SEP_OCT, OCT][:count]
    assert refusal_of([ONE] * count, layers) == f"The number of input layers must be 2, and it is {count}."


def test_change_refuses_layers_on_different_grids() -> None:
    assert refusal_of([ONE, grid([0.5])], [SEP_OCT, OCT]) == "The input layers do not have the same grid."


def test_change_reads_layers_of_gunw_products() -> None:
    sentence = 'The layer "Layer of 2026-10-21" is not a layer received from one NISAR GUNW product.'
    assert refusal_of([ONE, ONE], [SEP_OCT, EARLIER]) == sentence
    assert refusal_of([ONE, ONE], [EARLIER, OCT]) == sentence


def test_change_refuses_a_result_of_a_tool() -> None:
    result = layer(GUNW_9_21_OCT, "2026-10-09", "2026-10-21", kind="result", layer=None, method="A method")
    assert refusal_of([ONE, ONE], [SEP_OCT, result]) == (
        'The layer "Layer of 2026-10-09 and 2026-10-21" is not a layer received from one NISAR GUNW product.'
    )


@pytest.mark.parametrize(
    "name",
    [
        "unwrappedInterferogram/HH/connectedComponents",
        "unwrappedInterferogram/HH/unwrappedPhase",
        "pixelOffsets/HH/correlationSurfacePeak",
        "wrappedInterferogram/HV/coherenceMagnitude",
        "coherenceMagnitude",
    ],
)
def test_change_refuses_a_layer_that_is_not_a_coherence_magnitude(name: str) -> None:
    other = pair(GUNW_9_21_OCT, "2026-10-09", "2026-10-21", name)
    assert refusal_of([ONE, ONE], [SEP_OCT, other]) == (
        f'The layer "Layer of 2026-10-09 and 2026-10-21" is the layer {name} of its product, '
        "and the tool reads the layer coherenceMagnitude."
    )


def test_change_refuses_a_layer_stored_without_the_name_of_its_layer() -> None:
    stored = layer(GUNW_27_SEP_9_OCT, "2026-09-27", "2026-10-09", layer=None)
    assert refusal_of([ONE, ONE], [stored, OCT]) == (
        'The layer "Layer of 2026-09-27 and 2026-10-09" does not record which layer of its product it is; '
        "receive it again with Get layer."
    )


def test_change_refuses_a_layer_with_another_unit() -> None:
    radians = pair(GUNW_9_21_OCT, "2026-10-09", "2026-10-21", unit="rad")
    assert refusal_of([ONE, ONE], [SEP_OCT, radians]) == (
        'The layer "Layer of 2026-10-09 and 2026-10-21" has the unit rad, and the tool reads the unit 1.'
    )


def test_change_refuses_a_layer_without_a_pair_of_dates() -> None:
    one_date = layer(GUNW_9_21_OCT, "2026-10-21", layer=WRAPPED)
    assert refusal_of([ONE, ONE], [SEP_OCT, one_date]) == (
        'The number of dates of the layer "Layer of 2026-10-21" must be 2, and it is 1.'
    )


@pytest.mark.parametrize(
    ("first", "second"),
    [
        (WRAPPED, UNWRAPPED),
        (UNWRAPPED, WRAPPED),
        (WRAPPED, "wrappedInterferogram/VV/coherenceMagnitude"),
        ("unwrappedInterferogram/VV/coherenceMagnitude", UNWRAPPED),
    ],
)
def test_change_refuses_two_different_coherence_layers(first: str, second: str) -> None:
    layers = [
        pair(GUNW_27_SEP_9_OCT, "2026-09-27", "2026-10-09", first),
        pair(GUNW_9_21_OCT, "2026-10-09", "2026-10-21", second),
    ]
    assert refusal_of([ONE, ONE], layers) == (
        f"The two layers are not the same coherence layer: the first is {first} and the second is {second}."
    )


@pytest.mark.parametrize(
    ("old", "new"),
    [
        ("NISAR_L2", "NISAR_S2"),
        ("_141_D_067_", "_140_D_067_"),
        ("_141_D_067_", "_141_A_067_"),
        ("_141_D_067_", "_141_D_068_"),
    ],
)
def test_change_refuses_pairs_of_different_instruments_tracks_directions_or_frames(old: str, new: str) -> None:
    other = pair(GUNW_9_21_OCT.replace(old, new), "2026-10-09", "2026-10-21")
    assert refusal_of([ONE, ONE], [SEP_OCT, other]) == (
        "The two layers are not of the same instrument, track, direction and frame."
    )


def test_change_refuses_pairs_of_different_bandwidth_modes() -> None:
    other = pair(GUNW_9_21_OCT.replace("_4000_SH_", "_2005_SH_"), "2026-10-09", "2026-10-21")
    assert refusal_of([ONE, ONE], [SEP_OCT, other]) == (
        "The two layers are not of the same bandwidth mode: the first is 4000 and the second is 2005."
    )
    assert refusal_of([ONE, ONE], [other.model_copy(update={"dates": SEP_OCT.dates}), OCT]) == (
        "The two layers are not of the same bandwidth mode: the first is 2005 and the second is 4000."
    )


def test_change_accepts_pairs_of_different_polarisation_modes_and_releases() -> None:
    other = pair(GUNW_9_21_OCT.replace("_4000_SH_", "_4000_DH_"), "2026-10-09", "2026-10-21")
    assert "P05023" in SEP_OCT.inputs[0]
    assert "P05036" in other.inputs[0]
    np.testing.assert_array_equal(coherence_change([grid([0.5]), grid([0.75])], [SEP_OCT, other]).values, grid([0.25]))


@pytest.mark.parametrize("name", ["NISAR_L2_PR_GUNW_032_141_D_067_", "NISAR_L2_PR_GUNW_032_141_D_067_033_40_SH_2026"])
def test_change_refuses_a_product_name_without_a_bandwidth_mode(name: str) -> None:
    short = pair(name, "2026-10-09", "2026-10-21")
    assert refusal_of([ONE, ONE], [SEP_OCT, short]) == (
        'The name of the product of the layer "Layer of 2026-10-09 and 2026-10-21" does not hold its bandwidth mode.'
    )


def test_change_refuses_a_layer_whose_two_dates_are_the_same_day() -> None:
    same = pair(GUNW_9_21_OCT, "2026-10-21", "2026-10-21")
    assert refusal_of([ONE, ONE], [SEP_OCT, same]) == (
        'The two dates of the layer "Layer of 2026-10-21 and 2026-10-21" are the same day.'
    )


@pytest.mark.parametrize(
    "layers",
    [
        [OCT, SEP_OCT],
        [OCT, SEP],
        [OCT, pair(GUNW_9_21_OCT, "2026-10-09", "2026-10-21", title="The same pair")],
        [SEP_OCT, pair(GUNW_9_21_OCT, "2026-10-03", "2026-10-15")],
        [pair(GUNW_27_SEP_9_OCT, "2026-09-27", "2026-10-21"), pair(GUNW_9_21_OCT, "2026-10-09", "2026-10-21")],
        [pair(GUNW_27_SEP_9_OCT, "2026-10-09", "2026-11-02"), pair(GUNW_9_21_OCT, "2026-10-09", "2026-10-21")],
    ],
    ids=["later pair first", "later pair first, apart", "same pair", "overlap", "same end", "same start"],
)
def test_change_refuses_pairs_that_are_not_one_after_the_other(layers: list[LayerDescription]) -> None:
    assert refusal_of([ONE, ONE], layers) == (
        "The pair of the first layer must end on or before the first date of the pair of the second."
    )


def test_change_reads_the_dates_of_a_pair_in_either_order() -> None:
    turned = pair(GUNW_27_SEP_9_OCT, "2026-10-09", "2026-09-27")
    np.testing.assert_array_equal(coherence_change([grid([0.5]), grid([0.25])], [turned, OCT]).values, grid([-0.25]))


def test_change_refuses_pairs_that_span_different_numbers_of_days() -> None:
    assert refusal_of([ONE, ONE], [JUL_AUG, AUG]) == (
        "The two pairs do not span the same number of days: the first spans 24 days and the second 12 days."
    )
    assert refusal_of([ONE, ONE], [AUG, pair(GUNW_9_21_OCT, "2026-10-09", "2026-11-02")]) == (
        "The two pairs do not span the same number of days: the first spans 12 days and the second 24 days."
    )


@pytest.mark.parametrize("wrong", [grid([0.5, 1.5]), grid([-0.5, 0.5]), grid([0.5, float("inf")])])
def test_change_refuses_a_layer_that_is_not_a_coherence(wrong: Any) -> None:
    assert refusal_of([wrong, ONE], [SEP_OCT, OCT]) == (
        'The layer "Layer of 2026-09-27 and 2026-10-09" holds values outside 0 to 1, '
        "so it is not a coherence magnitude."
    )
    assert refusal_of([ONE, wrong], [SEP_OCT, OCT]) == (
        'The layer "Layer of 2026-10-09 and 2026-10-21" holds values outside 0 to 1, '
        "so it is not a coherence magnitude."
    )


@pytest.mark.parametrize(
    ("before", "after"),
    [
        (grid([NAN, NAN]), grid([0.5, 0.5])),
        (grid([0.5, 0.5]), grid([NAN, NAN])),
        (grid([NAN, 0.5]), grid([0.5, NAN])),
    ],
)
def test_change_without_a_cell_that_holds_a_value_in_both_layers_is_refused(before: Any, after: Any) -> None:
    assert refusal_of([before, after], [SEP_OCT, OCT]) == "The result would hold no value in any cell."


def test_arrays_and_descriptions_that_differ_in_number_are_a_fault_of_the_caller() -> None:
    with pytest.raises(ValueError, match="differ in number"):
        coherence_change([ONE], [SEP_OCT, OCT])
