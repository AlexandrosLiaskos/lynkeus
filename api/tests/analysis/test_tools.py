"""Tests of the list of analysis tools."""

import re

from lynkeus.analysis import TOOLS

# The names of the buttons of the Analysis tab: a measurement and a kind of tool.
BUTTON = re.compile(r"(backscatter|coherence|displacement|soil-moisture)-(state|change|series|map)")


def test_every_tool_carries_the_name_of_its_button() -> None:
    for name in TOOLS:
        assert BUTTON.fullmatch(name), name
