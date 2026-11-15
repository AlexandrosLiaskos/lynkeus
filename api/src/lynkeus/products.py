"""Search of NISAR products in NASA's catalogue.

The Common Metadata Repository (CMR) of NASA holds one record for every
product file. The search asks it, through the library earthaccess, for the
products that match the choices of the user, and reads from each record what
the result list and the details of the interface show. The search needs no
Earthdata account.

The parameters of the catalogue that the search uses, and the values that the
records of the NISAR collections carry, are listed in the research note
``docs/research/data.md``.
"""

import http.client
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from typing import Any, Literal, Self
from urllib.parse import urljoin, urlsplit

import earthaccess
from pydantic import Field, ValidationError, model_validator

from lynkeus.layers import Format, ProductType, Text

type Maturity = Literal["Validated", "Provisional", "Beta"]
type Direction = Literal["ascending", "descending"]
type Channel = Literal["HH", "HV", "VH", "VV"]
type Band = Literal["A", "B"]
type Coverage = Literal["full", "partial"]
type Sort = Literal["newest", "oldest", "name", "largest", "smallest", "recorded"]
type Ring = tuple[tuple[float, float], ...]
type Span = tuple[int, int]

MOST_PRODUCTS = 200
"""The largest number of products that one answer holds."""

DEEPEST_PRODUCT = 1_000_000
"""The catalogue returns only the first million products of a search."""

MOST_POINTS = 250
"""The largest number of points in the polygons of a search area. The catalogue refuses a longer address."""

MOST_POLYGONS = 10
"""The largest number of polygons in a search area."""

MOST_NAMES = 50
"""The largest number of product names in one search."""

TRACKS = 173
"""The number of tracks of the NISAR orbit."""

FRAMES = 176
"""The number of frames along one track."""

CATALOGUE_TIME = 40.0
"""The longest time that one request to the catalogue may take, in seconds."""

MOST_BROWSE_BYTES = 2_000_000
"""The largest browse image that the server passes on, in bytes."""

BROWSE_HOST = "nisar.asf.earthdatacloud.nasa.gov"
"""The server of the Alaska Satellite Facility that holds the browse images."""

PAIR_PRODUCTS: frozenset[ProductType] = frozenset({"GUNW", "GOFF"})
"""The product types that are made from a pair of acquisitions."""

_SORT_KEYS: Mapping[Sort, tuple[str, ...]] = {
    "newest": ("-start_date", "granule_ur"),
    "oldest": ("start_date", "granule_ur"),
    "name": ("granule_ur",),
    "largest": ("-data_size", "granule_ur"),
    "smallest": ("data_size", "granule_ur"),
    "recorded": ("-revision_date", "granule_ur"),
}
"""The sort keys of the catalogue for each order. The name breaks a tie, so that two pages never overlap."""

_NAME = re.compile(r"^[A-Za-z0-9_.*?-]+$")
_PRODUCT_ID = re.compile(r"^G\d+-ASF$")
# The start of a product name: mission, instrument and level, pipeline, product type, cycle, track, direction, frame.
_NAME_START = re.compile(r"^NISAR_[LS]\d_[A-Z]{2}_[A-Z0-9]{4}_(\d{3})_\d{3}_[AD]_\d{3}_")
_PNG = b"\x89PNG\r\n\x1a\n"


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
"""The validated and the provisional collection of each product type. No validated soil moisture exists yet.

A search without a choice of level reads these collections.
"""

BETA_COLLECTIONS: Mapping[ProductType, Collection] = {
    "GCOV": Collection("NISAR_L2_GCOV_BETA_V1", "C3622214170-ASF", "Beta"),
    "GUNW": Collection("NISAR_L2_GUNW_BETA_V1", "C2850261892-ASF", "Beta"),
    "GOFF": Collection("NISAR_L2_GOFF_BETA_V1", "C2850263910-ASF", "Beta"),
    "SME2": Collection("NISAR_L3_SME2_BETA_V1", "C2850265000-ASF", "Beta"),
}
"""The beta collection of each product type. Its products are searched when the user chooses the beta level."""

_SEARCHED: Mapping[ProductType, tuple[Collection, ...]] = {
    product: (*collections, BETA_COLLECTIONS[product]) for product, collections in COLLECTIONS.items()
}
_BY_CONCEPT_ID = {
    collection.concept_id: (product, collection)
    for product, collections in _SEARCHED.items()
    for collection in collections
}


class CatalogueError(Exception):
    """The catalogue did not answer, or its answer could not be read."""


class RefusedSearchError(CatalogueError):
    """The catalogue refused a search, and said why in words that the user can read."""


class UnknownProductError(CatalogueError):
    """The catalogue holds no NISAR product, or no browse image, under the identifier."""


class SearchBox(Format):
    """A rectangle on the Earth, in degrees of longitude and latitude (WGS 84).

    South is smaller than north. A rectangle whose west is larger than its
    east crosses the meridian of 180 degrees.
    """

    west: float = Field(ge=-180, le=180)
    south: float = Field(ge=-90, le=90)
    east: float = Field(ge=-180, le=180)
    north: float = Field(ge=-90, le=90)

    @model_validator(mode="after")
    def _has_extent(self) -> Self:
        if self.west == self.east:
            raise ValueError("west and east must differ")
        if self.south >= self.north:
            raise ValueError("south must be smaller than north")
        return self


def _signed_area(ring: Sequence[tuple[float, float]]) -> float:
    """Return twice the area of a ring, positive when its points run counter-clockwise.

    The longitudes are first made continuous, so that a ring that crosses the
    meridian of 180 degrees keeps its direction.
    """
    longitudes = [ring[0][0]]
    for longitude, _ in ring[1:]:
        step = (longitude - longitudes[-1] + 180) % 360 - 180
        longitudes.append(longitudes[-1] + step)
    latitudes = [latitude for _, latitude in ring]
    return sum(
        longitudes[index] * latitudes[index + 1] - longitudes[index + 1] * latitudes[index]
        for index in range(len(ring) - 1)
    )


def counter_clockwise(ring: Sequence[tuple[float, float]]) -> Ring:
    """Return a closed ring with its points in counter-clockwise order, as the catalogue requires.

    Parameters
    ----------
    ring : sequence of tuple of float
        Pairs of longitude and latitude, in degrees. The last point may
        repeat the first.

    Raises
    ------
    ValueError
        If the ring has fewer than three different points, a point outside
        the limits of longitude and latitude, or no area.
    """
    points = [(float(longitude), float(latitude)) for longitude, latitude in ring]
    if len(points) > 1 and points[0] == points[-1]:
        points.pop()
    if len(points) < 3:
        raise ValueError("a polygon needs at least three points")
    if not all(-180 <= longitude <= 180 and -90 <= latitude <= 90 for longitude, latitude in points):
        raise ValueError("a point of a polygon lies outside the limits of longitude and latitude")
    points.append(points[0])
    area = _signed_area(points)
    if area == 0:
        raise ValueError("a polygon must enclose an area")
    return tuple(points if area > 0 else reversed(points))


def _span(first: int, last: int, largest: int, what: str) -> None:
    if not 1 <= first <= last <= largest:
        raise ValueError(f"{what} must lie between 1 and {largest}, the first not after the last")


class ProductSearch(Format):
    """The choices of a search.

    Every choice except the first two is optional, and a choice that is left
    out does not limit the search.

    Attributes
    ----------
    product : {"GCOV", "GUNW", "GOFF", "SME2"} or None
        Product type. None, which is accepted only with ``names``, searches
        every product type.
    maturity : tuple of {"Validated", "Provisional", "Beta"}
        NASA's levels of validation whose collections are searched.
    area : SearchBox or None
        Rectangle that the products intersect.
    polygons : tuple of tuple of tuple of float
        Polygons, each a ring of longitude and latitude pairs in degrees. A
        product is found when it intersects one of them.
    start, end : datetime.date or None
        First and last day of the period, in Coordinated Universal Time.
    season : tuple of int or None
        First and last day of the year (1 to 366) of the part of every year
        that is searched. The first may be after the last, for a season that
        passes the new year.
    pair_inside : bool
        For a product made from a pair of acquisitions: whether both
        acquisitions must lie inside the period. Otherwise the time from the
        first acquisition to the second must only overlap the period.
    track, frame : tuple of int or None
        First and last track number (1 to 173) and frame number (1 to 176).
    direction : {"ascending", "descending"} or None
        Direction of the orbit.
    channels, side_channels : tuple of {"HH", "HV", "VH", "VV"}
        Polarisation channels that the main frequency band (A) and the side
        frequency band (B) of a product must all have.
    bands : tuple of {"A", "B"}
        Frequency bands that a product must have.
    bandwidth : {5, 20, 40, 77} or None
        Range bandwidth of the main frequency band, in megahertz.
    coverage : {"full", "partial"} or None
        Whether the product covers its whole frame.
    joint : bool or None
        Whether the L-band and the S-band radar observed together.
    cycle : int or None
        Number of the 12-day cycle of the orbit, as the product name states
        it. For a pair it is the cycle of the first acquisition.
    orbit : tuple of int or None
        First and last absolute orbit number.
    names : tuple of str
        Product names. ``*`` stands for any characters and ``?`` for one.
    sort : {"newest", "oldest", "name", "largest", "smallest", "recorded"}
        Order of the products.
    offset : int
        Number of products to pass over, for the next part of a long list.
    """

    product: ProductType | None = None
    maturity: tuple[Maturity, ...] = Field(default=("Validated", "Provisional"), min_length=1)
    area: SearchBox | None = None
    polygons: tuple[Ring, ...] = Field(default=(), max_length=MOST_POLYGONS)
    start: date | None = None
    end: date | None = None
    season: tuple[int, int] | None = None
    pair_inside: bool = False
    track: Span | None = None
    frame: Span | None = None
    direction: Direction | None = None
    channels: tuple[Channel, ...] = ()
    side_channels: tuple[Channel, ...] = ()
    bands: tuple[Band, ...] = ()
    bandwidth: Literal[5, 20, 40, 77] | None = None
    coverage: Coverage | None = None
    joint: bool | None = None
    cycle: int | None = Field(default=None, ge=1, le=999)
    orbit: Span | None = None
    names: tuple[Text, ...] = Field(default=(), max_length=MOST_NAMES)
    sort: Sort = "newest"
    offset: int = Field(default=0, ge=0, le=DEEPEST_PRODUCT - MOST_PRODUCTS)

    @model_validator(mode="after")
    def _is_consistent(self) -> Self:
        if self.product is None and not self.names:
            raise ValueError("a search needs a product type or product names")
        if self.start and self.end and self.start > self.end:
            raise ValueError("the first day of the period must not be after the last")
        if self.season:
            if not (self.start and self.end):
                raise ValueError("a season needs the first and the last day of a period")
            if not all(1 <= day <= 366 for day in self.season):
                raise ValueError("a day of the year lies between 1 and 366")
        if self.pair_inside and not (self.product in PAIR_PRODUCTS and self.start and self.end):
            raise ValueError("only a search of pairs with a period can ask for both acquisitions inside it")
        if self.area and self.polygons:
            raise ValueError("a search area is a rectangle or polygons, not both")
        if sum(len(ring) for ring in self.polygons) > MOST_POINTS:
            raise ValueError(f"the polygons of a search area have at most {MOST_POINTS} points")
        if self.track:
            _span(*self.track, TRACKS, "a track number")
        if self.frame:
            _span(*self.frame, FRAMES, "a frame number")
        if self.orbit:
            _span(*self.orbit, 999_999, "an orbit number")
        if not all(_NAME.fullmatch(name) for name in self.names):
            raise ValueError("a product name holds letters, digits, the signs _ . - and the wildcards * and ?")
        if self.cycle is not None and self.names:
            raise ValueError("a search by product names cannot also give a cycle")
        return self

    @model_validator(mode="before")
    @classmethod
    def _orders_polygons(cls, values: Any) -> Any:
        if isinstance(values, Mapping) and values.get("polygons"):
            return {**values, "polygons": tuple(counter_clockwise(ring) for ring in values["polygons"])}
        return values


class ProductLayer(Format):
    """A layer of a product that Lynkeus receives.

    Attributes
    ----------
    name : str
        Name of the layer, as a layer request takes it.
    title : str
        Name of the layer for the visitor.
    spacing : float
        Smallest cell size that the product specification gives for the
        layer, in metres.
    """

    name: Text
    title: Text
    spacing: float = Field(gt=0)


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
    maturity : {"Validated", "Provisional", "Beta"}
        NASA's level of validation of the collection.
    dates : tuple of datetime.date
        Date of the acquisition, or the two dates of a pair, in Coordinated
        Universal Time.
    start, end : datetime.datetime
        Start and end of the acquisition, in Coordinated Universal Time. For
        a pair they are the start of the first acquisition and the end of
        the second.
    track, frame : int
        Track and frame of the acquisition.
    direction : {"ascending", "descending"}
        Direction of the orbit.
    cycle : int or None
        Number of the 12-day cycle, read from the product name. For a pair it
        is the cycle of the first acquisition.
    orbit : int or None
        Absolute orbit number.
    bands : tuple of str
        Frequency bands of the product: ``A``, ``B`` or both.
    channels, side_channels : tuple of str
        Polarisation channels of the main frequency band (A) and of the side
        frequency band (B), for example ``HH``.
    bandwidth, side_bandwidth : int or None
        Range bandwidth of the main and of the side frequency band, in
        megahertz.
    coverage : {"full", "partial"} or None
        Whether the product covers its whole frame.
    joint : bool or None
        Whether the L-band and the S-band radar observed together.
    version : str or None
        Version of the product.
    size : int or None
        Size of the product file, in bytes.
    footprint : tuple
        Outline of the product on the ground: one ring of longitude and
        latitude pairs, in degrees, for each of its polygons.
    layers : tuple of ProductLayer
        The layers of the product that Lynkeus receives, as
        ``lynkeus.harmony.layers_of`` lists them. It is empty when none can
        be received.
    """

    id: Text
    name: Text
    product: ProductType
    collection: Text
    maturity: Maturity
    dates: tuple[date, ...] = Field(min_length=1, max_length=2)
    start: datetime
    end: datetime
    track: int
    frame: int
    direction: Direction
    cycle: int | None
    orbit: int | None
    bands: tuple[Text, ...]
    channels: tuple[Text, ...]
    side_channels: tuple[Text, ...]
    bandwidth: int | None
    side_bandwidth: int | None
    coverage: Coverage | None
    joint: bool | None
    version: str | None
    size: int | None
    footprint: tuple[Ring, ...]
    layers: tuple[ProductLayer, ...] = ()


class ProductsFound(Format):
    """The answer of a search.

    Attributes
    ----------
    found : int
        Number of products in the catalogue that match the search.
    products : tuple of Product
        The products returned, in the order of the search and from its
        offset. They are at most ``MOST_PRODUCTS``.
    """

    found: int = Field(ge=0)
    products: tuple[Product, ...]


class Attribute(Format):
    """An additional attribute of a record of the catalogue, with NASA's name for it and its values."""

    name: Text
    values: tuple[str, ...]


class ProductFile(Format):
    """A file of a product, with its address at the Alaska Satellite Facility.

    Attributes
    ----------
    name : str
        Name of the file.
    kind : {"data", "browse", "metadata", "quality"}
        What the file is: the product itself, an image of it, a description
        of it or a report on its quality.
    url : str
        Address of the file. The product itself needs an Earthdata account.
    size : int or None
        Size of the file, in bytes.
    format : str or None
        Format of the file, for example ``HDF5``.
    checksum : str or None
        Checksum of the file, after the name of its algorithm.
    """

    name: Text
    kind: Literal["data", "browse", "metadata", "quality"]
    url: Text
    size: int | None
    format: str | None
    checksum: str | None


class ProductDetail(Format):
    """Everything that the record of a product file states.

    Attributes
    ----------
    product : Product
        The product as the result list shows it.
    attributes : tuple of Attribute
        Every additional attribute of the record.
    files : tuple of ProductFile
        The files of the product.
    inputs : tuple of str
        Names of the product files from which the product was made.
    localities : tuple of str
        Kinds of surface and continents that the product covers.
    look : str or None
        Side to which the radar looked.
    software : str or None
        Program that made the product, with its version.
    identifiers : tuple of Attribute
        Identifiers of the processing, for example the composite release
        identifier (CRID).
    produced, recorded : datetime.datetime or None
        When the product was made, and when its record last changed.
    thumbnail : bool
        Whether the record has a small browse image.
    """

    product: Product
    attributes: tuple[Attribute, ...]
    files: tuple[ProductFile, ...]
    inputs: tuple[Text, ...]
    localities: tuple[Text, ...]
    look: str | None
    software: str | None
    identifiers: tuple[Attribute, ...]
    produced: datetime | None
    recorded: datetime | None
    thumbnail: bool


def _moment(written: str) -> datetime:
    """Return a moment written as in the catalogue, in Coordinated Universal Time."""
    return datetime.fromisoformat(written).astimezone(UTC)


def _first(attributes: Mapping[str, Any], name: str) -> str | None:
    values = attributes.get(name)
    return str(values[0]) if values else None


def _whole(attributes: Mapping[str, Any], name: str) -> int | None:
    value = _first(attributes, name)
    return None if value is None else int(value)


def _flag(attributes: Mapping[str, Any], name: str) -> bool | None:
    value = _first(attributes, name)
    return None if value is None else value == "TRUE"


def _attributes(umm: Mapping[str, Any]) -> dict[str, Any]:
    return {attribute["Name"]: attribute["Values"] for attribute in umm["AdditionalAttributes"]}


def _layers(product: ProductType, bands: Sequence[str], channels: Sequence[str]) -> tuple[ProductLayer, ...]:
    """List the layers of a product that Lynkeus receives.

    The layers of a GCOV, GUNW or GOFF product are those of its main
    frequency band (A), so a product whose record states only the side band
    has none. The level of validation of the product does not change them.
    """
    # The module of the layers reads this module, so it is imported here and not at the top.
    from lynkeus.harmony import layers_of

    if product != "SME2" and bands and "A" not in bands:
        return ()
    return tuple(
        ProductLayer(name=layer.name, title=layer.title, spacing=layer.spacing)
        for layer in layers_of(product, channels)
    )


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
        attributes = _attributes(umm)
        name = umm["GranuleUR"]
        period = umm["TemporalExtent"]["RangeDateTime"]
        start, end = _moment(period["BeginningDateTime"]), _moment(period["EndingDateTime"])
        # A product made from a pair of acquisitions states the start of each one.
        if "REFERENCE_ZERO_DOPPLER_START_TIME" in attributes:
            moments = [
                _moment(attributes["REFERENCE_ZERO_DOPPLER_START_TIME"][0]),
                _moment(attributes["SECONDARY_ZERO_DOPPLER_START_TIME"][0]),
            ]
        else:
            moments = [start]
        polygons = umm["SpatialExtent"]["HorizontalSpatialDomain"]["Geometry"].get("GPolygons", [])
        files = umm.get("DataGranule", {}).get("ArchiveAndDistributionInformation", [])
        orbits = [domain["OrbitNumber"] for domain in umm.get("OrbitCalculatedSpatialDomains", [])]
        cycle = _NAME_START.match(name)
        full = _flag(attributes, "FULL_FRAME")
        bands = tuple(attributes.get("FREQUENCIES", ()))
        channels = tuple(attributes.get("FREQUENCY_A_POLARIZATION", ()))
        return Product(
            id=meta["concept-id"],
            name=name,
            product=product,
            collection=collection.short_name,
            maturity=collection.maturity,
            dates=tuple(moment.date() for moment in moments),
            start=start,
            end=end,
            track=int(attributes["TRACK_NUMBER"][0]),
            frame=int(attributes["FRAME_NUMBER"][0]),
            direction=attributes["ASCENDING_DESCENDING"][0].lower(),
            cycle=int(cycle.group(1)) if cycle else None,
            orbit=orbits[0] if orbits else None,
            bands=bands,
            channels=channels,
            side_channels=tuple(attributes.get("FREQUENCY_B_POLARIZATION", ())),
            bandwidth=_whole(attributes, "FREQUENCY_A_RANGE_BANDWIDTH"),
            side_bandwidth=_whole(attributes, "FREQUENCY_B_RANGE_BANDWIDTH"),
            coverage=None if full is None else "full" if full else "partial",
            joint=_flag(attributes, "JOINT_OBSERVATION"),
            version=_first(attributes, "PRODUCT_VERSION"),
            size=next((file["SizeInBytes"] for file in files if file["Name"] == f"{name}.h5"), None),
            footprint=tuple(
                tuple((point["Longitude"], point["Latitude"]) for point in polygon["Boundary"]["Points"])
                for polygon in polygons
            ),
            layers=_layers(product, bands, channels),
        )
    except (KeyError, IndexError, TypeError, ValueError, ValidationError) as error:
        raise CatalogueError(f"a record of the catalogue could not be read: {error!r}") from error


_FILE_KINDS: Mapping[str, Literal["data", "browse", "metadata", "quality"]] = {
    "GET DATA": "data",
    "GET RELATED VISUALIZATION": "browse",
    "EXTENDED METADATA": "metadata",
    "VIEW RELATED INFORMATION": "quality",
}


def _files(umm: Mapping[str, Any]) -> tuple[ProductFile, ...]:
    """Return the files of a record that have a web address, each once and in the order of the record."""
    stated = {file["Name"]: file for file in umm.get("DataGranule", {}).get("ArchiveAndDistributionInformation", [])}
    files: dict[str, ProductFile] = {}
    for link in umm.get("RelatedUrls", []):
        url, kind = link["URL"], _FILE_KINDS.get(link["Type"])
        name = url.rsplit("/", 1)[-1]
        # The record also gives each file an address inside NASA's cloud, and the address of a service.
        if kind is None or not url.startswith("https://") or not name.startswith(umm["GranuleUR"]) or url in files:
            continue
        file = stated.get(name, {})
        checksum = file.get("Checksum")
        files[url] = ProductFile(
            name=name,
            kind=kind,
            url=url,
            size=file.get("SizeInBytes"),
            format=file.get("Format"),
            checksum=f"{checksum['Algorithm']} {checksum['Value']}" if checksum else None,
        )
    return tuple(files.values())


def _thumbnail(files: Sequence[ProductFile]) -> ProductFile | None:
    """Return the small browse image among the files of a product, or None."""
    return next((file for file in files if file.kind == "browse" and file.name.endswith("thumbnail.png")), None)


def detail_from_record(record: Mapping[str, Any]) -> ProductDetail:
    """Read everything that the record of a product file states.

    Parameters
    ----------
    record : Mapping
        Record of a product file in the UMM-G form of the catalogue.

    Raises
    ------
    CatalogueError
        If the record cannot be read.
    """
    product = product_from_record(record)
    try:
        meta, umm = record["meta"], record["umm"]
        granule = umm.get("DataGranule", {})
        files = _files(umm)
        software = umm.get("PGEVersionClass", {})
        looks = [
            characteristic["Value"]
            for platform in umm.get("Platforms", [])
            for instrument in platform.get("Instruments", [])
            for characteristic in instrument.get("Characteristics", [])
            if characteristic["Name"] == "LookDirection"
        ]
        return ProductDetail(
            product=product,
            attributes=tuple(Attribute(name=name, values=tuple(values)) for name, values in _attributes(umm).items()),
            files=files,
            inputs=tuple(umm.get("InputGranules", ())),
            localities=tuple(umm["SpatialExtent"].get("GranuleLocalities", ())),
            look=looks[0].lower() if looks else None,
            software=" ".join(software[key] for key in ("PGEName", "PGEVersion") if key in software) or None,
            identifiers=tuple(
                Attribute(
                    name=identifier.get("IdentifierName") or identifier["IdentifierType"],
                    values=(identifier["Identifier"],),
                )
                for identifier in granule.get("Identifiers", [])
                if identifier["IdentifierType"] != "ProducerGranuleId"
            ),
            produced=_moment(granule["ProductionDateTime"]) if "ProductionDateTime" in granule else None,
            recorded=_moment(meta["revision-date"]) if "revision-date" in meta else None,
            thumbnail=_thumbnail(files) is not None,
        )
    except (KeyError, IndexError, TypeError, ValueError, ValidationError) as error:
        raise CatalogueError(f"a record of the catalogue could not be read: {error!r}") from error


def _degrees(angle: float) -> str:
    """Write an angle with at most five decimals, which is about one metre on the ground."""
    return f"{angle:.5f}".rstrip("0").rstrip(".")


def _range(first: int, last: int) -> str:
    return str(first) if first == last else f"{first},{last}"


def _written(moment: datetime) -> str:
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


def _attribute_conditions(search: ProductSearch) -> list[str]:
    """Return the conditions on the additional attributes of the records, in the form of the catalogue.

    The catalogue finds a record only when it meets every condition.
    """
    conditions = []
    if search.track:
        conditions.append(f"int,TRACK_NUMBER,{_range(*search.track)}")
    if search.frame:
        conditions.append(f"int,FRAME_NUMBER,{_range(*search.frame)}")
    if search.direction:
        conditions.append(f"string,ASCENDING_DESCENDING,{search.direction.upper()}")
    conditions.extend(f"string,FREQUENCY_A_POLARIZATION,{channel}" for channel in search.channels)
    conditions.extend(f"string,FREQUENCY_B_POLARIZATION,{channel}" for channel in search.side_channels)
    conditions.extend(f"string,FREQUENCIES,{band}" for band in search.bands)
    if search.bandwidth is not None:
        conditions.append(f"int,FREQUENCY_A_RANGE_BANDWIDTH,{search.bandwidth}")
    if search.coverage:
        conditions.append(f"string,FULL_FRAME,{'TRUE' if search.coverage == 'full' else 'FALSE'}")
    if search.joint is not None:
        conditions.append(f"string,JOINT_OBSERVATION,{'TRUE' if search.joint else 'FALSE'}")
    if search.pair_inside and search.start and search.end:
        # The record writes the start of each acquisition as text, which the catalogue compares letter by letter.
        first = datetime.combine(search.start, time.min).isoformat()
        last = datetime.combine(search.end, time.max).isoformat()
        conditions.append(f"string,REFERENCE_ZERO_DOPPLER_START_TIME,{first},")
        conditions.append(f"string,SECONDARY_ZERO_DOPPLER_START_TIME,,{last}Z")
    return conditions


def collections_of(search: ProductSearch) -> list[str]:
    """Return the identifiers of the collections that a search reads."""
    types = _SEARCHED if search.product is None else {search.product: _SEARCHED[search.product]}
    return [
        collection.concept_id
        for collections in types.values()
        for collection in collections
        if collection.maturity in search.maturity
    ]


def catalogue_query(search: ProductSearch) -> Any:
    """Return the query of earthaccess that asks the catalogue for the products of a search."""
    query = earthaccess.DataGranules().concept_id(collections_of(search))
    if search.area:
        query.bounding_box(search.area.west, search.area.south, search.area.east, search.area.north)
    if search.polygons:
        # earthaccess takes one polygon, and the catalogue takes several when it is told to join them.
        query.params["polygon"] = [
            ",".join(f"{_degrees(longitude)},{_degrees(latitude)}" for longitude, latitude in ring)
            for ring in search.polygons
        ]
        if len(search.polygons) > 1:
            query.option("polygon", "or", True)
    first = datetime.combine(search.start, time.min, tzinfo=UTC) if search.start else None
    last = datetime.combine(search.end, time.max, tzinfo=UTC) if search.end else None
    if search.season and first and last:
        # earthaccess has no days of the year; the catalogue takes them after the two ends of the period.
        query.params["temporal"] = [f"{_written(first)},{_written(last)},{search.season[0]},{search.season[1]}"]
    elif first or last:
        query.temporal(first, last)
    conditions = _attribute_conditions(search)
    if conditions:
        query.params["attribute"] = conditions
    if search.orbit:
        query.orbit_number(*search.orbit)
    if search.names:
        query.readable_granule_name(list(search.names))
    elif search.cycle is not None and search.product:
        # No field of the record holds the cycle, so the search reads it in the name, where it follows the type.
        query.readable_granule_name([f"NISAR_??_??_{search.product}_{search.cycle:03d}_*"])
    query.params["sort_key"] = list(_SORT_KEYS[search.sort])
    return query


def _ask(query: Any, limit: int, offset: int = 0) -> tuple[int, list[dict[str, Any]]]:
    """Send a query to the catalogue and return the number of records that match, with the records of one page.

    Raises
    ------
    RefusedSearchError
        If the catalogue refuses the query.
    CatalogueError
        If the catalogue does not answer, or its answer cannot be read.
    """
    try:
        response = query.session.get(
            query._build_url(),
            headers=query.headers,
            params={"page_size": limit, "offset": offset},
            timeout=CATALOGUE_TIME,
        )
        if response.status_code == http.client.BAD_REQUEST:
            reasons = response.json().get("errors", [])
            raise RefusedSearchError(" ".join(str(reason) for reason in reasons) or "the search was refused")
        response.raise_for_status()
        return int(response.headers["CMR-Hits"]), response.json()["items"]
    except CatalogueError:
        raise
    except Exception as error:  # the libraries raise errors of several kinds, of themselves and of the network
        raise CatalogueError(f"the catalogue did not answer: {error!r}") from error


def search_products(search: ProductSearch) -> ProductsFound:
    """Find the products that match the choices of a search.

    Raises
    ------
    RefusedSearchError
        If the catalogue refuses the search, for example for a polygon that
        crosses itself.
    CatalogueError
        If the catalogue does not answer, or its answer cannot be read.
    """
    try:
        query = catalogue_query(search)
    except Exception as error:  # earthaccess checks the values that it is given
        raise CatalogueError(f"the search could not be written for the catalogue: {error!r}") from error
    found, records = _ask(query, MOST_PRODUCTS, search.offset)
    return ProductsFound(found=found, products=tuple(product_from_record(record) for record in records))


def _record(product_id: str) -> dict[str, Any]:
    """Return the record of one product file of the NISAR collections that Lynkeus reads."""
    if not _PRODUCT_ID.fullmatch(product_id):
        raise UnknownProductError(f"{product_id!r} is not the identifier of a product")
    try:
        query = earthaccess.DataGranules().concept_id([product_id])
    except Exception as error:
        raise CatalogueError(f"the search could not be written for the catalogue: {error!r}") from error
    _, records = _ask(query, 1)
    if not records or records[0]["meta"].get("collection-concept-id") not in _BY_CONCEPT_ID:
        raise UnknownProductError(f"the catalogue holds no NISAR product {product_id}")
    return records[0]


def product_detail(product_id: str) -> ProductDetail:
    """Return everything that the catalogue states about one product file.

    Parameters
    ----------
    product_id : str
        Identifier of the product file in the catalogue (concept id).

    Raises
    ------
    UnknownProductError
        If the catalogue holds no NISAR product under the identifier.
    CatalogueError
        If the catalogue does not answer, or its answer cannot be read.
    """
    return detail_from_record(_record(product_id))


def _fetch(url: str, redirects: int = 3) -> bytes:
    """Return the bytes at a public https address, following the redirections of its server."""
    address = urlsplit(url)
    if address.scheme != "https" or not address.hostname:
        raise CatalogueError("the address of a browse image is not an https address")
    connection = http.client.HTTPSConnection(address.hostname, timeout=CATALOGUE_TIME)
    try:
        connection.request("GET", f"{address.path}?{address.query}" if address.query else address.path)
        response = connection.getresponse()
        target = response.getheader("Location")
        if response.status in (301, 302, 303, 307, 308) and target and redirects > 0:
            return _fetch(urljoin(url, target), redirects - 1)
        if response.status != http.client.OK:
            raise CatalogueError(f"the server of the browse image answered {response.status}")
        content = response.read(MOST_BROWSE_BYTES + 1)
    except CatalogueError:
        raise
    except Exception as error:
        raise CatalogueError(f"the browse image could not be received: {error!r}") from error
    finally:
        connection.close()
    if len(content) > MOST_BROWSE_BYTES or not content.startswith(_PNG):
        raise CatalogueError("the browse image is too large or is not a PNG image")
    return content


def product_browse(product_id: str) -> bytes:
    """Return the small browse image of a product, as the bytes of a PNG file.

    The Alaska Satellite Facility serves the browse images without an
    Earthdata account.

    Raises
    ------
    UnknownProductError
        If the catalogue holds no NISAR product under the identifier, or the
        product has no small browse image.
    CatalogueError
        If the catalogue or the server of the image does not answer.
    """
    try:
        thumbnail = _thumbnail(_files(_record(product_id)["umm"]))
    except (KeyError, TypeError, ValidationError) as error:
        raise CatalogueError(f"a record of the catalogue could not be read: {error!r}") from error
    if thumbnail is None:
        raise UnknownProductError(f"the product {product_id} has no browse image")
    if urlsplit(thumbnail.url).hostname != BROWSE_HOST:
        raise CatalogueError("the browse image is not held by the Alaska Satellite Facility")
    return _fetch(thumbnail.url)
