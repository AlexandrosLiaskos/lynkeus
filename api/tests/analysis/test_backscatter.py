"""Tests of the tools of the group Backscatter."""

from typing import Any

import numpy as np
import pytest

from lynkeus.analysis.backscatter import backscatter_change, backscatter_state
from lynkeus.writing import LayerError

from .layers import EARLIER, GCOV_2_NOV, LATER, grid, layer

NAN = float("nan")


def test_state_is_ten_times_the_logarithm_of_the_power() -> None:
    power = grid([1, 10, 100], [0.1, NAN, 0], [-1, 0.001, 1000])
    before = power.copy()
    result = backscatter_state([power], [EARLIER])
    np.testing.assert_allclose(result.values, grid([0, 10, 20], [-10, NAN, NAN], [NAN, -30, 30]), rtol=1e-6)
    assert result.values.dtype == np.float32
    assert (result.quantity, result.unit, result.colours) == ("Radar backscatter gamma0", "dB", "grey")
    assert "D-102274" in result.method
    np.testing.assert_array_equal(power, before)


def test_state_legend_runs_between_the_5th_and_the_95th_percentile() -> None:
    # The six values are -30, -10, 0, 10, 20 and 30 dB. The percentiles lie at the positions 0.25 and 4.75.
    result = backscatter_state([grid([1, 10, 100], [0.1, NAN, 0], [-1, 0.001, 1000])], [EARLIER])
    assert result.range == pytest.approx((-25.0, 27.5), abs=1e-5)


def test_state_gives_no_data_to_an_infinite_power() -> None:
    result = backscatter_state([grid([float("inf"), 1, 10])], [EARLIER])
    np.testing.assert_array_equal(result.values, grid([NAN, 0, 10]))


@pytest.mark.parametrize(
    ("power", "message"),
    [
        (grid([NAN, 0], [-1, NAN]), "no value in any cell"),
        (grid([2, 2], [2, NAN]), "too alike"),
    ],
)
def test_state_without_a_legend_is_refused(power: Any, message: str) -> None:
    with pytest.raises(LayerError, match=message):
        backscatter_state([power], [EARLIER])


def test_state_takes_one_layer() -> None:
    with pytest.raises(LayerError, match="must be 1, and it is 2"):
        backscatter_state([grid([1]), grid([1])], [EARLIER, LATER])


def test_change_is_the_ratio_of_the_later_to_the_earlier_date_in_decibels() -> None:
    earlier = grid([1, 2, 10], [1, NAN, 0], [5, 1, 4], [-2, 0, -1])
    later = grid([10, 1, 10], [0.1, 5, 3], [-5, NAN, 0], [-4, 0, 1])
    before = earlier.copy(), later.copy()
    result = backscatter_change([earlier, later], [EARLIER, LATER])
    halving = -10 * np.log10(2)
    np.testing.assert_allclose(
        result.values, grid([10, halving, 0], [-10, NAN, NAN], [NAN, NAN, NAN], [NAN, NAN, NAN]), rtol=1e-6, atol=1e-7
    )
    assert result.values.dtype == np.float32
    assert (result.quantity, result.unit, result.colours) == ("Change of radar backscatter gamma0", "dB", "RdBu")
    assert "Rignot" in result.method
    np.testing.assert_array_equal(earlier, before[0])
    np.testing.assert_array_equal(later, before[1])


def test_change_legend_reaches_the_99th_percentile_of_the_absolute_values() -> None:
    # The changes are 0, -1, 2, -3, ... 100 dB, so the 99th percentile of their absolute values is 99 dB.
    steps = np.arange(101, dtype=np.float32)
    later = grid(list(10 ** (steps * (-1) ** steps / 10)))
    result = backscatter_change([np.ones_like(later), later], [EARLIER, LATER])
    assert result.range == pytest.approx((-99.0, 99.0), abs=1e-4)


def test_change_gives_no_data_to_a_ratio_beyond_32_bit_numbers_and_to_infinite_powers() -> None:
    infinite = float("inf")
    earlier = grid([1e-30, 1e30, infinite, infinite, 1, 1, 1])
    later = grid([1e30, 1e-30, infinite, 1, infinite, 10, 0.1])
    result = backscatter_change([earlier, later], [EARLIER, LATER])
    np.testing.assert_allclose(result.values, grid([NAN, NAN, NAN, NAN, NAN, 10, -10]), rtol=1e-6)


@pytest.mark.parametrize(
    ("layers", "message"),
    [
        ([LATER, EARLIER], "earlier date"),
        ([EARLIER, EARLIER], "earlier date"),
        ([EARLIER, layer(GCOV_2_NOV.replace("_141_", "_142_"), "2026-11-02")], "same track, direction and frame"),
        ([EARLIER, layer(GCOV_2_NOV.replace("_D_067_", "_A_067_"), "2026-11-02")], "same track, direction and frame"),
        ([EARLIER, layer(GCOV_2_NOV.replace("_D_067_", "_D_068_"), "2026-11-02")], "same track, direction and frame"),
    ],
)
def test_change_of_unlike_layers_is_refused(layers: Any, message: str) -> None:
    with pytest.raises(LayerError, match=message):
        backscatter_change([grid([1, 2]), grid([2, 1])], layers)


@pytest.mark.parametrize(
    ("earlier", "later", "message"),
    [
        (grid([1, NAN, 0]), grid([NAN, 1, 1]), "no value in any cell"),
        (grid([1, 2, 3]), grid([1, 2, 3]), "too alike"),
        (grid([1, 2, 3]), grid([1, 2]), "same grid"),
    ],
)
def test_change_without_a_legend_is_refused(earlier: Any, later: Any, message: str) -> None:
    with pytest.raises(LayerError, match=message):
        backscatter_change([earlier, later], [EARLIER, LATER])
