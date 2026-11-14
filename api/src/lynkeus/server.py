"""The web service of Lynkeus, which the interface calls.

``GET /api/health`` reports that the service runs, with its version.
``GET /api/products`` searches NASA's catalogue for NISAR products.
``GET /api/products/{id}`` returns everything that the catalogue states about one product.
``GET /api/products/{id}/browse`` returns the small browse image of one product.
The addresses of the sessions, the processes, the jobs and the layers are added
by ``lynkeus.routes``, with the processes that ``lynkeus.offered`` lists.
"""

import asyncio
from collections.abc import Callable
from datetime import date
from typing import Annotated, Any, Literal, Self

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi import Path as PathParameter
from pydantic import Field, ValidationError, model_validator

from lynkeus import __version__
from lynkeus.layers import Format, ProductType
from lynkeus.offered import processes
from lynkeus.products import (
    MOST_NAMES,
    MOST_POLYGONS,
    Band,
    CatalogueError,
    Channel,
    Coverage,
    Direction,
    Maturity,
    ProductDetail,
    ProductSearch,
    ProductsFound,
    RefusedSearchError,
    SearchBox,
    Sort,
    UnknownProductError,
    product_browse,
    product_detail,
    search_products,
)
from lynkeus.routes import install

SEARCH_TIME = 45.0
"""The longest time that a search may take, in seconds."""

type Search = Callable[[ProductSearch], ProductsFound]
type Detail = Callable[[str], ProductDetail]
type Browse = Callable[[str], bytes]

type Numbers = Annotated[str, Field(pattern=r"^\d{1,6}(-\d{1,6})?$")]
ProductId = Annotated[str, PathParameter(pattern=r"^G\d{1,12}-ASF$")]


def _span(numbers: str | None) -> tuple[int, int] | None:
    """Read one number, or the first and the last number of a range written as ``12-15``."""
    if numbers is None:
        return None
    first, _, last = numbers.partition("-")
    return int(first), int(last or first)


class ProductQuery(Format):
    """The choices of a search, as the parameters of the address.

    A parameter that may be given several times is marked "repeated". Every
    parameter except ``product`` may be left out.

    Attributes
    ----------
    product : {"GCOV", "GUNW", "GOFF", "SME2"} or None
        Product type. It may be left out only when ``name`` is given.
    maturity : list of {"Validated", "Provisional", "Beta"}
        NASA's levels of validation to search (repeated). Without it the
        validated and the provisional collections are searched.
    west, south, east, north : float or None
        Sides of a rectangular area, in degrees of longitude and latitude
        (WGS 84). A west larger than the east crosses the meridian of 180
        degrees.
    polygon : list of str
        Polygons of the area (repeated), each written as
        ``longitude,latitude,longitude,latitude,...`` in degrees.
    start, end : datetime.date or None
        First and last day of the period, in Coordinated Universal Time.
    season_start, season_end : int or None
        First and last day of the year (1 to 366) of the season searched.
    pair : {"overlap", "inside"}
        For pairs: whether the pair must only overlap the period, or both of
        its acquisitions must lie inside it.
    track, frame, orbit : str or None
        One number, or a range written as ``12-15``.
    direction : {"ascending", "descending"} or None
        Direction of the orbit.
    channel, side_channel : list of {"HH", "HV", "VH", "VV"}
        Polarisation channels that the main and the side frequency band must
        have (repeated).
    band : list of {"A", "B"}
        Frequency bands that a product must have (repeated).
    bandwidth : {5, 20, 40, 77} or None
        Range bandwidth of the main frequency band, in megahertz.
    coverage : {"full", "partial"} or None
        Whether the product covers its whole frame.
    joint : bool or None
        Whether the L-band and the S-band radar observed together.
    cycle : int or None
        Number of the 12-day cycle.
    name : list of str
        Product names (repeated), with ``*`` and ``?`` as wildcards.
    sort : {"newest", "oldest", "name", "largest", "smallest", "recorded"}
        Order of the products.
    offset : int
        Number of products to pass over.
    """

    product: ProductType | None = None
    maturity: list[Maturity] = Field(default=["Validated", "Provisional"], min_length=1, max_length=3)
    west: float | None = Field(default=None, ge=-180, le=180)
    south: float | None = Field(default=None, ge=-90, le=90)
    east: float | None = Field(default=None, ge=-180, le=180)
    north: float | None = Field(default=None, ge=-90, le=90)
    polygon: list[str] = Field(default_factory=list, max_length=MOST_POLYGONS)
    start: date | None = None
    end: date | None = None
    season_start: int | None = Field(default=None, ge=1, le=366)
    season_end: int | None = Field(default=None, ge=1, le=366)
    pair: Literal["overlap", "inside"] = "overlap"
    track: Numbers | None = None
    frame: Numbers | None = None
    orbit: Numbers | None = None
    direction: Direction | None = None
    channel: list[Channel] = Field(default_factory=list, max_length=4)
    side_channel: list[Channel] = Field(default_factory=list, max_length=4)
    band: list[Band] = Field(default_factory=list, max_length=2)
    bandwidth: int | None = None
    coverage: Coverage | None = None
    joint: bool | None = None
    cycle: int | None = Field(default=None, ge=1, le=999)
    name: list[str] = Field(default_factory=list, max_length=MOST_NAMES)
    sort: Sort = "newest"
    offset: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def _is_a_search(self) -> Self:
        self.search()
        return self

    def _area(self) -> SearchBox | None:
        sides = (self.west, self.south, self.east, self.north)
        if all(side is None for side in sides):
            return None
        if self.west is None or self.south is None or self.east is None or self.north is None:
            raise ValueError("a rectangular area needs its four sides")
        return SearchBox(west=self.west, south=self.south, east=self.east, north=self.north)

    def _polygons(self) -> tuple[tuple[tuple[float, float], ...], ...]:
        rings = []
        for written in self.polygon:
            try:
                numbers = [float(number) for number in written.split(",")]
            except ValueError as error:
                raise ValueError("a polygon is written as numbers with commas between them") from error
            if len(numbers) % 2:
                raise ValueError("a polygon needs a latitude for every longitude")
            rings.append(tuple(zip(numbers[::2], numbers[1::2], strict=True)))
        return tuple(rings)

    def search(self) -> ProductSearch:
        """Return the choices as a search, with the parameters of one choice joined."""
        if (self.season_start is None) != (self.season_end is None):
            raise ValueError("a season needs its first and its last day")
        choices: dict[str, Any] = {
            "product": self.product,
            "maturity": tuple(self.maturity),
            "area": self._area(),
            "polygons": self._polygons(),
            "start": self.start,
            "end": self.end,
            "season": None if self.season_start is None else (self.season_start, self.season_end),
            "pair_inside": self.pair == "inside",
            "track": _span(self.track),
            "frame": _span(self.frame),
            "orbit": _span(self.orbit),
            "direction": self.direction,
            "channels": tuple(self.channel),
            "side_channels": tuple(self.side_channel),
            "bands": tuple(self.band),
            "bandwidth": self.bandwidth,
            "coverage": self.coverage,
            "joint": self.joint,
            "cycle": self.cycle,
            "names": tuple(self.name),
            "sort": self.sort,
            "offset": self.offset,
        }
        try:
            return ProductSearch(**choices)
        except ValidationError as error:
            # The checks of a search speak of its own fields, and the first of them names what is wrong.
            raise ValueError(error.errors()[0]["msg"]) from error


def catalogue_search() -> Search:
    """Return the function that searches the catalogue."""
    return search_products


def catalogue_detail() -> Detail:
    """Return the function that reads one product from the catalogue."""
    return product_detail


def catalogue_browse() -> Browse:
    """Return the function that receives the browse image of one product."""
    return product_browse


async def _ask[Result](question: Callable[[], Result]) -> Result:
    """Run a question to the catalogue beside the service, and answer its failures in plain words."""
    try:
        return await asyncio.wait_for(asyncio.to_thread(question), SEARCH_TIME)
    except TimeoutError as error:
        detail = "NASA's catalogue did not answer in time."
        raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, detail) from error
    except UnknownProductError as error:
        detail = "NASA's catalogue holds no such NISAR product, or the product has no browse image."
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail) from error
    except RefusedSearchError as error:
        detail = f"NASA's catalogue refused the search: {error}"
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail) from error
    except CatalogueError as error:
        detail = "NASA's catalogue did not answer, or its answer could not be read."
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail) from error


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
        """Find the NISAR products that match the choices of a search."""
        return await _ask(lambda: search(query.search()))

    @app.get("/api/products/{product_id}")
    async def product(product_id: ProductId, detail: Annotated[Detail, Depends(catalogue_detail)]) -> ProductDetail:
        """Return everything that NASA's catalogue states about one product."""
        return await _ask(lambda: detail(product_id))

    @app.get("/api/products/{product_id}/browse", response_class=Response)
    async def browse(product_id: ProductId, image: Annotated[Browse, Depends(catalogue_browse)]) -> Response:
        """Return the small browse image of one product, as a PNG file."""
        return Response(await _ask(lambda: image(product_id)), media_type="image/png")

    install(app, processes())
    return app


app = create_app()
