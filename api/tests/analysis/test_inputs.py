"""Tests of the checks that every analysis tool makes on its input layers."""

from typing import Any

import numpy as np
import pytest

from lynkeus.analysis.inputs import Acquisition, check_inputs
from lynkeus.writing import LayerError

from .layers import EARLIER, GCOV_21_OCT, GUNW_9_21_OCT, LATER, PAIR, grid, layer

POWER = grid([1, 2], [3, 4])


def test_acquisition_is_read_from_the_name_of_the_product_file() -> None:
    assert check_inputs([POWER, POWER], [EARLIER, LATER], count=2, product="GCOV", dates=1) == (
        Acquisition(141, "D", 67),
        Acquisition(141, "D", 67),
    )
    assert check_inputs([POWER], [PAIR], count=1, product="GUNW", dates=2) == (Acquisition(141, "D", 67),)


@pytest.mark.parametrize(
    "name",
    [
        GCOV_21_OCT,
        GCOV_21_OCT.replace("NISAR_L2_PR_", "NISAR_L2_UR_"),
        GCOV_21_OCT.replace("NISAR_L2_PR_", "NISAR_L2_OD_"),
        GCOV_21_OCT.replace("NISAR_L2_", "NISAR_S2_"),
    ],
)
def test_names_that_the_naming_convention_allows_are_read(name: str) -> None:
    layers = [layer(name, "2026-10-21", inputs=[name])]
    assert check_inputs([POWER], layers, count=1, product="GCOV", dates=1) == (Acquisition(141, "D", 67),)


@pytest.mark.parametrize(
    ("arrays", "layers", "message"),
    [
        ([POWER], [EARLIER], "must be 2, and it is 1"),
        ([POWER, POWER, POWER], [EARLIER, LATER, LATER], "must be 2, and it is 3"),
        ([POWER, grid([1, 2])], [EARLIER, LATER], "same grid"),
        ([POWER, POWER], [EARLIER, PAIR], "one NISAR GCOV product"),
        ([POWER, POWER], [EARLIER, layer("product-file", "2026-11-02")], "one NISAR GCOV product"),
        ([POWER, POWER], [EARLIER, layer(f"folder/{GCOV_21_OCT}", "2026-11-02")], "one NISAR GCOV product"),
        (
            [POWER, POWER],
            [EARLIER, layer(GCOV_21_OCT, "2026-11-02", inputs=["a.h5", "b.h5"])],
            "one NISAR GCOV product",
        ),
        (
            [POWER, POWER],
            [EARLIER, layer(GCOV_21_OCT, "2026-11-02", inputs=[f"{GCOV_21_OCT}.h5", "b.h5"])],
            "one NISAR GCOV product",
        ),
        ([POWER, POWER], [EARLIER, layer(GCOV_21_OCT, "2026-11-02", kind="result", method="Method")], "one NISAR GCOV"),
        ([POWER, POWER], [EARLIER, layer(GCOV_21_OCT, "2026-11-02", unit="dB")], "has the unit dB"),
        ([POWER, POWER], [EARLIER, layer(GCOV_21_OCT, "2026-10-21", "2026-11-02")], "must be 1, and it is 2"),
    ],
)
def test_wrong_layers_are_refused(arrays: Any, layers: Any, message: str) -> None:
    with pytest.raises(LayerError, match=message):
        check_inputs(arrays, layers, count=2, product="GCOV", dates=1)


def test_layer_of_another_product_type_is_refused() -> None:
    with pytest.raises(LayerError, match="one NISAR GUNW product"):
        check_inputs([POWER], [EARLIER], count=1, product="GUNW", dates=2)
    with pytest.raises(LayerError, match="one NISAR GCOV product"):
        check_inputs([POWER], [layer(GUNW_9_21_OCT, "2026-10-21")], count=1, product="GCOV", dates=1)


def test_pair_with_one_date_is_refused() -> None:
    with pytest.raises(LayerError, match="must be 2, and it is 1"):
        check_inputs([POWER], [layer(GUNW_9_21_OCT, "2026-10-21")], count=1, product="GUNW", dates=2)


@pytest.mark.parametrize(
    ("arrays", "message"),
    [
        ([POWER], "differ in number"),
        ([POWER, POWER, POWER], "differ in number"),
        ([POWER, POWER.astype(np.float64)], "32-bit floating point"),
        ([POWER, POWER.astype(np.int32)], "32-bit floating point"),
        ([POWER, POWER[0]], "32-bit floating point"),
    ],
)
def test_fault_of_the_caller_is_not_a_refusal_for_the_visitor(arrays: Any, message: str) -> None:
    with pytest.raises(ValueError, match=message) as fault:
        check_inputs(arrays, [EARLIER, LATER], count=2, product="GCOV", dates=1)
    assert not isinstance(fault.value, LayerError)
