# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""Tests of the thematic map of the group Backscatter: the wetland inundation classification."""

from typing import Any

import numpy as np
import pytest

from lynkeus.analysis import TOOLS
from lynkeus.analysis.inundation import (
    CLASSES,
    OPEN_WATER_SUM_MAX,
    OPEN_WATER_SUM_MIN,
    VEGETATION_HH_MAX,
    VEGETATION_HH_MIN,
    VEGETATION_RATIO_MAX,
    VEGETATION_RATIO_MIN,
    backscatter_map,
)
from lynkeus.layers import LayerDescription
from lynkeus.writing import LayerError

from .layers import GCOV_2_NOV, GCOV_21_OCT, PAIR, grid, layer

NAN = float("nan")
TITLE = "Layer of 2026-10-21"


def single(value: float) -> float:
    """Return the 32-bit number nearest to a value."""
    return float(np.float32(value))


def after(value: float, toward: float) -> float:
    """Return the 32-bit number next to the 32-bit number of a value, toward another value."""
    return float(np.nextafter(np.float32(value), np.float32(toward)))


def term(name: str, granule: str = GCOV_21_OCT, day: str = "2026-10-21", **changes: Any) -> LayerDescription:
    """Describe a layer of a GCOV product of the pilot area."""
    return layer(granule, day, layer=name, **changes)


HH = term("HHHH")
HV = term("HVHV")


def classify(*cells: tuple[float, float]) -> list[float]:
    """Classify cells given as pairs of HHHH and HVHV, and return the classes in one row."""
    hh = grid([first for first, _ in cells])
    hv = grid([second for _, second in cells])
    return [float(value) for value in backscatter_map([hh, hv], [HH, HV]).values[0]]


def test_thresholds_are_those_of_the_set_default_of_the_notebook() -> None:
    # ancillary_data/wetland_calibration_parameters.yaml of NISAR_Inundation at commit 85140c4, set Default.
    assert (OPEN_WATER_SUM_MIN, OPEN_WATER_SUM_MAX) == (0.0, 0.06800000369548798)
    assert (VEGETATION_HH_MIN, VEGETATION_HH_MAX) == (0.42448979591836733, 10)
    assert (VEGETATION_RATIO_MIN, VEGETATION_RATIO_MAX) == (1.2000000000000002, 500)


def test_classes_and_colours_are_those_of_the_notebook() -> None:
    # Step 7 of the notebook: grey, dark blue and light blue for the classes 1, 2 and 3.
    notebook = {1: (236, 236, 238), 2: (21, 27, 115), 3: (66, 233, 245)}
    assert [(entry.value, entry.name) for entry in CLASSES] == [
        (1, "Not inundated"),
        (2, "Open water"),
        (3, "Inundated vegetation"),
    ]
    for entry in CLASSES:
        assert entry.colour == "#{:02x}{:02x}{:02x}".format(*notebook[entry.value])


def test_open_water_is_a_sum_above_zero_and_at_most_its_threshold() -> None:
    largest = single(OPEN_WATER_SUM_MAX)
    assert largest == OPEN_WATER_SUM_MAX
    assert classify((largest, 0), (after(largest, 1), 0), (0.01, 0.002), (0.05, 0.01)) == [2, 1, 2, 2]


def test_cell_without_a_sum_above_zero_holds_no_class() -> None:
    values = classify((0, 0), (-0.1, 0.05), (0.5, NAN), (NAN, 0.1), (NAN, NAN), (0.2, 0.1))
    assert np.isnan(values[:5]).all()
    assert values[5] == 1


def test_inundated_vegetation_is_bright_in_hh_and_brighter_in_hh_than_in_hv() -> None:
    assert classify((0.5, 0.1), (0.3, 0.05), (0.5, 0.45)) == [3, 1, 1]


def test_bounds_of_hh_belong_to_the_inundated_vegetation() -> None:
    lowest = single(VEGETATION_HH_MIN)
    below = after(lowest, 0)
    assert classify((lowest, lowest / 2), (below, below / 2), (10, 1), (after(10, 11), 1)) == [3, 1, 3, 1]


def test_bounds_of_the_ratio_belong_to_the_inundated_vegetation() -> None:
    # The ratios of these cells, in 32-bit numbers, are the two thresholds themselves.
    assert np.float32(0.6) / np.float32(0.5) == np.float32(VEGETATION_RATIO_MIN)
    assert np.float32(5) / np.float32(0.01) == np.float32(VEGETATION_RATIO_MAX)
    assert classify((0.6, 0.5), (after(0.6, 0), 0.5), (5, 0.01), (5, 0.0099)) == [3, 1, 3, 1]


def test_ratio_by_zero_or_by_a_negative_hv_is_not_inundated_vegetation() -> None:
    assert classify((0.5, 0), (0.5, -0.1)) == [1, 1]


def test_result_carries_the_classes_and_is_reduced_by_the_most_frequent_class() -> None:
    result = backscatter_map([grid([0.5, 0.01, 0.2]), grid([0.1, 0.002, 0.1])], [HH, HV])
    assert result.values.dtype == np.float32
    assert result.values.tolist() == [[3.0, 2.0, 1.0]]
    assert (result.quantity, result.unit, result.range) == ("Wetland inundation class", "1", (1.0, 3.0))
    assert (result.colours, result.reduction, result.classes, result.ends) == ("classes", "mode", CLASSES, None)
    for words in ("85140c4", "Default", "wetland_calibration_parameters.yaml", "https://doi.org/10.48577/jpl.UD4HV3"):
        assert words in result.method


def test_tool_is_the_thematic_map_of_the_group_backscatter() -> None:
    assert TOOLS["backscatter-map"] is backscatter_map


def test_map_does_not_change_its_inputs() -> None:
    hh, hv = grid([0.5, NAN, 0.01]), grid([0.1, 0.2, 0])
    before = hh.copy(), hv.copy()
    backscatter_map([hh, hv], [HH, HV])
    assert np.array_equal(hh, before[0], equal_nan=True)
    assert np.array_equal(hv, before[1], equal_nan=True)


@pytest.mark.parametrize("count", [1, 3])
def test_map_takes_two_layers(count: int) -> None:
    with pytest.raises(LayerError) as refusal:
        backscatter_map([grid([1])] * count, [HH] * count)
    assert str(refusal.value) == f"The number of input layers must be 2, and it is {count}."


@pytest.mark.parametrize("name", ["HVHV", "VVVV", "VHVH", "RHRH", "mask"])
def test_map_refuses_a_first_layer_that_is_not_hhhh(name: str) -> None:
    with pytest.raises(LayerError) as refusal:
        backscatter_map([grid([1]), grid([1])], [term(name), HV])
    assert str(refusal.value) == (
        f'The layer "{TITLE}" is the layer {name} of its product, and the tool reads the layer HHHH.'
    )


@pytest.mark.parametrize("name", ["HHHH", "VHVH", "VVVV", "RVRV"])
def test_map_refuses_a_second_layer_that_is_not_hvhv(name: str) -> None:
    with pytest.raises(LayerError) as refusal:
        backscatter_map([grid([1]), grid([1])], [HH, term(name)])
    assert str(refusal.value) == (
        f'The layer "{TITLE}" is the layer {name} of its product, and the tool reads the layer HVHV.'
    )


def test_map_refuses_a_layer_that_is_not_of_a_gcov_product() -> None:
    with pytest.raises(LayerError, match="is not a layer received from one NISAR GCOV product"):
        backscatter_map([grid([1]), grid([1])], [PAIR, HV])


def test_map_refuses_a_layer_in_another_unit() -> None:
    with pytest.raises(LayerError) as refusal:
        backscatter_map([grid([1]), grid([1])], [HH, term("HVHV", unit="dB")])
    assert str(refusal.value) == f'The layer "{TITLE}" has the unit dB, and the tool reads the unit 1.'


def test_map_refuses_layers_on_different_grids() -> None:
    with pytest.raises(LayerError) as refusal:
        backscatter_map([grid([1, 2]), grid([1])], [HH, HV])
    assert str(refusal.value) == "The input layers do not have the same grid."


def test_map_refuses_layers_of_two_product_files() -> None:
    other = term("HVHV", GCOV_2_NOV, "2026-11-02")
    with pytest.raises(LayerError) as refusal:
        backscatter_map([grid([1]), grid([1])], [HH, other])
    assert str(refusal.value) == "The two layers are not of the same product file."


@pytest.mark.parametrize("value", [NAN, 0.0])
def test_map_refuses_layers_that_give_no_class_in_any_cell(value: float) -> None:
    with pytest.raises(LayerError) as refusal:
        backscatter_map([grid([value, value]), grid([value, value])], [HH, HV])
    assert str(refusal.value) == "The result would hold no value in any cell."


def test_arrays_and_descriptions_that_differ_in_number_are_a_fault_of_the_caller() -> None:
    with pytest.raises(ValueError, match="differ in number"):
        backscatter_map([grid([1])], [HH, HV])
