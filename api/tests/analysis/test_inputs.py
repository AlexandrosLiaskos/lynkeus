"""Tests of the checks that every analysis tool makes on its input layers."""

import re
from typing import Any

import numpy as np
import pytest

from lynkeus.analysis.inputs import Acquisition, check_inputs
from lynkeus.writing import LayerError

from .layers import COHERENCE, EARLIER, GCOV_21_OCT, GUNW_9_21_OCT, LATER, PAIR, grid, layer

POWER = grid([1, 2], [3, 4])
TERM = re.compile("HHHH|HVHV")
PAIRS = re.compile(re.escape(COHERENCE))


def check_terms(arrays: Any, layers: Any, count: int = 2) -> Any:
    """Check layers as a tool that reads the terms ``HHHH`` and ``HVHV`` of GCOV products."""
    return check_inputs(arrays, layers, count=count, product="GCOV", names=TERM, reads="the term HHHH or HVHV", dates=1)


def check_pair(arrays: Any, layers: Any) -> Any:
    """Check layers as a tool that reads the coherence of one GUNW product."""
    return check_inputs(arrays, layers, count=1, product="GUNW", names=PAIRS, reads="the coherence", dates=2)


def test_acquisition_is_read_from_the_name_of_the_product_file() -> None:
    assert check_terms([POWER, POWER], [EARLIER, LATER]) == (
        Acquisition("L", 141, "D", 67),
        Acquisition("L", 141, "D", 67),
    )
    assert check_pair([POWER], [PAIR]) == (Acquisition("L", 141, "D", 67),)


@pytest.mark.parametrize(
    ("name", "instrument"),
    [
        (GCOV_21_OCT, "L"),
        (GCOV_21_OCT.replace("NISAR_L2_PR_", "NISAR_L2_UR_"), "L"),
        (GCOV_21_OCT.replace("NISAR_L2_PR_", "NISAR_L2_OD_"), "L"),
        (GCOV_21_OCT.replace("NISAR_L2_", "NISAR_S2_"), "S"),
    ],
)
def test_names_that_the_naming_convention_allows_are_read(name: str, instrument: str) -> None:
    layers = [layer(name, "2026-10-21", inputs=[name])]
    assert check_terms([POWER], layers, count=1) == (Acquisition(instrument, 141, "D", 67),)


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
        (
            [POWER, POWER],
            [EARLIER, layer(GCOV_21_OCT, "2026-11-02", kind="result", layer=None, method="Method")],
            "one NISAR GCOV",
        ),
        (
            [POWER, POWER],
            [EARLIER, layer(GCOV_21_OCT, "2026-11-02", layer=None)],
            "does not record which layer of its product it is; receive it again with Get layer",
        ),
        (
            [POWER, POWER],
            [EARLIER, layer(GCOV_21_OCT, "2026-11-02", layer="mask")],
            "is the layer mask of its product, and the tool reads the term HHHH or HVHV",
        ),
        ([POWER, POWER], [EARLIER, layer(GCOV_21_OCT, "2026-11-02", layer="HHHHH")], "is the layer HHHHH of its"),
        ([POWER, POWER], [EARLIER, layer(GCOV_21_OCT, "2026-11-02", layer="hhhh")], "is the layer hhhh of its"),
        ([POWER, POWER], [EARLIER, layer(GCOV_21_OCT, "2026-11-02", layer="mask", unit="dB")], "is the layer mask"),
        ([POWER, POWER], [EARLIER, layer(GCOV_21_OCT, "2026-11-02", unit="dB")], "has the unit dB"),
        ([POWER, POWER], [EARLIER, layer(GCOV_21_OCT, "2026-10-21", "2026-11-02")], "must be 1, and it is 2"),
    ],
)
def test_wrong_layers_are_refused(arrays: Any, layers: Any, message: str) -> None:
    with pytest.raises(LayerError, match=message):
        check_terms(arrays, layers)


def test_refusal_names_the_layer_by_its_title_in_one_sentence() -> None:
    stored = layer(GCOV_21_OCT, "2026-10-21", layer=None)
    with pytest.raises(LayerError) as refusal:
        check_terms([POWER], [stored], count=1)
    assert str(refusal.value) == (
        'The layer "Layer of 2026-10-21" does not record which layer of its product it is; '
        "receive it again with Get layer."
    )
    looks = layer(GCOV_21_OCT, "2026-10-21", layer="numberOfLooks")
    with pytest.raises(LayerError) as refusal:
        check_terms([POWER], [looks], count=1)
    assert str(refusal.value) == (
        'The layer "Layer of 2026-10-21" is the layer numberOfLooks of its product, '
        "and the tool reads the term HHHH or HVHV."
    )


def test_layer_of_another_product_type_is_refused() -> None:
    with pytest.raises(LayerError, match="one NISAR GUNW product"):
        check_pair([POWER], [EARLIER])
    with pytest.raises(LayerError, match="one NISAR GCOV product"):
        check_terms([POWER], [layer(GUNW_9_21_OCT, "2026-10-21")], count=1)


def test_unit_that_the_tool_names_is_required() -> None:
    moisture = re.compile("soilMoisture")
    wet = layer(GCOV_21_OCT, "2026-10-21", layer="soilMoisture", unit="m3 m-3")

    def check(layers: Any) -> Any:
        return check_inputs(
            [POWER], layers, count=1, product="GCOV", names=moisture, reads="the soil moisture", dates=1, unit="m3 m-3"
        )

    assert check([wet]) == (Acquisition("L", 141, "D", 67),)
    with pytest.raises(LayerError) as refusal:
        check([layer(GCOV_21_OCT, "2026-10-21", layer="soilMoisture")])
    assert str(refusal.value) == 'The layer "Layer of 2026-10-21" has the unit 1, and the tool reads the unit m3 m-3.'


def test_pair_with_one_date_is_refused() -> None:
    with pytest.raises(LayerError, match="must be 2, and it is 1"):
        check_pair([POWER], [layer(GUNW_9_21_OCT, "2026-10-21", layer=COHERENCE)])


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
        check_terms(arrays, [EARLIER, LATER])
    assert not isinstance(fault.value, LayerError)
