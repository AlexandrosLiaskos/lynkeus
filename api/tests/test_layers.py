"""Tests of the formats that connect the parts."""

from datetime import date
from typing import Any

import pytest
from pydantic import ValidationError

from lynkeus.layers import Area, LayerDescription, LayerRequest, ToolRun

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
    assert layer.model_dump(mode="json") == {**LAYER, "range": [-25.0, 0.0]}


def test_result_needs_its_method() -> None:
    with pytest.raises(ValidationError, match="needs the reference of its method"):
        LayerDescription.model_validate({**LAYER, "kind": "result"})
    result = LayerDescription.model_validate({**LAYER, "kind": "result", "method": "Reference of the method"})
    assert result.method == "Reference of the method"


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


def test_tool_run_is_read() -> None:
    run = ToolRun.model_validate({"tool": "backscatter-change", "inputs": ["a", "b"], "title": "Change"})
    assert run.inputs == ("a", "b")


@pytest.mark.parametrize("change", [{"tool": ""}, {"inputs": []}, {"title": ""}])
def test_wrong_tool_run_is_rejected(change: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        ToolRun.model_validate({"tool": "backscatter-change", "inputs": ["a"], "title": "Change", **change})
