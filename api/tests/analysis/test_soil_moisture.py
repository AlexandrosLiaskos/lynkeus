"""Tests of the tools of the group Soil moisture."""

from typing import Any

import numpy as np
import pytest

from lynkeus.analysis.inputs import check_inputs
from lynkeus.analysis.soil_moisture import _LAYER, soil_moisture_change, soil_moisture_state
from lynkeus.layers import LayerDescription
from lynkeus.writing import LayerError

from .layers import EARLIER, grid, layer

NAN = float("nan")

# The names of two SME2 product files of the pilot area, track 141, frame 67, descending.
SME2_27_SEP = "NISAR_L3_PR_SME2_031_141_D_067_4005_DHDH_A_20260927T234330_20260927T234405_P05023_N_F_J_001"
SME2_9_OCT = "NISAR_L3_PR_SME2_032_141_D_067_4005_DHDH_A_20261009T234330_20261009T234405_P05023_N_F_J_001"


def moisture(granule: str, day: str, **changes: Any) -> LayerDescription:
    """Describe a layer ``soilMoisture`` received from an SME2 product file, unless ``changes`` say otherwise."""
    return layer(granule, day, **{"layer": "soilMoisture", "unit": "m3 m-3", **changes})


FIRST = moisture(SME2_27_SEP, "2026-09-27")
SECOND = moisture(SME2_9_OCT, "2026-10-09")


def test_name_of_an_sme2_product_file_gives_its_acquisition() -> None:
    (acquisition,) = check_inputs(
        [grid([0.2])], [SECOND], count=1, product="SME2", names=_LAYER, reads="", dates=1, unit="m3 m-3"
    )
    assert acquisition == ("L", 141, "D", 67)


def test_state_is_the_layer_of_the_product_unchanged() -> None:
    values = grid([0.02, 0.25, 0.6], [NAN, 0, 1])
    result = soil_moisture_state([values], [SECOND])
    assert result.values is values
    assert (result.quantity, result.unit) == ("Soil moisture", "m3 m-3")
    assert (result.range, result.colours) == ((0.02, 0.6), "YlGnBu")
    assert "D-107677" in result.method
    assert result.reduction == "mean"
    assert result.ends is None


@pytest.mark.parametrize(
    ("values", "message"),
    [
        (grid([NAN, NAN]), '"Layer of 2026-10-09" holds no value in any cell'),
        (grid([0.25, 1.5]), "outside 0 to 1, so it is not a volumetric soil moisture"),
        (grid([-0.25, 0.25]), "outside 0 to 1"),
        (grid([-9999, 0.25]), "outside 0 to 1"),
        (grid([0.25, float("inf")]), "outside 0 to 1"),
    ],
)
def test_state_of_a_layer_that_is_not_a_soil_moisture_is_refused(values: Any, message: str) -> None:
    with pytest.raises(LayerError, match=message):
        soil_moisture_state([values], [SECOND])


def test_state_takes_one_layer() -> None:
    with pytest.raises(LayerError, match="must be 1, and it is 2"):
        soil_moisture_state([grid([0.2]), grid([0.3])], [FIRST, SECOND])


def test_state_and_change_read_a_layer_of_an_sme2_product() -> None:
    sentence = 'The layer "Layer of 2026-10-21" is not a layer received from one NISAR SME2 product.'
    with pytest.raises(LayerError) as refusal:
        soil_moisture_state([grid([0.2])], [EARLIER])
    assert str(refusal.value) == sentence
    with pytest.raises(LayerError) as refusal:
        soil_moisture_change([grid([0.2]), grid([0.3])], [EARLIER, SECOND])
    assert str(refusal.value) == sentence
    result = moisture(SME2_9_OCT, "2026-10-09", kind="result", layer=None, method="A method")
    with pytest.raises(LayerError, match="not a layer received from one NISAR SME2 product"):
        soil_moisture_state([grid([0.2])], [result])


@pytest.mark.parametrize(
    "name",
    [
        "soilMoistureUncertainty",
        "retrievalQualityFlag",
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
    with pytest.raises(LayerError) as refusal:
        soil_moisture_state([grid([0.2, 0.3])], [other])
    assert str(refusal.value) == sentence
    with pytest.raises(LayerError) as refusal:
        soil_moisture_change([grid([0.2, 0.3]), grid([0.3, 0.2])], [FIRST, other])
    assert str(refusal.value) == sentence


def test_state_and_change_refuse_a_layer_stored_without_the_name_of_its_layer() -> None:
    sentence = (
        'The layer "Layer of 2026-10-09" does not record which layer of its product it is; '
        "receive it again with Get layer."
    )
    stored = moisture(SME2_9_OCT, "2026-10-09", layer=None)
    with pytest.raises(LayerError) as refusal:
        soil_moisture_state([grid([0.2, 0.3])], [stored])
    assert str(refusal.value) == sentence
    with pytest.raises(LayerError) as refusal:
        soil_moisture_change([grid([0.2, 0.3]), grid([0.3, 0.2])], [FIRST, stored])
    assert str(refusal.value) == sentence


@pytest.mark.parametrize("unit", ["1", "meter^3/meter^3", "m3/m3", "%"])
def test_state_and_change_refuse_a_layer_with_another_unit(unit: str) -> None:
    sentence = f'The layer "Layer of 2026-10-09" has the unit {unit}, and the tool reads the unit m3 m-3.'
    other = moisture(SME2_9_OCT, "2026-10-09", unit=unit)
    with pytest.raises(LayerError) as refusal:
        soil_moisture_state([grid([0.2, 0.3])], [other])
    assert str(refusal.value) == sentence
    with pytest.raises(LayerError) as refusal:
        soil_moisture_change([grid([0.2, 0.3]), grid([0.3, 0.2])], [FIRST, other])
    assert str(refusal.value) == sentence


def test_change_is_the_later_date_minus_the_earlier() -> None:
    earlier = grid([0.25, 0.5, 0.125], [0.25, NAN, 0.5], [0, 1, NAN])
    later = grid([0.5, 0.25, 0.125], [NAN, 0.25, 0.625], [1, 0, NAN])
    before = earlier.copy(), later.copy()
    result = soil_moisture_change([earlier, later], [FIRST, SECOND])
    np.testing.assert_array_equal(result.values, grid([0.25, -0.25, 0], [NAN, NAN, 0.125], [1, -1, NAN]))
    assert result.values.dtype == np.float32
    assert (result.quantity, result.unit, result.colours) == ("Change of soil moisture", "m3 m-3", "RdBu")
    assert "Singh" in result.method
    assert result.reduction == "mean"
    assert result.ends == ("decrease", "increase")
    np.testing.assert_array_equal(earlier, before[0])
    np.testing.assert_array_equal(later, before[1])


def test_change_legend_reaches_the_99th_percentile_of_the_absolute_values() -> None:
    # The changes are 0, -1/256, 2/256, -3/256, ... 100/256, so the 99th percentile of their absolute values is 99/256.
    steps = np.arange(101, dtype=np.float32)
    later = grid(list(steps / 256))
    earlier = grid(list(np.where(steps % 2 == 1, steps / 128, 0)))
    result = soil_moisture_change([earlier, later], [FIRST, SECOND])
    assert result.range == (-99 / 256, 99 / 256)


@pytest.mark.parametrize(
    ("layers", "message"),
    [
        ([SECOND, FIRST], "earlier date"),
        ([FIRST, FIRST], "earlier date"),
        ([FIRST, moisture(SME2_9_OCT.replace("NISAR_L3_", "NISAR_S3_"), "2026-10-09")], "same instrument, track, dir"),
        ([FIRST, moisture(SME2_9_OCT.replace("_141_", "_069_"), "2026-10-09")], "same instrument, track, direction"),
        ([FIRST, moisture(SME2_9_OCT.replace("_D_067_", "_A_067_"), "2026-10-09")], "track, direction and frame"),
        ([FIRST, moisture(SME2_9_OCT.replace("_D_067_", "_D_066_"), "2026-10-09")], "track, direction and frame"),
        # Another acquisition is reported before a wrong order of the dates.
        ([moisture(SME2_9_OCT.replace("_141_", "_069_"), "2026-10-09"), FIRST], "same instrument, track, direction"),
    ],
)
def test_change_of_unlike_layers_is_refused(layers: Any, message: str) -> None:
    with pytest.raises(LayerError, match=message):
        soil_moisture_change([grid([0.2, 0.3]), grid([0.3, 0.2])], layers)


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
        soil_moisture_change([earlier, later], [FIRST, SECOND])


def test_change_takes_two_layers() -> None:
    with pytest.raises(LayerError, match="must be 2, and it is 1"):
        soil_moisture_change([grid([0.2])], [FIRST])


def test_result_of_each_tool_fits_a_layer_description_and_the_grid_of_its_inputs() -> None:
    first, second = grid([0.125, 0.25], [0.375, 0.5]), grid([0.25, 0.125], [0.5, 0.375])
    runs = [
        (soil_moisture_state, [second], [SECOND]),
        (soil_moisture_change, [first, second], [FIRST, SECOND]),
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
        }
        assert LayerDescription.model_validate(description).range == result.range
