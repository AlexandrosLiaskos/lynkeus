"""Tests of the tools of the group Coherence."""

from typing import Any

import pytest

from lynkeus.analysis.coherence import coherence_state
from lynkeus.writing import LayerError

from .layers import EARLIER, PAIR, grid

NAN = float("nan")


def test_state_is_the_layer_of_the_product_unchanged() -> None:
    coherence = grid([0, 0.25, 1], [NAN, 0.5, 0.75])
    result = coherence_state([coherence], [PAIR])
    assert result.values is coherence
    assert (result.quantity, result.unit) == ("Interferometric coherence (magnitude)", "1")
    assert (result.range, result.colours) == ((0.0, 1.0), "grey")
    assert "D-102272" in result.method


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
