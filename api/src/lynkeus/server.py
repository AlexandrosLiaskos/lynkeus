"""The web service of Lynkeus, which the interface calls.

``GET /api/health`` reports that the service runs, with its version.
``GET /api/products`` searches NASA's catalogue for NISAR products.
The addresses of the sessions, the processes, the jobs and the layers are added
by ``lynkeus.routes``, with the processes that ``lynkeus.offered`` lists.
"""

import asyncio
from collections.abc import Callable
from datetime import date
from typing import Annotated, Self

from fastapi import Depends, FastAPI, HTTPException, Query, status
from pydantic import Field, model_validator

from lynkeus import __version__
from lynkeus.layers import Area, Format, ProductType
from lynkeus.offered import processes
from lynkeus.products import CatalogueError, ProductSearch, ProductsFound, search_products
from lynkeus.routes import install

SEARCH_TIME = 45.0
"""The longest time that a search may take, in seconds."""

type Search = Callable[[ProductSearch], ProductsFound]


class ProductQuery(Format):
    """The choices of a search, as the parameters of the address.

    Attributes
    ----------
    product : {"GCOV", "GUNW", "GOFF", "SME2"}
        Product type.
    west, south, east, north : float
        Sides of the area, in degrees of longitude and latitude (WGS 84).
    start, end : datetime.date
        First and last day of the period, in Coordinated Universal Time.
    """

    product: ProductType
    west: float = Field(ge=-180, le=180)
    south: float = Field(ge=-90, le=90)
    east: float = Field(ge=-180, le=180)
    north: float = Field(ge=-90, le=90)
    start: date
    end: date

    @model_validator(mode="after")
    def _is_a_search(self) -> Self:
        self.search()
        return self

    def search(self) -> ProductSearch:
        """Return the choices as a search, with the four sides joined in an area."""
        area = Area(west=self.west, south=self.south, east=self.east, north=self.north)
        return ProductSearch(product=self.product, area=area, start=self.start, end=self.end)


def catalogue_search() -> Search:
    """Return the function that searches the catalogue."""
    return search_products


def create_app() -> FastAPI:
    """Create the web service."""
    app = FastAPI(
        title="Lynkeus",
        version=__version__,
        openapi_url="/api/openapi.json",
        docs_url=None,
        redoc_url=None,
    )

    @app.get("/api/health")
    def health() -> dict[str, str]:
        """Report that the service runs."""
        return {"status": "ok", "version": __version__}

    @app.get("/api/products")
    async def products(
        query: Annotated[ProductQuery, Query()],
        search: Annotated[Search, Depends(catalogue_search)],
    ) -> ProductsFound:
        """Find the NISAR products of one type that intersect an area and a period."""
        try:
            return await asyncio.wait_for(asyncio.to_thread(search, query.search()), SEARCH_TIME)
        except TimeoutError as error:
            detail = "NASA's catalogue did not answer in time."
            raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, detail) from error
        except CatalogueError as error:
            detail = "NASA's catalogue did not answer, or its answer could not be read."
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail) from error

    install(app, processes())
    return app


app = create_app()
