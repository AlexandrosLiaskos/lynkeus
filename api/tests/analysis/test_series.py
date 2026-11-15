# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""Tests of the tools of the kind Series."""

import math
import re
from collections.abc import Iterator
from datetime import date
from typing import Any

import numpy as np
import pytest
from numpy.typing import NDArray

from lynkeus.analysis import SERIES_TOOLS, TOOLS
from lynkeus.analysis.backscatter import backscatter_state
from lynkeus.analysis.displacement import displacement_series
from lynkeus.analysis.series import LEAST_LAYERS, backscatter_series, coherence_series
from lynkeus.layers import Area, Cell, LayerDescription, Point, Reference, SeriesDescription
from lynkeus.writing import LayerError

from .layers import COHERENCE, GCOV_2_NOV, GCOV_21_OCT, GUNW_9_21_OCT, grid, layer

NAN = float("nan")
INF = float("inf")

# The names of the buttons of the Analysis tab for the tools of the kind Series.
BUTTON = re.compile(r"(backscatter|coherence|displacement|soil-moisture)-series")

GCOV_9_OCT = "NISAR_L2_PR_GCOV_032_141_D_067_4005_DHDH_A_20261009T234330_20261009T234405_P05023_N_F_J_001"
GUNW_27_SEP_9_OCT = (
    "NISAR_L2_PR_GUNW_031_141_D_067_032_4000_SH_20260927T234330_20260927T234405_"
    "20261009T234330_20261009T234405_P05023_N_F_J_001"
)
GUNW_15_27_SEP = (
    "NISAR_L2_PR_GUNW_030_141_D_067_031_4000_SH_20260915T234330_20260915T234405_"
    "20260927T234330_20260927T234405_P05023_N_F_J_001"
)

FIRST = layer(GCOV_9_OCT, "2026-10-09")
SECOND = layer(GCOV_21_OCT, "2026-10-21")
THIRD = layer(GCOV_2_NOV, "2026-11-02")
PAIR_1 = layer(GUNW_15_27_SEP, "2026-09-15", "2026-09-27", layer=COHERENCE)
PAIR_2 = layer(GUNW_27_SEP_9_OCT, "2026-09-27", "2026-10-09", layer=COHERENCE)
PAIR_3 = layer(GUNW_9_21_OCT, "2026-10-09", "2026-10-21", layer=COHERENCE)
# The layers unwrappedPhase and connectedComponents of two pairs, which Surface displacement, Series reads.
PHASE_2 = (
    layer(
        GUNW_27_SEP_9_OCT,
        "2026-09-27",
        "2026-10-09",
        layer="unwrappedInterferogram/HH/unwrappedPhase",
        unit="rad",
        frequency=1239000000.0,
    ),
    layer(GUNW_27_SEP_9_OCT, "2026-09-27", "2026-10-09", layer="unwrappedInterferogram/HH/connectedComponents"),
)
PHASE_3 = (
    layer(
        GUNW_9_21_OCT,
        "2026-10-09",
        "2026-10-21",
        layer="unwrappedInterferogram/HH/unwrappedPhase",
        unit="rad",
        frequency=1239000000.0,
    ),
    layer(GUNW_9_21_OCT, "2026-10-09", "2026-10-21", layer="unwrappedInterferogram/HH/connectedComponents"),
)


def decibels(power: float) -> float:
    return 10 * math.log10(power)


def values_of(result: Any) -> list[Any]:
    """Return the dates, the value and the number of cells of every entry of a series."""
    return [(entry.dates, entry.value, entry.cells) for entry in result.entries]


# The list of tools


def test_every_series_tool_carries_the_name_of_its_button() -> None:
    for name in SERIES_TOOLS:
        assert BUTTON.fullmatch(name), name
    assert not set(SERIES_TOOLS) & set(TOOLS)


def test_the_series_tools_are_listed() -> None:
    assert SERIES_TOOLS["backscatter-series"] is backscatter_series
    assert SERIES_TOOLS["coherence-series"] is coherence_series
    assert SERIES_TOOLS["displacement-series"] is displacement_series


def test_result_of_every_series_tool_fits_a_series_description() -> None:
    power, coherence = grid([1, 10], [100, 1000]), grid([0.2, 0.4], [0.6, 0.8])
    phase, labels = grid([1, 2], [3, 4]), grid([1, 1], [1, 1])
    runs: dict[str, tuple[list[NDArray[np.float32]], list[LayerDescription]]] = {
        "backscatter-series": ([power, grid([2, 20], [200, 2000])], [SECOND, THIRD]),
        "coherence-series": ([coherence, grid([0.1, 0.2], [0.3, 0.4])], [PAIR_2, PAIR_3]),
        "displacement-series": ([phase, labels, phase, labels], [*PHASE_2, *PHASE_3]),
    }
    assert set(runs) == set(SERIES_TOOLS)
    for name, (arrays, layers) in runs.items():
        # Only Surface displacement, Series takes a point and a reference point, and it needs both.
        cells = ((0, 0), (1, 1)) if name == "displacement-series" else (None, None)
        result = SERIES_TOOLS[name](arrays, layers, *cells)
        place = Point(longitude=-71.0, latitude=42.8)
        cell = Cell(row=0, column=0, longitude=-71.0, latitude=42.8)
        description = SeriesDescription(
            id="series-1",
            title="A series",
            kind="series",
            quantity=result.quantity,
            unit=result.unit,
            reduction=result.reduction,
            range=result.range,
            point=place if cells[0] else None,
            cell=cell if cells[0] else None,
            reference=Reference(point=place, cell=cell) if cells[1] else None,
            area=Area(west=-71.2, south=42.6, east=-70.75, north=42.95),
            entries=result.entries,
            inputs=result.inputs,
            layer=result.layer,
            program="Lynkeus 0.1.0",
            method=result.method,
        )
        if name == "displacement-series":
            days = sorted({day for layer in layers for day in layer.dates})
            assert [entry.dates for entry in description.entries] == [(day,) for day in days]
        else:
            assert [entry.dates for entry in description.entries] == [layer.dates for layer in layers]


# Backscatter, Series


def test_backscatter_series_of_an_area_is_the_decibels_of_the_mean_power_of_each_date() -> None:
    result = backscatter_series([grid([1, 3], [NAN, 8]), grid([0.5, 0.5], [0.5, 0.5])], [SECOND, THIRD])
    assert values_of(result) == [
        ((date(2026, 10, 21),), pytest.approx(decibels(4), abs=1e-12), 3),
        ((date(2026, 11, 2),), pytest.approx(decibels(0.5), abs=1e-12), 4),
    ]
    assert result.inputs == (f"{GCOV_21_OCT}.h5", f"{GCOV_2_NOV}.h5")
    assert (result.layer, result.quantity, result.unit) == ("HHHH", "Radar backscatter gamma0", "dB")
    assert (result.reduction, result.range) == ("mean-power", None)
    assert "NISAR_GCOV_Time_Series_Example" in result.method


def test_backscatter_series_is_not_the_mean_of_the_decibels() -> None:
    result = backscatter_series([grid([1, 100]), grid([1, 1])], [SECOND, THIRD])
    assert result.entries[0].value == pytest.approx(decibels(50.5), abs=1e-12)
    assert result.entries[0].value != pytest.approx(10.0)


def test_backscatter_series_gives_the_earliest_date_first_whatever_the_order_of_the_layers() -> None:
    result = backscatter_series([grid([4]), grid([1]), grid([2])], [THIRD, FIRST, SECOND])
    assert values_of(result) == [
        ((date(2026, 10, 9),), pytest.approx(decibels(1), abs=1e-12), 1),
        ((date(2026, 10, 21),), pytest.approx(decibels(2), abs=1e-12), 1),
        ((date(2026, 11, 2),), pytest.approx(decibels(4), abs=1e-12), 1),
    ]
    assert result.inputs == (f"{GCOV_9_OCT}.h5", f"{GCOV_21_OCT}.h5", f"{GCOV_2_NOV}.h5")


def test_backscatter_series_uses_only_the_cells_that_hold_a_finite_value_above_zero() -> None:
    result = backscatter_series([grid([0, -1, INF], [NAN, 2, 6]), grid([NAN, NAN, NAN], [0, -2, INF])], [SECOND, THIRD])
    assert values_of(result) == [
        ((date(2026, 10, 21),), pytest.approx(decibels(4), abs=1e-12), 2),
        ((date(2026, 11, 2),), None, 0),
    ]


def test_backscatter_series_at_a_point_is_the_value_of_the_cell_on_each_date() -> None:
    arrays = [grid([1, 2], [3, 4]), grid([10, 20], [NAN, 40])]
    result = backscatter_series(arrays, [SECOND, THIRD], (1, 0))
    assert values_of(result) == [
        ((date(2026, 10, 21),), pytest.approx(decibels(3), abs=1e-12), 1),
        ((date(2026, 11, 2),), None, 0),
    ]
    other = backscatter_series(arrays, [SECOND, THIRD], (0, 1))
    assert [entry.value for entry in other.entries] == [pytest.approx(decibels(2)), pytest.approx(decibels(20))]


def test_backscatter_series_at_a_point_agrees_with_the_tool_one_date() -> None:
    rng = np.random.default_rng(7)
    power = rng.gamma(2.0, 0.1, (4, 5)).astype(np.float32)
    state = backscatter_state([power], [SECOND]).values
    result = backscatter_series([power, power * 3], [SECOND, THIRD], (2, 3))
    assert result.entries[0].value == pytest.approx(float(state[2, 3]), abs=1e-5)


def test_backscatter_series_takes_the_arrays_one_after_another() -> None:
    alive = []

    def arrays() -> Iterator[NDArray[np.float32]]:
        for power in (1, 2, 4):
            alive.append(power)
            yield grid([power, power])

    result = backscatter_series(arrays(), [FIRST, SECOND, THIRD])
    assert alive == [1, 2, 4]
    assert [entry.cells for entry in result.entries] == [2, 2, 2]


@pytest.mark.parametrize("name", ["HHHH", "HVHV", "VHVH", "VVVV", "RHRH", "RVRV"])
def test_backscatter_series_reads_each_diagonal_term(name: str) -> None:
    layers = [layer(GCOV_21_OCT, "2026-10-21", layer=name), layer(GCOV_2_NOV, "2026-11-02", layer=name)]
    assert backscatter_series([grid([1]), grid([2])], layers).layer == name


@pytest.mark.parametrize("name", ["mask", "numberOfLooks", "rtcGammaToSigmaFactor", "HHHV", "hhhh"])
def test_backscatter_series_refuses_a_layer_that_is_not_a_diagonal_term(name: str) -> None:
    other = layer(GCOV_2_NOV, "2026-11-02", layer=name)
    with pytest.raises(LayerError) as refusal:
        backscatter_series([grid([1]), grid([2])], [SECOND, other])
    assert str(refusal.value) == (
        f'The layer "Layer of 2026-11-02" is the layer {name} of its product, and the tool reads '
        "a diagonal covariance term (HHHH, HVHV, VHVH, VVVV, RHRH or RVRV)."
    )


def refusal_of(layers: list[LayerDescription], arrays: list[Any] | None = None, **more: Any) -> str:
    with pytest.raises(LayerError) as refusal:
        backscatter_series(arrays or [grid([1]) for _ in layers], layers, **more)
    return str(refusal.value)


def test_backscatter_series_needs_two_layers() -> None:
    assert LEAST_LAYERS == 2
    assert refusal_of([SECOND]) == "A series needs at least 2 layers, and it has 1."
    assert refusal_of([]) == "A series needs at least 2 layers, and it has 0."


def test_backscatter_series_refuses_layers_of_other_products_units_and_numbers_of_dates() -> None:
    assert refusal_of([SECOND, PAIR_3]) == (
        'The layer "Layer of 2026-10-09 and 2026-10-21" is not a layer received from one NISAR GCOV product.'
    )
    result = layer(GCOV_2_NOV, "2026-11-02", kind="result", layer=None, method="A method")
    assert refusal_of([SECOND, result]) == (
        'The layer "Layer of 2026-11-02" is not a layer received from one NISAR GCOV product.'
    )
    assert refusal_of([SECOND, layer(GCOV_2_NOV, "2026-11-02", unit="dB")]) == (
        'The layer "Layer of 2026-11-02" has the unit dB, and the tool reads the unit 1.'
    )
    assert refusal_of([SECOND, layer(GCOV_2_NOV, "2026-11-02", "2026-11-03")]) == (
        'The number of dates of the layer "Layer of 2026-11-02 and 2026-11-03" must be 1, and it is 2.'
    )
    assert refusal_of([SECOND, layer(GCOV_2_NOV, "2026-11-02", layer=None)]) == (
        'The layer "Layer of 2026-11-02" does not record which layer of its product it is; '
        "receive it again with Get layer."
    )


def test_backscatter_series_refuses_different_terms() -> None:
    assert refusal_of([SECOND, layer(GCOV_2_NOV, "2026-11-02", layer="HVHV")]) == (
        "The layers are not the same layer of their products: "
        '"Layer of 2026-10-21" is HHHH and "Layer of 2026-11-02" is HVHV.'
    )


@pytest.mark.parametrize(
    "other",
    [
        GCOV_2_NOV.replace("NISAR_L2", "NISAR_S2"),
        GCOV_2_NOV.replace("_141_D_", "_142_D_"),
        GCOV_2_NOV.replace("_141_D_", "_141_A_"),
        GCOV_2_NOV.replace("_D_067_", "_D_068_"),
    ],
)
def test_backscatter_series_refuses_another_instrument_track_direction_or_frame(other: str) -> None:
    assert refusal_of([SECOND, layer(other, "2026-11-02")]) == (
        "The layers are not of the same instrument, track, direction and frame."
    )


def test_backscatter_series_accepts_minor_releases_and_refuses_another_major_release() -> None:
    # P05023 and P05036 are the releases of the provisional and of the validated products of 2026: the same
    # environment and major release, another minor release and patch.
    assert backscatter_series([grid([1]), grid([2])], [FIRST, SECOND]).inputs[0].endswith("P05023_N_F_J_001.h5")
    for release in ("P06000", "P04036", "R05036"):
        other = layer(GCOV_2_NOV.replace("P05036", release), "2026-11-02")
        assert refusal_of([SECOND, other]) == (
            "The layers are not of the same major release of the processing software: "
            f'"Layer of 2026-10-21" is of the release P05036 and "Layer of 2026-11-02" of {release}.'
        )


def test_backscatter_series_refuses_a_product_file_without_a_release_in_its_name() -> None:
    short = layer("NISAR_L2_PR_GCOV_034_141_D_067_4005_DHDH_A_20261102T234330_20261102T234405", "2026-11-02")
    assert refusal_of([SECOND, short]) == (
        'The name of the product file of the layer "Layer of 2026-11-02" does not hold the release of the '
        "processing software."
    )


def test_backscatter_series_refuses_two_layers_of_one_date() -> None:
    again = layer(GCOV_21_OCT, "2026-10-21", title="The same date again")
    assert refusal_of([SECOND, THIRD, again]) == (
        'The layers "Layer of 2026-10-21" and "The same date again" have the same dates.'
    )


def test_backscatter_series_refuses_grids_of_different_sizes() -> None:
    assert refusal_of([SECOND, THIRD], [grid([1, 2]), grid([1, 2, 3])]) == "The input layers do not have the same grid."


def test_backscatter_series_refuses_layers_without_any_value() -> None:
    empty = [grid([NAN, 0]), grid([-1, NAN])]
    assert refusal_of([SECOND, THIRD], empty) == "No layer of the series holds a value in any cell."
    assert refusal_of([SECOND, THIRD], [grid([NAN, 1]), grid([0, 1])], cell=(0, 0)) == (
        "No layer of the series holds a value at the point."
    )


def test_faults_of_the_caller_are_not_refusals_for_the_visitor() -> None:
    with pytest.raises(ValueError, match=r"shorter|longer"):
        backscatter_series([grid([1])], [SECOND, THIRD])
    with pytest.raises(ValueError, match=r"shorter|longer"):
        backscatter_series([grid([1]), grid([1]), grid([1])], [SECOND, THIRD])
    with pytest.raises(ValueError, match="two-dimensional 32-bit"):
        wide: Any = [np.ones((1, 2)), np.ones((1, 2))]
        backscatter_series(wide, [SECOND, THIRD])
    with pytest.raises(ValueError, match="two-dimensional 32-bit"):
        backscatter_series([np.ones(2, np.float32), np.ones(2, np.float32)], [SECOND, THIRD])
    for cell in [(1, 0), (0, 2), (-1, 0)]:
        with pytest.raises(ValueError, match="outside the grid"):
            backscatter_series([grid([1, 2]), grid([1, 2])], [SECOND, THIRD], cell)


# Coherence, Series


def test_coherence_series_of_an_area_is_the_mean_of_each_pair() -> None:
    arrays = [grid([0.5, 0.25], [NAN, 0.75]), grid([0, 1], [0.5, 0.5]), grid([NAN, NAN], [NAN, NAN])]
    result = coherence_series(arrays, [PAIR_3, PAIR_1, PAIR_2])
    assert values_of(result) == [
        ((date(2026, 9, 15), date(2026, 9, 27)), pytest.approx(0.5, abs=1e-15), 4),
        ((date(2026, 9, 27), date(2026, 10, 9)), None, 0),
        ((date(2026, 10, 9), date(2026, 10, 21)), pytest.approx(0.5, abs=1e-15), 3),
    ]
    assert result.inputs == (f"{GUNW_15_27_SEP}.h5", f"{GUNW_27_SEP_9_OCT}.h5", f"{GUNW_9_21_OCT}.h5")
    assert (result.layer, result.quantity, result.unit) == (COHERENCE, "Interferometric coherence (magnitude)", "1")
    assert (result.reduction, result.range) == ("mean", (0.0, 1.0))
    assert "D-102272" in result.method


def test_coherence_series_at_a_point_is_the_value_of_the_cell_of_each_pair() -> None:
    arrays = [grid([0.5, 0.25], [NAN, 0.75]), grid([0.125, 1], [0.5, 0.5])]
    result = coherence_series(arrays, [PAIR_2, PAIR_3], (0, 0))
    assert values_of(result) == [
        ((date(2026, 9, 27), date(2026, 10, 9)), 0.5, 1),
        ((date(2026, 10, 9), date(2026, 10, 21)), 0.125, 1),
    ]
    assert values_of(coherence_series(arrays, [PAIR_2, PAIR_3], (1, 0)))[0][1:] == (None, 0)


@pytest.mark.parametrize(
    "name",
    [
        "unwrappedInterferogram/HH/coherenceMagnitude",
        "wrappedInterferogram/HH/coherenceMagnitude",
        "unwrappedInterferogram/VV/coherenceMagnitude",
        "wrappedInterferogram/VV/coherenceMagnitude",
    ],
)
def test_coherence_series_reads_the_coherence_of_each_group_and_channel(name: str) -> None:
    layers = [PAIR_2.model_copy(update={"layer": name}), PAIR_3.model_copy(update={"layer": name})]
    assert coherence_series([grid([0.25]), grid([0.5])], layers).layer == name


def coherence_refusal(layers: list[LayerDescription], arrays: list[Any] | None = None, **more: Any) -> str:
    with pytest.raises(LayerError) as refusal:
        coherence_series(arrays or [grid([0.5]) for _ in layers], layers, **more)
    return str(refusal.value)


def test_coherence_series_refuses_what_it_does_not_read() -> None:
    assert coherence_refusal([PAIR_3]) == "A series needs at least 2 layers, and it has 1."
    assert coherence_refusal([PAIR_3, SECOND]) == (
        'The layer "Layer of 2026-10-21" is not a layer received from one NISAR GUNW product.'
    )
    components = PAIR_2.model_copy(update={"layer": "unwrappedInterferogram/HH/connectedComponents"})
    assert coherence_refusal([PAIR_3, components]) == (
        'The layer "Layer of 2026-09-27 and 2026-10-09" is the layer unwrappedInterferogram/HH/connectedComponents '
        "of its product, and the tool reads the layer coherenceMagnitude."
    )
    coarse = PAIR_2.model_copy(update={"layer": "unwrappedInterferogram/HH/coherenceMagnitude"})
    assert coherence_refusal([PAIR_3, coarse]) == (
        "The layers are not the same layer of their products: "
        '"Layer of 2026-10-09 and 2026-10-21" is wrappedInterferogram/HH/coherenceMagnitude and '
        '"Layer of 2026-09-27 and 2026-10-09" is unwrappedInterferogram/HH/coherenceMagnitude.'
    )
    other_frame = layer(GUNW_27_SEP_9_OCT.replace("_D_067_", "_D_068_"), "2026-09-27", "2026-10-09", layer=COHERENCE)
    assert coherence_refusal([PAIR_3, other_frame]) == (
        "The layers are not of the same instrument, track, direction and frame."
    )
    other_release = layer(GUNW_27_SEP_9_OCT.replace("P05023", "P04023"), "2026-09-27", "2026-10-09", layer=COHERENCE)
    assert coherence_refusal([PAIR_3, other_release]).startswith(
        "The layers are not of the same major release of the processing software:"
    )
    again = PAIR_3.model_copy(update={"title": "The same pair again"})
    assert coherence_refusal([PAIR_3, PAIR_2, again]) == (
        'The layers "Layer of 2026-10-09 and 2026-10-21" and "The same pair again" have the same dates.'
    )


def test_coherence_series_accepts_two_pairs_that_share_one_date() -> None:
    result = coherence_series([grid([0.25]), grid([0.5])], [PAIR_2, PAIR_3])
    assert [entry.dates[1] for entry in result.entries] == [date(2026, 10, 9), date(2026, 10, 21)]


@pytest.mark.parametrize("wrong", [grid([0.5, 1.5]), grid([-0.5, 0.5]), grid([0.5, INF])])
def test_coherence_series_refuses_a_layer_with_a_value_outside_0_to_1(wrong: Any) -> None:
    for cell in (None, (0, 0)):
        assert coherence_refusal([PAIR_2, PAIR_3], [grid([0.5, 0.5]), wrong], cell=cell) == (
            'The layer "Layer of 2026-10-09 and 2026-10-21" holds values outside 0 to 1, '
            "so it is not a coherence magnitude."
        )


def test_coherence_series_refuses_layers_without_any_value_and_grids_of_different_sizes() -> None:
    assert coherence_refusal([PAIR_2, PAIR_3], [grid([NAN]), grid([NAN])]) == (
        "No layer of the series holds a value in any cell."
    )
    assert coherence_refusal([PAIR_2, PAIR_3], [grid([NAN, 1]), grid([NAN, 0])], cell=(0, 0)) == (
        "No layer of the series holds a value at the point."
    )
    assert coherence_refusal([PAIR_2, PAIR_3], [grid([0.5]), grid([0.5, 0.5])]) == (
        "The input layers do not have the same grid."
    )


def test_mean_of_a_large_area_is_computed_in_64_bit_numbers() -> None:
    # In 32-bit numbers the running sum of sixteen million cells of 0.1 and one cell of 1 loses the last cell.
    coherence = np.full((4000, 4200), 0.1, np.float32)
    coherence[0, 0] = 1.0
    result = coherence_series([coherence, coherence], [PAIR_2, PAIR_3])
    expected = (float(np.float32(0.1)) * (coherence.size - 1) + 1.0) / coherence.size
    assert result.entries[0].value == pytest.approx(expected, rel=1e-12)
    assert result.entries[0].cells == coherence.size
