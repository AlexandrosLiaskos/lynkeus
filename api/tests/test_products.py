"""Tests of the search of NISAR products.

The records in ``tests/data`` are the records of three product files as the
Common Metadata Repository of NASA returned them on 14 November 2026.
"""

import json
from datetime import date
from pathlib import Path
from typing import Any

import earthaccess
import pytest
from pydantic import ValidationError

from lynkeus import products
from lynkeus.layers import Area
from lynkeus.products import COLLECTIONS, CatalogueError, ProductSearch, product_from_record, search_products

DATA = Path(__file__).parent / "data"
AREA = Area(west=-71.2, south=42.6, east=-70.75, north=42.95)


def record(name: str) -> dict[str, Any]:
    items: list[dict[str, Any]] = json.loads((DATA / f"{name}.json").read_text(encoding="utf-8"))["items"]
    return items[0]


def test_backscatter_product_is_read_from_its_record() -> None:
    product = product_from_record(record("granule-gcov"))
    assert product.id == "G4405194348-ASF"
    assert product.name == (
        "NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001"
    )
    assert (product.product, product.collection, product.maturity) == ("GCOV", "NISAR_L2_GCOV_V1", "Validated")
    assert product.dates == (date(2026, 10, 21),)
    assert (product.track, product.frame, product.direction) == (141, 67, "descending")
    assert product.channels == ("HH", "HV")
    assert product.size == 5758779392
    assert len(product.footprint) == 1
    assert len(product.footprint[0]) == 5
    assert product.footprint[0][0] == product.footprint[0][-1]


def test_backscatter_product_is_written_as_the_interface_expects_it() -> None:
    # The tests of the interface read the same file.
    expected = json.loads((DATA / "product-gcov.json").read_text(encoding="utf-8"))
    assert product_from_record(record("granule-gcov")).model_dump(mode="json") == expected


def test_interferogram_product_has_the_two_dates_of_its_pair() -> None:
    product = product_from_record(record("granule-gunw"))
    assert (product.product, product.maturity) == ("GUNW", "Validated")
    assert product.dates == (date(2026, 10, 9), date(2026, 10, 21))
    assert product.channels == ("HH",)
    assert product.size == 2415919104


def test_soil_moisture_product_is_provisional() -> None:
    product = product_from_record(record("granule-sme2"))
    assert (product.product, product.collection) == ("SME2", "NISAR_L3_SME2_PROVISIONAL_V1")
    assert product.maturity == "Provisional"
    assert product.dates == (date(2026, 10, 9),)
    assert product.size == 96468992


def test_footprint_lies_inside_the_limits_of_longitude_and_latitude() -> None:
    for name in ("granule-gcov", "granule-gunw", "granule-sme2"):
        for ring in product_from_record(record(name)).footprint:
            assert all(-180 <= longitude <= 180 and -90 <= latitude <= 90 for longitude, latitude in ring)


def test_record_without_a_needed_field_is_rejected() -> None:
    broken = record("granule-gcov")
    broken["umm"]["AdditionalAttributes"] = [
        attribute for attribute in broken["umm"]["AdditionalAttributes"] if attribute["Name"] != "TRACK_NUMBER"
    ]
    with pytest.raises(CatalogueError, match="could not be read"):
        product_from_record(broken)


def test_record_of_another_collection_is_rejected() -> None:
    other = record("granule-gcov")
    other["meta"]["collection-concept-id"] = "C0000000000-ASF"
    with pytest.raises(CatalogueError):
        product_from_record(other)


def test_every_product_type_has_its_collections() -> None:
    assert set(COLLECTIONS) == {"GCOV", "GUNW", "GOFF", "SME2"}
    identifiers = [collection.concept_id for collections in COLLECTIONS.values() for collection in collections]
    assert len(set(identifiers)) == len(identifiers)


def test_period_must_not_end_before_it_starts() -> None:
    with pytest.raises(ValidationError, match="must not be after"):
        ProductSearch(product="GCOV", area=AREA, start=date(2026, 11, 2), end=date(2026, 11, 1))
    one_day = ProductSearch(product="GCOV", area=AREA, start=date(2026, 11, 2), end=date(2026, 11, 2))
    assert one_day.start == one_day.end


class FakeQuery:
    """A query that records what the search asks and answers with fixed records."""

    def __init__(self, records: list[dict[str, Any]], asked: dict[str, Any]) -> None:
        self._records = records
        self._asked = asked

    def concept_id(self, identifiers: list[str]) -> "FakeQuery":
        self._asked["concept_id"] = identifiers
        return self

    def bounding_box(self, *sides: float) -> "FakeQuery":
        self._asked["bounding_box"] = sides
        return self

    def temporal(self, start: object, end: object) -> "FakeQuery":
        self._asked["temporal"] = (str(start), str(end))
        return self

    def sort_key(self, key: str) -> "FakeQuery":
        self._asked["sort_key"] = key
        return self

    def hits(self) -> int:
        return 1234

    def get(self, limit: int) -> list[dict[str, Any]]:
        self._asked["limit"] = limit
        return self._records


def test_search_asks_both_collections_for_the_whole_days(monkeypatch: pytest.MonkeyPatch) -> None:
    asked: dict[str, Any] = {}
    monkeypatch.setattr(earthaccess, "DataGranules", lambda: FakeQuery([record("granule-gcov")], asked))
    search = ProductSearch(product="GCOV", area=AREA, start=date(2026, 10, 1), end=date(2026, 11, 14))
    found = search_products(search)
    assert asked == {
        "concept_id": ["C3622241360-ASF", "C2854338529-ASF"],
        "bounding_box": (-71.2, 42.6, -70.75, 42.95),
        "temporal": ("2026-10-01 00:00:00+00:00", "2026-11-14 23:59:59.999999+00:00"),
        "sort_key": "-start_date",
        "limit": products.MOST_PRODUCTS,
    }
    assert found.found == 1234
    assert [product.id for product in found.products] == ["G4405194348-ASF"]


def test_failure_of_the_catalogue_is_reported_as_one_kind_of_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail() -> FakeQuery:
        raise ConnectionError("no network")

    monkeypatch.setattr(earthaccess, "DataGranules", fail)
    search = ProductSearch(product="GCOV", area=AREA, start=date(2026, 10, 1), end=date(2026, 11, 14))
    with pytest.raises(CatalogueError, match="did not answer"):
        search_products(search)
