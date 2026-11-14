"""Search of NISAR products in NASA's catalogue.

The Common Metadata Repository (CMR) of NASA holds one record for every
product file. The search asks it, through the library earthaccess, for the
products of one type that intersect an area and a period, and reads from each
record what the result list of the interface shows. The search needs no
Earthdata account.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from typing import Any, Literal, Self

import earthaccess
from pydantic import Field, ValidationError, model_validator

from lynkeus.layers import Area, Format, ProductType, Text

type Maturity = Literal["Validated", "Provisional"]

MOST_PRODUCTS = 200
"""The largest number of products that one search returns."""


@dataclass(frozen=True)
class Collection:
    """A collection of NISAR products in the catalogue, with NASA's name and identifier for it."""

    short_name: str
    concept_id: str
    maturity: Maturity


COLLECTIONS: Mapping[ProductType, tuple[Collection, ...]] = {
    "GCOV": (
        Collection("NISAR_L2_GCOV_V1", "C3622241360-ASF", "Validated"),
        Collection("NISAR_L2_GCOV_PROVISIONAL_V1", "C2854338529-ASF", "Provisional"),
    ),
    "GUNW": (
        Collection("NISAR_L2_GUNW_V1", "C3622247503-ASF", "Validated"),
        Collection("NISAR_L2_GUNW_PROVISIONAL_V1", "C2854335566-ASF", "Provisional"),
    ),
    "GOFF": (
        Collection("NISAR_L2_GOFF_V1", "C3622250865-ASF", "Validated"),
        Collection("NISAR_L2_GOFF_PROVISIONAL_V1", "C2854341702-ASF", "Provisional"),
    ),
    "SME2": (Collection("NISAR_L3_SME2_PROVISIONAL_V1", "C2854344945-ASF", "Provisional"),),
}
"""The validated and the provisional collection of each product type. No validated soil moisture exists yet."""

_BY_CONCEPT_ID = {
    collection.concept_id: (product, collection)
    for product, collections in COLLECTIONS.items()
    for collection in collections
}


class CatalogueError(Exception):
    """The catalogue did not answer, or its answer could not be read."""


class ProductSearch(Format):
    """The choices of a search.

    Attributes
    ----------
    product : {"GCOV", "GUNW", "GOFF", "SME2"}
        Product type.
    area : Area
        Area that the products intersect.
    start, end : datetime.date
        First and last day of the period, in Coordinated Universal Time.
    """

    product: ProductType
    area: Area
    start: date
    end: date

    @model_validator(mode="after")
    def _has_period(self) -> Self:
        if self.start > self.end:
            raise ValueError("the first day of the period must not be after the last")
        return self


class Product(Format):
    """A product file found by a search.

    Attributes
    ----------
    id : str
        Identifier of the product file in the catalogue (concept id).
    name : str
        Name of the product file.
    product : {"GCOV", "GUNW", "GOFF", "SME2"}
        Product type.
    collection : str
        NASA's short name of the collection that holds the product.
    maturity : {"Validated", "Provisional"}
        NASA's level of validation of the collection.
    dates : tuple of datetime.date
        Date of the acquisition, or the two dates of a pair, in Coordinated
        Universal Time.
    track, frame : int
        Track and frame of the acquisition.
    direction : {"ascending", "descending"}
        Direction of the orbit.
    channels : tuple of str
        Polarisation channels of the main frequency band, for example ``HH``.
    size : int or None
        Size of the product file, in bytes.
    footprint : tuple
        Outline of the product on the ground: one ring of longitude and
        latitude pairs, in degrees, for each of its polygons.
    """

    id: Text
    name: Text
    product: ProductType
    collection: Text
    maturity: Maturity
    dates: tuple[date, ...] = Field(min_length=1, max_length=2)
    track: int
    frame: int
    direction: Literal["ascending", "descending"]
    channels: tuple[Text, ...]
    size: int | None
    footprint: tuple[tuple[tuple[float, float], ...], ...]


class ProductsFound(Format):
    """The answer of a search.

    Attributes
    ----------
    found : int
        Number of products in the catalogue that match the search.
    products : tuple of Product
        The products returned, the latest first. They are at most
        ``MOST_PRODUCTS``.
    """

    found: int = Field(ge=0)
    products: tuple[Product, ...]


def _day(moment: str) -> date:
    """Return the day, in Coordinated Universal Time, of a moment written as in the catalogue."""
    return datetime.fromisoformat(moment).astimezone(UTC).date()


def product_from_record(record: Mapping[str, Any]) -> Product:
    """Read a product from its record in the catalogue.

    Parameters
    ----------
    record : Mapping
        Record of a product file in the UMM-G form of the catalogue, with its
        ``meta`` and ``umm`` parts.

    Raises
    ------
    CatalogueError
        If the record lacks a field that the result list needs, or belongs to
        a collection that Lynkeus does not read.
    """
    try:
        meta, umm = record["meta"], record["umm"]
        product, collection = _BY_CONCEPT_ID[meta["collection-concept-id"]]
        attributes = {attribute["Name"]: attribute["Values"] for attribute in umm["AdditionalAttributes"]}
        name = umm["GranuleUR"]
        # A product made from a pair of acquisitions states the start of each one.
        if "REFERENCE_ZERO_DOPPLER_START_TIME" in attributes:
            moments = [
                attributes["REFERENCE_ZERO_DOPPLER_START_TIME"][0],
                attributes["SECONDARY_ZERO_DOPPLER_START_TIME"][0],
            ]
        else:
            moments = [umm["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"]]
        polygons = umm["SpatialExtent"]["HorizontalSpatialDomain"]["Geometry"].get("GPolygons", [])
        files = umm.get("DataGranule", {}).get("ArchiveAndDistributionInformation", [])
        return Product(
            id=meta["concept-id"],
            name=name,
            product=product,
            collection=collection.short_name,
            maturity=collection.maturity,
            dates=tuple(_day(moment) for moment in moments),
            track=int(attributes["TRACK_NUMBER"][0]),
            frame=int(attributes["FRAME_NUMBER"][0]),
            direction=attributes["ASCENDING_DESCENDING"][0].lower(),
            channels=tuple(attributes.get("FREQUENCY_A_POLARIZATION", attributes.get("FREQUENCY_B_POLARIZATION", ()))),
            size=next((file["SizeInBytes"] for file in files if file["Name"] == f"{name}.h5"), None),
            footprint=tuple(
                tuple((point["Longitude"], point["Latitude"]) for point in polygon["Boundary"]["Points"])
                for polygon in polygons
            ),
        )
    except (KeyError, IndexError, TypeError, ValueError, ValidationError) as error:
        raise CatalogueError(f"a record of the catalogue could not be read: {error!r}") from error


def search_products(search: ProductSearch) -> ProductsFound:
    """Find the products of one type that intersect an area and a period.

    The validated and the provisional collection of the product type are
    searched together.

    Raises
    ------
    CatalogueError
        If the catalogue does not answer, or its answer cannot be read.
    """
    area = search.area
    try:
        query = (
            earthaccess.DataGranules()
            .concept_id([collection.concept_id for collection in COLLECTIONS[search.product]])
            .bounding_box(area.west, area.south, area.east, area.north)
            .temporal(
                datetime.combine(search.start, time.min, tzinfo=UTC),
                datetime.combine(search.end, time.max, tzinfo=UTC),
            )
            .sort_key("-start_date")
        )
        found = query.hits()
        records = query.get(MOST_PRODUCTS)
    except CatalogueError:
        raise
    except Exception as error:  # the library raises errors of several kinds, of itself and of the network
        raise CatalogueError(f"the catalogue did not answer: {error!r}") from error
    return ProductsFound(found=found, products=tuple(product_from_record(record) for record in records))
