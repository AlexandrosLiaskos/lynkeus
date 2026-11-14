"""Tests of the search of NISAR products.

The records in ``tests/data`` are the records of four product files as the
Common Metadata Repository of NASA returned them on 14 November 2026.
"""

import http.client
import json
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import earthaccess
import pytest
from pydantic import ValidationError

from lynkeus import products
from lynkeus.harmony import layers_of
from lynkeus.products import (
    BETA_COLLECTIONS,
    COLLECTIONS,
    MOST_POINTS,
    MOST_PRODUCTS,
    CatalogueError,
    ProductSearch,
    RefusedSearchError,
    SearchBox,
    UnknownProductError,
    catalogue_query,
    collections_of,
    counter_clockwise,
    detail_from_record,
    product_browse,
    product_detail,
    product_from_record,
    search_products,
)

DATA = Path(__file__).parent / "data"
AREA = SearchBox(west=-71.2, south=42.6, east=-70.75, north=42.95)
GCOV_NAME = "NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


def record(name: str) -> dict[str, Any]:
    items: list[dict[str, Any]] = json.loads((DATA / f"{name}.json").read_text(encoding="utf-8"))["items"]
    return items[0]


def test_backscatter_product_is_read_from_its_record() -> None:
    product = product_from_record(record("granule-gcov"))
    assert product.id == "G4405194348-ASF"
    assert product.name == GCOV_NAME
    assert (product.product, product.collection, product.maturity) == ("GCOV", "NISAR_L2_GCOV_V1", "Validated")
    assert product.dates == (date(2026, 10, 21),)
    assert product.start == datetime(2026, 10, 21, 23, 43, 30, tzinfo=UTC)
    assert product.end == datetime(2026, 10, 21, 23, 44, 5, 999342, tzinfo=UTC)
    assert (product.track, product.frame, product.direction) == (141, 67, "descending")
    assert (product.cycle, product.orbit) == (33, 6468)
    assert product.bands == ("A", "B")
    assert (product.channels, product.side_channels) == (("HH", "HV"), ("HH", "HV"))
    assert (product.bandwidth, product.side_bandwidth) == (40, 5)
    assert (product.coverage, product.joint, product.version) == ("full", True, "1.0.20")
    assert product.size == 5758779392
    assert len(product.footprint) == 1
    assert len(product.footprint[0]) == 5
    assert product.footprint[0][0] == product.footprint[0][-1]


def test_backscatter_product_is_written_as_the_interface_expects_it() -> None:
    # The tests of the interface read the same file.
    expected = json.loads((DATA / "product-gcov.json").read_text(encoding="utf-8"))
    assert product_from_record(record("granule-gcov")).model_dump(mode="json") == expected


def test_detail_is_written_as_the_interface_expects_it() -> None:
    # The tests of the interface read the same file.
    expected = json.loads((DATA / "detail-gcov.json").read_text(encoding="utf-8"))
    assert detail_from_record(record("granule-gcov")).model_dump(mode="json") == expected


def test_interferogram_product_has_the_two_dates_of_its_pair() -> None:
    product = product_from_record(record("granule-gunw"))
    assert (product.product, product.maturity) == ("GUNW", "Validated")
    assert product.dates == (date(2026, 10, 9), date(2026, 10, 21))
    assert product.start == datetime(2026, 10, 9, 23, 43, 30, tzinfo=UTC)
    assert product.end == datetime(2026, 10, 21, 23, 44, 5, 999342, tzinfo=UTC)
    assert (product.cycle, product.orbit) == (32, 6295)
    assert (product.bands, product.channels, product.side_channels) == (("A",), ("HH",), ())
    assert (product.bandwidth, product.side_bandwidth) == (40, None)
    assert product.size == 2415919104


def test_product_carries_the_layers_that_lynkeus_receives() -> None:
    product = product_from_record(record("granule-gcov"))
    assert [layer.name for layer in product.layers] == [
        "HHHH",
        "HVHV",
        "rtcGammaToSigmaFactor",
        "numberOfLooks",
        "mask",
    ]
    assert (product.layers[0].title, product.layers[0].spacing) == ("Backscatter HH", 10)
    for name in ("granule-gcov", "granule-gunw", "granule-goff", "granule-sme2"):
        product = product_from_record(record(name))
        offered = layers_of(product.product, product.channels)
        assert len(offered) > 0
        assert [layer.model_dump() for layer in product.layers] == [layer.model_dump() for layer in offered]


def test_product_of_the_side_band_alone_has_no_layers() -> None:
    # The layers are those of the main band (A). Records that state only band B exist in the GCOV collections.
    side = record("granule-gcov")
    side["umm"]["AdditionalAttributes"] = [
        {"Name": "FREQUENCIES", "Values": ["B"]} if attribute["Name"] == "FREQUENCIES" else attribute
        for attribute in side["umm"]["AdditionalAttributes"]
        if not attribute["Name"].startswith("FREQUENCY_A_")
    ]
    product = product_from_record(side)
    assert (product.bands, product.channels, product.side_channels) == (("B",), (), ("HH", "HV"))
    assert product.layers == ()


def test_product_of_a_beta_collection_has_no_layers() -> None:
    beta = record("granule-gcov")
    beta["meta"]["collection-concept-id"] = BETA_COLLECTIONS["GCOV"].concept_id
    product = product_from_record(beta)
    assert (product.maturity, product.channels) == ("Beta", ("HH", "HV"))
    assert product.layers == ()


def test_soil_moisture_product_is_provisional_and_states_no_bandwidth() -> None:
    product = product_from_record(record("granule-sme2"))
    assert (product.product, product.collection) == ("SME2", "NISAR_L3_SME2_PROVISIONAL_V1")
    assert product.maturity == "Provisional"
    assert product.dates == (date(2026, 10, 9),)
    assert (product.bandwidth, product.side_bandwidth, product.version) == (None, None, "1.0.11")
    assert product.size == 96468992


def test_offsets_product_across_the_meridian_of_180_degrees_has_two_polygons() -> None:
    product = product_from_record(record("granule-goff"))
    assert (product.product, product.maturity, product.coverage) == ("GOFF", "Provisional", "partial")
    assert product.dates == (date(2026, 10, 8), date(2026, 10, 20))
    assert len(product.footprint) == 2
    assert {ring[0][0] for ring in product.footprint} == {-180.0, 180.0}


def test_footprint_lies_inside_the_limits_of_longitude_and_latitude() -> None:
    for name in ("granule-gcov", "granule-gunw", "granule-sme2", "granule-goff"):
        for ring in product_from_record(record(name)).footprint:
            assert all(-180 <= longitude <= 180 and -90 <= latitude <= 90 for longitude, latitude in ring)


def test_record_without_a_needed_field_is_rejected() -> None:
    broken = record("granule-gcov")
    broken["umm"]["AdditionalAttributes"] = [
        attribute for attribute in broken["umm"]["AdditionalAttributes"] if attribute["Name"] != "TRACK_NUMBER"
    ]
    with pytest.raises(CatalogueError, match="could not be read"):
        product_from_record(broken)
    with pytest.raises(CatalogueError, match="could not be read"):
        detail_from_record(broken)


def test_record_of_another_collection_is_rejected() -> None:
    other = record("granule-gcov")
    other["meta"]["collection-concept-id"] = "C0000000000-ASF"
    with pytest.raises(CatalogueError):
        product_from_record(other)


def test_record_with_an_unusual_name_has_no_cycle() -> None:
    renamed = record("granule-gcov")
    renamed["umm"]["GranuleUR"] = "A_PRODUCT_WITH_ANOTHER_NAME"
    product = product_from_record(renamed)
    assert product.cycle is None
    assert product.size is None


def test_detail_states_the_attributes_the_files_and_the_processing() -> None:
    detail = detail_from_record(record("granule-gcov"))
    attributes = {attribute.name: attribute.values for attribute in detail.attributes}
    assert len(attributes) == 21
    assert attributes["STACK_ID"] == ("141_D_067",)
    assert attributes["FREQUENCY_A_POLARIZATION"] == ("HH", "HV")
    assert detail.inputs == (GCOV_NAME.replace("L2_PR_GCOV", "L1_PR_RSLC") + ".h5",)
    assert detail.localities == ("Land", "North America")
    assert (detail.look, detail.software) == ("left", "GCOV_L_PGE R05.03.2")
    assert {identifier.name: identifier.values for identifier in detail.identifiers} == {
        "SASVersionId": ("ISCE3 0.25.21",),
        "CRID": ("P05036",),
        "ProductCounter": ("1",),
    }
    assert detail.produced == datetime(2026, 11, 8, 2, 38, 28, tzinfo=UTC)
    assert detail.recorded == datetime(2026, 11, 8, 2, 47, 46, 417000, tzinfo=UTC)
    assert detail.thumbnail is True


def test_files_of_a_product_are_listed_once_with_their_web_address() -> None:
    files = detail_from_record(record("granule-gcov")).files
    assert len(files) == len({file.url for file in files}) == 23
    assert all(file.url.startswith("https://nisar.asf.earthdatacloud.nasa.gov/") for file in files)
    [data] = [file for file in files if file.kind == "data"]
    assert (data.name, data.size, data.format) == (f"{GCOV_NAME}.h5", 5758779392, "HDF5")
    assert data.checksum == "MD5 66160390a733da1f67dbdce08ed6686b"
    assert {file.kind for file in files} == {"data", "browse", "metadata", "quality"}
    assert f"{GCOV_NAME}_QA_REPORT.pdf" in {file.name for file in files if file.kind == "quality"}


def test_soil_moisture_product_has_no_browse_image() -> None:
    detail = detail_from_record(record("granule-sme2"))
    assert detail.thumbnail is False
    assert "browse" not in {file.kind for file in detail.files}


def test_every_product_type_has_its_collections() -> None:
    assert set(COLLECTIONS) == set(BETA_COLLECTIONS) == {"GCOV", "GUNW", "GOFF", "SME2"}
    identifiers = [collection.concept_id for collections in COLLECTIONS.values() for collection in collections]
    identifiers += [collection.concept_id for collection in BETA_COLLECTIONS.values()]
    assert len(set(identifiers)) == len(identifiers) == 11
    assert [collection.maturity for collection in COLLECTIONS["GCOV"]] == ["Validated", "Provisional"]
    assert [collection.maturity for collection in COLLECTIONS["SME2"]] == ["Provisional"]
    assert {collection.maturity for collection in BETA_COLLECTIONS.values()} == {"Beta"}


def test_search_reads_the_collections_of_the_chosen_levels_of_validation() -> None:
    assert collections_of(ProductSearch(product="GCOV")) == ["C3622241360-ASF", "C2854338529-ASF"]
    assert collections_of(ProductSearch(product="GCOV", maturity=("Beta",))) == ["C3622214170-ASF"]
    assert collections_of(ProductSearch(product="SME2", maturity=("Validated",))) == []
    every = collections_of(ProductSearch(names=("NISAR_*",), maturity=("Validated", "Provisional", "Beta")))
    assert len(every) == 11


def test_ring_is_closed_and_turned_counter_clockwise() -> None:
    clockwise = [(0.0, 0.0), (0.0, 1.0), (1.0, 1.0), (1.0, 0.0)]
    turned = counter_clockwise(clockwise)
    assert turned == ((0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0), (0.0, 0.0))
    assert counter_clockwise(turned) == turned


def test_ring_across_the_meridian_of_180_degrees_keeps_its_direction() -> None:
    # Counter-clockwise on the ground: eastwards along the south, then westwards along the north.
    ring = ((170.0, 10.0), (-170.0, 10.0), (-170.0, 20.0), (170.0, 20.0), (170.0, 10.0))
    assert counter_clockwise(ring) == ring
    assert counter_clockwise(tuple(reversed(ring))) == ring


@pytest.mark.parametrize(
    ("ring", "reason"),
    [
        ([(0, 0), (1, 1)], "at least three points"),
        ([(0, 0), (1, 1), (0, 0)], "at least three points"),
        ([(0, 0), (1, 0), (181, 1)], "outside the limits"),
        ([(0, 0), (1, 0), (1, 91)], "outside the limits"),
        ([(0, 0), (1, 1), (2, 2)], "enclose an area"),
    ],
)
def test_ring_that_is_no_polygon_is_refused(ring: list[tuple[float, float]], reason: str) -> None:
    with pytest.raises(ValueError, match=reason):
        counter_clockwise(ring)


def test_polygons_of_a_search_are_turned_counter_clockwise() -> None:
    search = ProductSearch(product="GCOV", polygons=(((0, 0), (0, 1), (1, 1), (1, 0)),))
    assert search.polygons == (((0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0), (0.0, 0.0)),)


def test_area_may_cross_the_meridian_of_180_degrees() -> None:
    assert SearchBox(west=170, south=-20, east=-170, north=-10).west == 170
    with pytest.raises(ValidationError, match="south must be smaller"):
        SearchBox(west=0, south=10, east=1, north=10)
    with pytest.raises(ValidationError, match="must differ"):
        SearchBox(west=5, south=0, east=5, north=10)


@pytest.mark.parametrize(
    ("choices", "reason"),
    [
        ({}, "needs a product type or product names"),
        ({"product": "GCOV", "start": date(2026, 11, 2), "end": date(2026, 11, 1)}, "must not be after"),
        ({"product": "GCOV", "season": (152, 243)}, "a season needs"),
        (
            {"product": "GCOV", "start": date(2026, 1, 1), "end": date(2026, 2, 1), "season": (0, 10)},
            "between 1 and 366",
        ),
        (
            {"product": "GCOV", "start": date(2026, 1, 1), "end": date(2026, 2, 1), "pair_inside": True},
            "only a search of",
        ),
        ({"product": "GUNW", "pair_inside": True}, "only a search of"),
        ({"product": "GCOV", "area": AREA, "polygons": (((0, 0), (1, 0), (1, 1)),)}, "not both"),
        ({"product": "GCOV", "polygons": (((0, 0), (1, 1)),)}, "at least three points"),
        ({"product": "GCOV", "track": (0, 5)}, "a track number"),
        ({"product": "GCOV", "track": (5, 174)}, "a track number"),
        ({"product": "GCOV", "frame": (70, 60)}, "a frame number"),
        ({"product": "GCOV", "frame": (1, 177)}, "a frame number"),
        ({"product": "GCOV", "orbit": (0, 1)}, "an orbit number"),
        ({"product": "GCOV", "names": ("a b",)}, "a product name holds"),
        ({"product": "GCOV", "names": ("a&b=c",)}, "a product name holds"),
        ({"product": "GCOV", "names": ("NISAR_*",), "cycle": 33}, "cannot also give a cycle"),
        ({"product": "GCOV", "maturity": ()}, "at least 1 item"),
        ({"product": "GCOV", "cycle": 0}, "greater than or equal to 1"),
        ({"product": "GCOV", "offset": 999_801}, "less than or equal to 999800"),
        ({"product": "GCOV", "bandwidth": 10}, "Input should be 5, 20, 40 or 77"),
        ({"product": "GCOV", "channels": ("XX",)}, "Input should be 'HH', 'HV', 'VH' or 'VV'"),
        ({"product": "GCOV", "other": 1}, "Extra inputs are not permitted"),
    ],
)
def test_choices_that_make_no_search_are_refused(choices: dict[str, Any], reason: str) -> None:
    with pytest.raises(ValidationError, match=reason):
        ProductSearch(**choices)


def test_polygons_with_too_many_points_are_refused() -> None:
    # A zigzag along the equator, closed below it.
    ring = [(index * 0.01, (index % 2) * 0.01) for index in range(MOST_POINTS)] + [(1.0, -1.0)]
    with pytest.raises(ValidationError, match=f"at most {MOST_POINTS} points"):
        ProductSearch(product="GCOV", polygons=(tuple(ring),))


def test_period_of_one_day_is_accepted() -> None:
    one_day = ProductSearch(product="GCOV", area=AREA, start=date(2026, 11, 2), end=date(2026, 11, 2))
    assert one_day.start == one_day.end


def test_search_is_written_for_the_catalogue_with_every_choice() -> None:
    search = ProductSearch(
        product="GUNW",
        maturity=("Validated", "Beta"),
        polygons=(((0, 0), (0, 1), (1, 1), (1, 0)), ((170, 10), (-170, 10), (-170, 20.123456789), (170, 20))),
        start=date(2026, 1, 1),
        end=date(2026, 11, 14),
        season=(335, 59),
        pair_inside=True,
        track=(141, 141),
        frame=(60, 70),
        direction="descending",
        channels=("HH", "VV"),
        side_channels=("HV",),
        bands=("A", "B"),
        bandwidth=40,
        coverage="full",
        joint=False,
        cycle=32,
        orbit=(6000, 6468),
        sort="largest",
    )
    query = catalogue_query(search)
    assert query.params == {
        "concept_id": ["C3622247503-ASF", "C2850261892-ASF"],
        "polygon": ["0,0,1,0,1,1,0,1,0,0", "170,10,-170,10,-170,20.12346,170,20,170,10"],
        "temporal": ["2026-01-01T00:00:00Z,2026-11-14T23:59:59Z,335,59"],
        "attribute": [
            "int,TRACK_NUMBER,141",
            "int,FRAME_NUMBER,60,70",
            "string,ASCENDING_DESCENDING,DESCENDING",
            "string,FREQUENCY_A_POLARIZATION,HH",
            "string,FREQUENCY_A_POLARIZATION,VV",
            "string,FREQUENCY_B_POLARIZATION,HV",
            "string,FREQUENCIES,A",
            "string,FREQUENCIES,B",
            "int,FREQUENCY_A_RANGE_BANDWIDTH,40",
            "string,FULL_FRAME,TRUE",
            "string,JOINT_OBSERVATION,FALSE",
            "string,REFERENCE_ZERO_DOPPLER_START_TIME,2026-01-01T00:00:00,",
            "string,SECONDARY_ZERO_DOPPLER_START_TIME,,2026-11-14T23:59:59.999999Z",
        ],
        "orbit_number": "6000%2C6468",
        "readable_granule_name": ["NISAR_??_??_GUNW_032_*"],
        "sort_key": ["-data_size", "granule_ur"],
    }
    assert dict(query.options) == {"polygon": {"or": True}, "readable_granule_name": {"pattern": True}}


def test_search_by_area_period_and_names_is_written_for_the_catalogue() -> None:
    crossing = SearchBox(west=170, south=-20, east=-170, north=-10)
    query = catalogue_query(
        ProductSearch(names=("NISAR_L2_PR_GCOV_033_*", GCOV_NAME), area=crossing, start=date(2026, 10, 1))
    )
    assert query.params["bounding_box"] == "170.0,-20.0,-170.0,-10.0"
    assert query.params["temporal"] == ["2026-10-01T00:00:00Z,"]
    assert query.params["readable_granule_name"] == ["NISAR_L2_PR_GCOV_033_*", GCOV_NAME]
    assert query.params["sort_key"] == ["-start_date", "granule_ur"]
    assert len(query.params["concept_id"]) == 7
    assert "attribute" not in query.params


def test_search_of_the_whole_days_of_a_period_is_written_for_the_catalogue() -> None:
    query = catalogue_query(ProductSearch(product="GCOV", area=AREA, start=date(2026, 10, 1), end=date(2026, 11, 14)))
    assert query.params == {
        "concept_id": ["C3622241360-ASF", "C2854338529-ASF"],
        "bounding_box": "-71.2,42.6,-70.75,42.95",
        "temporal": ["2026-10-01T00:00:00Z,2026-11-14T23:59:59Z"],
        "sort_key": ["-start_date", "granule_ur"],
    }


class FakeResponse:
    """An answer of the catalogue."""

    def __init__(self, status_code: int, body: Any, hits: int | None = None) -> None:
        self.status_code = status_code
        self.headers = {} if hits is None else {"CMR-Hits": str(hits)}
        self._body = body

    def json(self) -> Any:
        return self._body

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"status {self.status_code}")


class FakeSession:
    """A connection that records what is asked and gives a fixed answer."""

    def __init__(self, response: FakeResponse | Exception) -> None:
        self.response = response
        self.asked: list[tuple[str, dict[str, Any]]] = []

    def get(self, url: str, **choices: Any) -> FakeResponse:
        self.asked.append((url, choices))
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


def catalogue(monkeypatch: pytest.MonkeyPatch, response: FakeResponse | Exception) -> FakeSession:
    """Make the queries of earthaccess ask a fake connection."""
    session = FakeSession(response)
    real = earthaccess.DataGranules

    def query() -> Any:
        made = real()
        monkeypatch.setattr(made, "session", session)
        return made

    monkeypatch.setattr(earthaccess, "DataGranules", query)
    return session


def test_search_asks_one_page_and_reads_the_number_found(monkeypatch: pytest.MonkeyPatch) -> None:
    session = catalogue(monkeypatch, FakeResponse(200, {"items": [record("granule-gcov")]}, hits=1234))
    search = ProductSearch(product="GCOV", area=AREA, start=date(2026, 10, 1), end=date(2026, 11, 14), offset=400)
    found = search_products(search)
    assert found.found == 1234
    assert [product.id for product in found.products] == ["G4405194348-ASF"]
    [(url, choices)] = session.asked
    assert url.startswith("https://cmr.earthdata.nasa.gov/search/granules.umm_json?concept_id[]=C3622241360-ASF&")
    assert "&bounding_box=-71.2,42.6,-70.75,42.95&" in url
    assert choices["params"] == {"page_size": MOST_PRODUCTS, "offset": 400}
    assert choices["timeout"] == products.CATALOGUE_TIME


def test_refusal_of_the_catalogue_is_reported_with_its_words(monkeypatch: pytest.MonkeyPatch) -> None:
    words = "The polygon boundary intersected itself at the following points: [lon=0.5 lat=0.5]"
    catalogue(monkeypatch, FakeResponse(400, {"errors": [words]}))
    with pytest.raises(RefusedSearchError, match="intersected itself"):
        search_products(ProductSearch(product="GCOV", polygons=(((0, 0), (4, 0), (1, 3), (3, 3)),)))


@pytest.mark.parametrize(
    "response",
    [
        FakeResponse(500, {"errors": ["An Internal Error has occurred."]}),
        FakeResponse(200, {"items": []}),
        FakeResponse(200, {"other": []}, hits=3),
        ConnectionError("no network"),
    ],
)
def test_failure_of_the_catalogue_is_reported_as_one_kind_of_error(
    monkeypatch: pytest.MonkeyPatch, response: FakeResponse | Exception
) -> None:
    catalogue(monkeypatch, response)
    search = ProductSearch(product="GCOV", area=AREA, start=date(2026, 10, 1), end=date(2026, 11, 14))
    with pytest.raises(CatalogueError, match="did not answer") as raised:
        search_products(search)
    assert not isinstance(raised.value, RefusedSearchError)


def test_record_that_cannot_be_read_fails_the_search(monkeypatch: pytest.MonkeyPatch) -> None:
    catalogue(monkeypatch, FakeResponse(200, {"items": [{"meta": {}, "umm": {}}]}, hits=1))
    with pytest.raises(CatalogueError, match="could not be read"):
        search_products(ProductSearch(product="GCOV"))


def test_detail_of_one_product_is_asked_by_its_identifier(monkeypatch: pytest.MonkeyPatch) -> None:
    session = catalogue(monkeypatch, FakeResponse(200, {"items": [record("granule-gcov")]}, hits=1))
    detail = product_detail("G4405194348-ASF")
    assert detail.product.name == GCOV_NAME
    [(url, choices)] = session.asked
    assert url.endswith("granules.umm_json?concept_id[]=G4405194348-ASF")
    assert choices["params"] == {"page_size": 1, "offset": 0}


def test_unknown_product_is_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    session = catalogue(monkeypatch, FakeResponse(200, {"items": []}, hits=0))
    with pytest.raises(UnknownProductError, match="holds no NISAR product"):
        product_detail("G1-ASF")
    assert len(session.asked) == 1
    # A name that is not an identifier of the catalogue is not asked for at all.
    for wrong in ("C3622241360-ASF", "G12-LPCLOUD", "G1-ASF&x=1", ""):
        with pytest.raises(UnknownProductError, match="not the identifier"):
            product_detail(wrong)
    assert len(session.asked) == 1


def test_product_of_a_collection_that_lynkeus_does_not_read_is_unknown(monkeypatch: pytest.MonkeyPatch) -> None:
    other = record("granule-gcov")
    other["meta"]["collection-concept-id"] = "C3622236985-ASF"
    catalogue(monkeypatch, FakeResponse(200, {"items": [other]}, hits=1))
    with pytest.raises(UnknownProductError):
        product_detail("G4405194348-ASF")


def test_browse_image_is_received_from_the_address_of_the_record(monkeypatch: pytest.MonkeyPatch) -> None:
    catalogue(monkeypatch, FakeResponse(200, {"items": [record("granule-gcov")]}, hits=1))
    asked: list[str] = []

    def fetch(url: str) -> bytes:
        asked.append(url)
        return PNG

    monkeypatch.setattr(products, "_fetch", fetch)
    assert product_browse("G4405194348-ASF") == PNG
    assert asked == [
        f"https://nisar.asf.earthdatacloud.nasa.gov/BROWSE/NISAR_L2_GCOV_V1/{GCOV_NAME}/{GCOV_NAME}_LATLON_thumbnail.png"
    ]


def test_product_without_a_browse_image_is_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    catalogue(monkeypatch, FakeResponse(200, {"items": [record("granule-sme2")]}, hits=1))
    with pytest.raises(UnknownProductError, match="has no browse image"):
        product_browse("G4359373353-ASF")


def test_browse_image_on_another_server_is_not_received(monkeypatch: pytest.MonkeyPatch) -> None:
    moved = record("granule-gcov")
    for link in moved["umm"]["RelatedUrls"]:
        link["URL"] = link["URL"].replace("nisar.asf.earthdatacloud.nasa.gov", "example.org")
    catalogue(monkeypatch, FakeResponse(200, {"items": [moved]}, hits=1))
    monkeypatch.setattr(products, "_fetch", lambda url: pytest.fail("the image must not be asked for"))
    with pytest.raises(CatalogueError, match="not held by the Alaska Satellite Facility"):
        product_browse("G4405194348-ASF")


class FakeHttpResponse:
    """An answer of a web server."""

    def __init__(self, status: int, content: bytes = b"", location: str | None = None) -> None:
        self.status = status
        self._content = content
        self._location = location

    def getheader(self, name: str) -> str | None:
        return self._location if name == "Location" else None

    def read(self, amount: int) -> bytes:
        return self._content[:amount]


def web_servers(monkeypatch: pytest.MonkeyPatch, answers: dict[str, FakeHttpResponse]) -> list[str]:
    """Make https connections answer from a table of addresses, and return the list of the addresses asked."""
    asked: list[str] = []

    class FakeConnection:
        def __init__(self, host: str, timeout: float) -> None:
            self._host = host

        def request(self, method: str, path: str) -> None:
            self._address = f"https://{self._host}{path}"
            asked.append(self._address)

        def getresponse(self) -> FakeHttpResponse:
            if self._address not in answers:
                raise OSError("no such server")
            return answers[self._address]

        def close(self) -> None:
            pass

    monkeypatch.setattr(http.client, "HTTPSConnection", FakeConnection)
    return asked


def test_image_is_received_through_the_redirection_of_its_server(monkeypatch: pytest.MonkeyPatch) -> None:
    asked = web_servers(
        monkeypatch,
        {
            "https://a.example/browse/x.png": FakeHttpResponse(303, location="https://b.example/s3/x.png?key=1"),
            "https://b.example/s3/x.png?key=1": FakeHttpResponse(200, PNG),
        },
    )
    assert products._fetch("https://a.example/browse/x.png") == PNG
    assert asked == ["https://a.example/browse/x.png", "https://b.example/s3/x.png?key=1"]


@pytest.mark.parametrize(
    ("answers", "reason"),
    [
        ({"https://a.example/x.png": FakeHttpResponse(200, b"<html>Sign in</html>")}, "is not a PNG image"),
        ({"https://a.example/x.png": FakeHttpResponse(200, PNG + b"\x00" * products.MOST_BROWSE_BYTES)}, "too large"),
        ({"https://a.example/x.png": FakeHttpResponse(404)}, "answered 404"),
        ({"https://a.example/x.png": FakeHttpResponse(302, location="https://a.example/x.png")}, "answered 302"),
        ({"https://a.example/x.png": FakeHttpResponse(302, location="http://a.example/x.png")}, "not an https address"),
        ({}, "could not be received"),
    ],
)
def test_image_that_cannot_be_received_is_reported(
    monkeypatch: pytest.MonkeyPatch, answers: dict[str, FakeHttpResponse], reason: str
) -> None:
    web_servers(monkeypatch, answers)
    with pytest.raises(CatalogueError, match=reason):
        products._fetch("https://a.example/x.png")
