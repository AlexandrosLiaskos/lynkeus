"""Checks of the files of a layer, shared by the tests of several modules.

The schemas in ``tests/data/stac`` are the published JSON schemas of a STAC
Item 1.1.0 (https://schemas.stacspec.org/v1.1.0/item-spec/json-schema/), of
the extensions projection 2.0.0, raster 2.0.0 and processing 1.2.0
(https://stac-extensions.github.io/) and of GeoJSON (https://geojson.org/schema/),
as they were on 14 November 2026, and of the extension classification 2.0.0,
as it was on 15 November 2026. ``index.json`` gives the address of each.
"""

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft7Validator
from referencing import Registry
from referencing.jsonschema import DRAFT7

DATA = Path(__file__).parent / "data"
LAYERS = DATA / "layers"
ITEM = "https://schemas.stacspec.org/v1.1.0/item-spec/json-schema/item.json"


def stac_faults(record: dict[str, Any]) -> list[str]:
    """Return the faults of a record against the schema of a STAC Item and of each extension that it names."""
    index: dict[str, str] = json.loads((DATA / "stac" / "index.json").read_text(encoding="utf-8"))
    schemas = {
        address: json.loads((DATA / "stac" / name).read_text(encoding="utf-8")) for address, name in index.items()
    }
    registry: Registry[Any] = Registry().with_resources(
        (address, DRAFT7.create_resource(schema)) for address, schema in schemas.items()
    )
    faults: list[str] = []
    for address in (ITEM, *record["stac_extensions"]):
        validator = Draft7Validator(schemas[address], registry=registry)
        faults += [f"{address}: {error.message}" for error in validator.iter_errors(record)]
    return faults
