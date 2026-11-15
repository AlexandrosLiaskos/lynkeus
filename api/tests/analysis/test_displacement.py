"""Tests of the tools of the group Surface displacement."""

import math
from typing import Any

import numpy as np
import pytest

from lynkeus.analysis.displacement import SPEED_OF_LIGHT, displacement_state
from lynkeus.layers import LayerDescription
from lynkeus.writing import LayerError, legend_range

from .layers import EARLIER, GUNW_9_21_OCT, PAIR, grid, layer

NAN = float("nan")
PHASE = "unwrappedInterferogram/HH/unwrappedPhase"
COMPONENTS = "unwrappedInterferogram/HH/connectedComponents"
# The centre frequency that the ISO XML file of the product of the pilot area states, in hertz.
FREQUENCY = 1239000000.0
TITLE = "Layer of 2026-10-09 and 2026-10-21"


def pair(name: str, **changes: Any) -> LayerDescription:
    """Describe a layer of the pair of the pilot area."""
    return layer(GUNW_9_21_OCT, "2026-10-09", "2026-10-21", layer=name, **changes)


UNWRAPPED = pair(PHASE, unit="rad", frequency=FREQUENCY)
LABELS = pair(COMPONENTS)


def test_state_is_the_phase_times_minus_the_wavelength_over_four_pi() -> None:
    phase = grid([0, 2 * math.pi, -math.pi], [1, NAN, 3])
    components = grid([1, 1, 2], [1, 1, 1])
    result = displacement_state([phase, components], [UNWRAPPED, LABELS])
    wavelength = SPEED_OF_LIGHT / FREQUENCY
    assert wavelength == pytest.approx(0.241963, abs=1e-6)
    expected = [
        [0, -wavelength / 2, wavelength / 4],
        [-wavelength / (4 * math.pi), NAN, -3 * wavelength / (4 * math.pi)],
    ]
    assert result.values.dtype == np.float32
    assert np.allclose(result.values, expected, rtol=1e-6, atol=0, equal_nan=True)
    assert (result.quantity, result.unit) == ("Relative displacement along the line of sight", "m")
    assert result.colours == "RdBu"
    assert result.ends == ("away from the radar", "toward the radar")
    assert result.reduction == "mean"
    assert "D-95677" in result.method
    assert "D-102272" in result.method
    assert "not corrected for the ionosphere, the troposphere or the solid Earth tides" in result.method


def test_state_is_computed_in_32_bit_numbers_with_the_factor_as_one_number() -> None:
    phase = grid([0.1, -7.25, 123.456])
    result = displacement_state([phase, grid([1, 1, 1])], [UNWRAPPED, LABELS])
    factor = -(SPEED_OF_LIGHT / FREQUENCY) / (4 * math.pi)
    assert np.array_equal(result.values, phase * np.float32(factor))


def test_positive_phase_is_a_movement_away_from_the_radar() -> None:
    result = displacement_state([grid([1, -1]), grid([1, 1])], [UNWRAPPED, LABELS])
    assert result.values[0, 0] < 0 < result.values[0, 1]


def test_state_holds_no_value_where_the_phase_was_not_unwrapped_reliably() -> None:
    phase = grid([1, 2, 3, 4, NAN, float("inf")])
    components = grid([0, 1, NAN, 7, 1, 1])
    result = displacement_state([phase, components], [UNWRAPPED, LABELS])
    assert np.isnan(result.values).tolist() == [[True, False, True, False, True, True]]


def test_state_does_not_change_its_inputs() -> None:
    phase, components = grid([1, 2, 3]), grid([1, 0, 1])
    before = phase.copy(), components.copy()
    result = displacement_state([phase, components], [UNWRAPPED, LABELS])
    assert result.values is not phase
    assert np.array_equal(phase, before[0])
    assert np.array_equal(components, before[1])


def test_legend_runs_between_the_percentiles_of_a_layer_and_is_not_centred_on_zero() -> None:
    phase = grid([float(value) for value in range(100, 201)])
    result = displacement_state([phase, np.ones_like(phase)], [UNWRAPPED, LABELS])
    lowest, highest = (float(value) for value in np.percentile(result.values, (2, 98)))
    assert result.range == (lowest, highest)
    assert lowest < highest < 0
    assert result.range == legend_range(result.values, "percentiles")


def test_wavelength_follows_the_centre_frequency_of_the_layer() -> None:
    phase, components = grid([1, 2]), grid([1, 1])
    longer = displacement_state([phase, components], [pair(PHASE, unit="rad", frequency=1229000000.0), LABELS])
    shorter = displacement_state([phase, components], [pair(PHASE, unit="rad", frequency=1257500000.0), LABELS])
    assert np.allclose(longer.values / shorter.values, 1257.5 / 1229, rtol=1e-6)


def test_state_reads_the_channel_vv() -> None:
    phase = pair("unwrappedInterferogram/VV/unwrappedPhase", unit="rad", frequency=FREQUENCY)
    components = pair("unwrappedInterferogram/VV/connectedComponents")
    assert displacement_state([grid([1, 2]), grid([1, 1])], [phase, components]).unit == "m"


@pytest.mark.parametrize("count", [1, 3])
def test_state_takes_two_layers(count: int) -> None:
    with pytest.raises(LayerError) as refusal:
        displacement_state([grid([1])] * count, [UNWRAPPED] * count)
    assert str(refusal.value) == f"The number of input layers must be 2, and it is {count}."


def test_state_refuses_a_phase_that_is_not_of_a_gunw_product() -> None:
    with pytest.raises(LayerError, match="one NISAR GUNW product"):
        displacement_state([grid([1]), grid([1])], [EARLIER, LABELS])


@pytest.mark.parametrize(
    "name",
    [
        COMPONENTS,
        "unwrappedInterferogram/HH/ionospherePhaseScreen",
        "unwrappedInterferogram/HH/coherenceMagnitude",
        "wrappedInterferogram/HH/unwrappedPhase",
        "unwrappedInterferogram/HV/unwrappedPhase",
        "pixelOffsets/HH/slantRangeOffset",
        "unwrappedPhase",
    ],
)
def test_state_refuses_a_first_layer_that_is_not_an_unwrapped_phase(name: str) -> None:
    other = pair(name, unit="rad", frequency=FREQUENCY)
    with pytest.raises(LayerError) as refusal:
        displacement_state([grid([1]), grid([1])], [other, LABELS])
    assert str(refusal.value) == (
        f'The layer "{TITLE}" is the layer {name} of its product, and the tool reads the layer unwrappedPhase.'
    )


@pytest.mark.parametrize("name", [PHASE, "unwrappedInterferogram/HH/coherenceMagnitude", "connectedComponents"])
def test_state_refuses_a_second_layer_that_is_not_the_connected_components(name: str) -> None:
    with pytest.raises(LayerError) as refusal:
        displacement_state([grid([1]), grid([1])], [UNWRAPPED, pair(name)])
    assert str(refusal.value) == (
        f'The layer "{TITLE}" is the layer {name} of its product, and the tool reads the layer connectedComponents.'
    )


def test_state_refuses_a_phase_that_is_not_in_radians() -> None:
    with pytest.raises(LayerError) as refusal:
        displacement_state([grid([1]), grid([1])], [pair(PHASE, frequency=FREQUENCY), LABELS])
    assert str(refusal.value) == f'The layer "{TITLE}" has the unit 1, and the tool reads the unit rad.'


def test_state_refuses_connected_components_with_a_unit() -> None:
    with pytest.raises(LayerError, match="has the unit rad, and the tool reads the unit 1"):
        displacement_state([grid([1]), grid([1])], [UNWRAPPED, pair(COMPONENTS, unit="rad")])


def test_state_refuses_layers_on_different_grids() -> None:
    with pytest.raises(LayerError) as refusal:
        displacement_state([grid([1, 2]), grid([1])], [UNWRAPPED, LABELS])
    assert str(refusal.value) == "The input layers do not have the same grid."


def test_state_refuses_layers_of_two_product_files() -> None:
    other = GUNW_9_21_OCT.replace("_032_141_D_067_033_", "_031_141_D_067_032_")
    labels = layer(other, "2026-10-09", "2026-10-21", layer=COMPONENTS)
    with pytest.raises(LayerError) as refusal:
        displacement_state([grid([1]), grid([1])], [UNWRAPPED, labels])
    assert str(refusal.value) == "The two layers are not of the same product file."


def test_state_refuses_layers_of_two_channels() -> None:
    labels = pair("unwrappedInterferogram/VV/connectedComponents")
    with pytest.raises(LayerError) as refusal:
        displacement_state([grid([1]), grid([1])], [UNWRAPPED, labels])
    assert str(refusal.value) == (
        "The two layers are not of the same polarisation channel: "
        f"the first is {PHASE} and the second is unwrappedInterferogram/VV/connectedComponents."
    )


def test_state_refuses_a_phase_without_its_centre_frequency() -> None:
    with pytest.raises(LayerError) as refusal:
        displacement_state([grid([1]), grid([1])], [pair(PHASE, unit="rad"), LABELS])
    assert str(refusal.value) == (
        f'The layer "{TITLE}" does not record the centre frequency of its radar band; receive it again with Get layer.'
    )


@pytest.mark.parametrize(
    "name",
    [
        # The secondary acquisition is the earlier one.
        GUNW_9_21_OCT.replace("20261009", "20261109"),
        # The two acquisitions start at the same time.
        GUNW_9_21_OCT.replace("20261021", "20261009"),
        # The name ends before the times.
        "NISAR_L2_PR_GUNW_032_141_D_067_033_4000_SH_",
    ],
)
def test_state_refuses_a_pair_whose_reference_is_not_the_earlier_date(name: str) -> None:
    phase = layer(name, "2026-10-09", "2026-10-21", layer=PHASE, unit="rad", frequency=FREQUENCY)
    labels = layer(name, "2026-10-09", "2026-10-21", layer=COMPONENTS)
    with pytest.raises(LayerError) as refusal:
        displacement_state([grid([1]), grid([1])], [phase, labels])
    assert str(refusal.value) == (
        f'The name of the product file of the layer "{TITLE}" does not give a reference date '
        "that is earlier than the secondary date."
    )


@pytest.mark.parametrize("components", [grid([1, 0.5]), grid([1, -1]), grid([1, float("inf")])])
def test_state_refuses_labels_that_are_not_whole_numbers_from_zero(components: Any) -> None:
    with pytest.raises(LayerError) as refusal:
        displacement_state([grid([1, 2]), components], [UNWRAPPED, LABELS])
    assert str(refusal.value) == (
        f'The layer "{TITLE}" holds values that are not whole numbers from 0, '
        "so it is not a layer of connected components."
    )


@pytest.mark.parametrize(
    ("phase", "components"),
    [(grid([1, 2]), grid([0, 0])), (grid([NAN, NAN]), grid([1, 1])), (grid([1, NAN]), grid([NAN, 1]))],
)
def test_state_without_any_value_is_refused(phase: Any, components: Any) -> None:
    with pytest.raises(LayerError) as refusal:
        displacement_state([phase, components], [UNWRAPPED, LABELS])
    assert str(refusal.value) == "The result would hold no value in any cell."


def test_state_whose_values_are_all_alike_has_no_legend() -> None:
    with pytest.raises(LayerError) as refusal:
        displacement_state([grid([2, 2]), grid([1, 1])], [UNWRAPPED, LABELS])
    assert str(refusal.value) == "The values of the result are too alike to give the legend a range."


def test_faults_of_the_caller_are_not_refusals_for_the_visitor() -> None:
    with pytest.raises(ValueError, match="differ in number"):
        displacement_state([grid([1])], [UNWRAPPED, LABELS])
    with pytest.raises(ValueError, match="not two-dimensional 32-bit floating point"):
        displacement_state([np.array([[1.0]]), grid([1])], [UNWRAPPED, LABELS])


def test_result_fits_a_layer_description_and_the_grid_of_its_inputs() -> None:
    phase, components = grid([1, 2], [3, 4]), grid([1, 1], [1, 0])
    result = displacement_state([phase, components], [UNWRAPPED, LABELS])
    assert result.values.shape == phase.shape
    description = {
        **PAIR.model_dump(),
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
