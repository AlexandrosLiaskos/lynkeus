# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""Tests of the description of a process and of the reading of its inputs."""

import base64
from typing import Any

import pytest
from pydantic import Field

from lynkeus import __version__
from lynkeus.layers import Area, Format, LayerDescription, LayerRequest
from lynkeus.processes import MAX_REFERENCES, InputError, Process, Work
from tests.standin import STAND_IN, StandInInputs, job_title, run

SCHEMA_KEYWORDS = {
    "title", "multipleOf", "maximum", "exclusiveMaximum", "minimum", "exclusiveMinimum", "maxLength", "minLength",
    "pattern", "maxItems", "minItems", "uniqueItems", "maxProperties", "minProperties", "required", "enum", "type",
    "not", "allOf", "oneOf", "anyOf", "items", "properties", "additionalProperties", "description", "format",
    "default", "nullable", "readOnly", "writeOnly", "example", "deprecated", "contentMediaType", "contentEncoding",
    "contentSchema",
}  # fmt: skip
"""The keywords that the schema of OGC API - Processes takes (schema.yaml, read on 14 Nov 2026)."""


def _no_link(address: str) -> object:
    raise AssertionError(f"the link {address} was read")


def _is_schema_of_the_standard(schema: Any) -> bool:
    if not isinstance(schema, dict) or not set(schema) <= SCHEMA_KEYWORDS:
        return False
    if "type" in schema and schema["type"] not in ("array", "boolean", "integer", "number", "object", "string"):
        return False
    if any(
        isinstance(schema.get(name), int | float) and not isinstance(schema[name], bool)
        for name in ("exclusiveMinimum", "exclusiveMaximum")
    ):
        return False
    parts = [*schema.get("properties", {}).values()]
    parts += [part for name in ("allOf", "oneOf", "anyOf") for part in schema.get(name, [])]
    parts += [schema[name] for name in ("items", "not") if name in schema]
    if isinstance(schema.get("additionalProperties"), dict):
        parts.append(schema["additionalProperties"])
    return all(_is_schema_of_the_standard(part) for part in parts)


def test_summary_names_the_process_and_how_it_is_executed() -> None:
    assert STAND_IN.summary() == {
        "id": "stand-in",
        "title": "Stand-in",
        "description": "Writes two small files after a pause.",
        "version": __version__,
        "jobControlOptions": ["async-execute", "dismiss"],
        "outputTransmission": ["value"],
    }


def test_description_gives_every_input_with_its_schema_and_number_of_values() -> None:
    inputs = STAND_IN.describe()["inputs"]
    assert set(inputs) == set(StandInInputs.model_fields)
    assert inputs["name"] == {
        "title": "Name",
        "description": "Name of the layer and of its files.",
        "minOccurs": 1,
        "maxOccurs": 1,
        "schema": {"type": "string", "minLength": 1, "pattern": "^[a-z0-9-]+$"},
    }
    assert inputs["seconds"]["minOccurs"] == 0
    assert inputs["seconds"]["schema"] == {"type": "number", "default": 0.0, "minimum": 0, "maximum": 60}
    assert inputs["size"]["schema"] == {"type": "integer", "default": 2000, "minimum": 1}
    # An input with several values is described by one value and the number of values.
    assert inputs["uses"] == {
        "title": "Uses",
        "minOccurs": 0,
        "maxOccurs": "unbounded",
        "schema": {"type": "string", "minLength": 1},
    }
    assert inputs["area"]["title"] == "Area"
    assert "description" not in inputs["area"]
    assert inputs["data"]["schema"] == {"type": "string", "format": "byte", "nullable": True, "default": None}
    assert inputs["end"]["schema"]["enum"][0] == "layer"
    box = inputs["area"]["schema"]
    assert box["nullable"] is True
    assert box["properties"]["bbox"]["anyOf"] == [
        {"type": "array", "items": {"type": "number"}, "minItems": 4, "maxItems": 4},
        {"type": "array", "items": {"type": "number"}, "minItems": 6, "maxItems": 6},
    ]
    assert box["properties"]["crs"]["enum"] == [
        "http://www.opengis.net/def/crs/OGC/1.3/CRS84",
        "http://www.opengis.net/def/crs/OGC/0/CRS84h",
    ]


def test_output_is_the_layer_description() -> None:
    outputs = STAND_IN.describe()["outputs"]
    assert set(outputs) == {"layer"}
    schema = outputs["layer"]["schema"]
    assert set(schema["properties"]) == set(LayerDescription.model_fields)
    assert schema["properties"]["range"] == {
        "title": "Range",
        "type": "array",
        "items": {"type": "number"},
        "minItems": 2,
        "maxItems": 2,
    }
    assert schema["properties"]["method"]["nullable"] is True
    ends = schema["properties"]["ends"]
    assert (ends["type"], ends["minItems"], ends["maxItems"], ends["nullable"]) == ("array", 2, 2, True)
    assert ends["items"]["type"] == "string"
    assert schema["properties"]["kind"]["enum"] == ["layer", "result"]


def _for_the_request(inputs: LayerRequest, work: Work) -> LayerDescription:
    raise NotImplementedError


@pytest.mark.parametrize(
    "process", [STAND_IN, Process("get", "Get", "Gets.", LayerRequest, _for_the_request, lambda inputs: inputs.layer)]
)
def test_every_schema_of_a_description_uses_the_keywords_of_the_standard_only(process: Process[Any]) -> None:
    description = process.describe()
    schemas = [part["schema"] for group in ("inputs", "outputs") for part in description[group].values()]
    assert len(schemas) > 4
    assert all(_is_schema_of_the_standard(schema) for schema in schemas)
    assert not _is_schema_of_the_standard({"const": 1})
    assert not _is_schema_of_the_standard({"properties": {"a": {"exclusiveMinimum": 0}}})


def test_process_with_a_wrong_name_or_a_function_inside_a_function_is_refused() -> None:
    with pytest.raises(ValueError, match="lower-case"):
        Process("Stand In", "Title", "Text.", StandInInputs, run, job_title)
    with pytest.raises(ValueError, match="top level"):
        Process("local", "Title", "Text.", StandInInputs, lambda inputs, work: run(inputs, work), job_title)


class Keyed(Format):
    """A format with a keyword of JSON Schema that the schema of the standard does not take."""

    values: tuple[str, ...] = Field(json_schema_extra={"contains": {"type": "string"}})


def test_parameter_that_json_cannot_hold_is_refused() -> None:
    with pytest.raises(ValueError, match="a list of values that JSON can hold"):
        Process("local", "Title", "Text.", StandInInputs, run, job_title, parameters={"limit": [float("inf")]})
    with pytest.raises(ValueError, match="a list of values that JSON can hold"):
        Process("local", "Title", "Text.", StandInInputs, run, job_title, parameters={"limit": [object()]})


def test_format_that_the_standard_cannot_describe_is_refused() -> None:
    with pytest.raises(ValueError, match="has no form in the schema of OGC API - Processes"):
        Process("keyed", "Title", "Text.", Keyed, _for_the_request, lambda inputs: "Title")  # type: ignore[arg-type]


def test_inputs_are_read_as_plain_values() -> None:
    inputs = STAND_IN.read_inputs({"name": "a", "seconds": 1.5, "uses": ["l1", "l2"]}, _no_link)
    assert (inputs.name, inputs.seconds, inputs.uses, inputs.end) == ("a", 1.5, ("l1", "l2"), "layer")


def test_inputs_are_read_as_qualified_values_a_bounding_box_and_a_binary_value() -> None:
    given = {
        "name": {"value": "a", "mediaType": "application/json"},
        "area": {"bbox": [-71.2, 42.6, -70.75, 42.95]},
        "data": base64.b64encode(b"\x00\x01binary").decode(),
    }
    inputs = STAND_IN.read_inputs(given, _no_link)
    assert inputs.area is not None
    assert inputs.area.bbox == (-71.2, 42.6, -70.75, 42.95)
    assert inputs.area.crs == "http://www.opengis.net/def/crs/OGC/1.3/CRS84"
    assert inputs.data == b"\x00\x01binary"
    area = {"value": {"bbox": [0, 0, 0, 1, 1, 9], "crs": "http://www.opengis.net/def/crs/OGC/0/CRS84h"}}
    assert STAND_IN.read_inputs({"name": "a", "area": area}, _no_link).area is not None


def test_object_input_is_read_plain_and_as_a_qualified_value() -> None:
    process = Process("get", "Get", "Gets.", LayerRequest, _for_the_request, lambda inputs: inputs.layer)
    area = {"west": -71.2, "south": 42.6, "east": -70.75, "north": 42.95}
    plain = process.read_inputs({"product": "GCOV", "granule": "G", "layer": "HHHH", "area": area}, _no_link)
    qualified = process.read_inputs(
        {"product": "GCOV", "granule": "G", "layer": "HHHH", "area": {"value": area}}, _no_link
    )
    assert plain == qualified
    assert plain.area == Area(**area)


def test_inputs_given_as_links_are_read_through_the_reader() -> None:
    read: list[str] = []

    def reader(address: str) -> object:
        read.append(address)
        return "from-a-link" if address.endswith("name") else "l1"

    given = {
        "name": {"href": "https://example.org/name", "type": "application/json"},
        "uses": [{"href": "https://example.org/use"}, "l2"],
    }
    inputs = STAND_IN.read_inputs(given, reader)
    assert (inputs.name, inputs.uses) == ("from-a-link", ("l1", "l2"))
    assert read == ["https://example.org/name", "https://example.org/use"]


@pytest.mark.parametrize(
    ("given", "reason"),
    [
        (["a"], "The field inputs of the request must be an object."),
        ({}, "The input name is not valid: Field required."),
        ({"name": "A B"}, "The input name is not valid: String should match pattern '^[a-z0-9-]+$'."),
        ({"name": "a", "other": 1}, "The input other is not valid: Extra inputs are not permitted."),
        ({"name": "a", "seconds": 61}, "The input seconds is not valid: Input should be less than or equal to 60."),
        ({"name": "a", "uses": "l1"}, "The input uses is not valid: Input should be a valid tuple."),
        ({"name": "a", "area": {"bbox": [1, 2, 3]}}, "The input area.bbox"),
        ({"name": "a", "data": "not base64!"}, "The input data is not valid: Base64 decoding error"),
        (
            {"name": {"value": "a", "other": 1}},
            "A qualified input value has the fields value, mediaType, encoding and schema only.",
        ),
        (
            {"name": {"value": "a", "mediaType": "text/plain"}},
            "A qualified input value must be of the type application/json.",
        ),
        (
            {"name": {"href": 7}},
            "A link given as an input value has the fields href, rel, type, hreflang and title only.",
        ),
        (
            {"name": {"href": "https://example.org/", "type": "text/html"}},
            "A link given as an input value must lead to a value of the type application/json.",
        ),
        (
            {"name": "a", "uses": [{"href": "https://example.org/"}] * (MAX_REFERENCES + 1)},
            "A request may give at most 8 input values as links.",
        ),
    ],
)
def test_wrong_inputs_are_refused_with_a_sentence(given: object, reason: str) -> None:
    with pytest.raises(InputError) as refusal:
        STAND_IN.read_inputs(given, lambda address: "l1")
    assert str(refusal.value).startswith(reason)


def test_sentence_about_a_wrong_input_of_a_format_names_its_reason() -> None:
    process = Process("get", "Get", "Gets.", LayerRequest, _for_the_request, lambda inputs: inputs.layer)
    area = {"west": 10, "south": 0, "east": 5, "north": 1}
    with pytest.raises(InputError, match=r"^The input area is not valid: west must be smaller than east\.$"):
        process.read_inputs({"product": "GCOV", "granule": "G", "layer": "HHHH", "area": area}, _no_link)
