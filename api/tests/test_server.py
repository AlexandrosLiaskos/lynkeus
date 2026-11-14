"""Tests of the web service."""

import time
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from lynkeus import __version__, server
from lynkeus.products import CatalogueError, ProductSearch, ProductsFound

QUERY = {
    "product": "GCOV",
    "west": "-71.2",
    "south": "42.6",
    "east": "-70.75",
    "north": "42.95",
    "start": "2026-10-01",
    "end": "2026-11-14",
}


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
    assert (search.area.west, search.area.south, search.area.east, search.area.north) == (-71.2, 42.6, -70.75, 42.95)
    assert (search.start.isoformat(), search.end.isoformat()) == ("2026-10-01", "2026-11-14")


@pytest.mark.parametrize(
    "change",
    [
        {"product": "RSLC"},
        {"west": "-70"},
        {"north": "91"},
        {"south": "abc"},
        {"start": "2026-11-15"},
        {"end": "14 Nov 2026"},
        {"other": "1"},
    ],
)
def test_wrong_choices_are_refused_before_the_search(
    client: TestClient, searches: list[ProductSearch], change: dict[str, str]
) -> None:
    response = client.get("/api/products", params={**QUERY, **change})
    assert response.status_code == 422
    assert searches == []


def test_missing_choice_is_refused(client: TestClient, searches: list[ProductSearch]) -> None:
    response = client.get("/api/products", params={key: value for key, value in QUERY.items() if key != "end"})
    assert response.status_code == 422
    assert searches == []


def test_failure_of_the_catalogue_is_answered_in_plain_words() -> None:
    def search(choices: ProductSearch) -> ProductsFound:
        raise CatalogueError("no answer")

    app = server.create_app()
    app.dependency_overrides[server.catalogue_search] = lambda: search
    with TestClient(app) as client:
        response = client.get("/api/products", params=QUERY)
    assert response.status_code == 502
    assert response.json() == {"detail": "NASA's catalogue did not answer, or its answer could not be read."}


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


def test_the_service_offers_no_other_address(client: TestClient) -> None:
    assert client.get("/api/other").status_code == 404
    assert client.get("/docs").status_code == 404
