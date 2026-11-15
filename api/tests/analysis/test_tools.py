"""Tests of the list of analysis tools."""

import re

from lynkeus.analysis import TOOLS
from lynkeus.layers import LayerDescription
from lynkeus.writing import LayerError

from .layers import EARLIER, LATER, PAIR, grid

# The names of the buttons of the Analysis tab: a measurement and a kind of tool.
BUTTON = re.compile(r"(backscatter|coherence|displacement|soil-moisture)-(state|change|series|map)")


def test_every_tool_carries_the_name_of_its_button() -> None:
    for name in TOOLS:
        assert BUTTON.fullmatch(name), name


def test_the_tools_of_level_1_are_listed() -> None:
    assert set(TOOLS) == {"backscatter-state", "backscatter-change", "coherence-state"}


def test_result_of_every_tool_fits_a_layer_description_and_the_grid_of_its_inputs() -> None:
    power, coherence = grid([1, 10], [100, 1000]), grid([0.2, 0.4], [0.6, 0.8])
    runs = {
        "backscatter-state": ([power], [EARLIER]),
        "backscatter-change": ([power, power[::-1]], [EARLIER, LATER]),
        "coherence-state": ([coherence], [PAIR]),
    }
    for name, (arrays, layers) in runs.items():
        result = TOOLS[name](arrays, layers)
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
        }
        assert LayerDescription.model_validate(description).range == result.range


def test_refusal_of_a_tool_is_a_layer_error_with_a_sentence_for_the_visitor() -> None:
    try:
        TOOLS["backscatter-change"]([grid([1]), grid([2])], [LATER, EARLIER])
    except LayerError as refusal:
        assert str(refusal) == "The first layer must be of an earlier date than the second."
    else:
        raise AssertionError("the tool accepted the later date first")
