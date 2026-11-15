"""Tests of the tools of the group Coherence."""

from typing import Any

import pytest

from lynkeus.analysis.coherence import coherence_state
from lynkeus.writing import LayerError

from .layers import EARLIER, GUNW_9_21_OCT, PAIR, grid, layer

NAN = float("nan")


def test_state_is_the_layer_of_the_product_unchanged() -> None:
    coherence = grid([0, 0.25, 1], [NAN, 0.5, 0.75])
    result = coherence_state([coherence], [PAIR])
    assert result.values is coherence
    assert (result.quantity, result.unit) == ("Interferometric coherence (magnitude)", "1")
    assert (result.range, result.colours) == ((0.0, 1.0), "grey")
    assert "D-102272" in result.method
    assert result.reduction == "mean"


@pytest.mark.parametrize(
    ("coherence", "message"),
    [
        (grid([NAN, NAN]), "no value in any cell"),
        (grid([0.5, 1.5]), "outside 0 to 1"),
        (grid([-0.5, 0.5]), "outside 0 to 1"),
        (grid([0.5, float("inf")]), "outside 0 to 1"),
    ],
)
def test_state_of_a_layer_that_is_not_a_coherence_is_refused(coherence: Any, message: str) -> None:
    with pytest.raises(LayerError, match=message):
        coherence_state([coherence], [PAIR])


def test_state_reads_a_pair_of_a_gunw_product() -> None:
    with pytest.raises(LayerError, match="one NISAR GUNW product"):
        coherence_state([grid([0.5])], [EARLIER])


@pytest.mark.parametrize(
    "name",
    [
        "unwrappedInterferogram/HH/coherenceMagnitude",
        "wrappedInterferogram/HH/coherenceMagnitude",
        "unwrappedInterferogram/VV/coherenceMagnitude",
        "wrappedInterferogram/VV/coherenceMagnitude",
    ],
)
def test_state_reads_the_coherence_of_each_group_and_channel(name: str) -> None:
    coherence = grid([0.25, 0.5])
    pair = layer(GUNW_9_21_OCT, "2026-10-09", "2026-10-21", layer=name)
    assert coherence_state([coherence], [pair]).values is coherence


@pytest.mark.parametrize(
    "name",
    [
        "unwrappedInterferogram/HH/connectedComponents",
        "pixelOffsets/HH/correlationSurfacePeak",
        "unwrappedInterferogram/HH/unwrappedPhase",
        "wrappedInterferogram/HH/coherenceMagnitudes",
        "wrappedInterferogram/HH/xcoherenceMagnitude",
        "coherenceMagnitude/HH/mask",
        "coherenceMagnitude",
        "HH/coherenceMagnitude",
        "wrappedInterferogram/HV/coherenceMagnitude",
        "pixelOffsets/HH/coherenceMagnitude",
        "HHHH",
    ],
)
def test_state_refuses_a_layer_that_is_not_a_coherence_magnitude(name: str) -> None:
    other = layer(GUNW_9_21_OCT, "2026-10-09", "2026-10-21", layer=name)
    with pytest.raises(LayerError) as refusal:
        coherence_state([grid([0, 1])], [other])
    assert str(refusal.value) == (
        f'The layer "Layer of 2026-10-09 and 2026-10-21" is the layer {name} of its product, '
        "and the tool reads the layer coherenceMagnitude."
    )


def test_state_refuses_a_layer_stored_without_the_name_of_its_layer() -> None:
    stored = layer(GUNW_9_21_OCT, "2026-10-09", "2026-10-21", layer=None)
    with pytest.raises(LayerError) as refusal:
        coherence_state([grid([0.25, 0.5])], [stored])
    assert str(refusal.value) == (
        'The layer "Layer of 2026-10-09 and 2026-10-21" does not record which layer of its product it is; '
        "receive it again with Get layer."
    )
