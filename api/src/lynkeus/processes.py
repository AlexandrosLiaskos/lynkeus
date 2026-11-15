"""The processes of the server, in the form of OGC API - Processes, Part 1 (OGC 18-062r2).

A process is a function that produces one layer or one series. The server
runs it as a job, in an operating-system process of its own. The inputs of a process are
declared as a pydantic format, and the description that the standard asks
for is derived from that format, so the description and the check of the
inputs of a request cannot differ.
"""

import json
import pickle
import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import Base64Bytes, BaseModel, Field, ValidationError, WithJsonSchema

from lynkeus import __version__
from lynkeus.layers import Format, LayerDescription, SeriesDescription
from lynkeus.references import Reader

type OutputName = Literal["layer", "series"]
"""The name of the one output of a process. It tells which of the two kinds of result the process produces."""

OUTPUT: OutputName = "layer"
"""The name of the one output of a process that produces a layer, which is the description of the layer."""

SERIES_OUTPUT: OutputName = "series"
"""The name of the one output of a process that produces a series, which is the description of the series."""

MAX_REFERENCES = 8
"""The largest number of input values that one request may give by reference."""

JSON = "application/json"

CELLS_PARAMETER = "most-cells"
"""The name of the parameter with which a process states the most cells of a layer that it receives.

The description of a process gives the number of the project server, and for an own server of the
visitor the limit of that server (``docs/Own_Servers.md``, Cells of a layer).
"""

_NAME = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")

_KEPT = frozenset(
    {
        "title",
        "description",
        "type",
        "format",
        "enum",
        "default",
        "pattern",
        "minLength",
        "maxLength",
        "minimum",
        "maximum",
        "multipleOf",
        "minItems",
        "maxItems",
        "uniqueItems",
        "required",
        "minProperties",
        "maxProperties",
        "contentMediaType",
        "contentEncoding",
    }
)
"""The keywords of a JSON Schema that the schema of the standard (schema.yaml) takes unchanged."""

type Binary = Annotated[Base64Bytes, WithJsonSchema({"type": "string", "format": "byte"})]
"""A binary input value, which a request gives as a base64-encoded string."""


class BoundingBox(Format):
    """A bounding box as an input value, in the form of the standard (bbox.yaml).

    Attributes
    ----------
    bbox : tuple of float
        West, south, east and north side, or west, south, lowest height,
        east, north and highest height.
    crs : str
        Coordinate reference system of the sides.
    """

    bbox: tuple[float, float, float, float] | tuple[float, float, float, float, float, float]
    crs: Literal["http://www.opengis.net/def/crs/OGC/1.3/CRS84", "http://www.opengis.net/def/crs/OGC/0/CRS84h"] = Field(
        default="http://www.opengis.net/def/crs/OGC/1.3/CRS84", json_schema_extra={"format": "uri"}
    )


class ProcessError(Exception):
    """An error of a process whose message is one plain sentence for the visitor."""


class InputError(Exception):
    """The inputs of a request are not those of the process. The message is a sentence for the visitor."""


@dataclass(frozen=True)
class Work:
    """What the server gives to the function of a process for one job.

    Attributes
    ----------
    layer_id : str
        The ``id`` that the description of the result must carry, whether
        the result is a layer or a series.
    folder : pathlib.Path
        Existing empty folder for the two files of a layer. A series has no
        files and leaves the folder empty.
    address : str
        Address of that folder for the browser, for example ``/files/<layer_id>``.
    token : str or None
        Earthdata token of the visitor, or None when the visitor is not signed in.
    layers : mapping of str to tuple
        For the ``id`` of every layer of the session, its description and
        the path of its GeoTIFF file.
    report : callable
        Reports the progress, in percent, and one sentence about the present step.
    layer_cells : int or None
        Largest number of cells of a layer that the server receives, or None when the server sets
        none: the constant of the process then holds (``lynkeus.harmony.MOST_CELLS``).
    """

    layer_id: str
    folder: Path
    address: str
    token: str | None
    layers: Mapping[str, tuple[LayerDescription, Path]]
    report: Callable[[int, str], None]
    layer_cells: int | None = None


def no_layers(inputs: BaseModel) -> tuple[str, ...]:
    """Return the layers that a job of a process without input layers reads: none."""
    return ()


@dataclass(frozen=True)
class Process[Inputs: BaseModel]:
    """A process that the server offers.

    Attributes
    ----------
    id : str
        Name of the process in the addresses, in lower-case letters, digits and hyphens.
    title : str
        Name of the process for the visitor.
    description : str
        What the process does, in one or two sentences.
    inputs : type
        Format of the inputs. Every field is one input of the process.
    run : callable
        Function of the process. It receives the inputs and the work of the
        job. A process whose output is ``layer`` writes the files of the
        layer in the folder of the work and returns the layer description;
        a process whose output is ``series`` writes no file and returns the
        series description. The function must be defined at the top level
        of a module, because the job imports it in another operating-system
        process.
    job_title : callable
        Returns the name of a job for the visitor, from the inputs.
    needs_earthdata : bool
        Whether the visitor must be signed in to Earthdata to start a job.
    errors : tuple of type
        The exceptions of the function whose message is one plain sentence
        for the visitor. Any other exception is reported to the visitor in
        general words, and in full in the log.
    version : str
        Version of the process.
    parameters : mapping of str to sequence
        Further facts about the process, each a name with its values, for
        example a limit on the inputs. The description gives them in the
        field ``additionalParameters`` of the standard.
    layers : callable
        Returns the names of the layers that a job reads, from the inputs. A
        job runs on the server that keeps them (``docs/Own_Servers.md``).
    output : {"layer", "series"}
        Name of the one output of the process: ``layer`` when the function
        returns a layer description, ``series`` when it returns a series
        description. The description of the process gives the schema of
        that output (OGC 18-062r2, requirements 52 and 53).
    """

    id: str
    title: str
    description: str
    inputs: type[Inputs]
    run: Callable[[Inputs, Work], LayerDescription | SeriesDescription]
    job_title: Callable[[Inputs], str]
    needs_earthdata: bool = False
    errors: tuple[type[Exception], ...] = (ProcessError,)
    version: str = __version__
    parameters: Mapping[str, Sequence[object]] = field(default_factory=dict)
    layers: Callable[[Inputs], Sequence[str]] = no_layers
    output: OutputName = OUTPUT
    _inputs_description: dict[str, Any] = field(init=False, repr=False, compare=False)

    def __post_init__(self) -> None:
        """Check the name, and describe the inputs."""
        if not _NAME.fullmatch(self.id):
            raise ValueError("the name of a process holds lower-case letters, digits and hyphens only")
        try:
            pickle.dumps((self.inputs, self.run, self.errors))
        except (pickle.PicklingError, AttributeError, TypeError) as error:
            raise ValueError(
                "the format, the function and the exceptions of a process must be defined at the top level of a module"
            ) from error
        try:
            json.dumps({name: list(values) for name, values in self.parameters.items()}, allow_nan=False)
        except (TypeError, ValueError) as error:
            raise ValueError("every parameter of a process is a list of values that JSON can hold") from error
        object.__setattr__(self, "_inputs_description", _described_inputs(self.inputs))

    def summary(self) -> dict[str, Any]:
        """Return the summary of the process (processSummary.yaml), without links."""
        parameters = [{"name": name, "value": list(values)} for name, values in self.parameters.items()]
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "version": self.version,
            "jobControlOptions": ["async-execute", "dismiss"],
            "outputTransmission": ["value"],
            **({"additionalParameters": {"parameters": parameters}} if parameters else {}),
        }

    def describe(self) -> dict[str, Any]:
        """Return the description of the process (process.yaml), without links."""
        return {
            **self.summary(),
            "inputs": self._inputs_description,
            "outputs": {self.output: _OUTPUT_DESCRIPTIONS[self.output]},
        }

    def read_inputs(self, given: object, read: Reader) -> Inputs:
        """Return the inputs of an execute request in the format of the process.

        Parameters
        ----------
        given : object
            Value of the field ``inputs`` of the request.
        read : callable
            Returns the JSON value at the address of a link.

        Raises
        ------
        InputError
            When the inputs are not those of the process.
        lynkeus.references.UnreadableReferenceError
            When the value of a link could not be read.
        """
        if not isinstance(given, dict):
            raise InputError("The field inputs of the request must be an object.")
        links = [0]
        values = {str(name): _value(value, read, links) for name, value in given.items()}
        try:
            return self.inputs.model_validate(values)
        except ValidationError as error:
            first = error.errors(include_url=False, include_input=False, include_context=False)[0]
            place = ".".join(str(part) for part in first["loc"]) or "inputs"
            reason = str(first["msg"]).removeprefix("Value error, ").rstrip(".")
            raise InputError(f"The input {place} is not valid: {reason}.") from None


def _value(given: object, read: Reader, links: list[int]) -> object:
    """Return an input value of an execute request (inlineOrRefData.yaml) without its wrapping."""
    if isinstance(given, list):
        return [_value(item, read, links) for item in given]
    if not isinstance(given, dict):
        return given
    if "href" in given:
        address, kind = given["href"], given.get("type", JSON)
        if not isinstance(address, str) or not set(given) <= {"href", "rel", "type", "hreflang", "title"}:
            raise InputError("A link given as an input value has the fields href, rel, type, hreflang and title only.")
        if kind != JSON:
            raise InputError(f"A link given as an input value must lead to a value of the type {JSON}.")
        links[0] += 1
        if links[0] > MAX_REFERENCES:
            raise InputError(f"A request may give at most {MAX_REFERENCES} input values as links.")
        return read(address)
    if "value" in given:
        if not set(given) <= {"value", "mediaType", "encoding", "schema"}:
            raise InputError("A qualified input value has the fields value, mediaType, encoding and schema only.")
        if given.get("mediaType", JSON) != JSON:
            raise InputError(f"A qualified input value must be of the type {JSON}.")
        return given["value"]
    return given


def _without_name(schema: Mapping[str, Any]) -> dict[str, Any]:
    """Return the schema of a format without the name and the documentation string of its class."""
    return {key: value for key, value in schema.items() if key not in ("title", "description")}


def _schema(schema: Mapping[str, Any], definitions: Mapping[str, Any]) -> dict[str, Any]:
    """Return a JSON Schema of pydantic in the form that the standard takes (schema.yaml).

    The standard takes the schema object of OpenAPI 3.0. A reference to a
    definition is replaced by the definition, ``const`` becomes ``enum``, a
    choice with ``null`` becomes ``nullable``, a numeric exclusive limit
    becomes a limit with a flag, and the items of a tuple become ``items``.
    """
    if "$ref" in schema:
        target = definitions[str(schema["$ref"]).removeprefix("#/$defs/")]
        return _schema(
            {**_without_name(target), **{key: value for key, value in schema.items() if key != "$ref"}}, definitions
        )
    result: dict[str, Any] = {}
    for key, value in schema.items():
        if key in _KEPT:
            result[key] = value
        elif key == "const":
            result["enum"] = [value]
        elif key in ("exclusiveMinimum", "exclusiveMaximum"):
            result[key.removeprefix("exclusive").lower()] = value
            result[key] = True
        elif key in ("anyOf", "oneOf", "allOf"):
            choices = [_schema(choice, definitions) for choice in value if choice != {"type": "null"}]
            if len(choices) < len(value):
                result["nullable"] = True
            if len(choices) == 1:
                result.update(choices[0])
            else:
                result[key] = choices
        elif key == "items":
            result["items"] = _schema(value, definitions)
        elif key == "prefixItems":
            items = [_schema(item, definitions) for item in value]
            different = [item for index, item in enumerate(items) if item not in items[:index]]
            result["items"] = different[0] if len(different) == 1 else {"oneOf": different}
        elif key == "properties":
            result["properties"] = {name: _schema(part, definitions) for name, part in value.items()}
        elif key == "additionalProperties":
            result[key] = value if isinstance(value, bool) else _schema(value, definitions)
        elif key != "$defs":
            raise ValueError(f"the keyword {key} of a JSON Schema has no form in the schema of OGC API - Processes")
    return result


def _described_inputs(inputs: type[BaseModel]) -> dict[str, Any]:
    """Return the description of every input of a format (inputDescription.yaml)."""
    whole = inputs.model_json_schema()
    definitions, required = whole.get("$defs", {}), whole.get("required", [])
    described: dict[str, Any] = {}
    for name, part in whole.get("properties", {}).items():
        schema = _schema(part, definitions)
        about = {"title": schema.pop("title", name.replace("_", " ").title())}
        if "description" in schema:
            about["description"] = schema.pop("description")
        if schema.get("type") == "array" and "items" in schema:
            # An input that takes several values is described by one value and the number of values.
            least = schema.get("minItems", 0) if name in required else 0
            described[name] = {
                **about,
                "minOccurs": least,
                "maxOccurs": schema.get("maxItems", "unbounded"),
                "schema": schema["items"],
            }
        else:
            described[name] = {**about, "minOccurs": 1 if name in required else 0, "maxOccurs": 1, "schema": schema}
    return described


_OUTPUT_DESCRIPTIONS: dict[OutputName, dict[str, Any]] = {
    OUTPUT: {
        "title": "Layer",
        "description": "The description of the layer that the job produced, with the addresses of its two files.",
        "schema": _schema(
            _without_name(LayerDescription.model_json_schema()), LayerDescription.model_json_schema().get("$defs", {})
        ),
    },
    SERIES_OUTPUT: {
        "title": "Series",
        "description": "The description of the series that the job produced, with the value of every date.",
        "schema": _schema(
            _without_name(SeriesDescription.model_json_schema()),
            SeriesDescription.model_json_schema().get("$defs", {}),
        ),
    },
}
"""The description of the one output of a process (outputDescription.yaml), by the name of the output."""
