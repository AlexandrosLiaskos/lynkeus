# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""Tests of the formats that connect the parts."""

from datetime import date
from typing import Any

import numpy as np
import pytest
from pydantic import ValidationError

from lynkeus.layers import AnalysisResult, Area, LayerClass, LayerDescription, LayerRequest, ToolRun

LAYER: dict[str, Any] = {
    "id": "gcov-hhhh-20261020",
    "title": "Backscatter HH, 20 Oct 2026",
    "kind": "layer",
    "url": "/files/gcov-hhhh-20261020.tif",
    "quantity": "Radar backscatter",
    "unit": "dB",
    "range": [-25, 0],
    "colours": "grey",
    "dates": ["2026-10-20"],
    "inputs": ["product-file.h5"],
    "layer": "HHHH",
    "program": "Lynkeus 0.1.0",
    "method": None,
    "record": "/files/gcov-hhhh-20261020.json",
}

REQUEST: dict[str, Any] = {
    "product": "GCOV",
    "granule": "product-file",
    "layer": "HHHH",
    "area": {"west": -122, "south": 37.9, "east": -121.5, "north": 38.3},
}


def test_layer_description_is_read_and_written_in_the_same_form() -> None:
    layer = LayerDescription.model_validate(LAYER)
    assert layer.dates == (date(2026, 10, 20),)
    assert layer.range == (-25.0, 0.0)
    assert layer.model_dump(mode="json") == {
        **LAYER,
        "ends": None,
        "classes": None,
        "frequency": None,
        "statistics": None,
        "range": [-25.0, 0.0],
    }


def test_layer_stored_without_the_name_of_its_layer_is_read() -> None:
    stored = {name: value for name, value in LAYER.items() if name != "layer"}
    layer = LayerDescription.model_validate(stored)
    assert layer.layer is None
    assert layer.model_dump(mode="json") == {
        **stored,
        "layer": None,
        "ends": None,
        "classes": None,
        "frequency": None,
        "statistics": None,
        "range": [-25.0, 0.0],
    }
    assert LayerDescription.model_validate_json(layer.model_dump_json()) == layer


def test_result_needs_its_method() -> None:
    with pytest.raises(ValidationError, match="needs the reference of its method"):
        LayerDescription.model_validate({**LAYER, "kind": "result", "layer": None})
    result = LayerDescription.model_validate(
        {**LAYER, "kind": "result", "layer": None, "method": "Reference of the method"}
    )
    assert result.method == "Reference of the method"
    assert result.layer is None


def test_result_has_no_name_of_a_layer_inside_a_product() -> None:
    with pytest.raises(ValidationError, match="so it has no name of one"):
        LayerDescription.model_validate({**LAYER, "kind": "result", "method": "Reference of the method"})


@pytest.mark.parametrize(
    "change",
    [
        {"id": "GCOV HHHH"},
        {"id": ""},
        {"kind": "other"},
        {"unit": ""},
        {"range": [0]},
        {"range": [0, 0]},
        {"range": [0, float("nan")]},
        {"dates": []},
        {"dates": ["20 Oct 2026"]},
        {"inputs": []},
        {"layer": ""},
        {"method": "Reference of the method"},
        {"other": 1},
    ],
)
def test_wrong_layer_description_is_rejected(change: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        LayerDescription.model_validate({**LAYER, **change})


def test_layer_description_cannot_be_changed() -> None:
    layer = LayerDescription.model_validate(LAYER)
    with pytest.raises(ValidationError):
        layer.title = "Other"


def test_area_keeps_its_four_sides() -> None:
    area = Area(west=-180, south=-90, east=180, north=90)
    assert (area.west, area.south, area.east, area.north) == (-180, -90, 180, 90)


@pytest.mark.parametrize(
    "sides",
    [
        {"west": 10, "south": 0, "east": 10, "north": 1},
        {"west": 0, "south": 5, "east": 1, "north": 4},
        {"west": -181, "south": 0, "east": 1, "north": 1},
        {"west": 0, "south": 0, "east": 1, "north": 91},
        {"west": 0, "south": 0, "east": 1},
        {"west": 0, "south": 0, "east": 1, "north": float("inf")},
    ],
)
def test_wrong_area_is_rejected(sides: dict[str, float]) -> None:
    with pytest.raises(ValidationError):
        Area.model_validate(sides)


def test_layer_request_is_read() -> None:
    request = LayerRequest.model_validate(REQUEST)
    assert request.product == "GCOV"
    assert request.area.east == -121.5


@pytest.mark.parametrize(
    "change",
    [
        {"product": "RSLC"},
        {"granule": ""},
        {"layer": ""},
        {"area": {"west": 1, "south": 0, "east": 0, "north": 1}},
        {"other": 1},
    ],
)
def test_wrong_layer_request_is_rejected(change: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        LayerRequest.model_validate({**REQUEST, **change})


RESULT: dict[str, Any] = {**LAYER, "kind": "result", "layer": None, "method": "Reference of the method"}


def test_result_may_name_the_two_ends_of_its_legend_in_words() -> None:
    assert LayerDescription.model_validate(RESULT).ends is None
    result = LayerDescription.model_validate({**RESULT, "ends": ["decrease", "increase"]})
    assert result.ends == ("decrease", "increase")
    assert result.model_dump(mode="json")["ends"] == ["decrease", "increase"]
    assert LayerDescription.model_validate_json(result.model_dump_json()) == result


def test_description_stored_without_the_words_of_the_ends_is_read() -> None:
    assert "ends" not in RESULT
    assert "ends" not in LAYER
    assert LayerDescription.model_validate(RESULT).ends is None
    assert LayerDescription.model_validate(LAYER).ends is None


@pytest.mark.parametrize("ends", [["decrease"], ["decrease", ""], ["decrease", "none", "increase"], "decrease"])
def test_words_of_the_ends_that_are_not_two_words_are_rejected(ends: Any) -> None:
    with pytest.raises(ValidationError):
        LayerDescription.model_validate({**RESULT, "ends": ends})


def test_layer_received_from_nasa_has_no_words_for_the_ends_of_its_legend() -> None:
    with pytest.raises(ValidationError, match="only the legend of a result has words for its two ends"):
        LayerDescription.model_validate({**LAYER, "ends": ["low", "high"]})


def test_result_of_a_tool_has_no_words_for_the_ends_of_its_legend_unless_it_gives_them() -> None:
    values = np.zeros((2, 2), dtype=np.float32)
    assert AnalysisResult(values, "Quantity", "1", (0.0, 1.0), "grey", "Method").ends is None
    result = AnalysisResult(values, "Quantity", "dB", (-1.0, 1.0), "RdBu", "Method", ends=("decrease", "increase"))
    assert result.ends == ("decrease", "increase")
    assert result.reduction == "mean"


def test_result_of_a_tool_is_reduced_by_the_mean_of_its_values_unless_it_says_otherwise() -> None:
    values = np.zeros((2, 2), dtype=np.float32)
    assert AnalysisResult(values, "Quantity", "1", (0.0, 1.0), "grey", "Method").reduction == "mean"
    result = AnalysisResult(values, "Quantity", "dB", (0.0, 1.0), "grey", "Method", "mean-power")
    assert result.reduction == "mean-power"


def test_tool_run_is_read() -> None:
    run = ToolRun.model_validate({"tool": "backscatter-change", "inputs": ["a", "b"], "title": "Change"})
    assert run.inputs == ("a", "b")


@pytest.mark.parametrize("change", [{"tool": ""}, {"inputs": []}, {"title": ""}])
def test_wrong_tool_run_is_rejected(change: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        ToolRun.model_validate({"tool": "backscatter-change", "inputs": ["a"], "title": "Change", **change})


def test_layer_received_from_nasa_may_carry_the_centre_frequency_of_its_radar_band() -> None:
    assert "frequency" not in LAYER
    assert LayerDescription.model_validate(LAYER).frequency is None
    layer = LayerDescription.model_validate({**LAYER, "frequency": 1239000000.0})
    assert layer.frequency == 1239000000.0
    assert layer.model_dump(mode="json")["frequency"] == 1239000000.0


@pytest.mark.parametrize("frequency", [0, -1239000000.0, "L band", float("inf")])
def test_centre_frequency_that_is_not_a_number_above_zero_is_rejected(frequency: Any) -> None:
    with pytest.raises(ValidationError):
        LayerDescription.model_validate({**LAYER, "frequency": frequency})


def test_result_of_a_tool_has_no_centre_frequency() -> None:
    assert LayerDescription.model_validate(RESULT).frequency is None
    with pytest.raises(ValidationError, match="it has no centre frequency of a radar band"):
        LayerDescription.model_validate({**RESULT, "frequency": 1239000000.0})


CLASSES: list[dict[str, Any]] = [
    {"value": 1, "name": "Not inundated", "colour": "#ececee"},
    {"value": 2, "name": "Open water", "colour": "#151b73"},
    {"value": 3, "name": "Inundated vegetation", "colour": "#42e9f5"},
]
RESULT_OF_CLASSES: dict[str, Any] = {
    **LAYER,
    "kind": "result",
    "layer": None,
    "unit": "1",
    "range": [1, 3],
    "colours": "classes",
    "method": "Reference of the method",
    "classes": CLASSES,
}


def test_result_may_carry_a_table_of_classes() -> None:
    result = LayerDescription.model_validate(RESULT_OF_CLASSES)
    assert result.classes == (
        LayerClass(value=1, name="Not inundated", colour="#ececee"),
        LayerClass(value=2, name="Open water", colour="#151b73"),
        LayerClass(value=3, name="Inundated vegetation", colour="#42e9f5"),
    )
    assert result.model_dump(mode="json")["classes"] == CLASSES
    assert LayerDescription.model_validate_json(result.model_dump_json()) == result


def test_description_stored_without_a_table_of_classes_is_read() -> None:
    stored = {name: value for name, value in RESULT_OF_CLASSES.items() if name != "classes"}
    assert LayerDescription.model_validate(stored).classes is None


def test_layer_received_from_nasa_has_no_table_of_classes() -> None:
    with pytest.raises(ValidationError, match="only a result may have classes"):
        LayerDescription.model_validate({**LAYER, "unit": "1", "range": [1, 3], "classes": CLASSES})


@pytest.mark.parametrize(
    "classes",
    [
        [],
        CLASSES[:1],
        [CLASSES[0], CLASSES[0], CLASSES[2]],
        [CLASSES[1], CLASSES[0], CLASSES[2]],
    ],
)
def test_table_of_classes_needs_two_classes_or_more_in_the_order_of_their_values(classes: list[Any]) -> None:
    with pytest.raises(ValidationError, match="at least two classes, with different values in increasing order"):
        LayerDescription.model_validate({**RESULT_OF_CLASSES, "classes": classes})


@pytest.mark.parametrize("bounds", [[0, 3], [1, 2], [1, 4]])
def test_range_of_a_result_of_classes_runs_from_its_lowest_to_its_highest_class(bounds: list[float]) -> None:
    with pytest.raises(ValidationError, match="from the lowest to the highest value of its classes"):
        LayerDescription.model_validate({**RESULT_OF_CLASSES, "range": bounds})


@pytest.mark.parametrize(
    "change",
    [
        {"value": -1},
        {"value": 1.5},
        {"value": "1"},
        {"value": True},
        {"name": ""},
        {"colour": "ececee"},
        {"colour": "#ECECEE"},
        {"colour": "#ececee80"},
        {"colour": "grey"},
        {"other": 1},
    ],
)
def test_wrong_class_is_rejected(change: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        LayerClass.model_validate({**CLASSES[0], **change})


def test_result_of_a_tool_has_classes_when_and_only_when_its_reduced_copies_take_the_most_frequent_value() -> None:
    values = np.array([[1, 2, 3]], dtype=np.float32)
    classes = tuple(LayerClass.model_validate(entry) for entry in CLASSES)
    result = AnalysisResult(values, "Class", "1", (1.0, 3.0), "classes", "Method", "mode", classes=classes)
    assert (result.reduction, result.classes) == ("mode", classes)
    with pytest.raises(ValueError, match="when, and only when"):
        AnalysisResult(values, "Class", "1", (1.0, 3.0), "classes", "Method", "mean", classes=classes)
    with pytest.raises(ValueError, match="when, and only when"):
        AnalysisResult(values, "Class", "1", (1.0, 3.0), "classes", "Method", "mode")
