"""Tests of the web service."""

import time
from collections.abc import Iterator
from datetime import date
from typing import Any

import pytest
from fastapi.testclient import TestClient

from lynkeus import __version__, server
from lynkeus.products import (
    CatalogueError,
    ProductDetail,
    ProductSearch,
    ProductsFound,
    RefusedSearchError,
    UnknownProductError,
)

QUERY = {
    "product": "GCOV",
    "west": "-71.2",
    "south": "42.6",
    "east": "-70.75",
    "north": "42.95",
    "start": "2026-10-01",
    "end": "2026-11-14",
}
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


@pytest.fixture
def searches() -> list[ProductSearch]:
    return []


@pytest.fixture
def client(searches: list[ProductSearch]) -> Iterator[TestClient]:
    def search(choices: ProductSearch) -> ProductsFound:
        searches.append(choices)
        return ProductsFound(found=0, products=())

    app = server.create_app()
    app.dependency_overrides[server.catalogue_search] = lambda: search
    with TestClient(app) as test_client:
        yield test_client


def client_that_fails(error: Exception) -> TestClient:
    """Return a client of a service whose catalogue fails with the given error."""

    def fail(*choices: Any) -> Any:
        raise error

    app = server.create_app()
    for function in (server.catalogue_search, server.catalogue_detail, server.catalogue_browse):
        app.dependency_overrides[function] = lambda: fail
    return TestClient(app)


def test_health_states_the_version(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": __version__}


def test_search_receives_the_choices_of_the_address(client: TestClient, searches: list[ProductSearch]) -> None:
    response = client.get("/api/products", params=QUERY)
    assert response.status_code == 200
    assert response.json() == {"found": 0, "products": []}
    [search] = searches
    assert search.product == "GCOV"
    assert search.area is not None
    assert (search.area.west, search.area.south, search.area.east, search.area.north) == (-71.2, 42.6, -70.75, 42.95)
    assert (search.start, search.end) == (date(2026, 10, 1), date(2026, 11, 14))
    assert (search.maturity, search.sort, search.offset) == (("Validated", "Provisional"), "newest", 0)
    assert search.polygons == ()


def test_search_receives_every_choice_of_the_address(client: TestClient, searches: list[ProductSearch]) -> None:
    choices: list[tuple[str, str | int | float | bool | None]] = [
        ("product", "GUNW"),
        ("maturity", "Validated"),
        ("maturity", "Beta"),
        ("polygon", "0,0,0,1,1,1,1,0"),
        ("polygon", "170,10,-170,10,-170,20,170,20,170,10"),
        ("start", "2026-01-01"),
        ("end", "2026-11-14"),
        ("season_start", "335"),
        ("season_end", "59"),
        ("pair", "inside"),
        ("track", "141"),
        ("frame", "60-70"),
        ("orbit", "6000-6468"),
        ("direction", "descending"),
        ("channel", "HH"),
        ("channel", "VV"),
        ("side_channel", "HV"),
        ("band", "A"),
        ("bandwidth", "40"),
        ("coverage", "full"),
        ("joint", "false"),
        ("cycle", "32"),
        ("sort", "largest"),
        ("offset", "400"),
    ]
    response = client.get("/api/products", params=choices)
    assert response.status_code == 200
    [search] = searches
    assert search.model_dump() == {
        "product": "GUNW",
        "maturity": ("Validated", "Beta"),
        "area": None,
        "polygons": (
            ((0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0), (0.0, 0.0)),
            ((170.0, 10.0), (-170.0, 10.0), (-170.0, 20.0), (170.0, 20.0), (170.0, 10.0)),
        ),
        "start": date(2026, 1, 1),
        "end": date(2026, 11, 14),
        "season": (335, 59),
        "pair_inside": True,
        "track": (141, 141),
        "frame": (60, 70),
        "direction": "descending",
        "channels": ("HH", "VV"),
        "side_channels": ("HV",),
        "bands": ("A",),
        "bandwidth": 40,
        "coverage": "full",
        "joint": False,
        "cycle": 32,
        "orbit": (6000, 6468),
        "names": (),
        "sort": "largest",
        "offset": 400,
    }


def test_search_by_names_needs_no_product_type(client: TestClient, searches: list[ProductSearch]) -> None:
    response = client.get("/api/products", params=[("name", "NISAR_L2_PR_GCOV_033_*"), ("name", "NISAR_L3_*")])
    assert response.status_code == 200
    [search] = searches
    assert (search.product, search.names) == (None, ("NISAR_L2_PR_GCOV_033_*", "NISAR_L3_*"))
    assert (search.area, search.start, search.end) == (None, None, None)


def test_search_of_one_product_type_needs_no_other_choice(client: TestClient, searches: list[ProductSearch]) -> None:
    assert client.get("/api/products", params={"product": "SME2"}).status_code == 200
    assert searches[0].model_dump(exclude_defaults=True) == {"product": "SME2"}


@pytest.mark.parametrize(
    "change",
    [
        {"product": "RSLC"},
        {"north": "91"},
        {"south": "abc"},
        {"south": "43"},
        {"west": "-70.75"},
        {"start": "2026-11-15"},
        {"end": "14 Nov 2026"},
        {"other": "1"},
        {"maturity": "Final"},
        {"polygon": "0,0,1,1"},
        {"polygon": "0,0,1,0,1"},
        {"polygon": "0,0,1,0,x,1"},
        {"season_start": "152"},
        {"season_start": "152", "season_end": "367"},
        {"pair": "inside"},
        {"pair": "both"},
        {"track": "174"},
        {"track": "5-3"},
        {"track": "1,2"},
        {"frame": "0"},
        {"orbit": "abc"},
        {"direction": "north"},
        {"channel": "LH"},
        {"band": "C"},
        {"bandwidth": "10"},
        {"coverage": "half"},
        {"joint": "maybe"},
        {"cycle": "0"},
        {"name": "a b"},
        {"name": "NISAR_*", "cycle": "33"},
        {"sort": "random"},
        {"offset": "-1"},
        {"offset": "999801"},
    ],
)
def test_wrong_choices_are_refused_before_the_search(
    client: TestClient, searches: list[ProductSearch], change: dict[str, str]
) -> None:
    response = client.get("/api/products", params={**QUERY, **change})
    assert response.status_code == 422
    assert searches == []


def test_area_with_three_sides_is_refused(client: TestClient, searches: list[ProductSearch]) -> None:
    response = client.get("/api/products", params={key: value for key, value in QUERY.items() if key != "east"})
    assert response.status_code == 422
    assert "needs its four sides" in response.text
    assert searches == []


def test_search_without_a_product_type_or_a_name_is_refused(client: TestClient, searches: list[ProductSearch]) -> None:
    response = client.get("/api/products", params={key: value for key, value in QUERY.items() if key != "product"})
    assert response.status_code == 422
    assert "needs a product type or product names" in response.text
    assert searches == []


def test_area_across_the_meridian_of_180_degrees_is_accepted(client: TestClient, searches: list[ProductSearch]) -> None:
    response = client.get("/api/products", params={**QUERY, "west": "170", "east": "-170"})
    assert response.status_code == 200
    assert searches[0].area is not None
    assert (searches[0].area.west, searches[0].area.east) == (170, -170)


def test_failure_of_the_catalogue_is_answered_in_plain_words() -> None:
    with client_that_fails(CatalogueError("no answer")) as client:
        for address in ("/api/products?product=GCOV", "/api/products/G1-ASF", "/api/products/G1-ASF/browse"):
            response = client.get(address)
            assert response.status_code == 502
            assert response.json() == {"detail": "NASA's catalogue did not answer, or its answer could not be read."}


def test_refusal_of_the_catalogue_is_answered_with_its_words() -> None:
    with client_that_fails(RefusedSearchError("The polygon boundary intersected itself.")) as client:
        response = client.get("/api/products", params=QUERY)
    assert response.status_code == 422
    assert response.json() == {
        "detail": "NASA's catalogue refused the search: The polygon boundary intersected itself."
    }


def test_search_that_takes_too_long_is_ended(monkeypatch: pytest.MonkeyPatch) -> None:
    def search(choices: ProductSearch) -> ProductsFound:
        time.sleep(0.5)
        return ProductsFound(found=0, products=())

    monkeypatch.setattr(server, "SEARCH_TIME", 0.05)
    app = server.create_app()
    app.dependency_overrides[server.catalogue_search] = lambda: search
    with TestClient(app) as client:
        response = client.get("/api/products", params=QUERY)
    assert response.status_code == 504
    assert response.json() == {"detail": "NASA's catalogue did not answer in time."}


def test_detail_of_one_product_is_returned(detail: ProductDetail) -> None:
    asked: list[str] = []

    def read(product_id: str) -> ProductDetail:
        asked.append(product_id)
        return detail

    app = server.create_app()
    app.dependency_overrides[server.catalogue_detail] = lambda: read
    with TestClient(app) as client:
        response = client.get("/api/products/G4405194348-ASF")
    assert response.status_code == 200
    assert response.json() == detail.model_dump(mode="json")
    assert asked == ["G4405194348-ASF"]


def test_browse_image_of_one_product_is_returned_as_a_png_file() -> None:
    app = server.create_app()
    app.dependency_overrides[server.catalogue_browse] = lambda: lambda product_id: PNG
    with TestClient(app) as client:
        response = client.get("/api/products/G4405194348-ASF/browse")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content == PNG


def test_unknown_product_is_answered_in_plain_words() -> None:
    with client_that_fails(UnknownProductError("none")) as client:
        for address in ("/api/products/G1-ASF", "/api/products/G1-ASF/browse"):
            response = client.get(address)
            assert response.status_code == 404
            assert response.json() == {
                "detail": "NASA's catalogue holds no such NISAR product, or the product has no browse image."
            }


@pytest.mark.parametrize("wrong", ["C3622241360-ASF", "G1-LPCLOUD", "G-ASF", "abc"])
def test_identifier_that_is_not_of_a_product_is_refused(wrong: str) -> None:
    with client_that_fails(AssertionError("the catalogue must not be asked")) as client:
        assert client.get(f"/api/products/{wrong}").status_code == 422
        assert client.get(f"/api/products/{wrong}/browse").status_code == 422


def test_the_service_offers_no_other_address(client: TestClient) -> None:
    assert client.get("/api/other").status_code == 404
    assert client.get("/docs").status_code == 404
    assert client.get("/api/products/G1-ASF/other").status_code == 404
