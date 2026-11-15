# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""Layers of NISAR products, received through NASA Harmony.

NASA Harmony clips one layer of a product file to an area and returns it as a
GeoTIFF. ``layers_of`` lists the layers of a product that Lynkeus receives,
and ``get_layer`` receives one of them: it finds the product in NASA's
catalogue, asks Harmony for the layer, follows the job of Harmony, fetches
the result and hands the values to ``lynkeus.writing``, which writes the files
of the layer.

The names, the quantities and the units of the layers follow the NISAR
product specifications: JPL D-102274 (GCOV), JPL D-102272 (GUNW),
JPL D-105010 (GOFF) and JPL D-107677 (SME2).

The layer ``unwrappedPhase`` of a GUNW product needs the centre frequency of
its radar band to be read as a distance. Harmony does not deliver the field
``centerFrequency`` of the product, so ``get_layer`` reads the same value
from the ISO XML file that accompanies the product in NASA's archive
(``docs/research/analysis-displacement.md``, part 2.3). It does so for this
layer only.
"""

import itertools
import math
import os
import re
import secrets
import shutil
import signal
import time
from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from types import FrameType
from typing import Any
from urllib.parse import urlsplit

import earthaccess
import numpy as np
from harmony import BBox, Client, Collection, Request
from harmony.auth import BadAuthentication
from pydantic import Field

from lynkeus.layers import Area, Format, LayerDescription, LayerRequest, ProductType, Text
from lynkeus.products import BETA_COLLECTIONS, COLLECTIONS, CatalogueError, Product, product_from_record
from lynkeus.writing import PROGRAM, LayerError, Rule, grid_of, read_layer, write_layer

MOST_CELLS = 25_000_000
"""The largest number of cells of a layer that the project server receives. ``cells_of`` estimates the cells of an area.

An own server receives as many cells as its owner set (``lynkeus.linking.ServerLimits.layer_cells``);
its jobs hand that limit to ``get_layer``.
"""

MOST_WAIT = 1800.0
"""The longest time that Lynkeus waits for a job of Harmony, in seconds."""

PAUSE = 3.0
"""The time between two questions about the state of a job of Harmony, in seconds."""

STEP = 0.2
"""The longest part of a pause that passes at once, in seconds.

A request to end the process is acted on between two parts. On Windows a pause is not interrupted by
that request, and a job has ``lynkeus.jobs.END_TIME`` seconds to cancel its request at Harmony.
"""

REMOVAL_TRIES = 5
"""The number of times that the removal of the folder of the received file is tried.

Windows refuses to remove a file for the moment in which another program reads it, for example a
virus scanner that looks at a new file.
"""

MOST_FAILURES = 3
"""The number of questions in a row that Harmony may leave without an answer."""

EARTH_RADIUS = 6_371_008.8
"""The mean radius of the Earth (GRS 80), in metres."""

_GROUPS: dict[ProductType, str] = {
    "GCOV": "/science/LSAR/GCOV/grids/frequencyA/",
    "GUNW": "/science/LSAR/GUNW/grids/frequencyA/",
    "GOFF": "/science/LSAR/GOFF/grids/frequencyA/",
    "SME2": "/science/LSAR/SME2/grids/",
}
"""The group of each product type that holds its layers. The name of a layer is its path inside this group."""

_NAMED_A = "Frequency A"
"""The words with which NASA's catalogue begins the name of each layer of the group ``frequencyA``."""

_RECORD = "https://cmr.earthdata.nasa.gov/search/concepts/{identifier}.umm_json"
_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
_LEVELS: dict[ProductType, str] = {"GCOV": "L2", "GUNW": "L2", "GOFF": "L2", "SME2": "L3"}
_WAITING = ("accepted", "running", "running_with_errors")

# The additional attributes of the ISO XML file of a product, and the description of the one that holds the
# centre frequency of the group ``frequencyA``, in hertz, the group whose layers Lynkeus receives.
_ATTRIBUTE = re.compile(r"<eos:EOS_AdditionalAttribute>.*?</eos:EOS_AdditionalAttribute>", re.DOTALL)
_FREQUENCY_A = "center frequency of the processed image - frequency A"

type Report = Callable[[int, str], None]


class LayerChoice(Format):
    """A layer of a product that Lynkeus receives.

    Attributes
    ----------
    name : str
        Name of the layer, as ``LayerRequest.layer`` takes it.
    title : str
        Name of the layer for the visitor.
    spacing : float
        Smallest cell size that the product specification gives for the
        layer, in metres. The cells of a product are of this size or larger,
        so ``cells_of`` with this size gives the largest number of cells that
        an area can have.
    """

    name: Text
    title: Text
    spacing: float = Field(gt=0)


@dataclass(frozen=True)
class _Layer:
    """What Lynkeus knows about a layer of a product.

    ``title`` is the name that NASA's catalogue gives the variable of the
    layer: the field ``LongName`` of its variable record. ``spacing`` is the
    smallest cell size that the product specification gives for the layer, in
    metres. ``averaged`` is false for classes. ``frequency`` is true for the
    layer that an analysis tool reads as a distance: its description then
    carries the centre frequency of the radar band.
    """

    name: str
    title: str
    quantity: str
    unit: str
    legend: tuple[float, float] | Rule
    colours: str
    spacing: float
    averaged: bool = True
    frequency: bool = False


class _Ended(BaseException):
    """The process was asked to end while Harmony was preparing a layer."""


def layers_of(product: ProductType, channels: Sequence[str]) -> tuple[LayerChoice, ...]:
    """List the layers of a product that Lynkeus receives.

    Parameters
    ----------
    product : {"GCOV", "GUNW", "GOFF", "SME2"}
        Product type.
    channels : sequence of str
        Polarisation channels of the main frequency band of the product, as
        the search gives them, for example ``("HH", "HV")``.

    Returns
    -------
    tuple of LayerChoice
        The layers, each with the name that a layer request takes, its name
        for the visitor and its smallest cell size.
    """
    return tuple(
        LayerChoice(name=layer.name, title=layer.title, spacing=layer.spacing) for layer in _layers(product, channels)
    )


def cells_of(area: Area, spacing: float) -> float:
    """Estimate the number of cells of a layer clipped to an area.

    Parameters
    ----------
    area : Area
        The area, in degrees of longitude and latitude.
    spacing : float
        The cell size of the layer, in metres.

    Returns
    -------
    float
        The surface of the area on a sphere of the mean radius of the Earth,
        divided by the surface of a cell.
    """
    width = math.radians(area.east - area.west)
    height = math.sin(math.radians(area.north)) - math.sin(math.radians(area.south))
    return EARTH_RADIUS**2 * width * height / spacing**2


def get_layer(
    request: LayerRequest,
    *,
    token: str | None,
    layer_id: str,
    folder: Path,
    address: str,
    report: Report,
    most_cells: int | None = None,
) -> LayerDescription:
    """Receive a layer of a NISAR product, clipped to an area, and write its files.

    Parameters
    ----------
    request : LayerRequest
        The product, the layer and the area.
    token : str or None
        The Earthdata Login token of the visitor. ``None`` uses the Earthdata
        credentials of the environment.
    layer_id : str
        The ``id`` that the layer receives.
    folder : pathlib.Path
        The existing empty folder that receives the two files of the layer.
    address : str
        The address of the folder for the browser.
    report : callable
        Called with the progress, from 0 to 100, and a sentence about it.
    most_cells : int or None
        The largest number of cells of the layer: the limit of the server that runs the job. ``None``
        is ``MOST_CELLS``, the limit of the project server.

    Returns
    -------
    LayerDescription
        The description of the layer. Its values are those of the product, in
        the unit and on the grid of the product. Its field ``layer`` holds the
        name of the layer as the request gave it. Its field ``frequency``
        holds the centre frequency of the radar band, in hertz, when the
        layer is the layer ``unwrappedPhase`` of a GUNW product and the ISO
        XML file of the product states the frequency; otherwise it holds None.

    Raises
    ------
    LayerError
        If the layer cannot be received. The message is one sentence for the
        visitor, and it never holds the token.
    """
    try:
        return _get_layer(request, token, layer_id, folder, address, report, most_cells)
    except LayerError:
        raise
    except Exception as error:
        raise LayerError("Lynkeus could not prepare the layer because of an internal error.") from error


def _get_layer(
    request: LayerRequest,
    token: str | None,
    layer_id: str,
    folder: Path,
    address: str,
    report: Report,
    most_cells: int | None,
) -> LayerDescription:
    """Receive a layer and write its files."""
    report(0, "Finding the product in NASA's catalogue.")
    product, collection, metadata = _find(request.product, request.granule)
    layer = next((layer for layer in _layers(product.product, product.channels) if layer.name == request.layer), None)
    if layer is None:
        raise LayerError("The product does not hold this layer.")
    area = request.area
    if not _overlaps(area, product.footprint):
        raise LayerError("The area lies outside the product.")
    if cells_of(area, layer.spacing) > (MOST_CELLS if most_cells is None else most_cells):
        raise LayerError(_too_large(cells_of(area, layer.spacing), most_cells))
    variable = _GROUPS[product.product] + layer.name
    with _folder_for_received_file(folder) as received:
        report(5, "Asking NASA Harmony for the layer.")
        client = _client(token)
        file, job = _receive(client, collection, product.id, variable, area, received, report)
        grid = grid_of(file)
        if grid.width * grid.height > (MOST_CELLS if most_cells is None else most_cells):
            raise LayerError(_too_large(grid.width * grid.height, most_cells))
        values, grid = read_layer(file)
        frequency = _centre_frequency(client, metadata, received) if layer.frequency else None
    if np.isnan(values).all():
        raise LayerError("The product holds no data in the area.")
    report(90, "Writing the layer.")
    days = "-".join(day.strftime("%Y%m%d") for day in product.dates)
    reduced = "averaging" if layer.averaged else "taking the most frequent value"
    description = write_layer(
        values,
        grid,
        layer_id=layer_id,
        folder=folder,
        address=address,
        name=re.sub(r"[^a-z0-9]+", "-", f"{product.product}-{layer.name}-{days}".lower()),
        title=f"{layer.title}, {' to '.join(_day(day) for day in product.dates)}",
        kind="layer",
        quantity=layer.quantity,
        unit=layer.unit,
        legend=layer.legend,
        colours=layer.colours,
        dates=product.dates,
        inputs=(f"{product.name}.h5",),
        layer=request.layer,
        frequency=frequency,
        lineage=(
            f"Layer {variable} of the NISAR product {product.name} ({product.maturity.lower()}), clipped to the area "
            f"{area.west}, {area.south}, {area.east}, {area.north} (west, south, east and north, in degrees) "
            f"by NASA Harmony (job {job}), and written by {PROGRAM} with reduced copies made by {reduced}."
        ),
        level=_LEVELS[product.product],
        links=(
            {
                "rel": "via",
                "href": _RECORD.format(identifier=product.id),
                "type": "application/json",
                "title": "Record of the product in NASA's Common Metadata Repository",
            },
        ),
        averaged=layer.averaged,
    )
    report(100, "The layer is ready.")
    return description


@contextmanager
def _folder_for_received_file(folder: Path) -> Iterator[Path]:
    """Make a folder inside the folder of a layer for the file that Harmony hands over, and remove it after the block.

    The folder is made with ``Path.mkdir`` and so takes the permissions of the folder of the layer.
    ``tempfile`` would give it to the present user alone, and on Windows a program that runs with
    reduced rights, as inside a sandbox, could then not write into it.
    """
    received = folder / f".harmony-{secrets.token_hex(8)}"
    received.mkdir()
    try:
        yield received
    finally:
        for attempt in range(REMOVAL_TRIES):
            shutil.rmtree(received, ignore_errors=True)
            if not received.exists():
                break
            if attempt + 1 < REMOVAL_TRIES:
                time.sleep(STEP * (attempt + 1))


def _pause(seconds: float) -> None:
    """Wait for a time in parts of at most ``STEP`` seconds, so that a request to end the process is acted on soon."""
    end = time.monotonic() + seconds
    while (left := end - time.monotonic()) > 0:
        time.sleep(min(left, STEP))


def _layers(product: ProductType, channels: Sequence[str]) -> tuple[_Layer, ...]:
    """Return the layers of a product that Lynkeus receives, with what it knows about each."""
    layers: list[_Layer] = []
    if product == "GCOV":
        # A diagonal term of the covariance matrix is the backscatter of one channel. Harmony lists
        # no term of the compact channels RH and RV.
        for channel in channels:
            if channel in ("HH", "HV", "VH", "VV"):
                quantity = f"Radar backscatter gamma nought, {channel}, linear power"
                layers.append(
                    _Layer(
                        channel + channel,
                        f"{_NAMED_A} {channel}{channel}",
                        quantity,
                        "1",
                        "percentiles",
                        "grey",
                        10,
                    )
                )
        layers.append(
            _Layer(
                "rtcGammaToSigmaFactor",
                f"{_NAMED_A} RTC Gamma to Sigma Factor",
                "Factor that turns radar backscatter gamma nought into sigma nought",
                "1",
                "percentiles",
                "viridis",
                10,
            )
        )
        quantity = "Number of radar looks averaged in a cell"
        layers.append(
            _Layer("numberOfLooks", f"{_NAMED_A} Number of Looks", quantity, "1", "percentiles", "viridis", 10)
        )
        quantity = "Number of the subswath of the valid samples of a cell, or 0 where a sample is not valid"
        layers.append(_Layer("mask", f"{_NAMED_A} Mask", quantity, "1", "extremes", "tab10", 10, averaged=False))
    elif product == "GUNW":
        for channel in channels:
            if channel in ("HH", "VV"):
                layers += _interferogram_layers(channel)
    elif product == "GOFF":
        for channel in channels:
            if channel in ("HH", "VV"):
                layers += [layer for number in (1, 2, 3) for layer in _offset_layers(channel, number)]
    else:
        layers.append(_Layer("soilMoisture", "Soil Moisture", "Soil moisture", "m3 m-3", "percentiles", "YlGnBu", 200))
        quantity = "Uncertainty of soil moisture"
        layers.append(
            _Layer(
                "soilMoistureUncertainty",
                "Soil Moisture Uncertainty",
                quantity,
                "m3 m-3",
                "percentiles",
                "viridis",
                200,
            )
        )
        # Whole numbers whose lowest bit is set where the mission does not recommend the retrieval (JPL D-107677
        # Rev C, page 37). The tools of the group Soil moisture leave those cells out.
        quantity = "Retrieval quality flag of the soil moisture, whose lowest bit marks a retrieval not recommended"
        layers.append(
            _Layer(
                "retrievalQualityFlag",
                "Retrieval Quality Flag",
                quantity,
                "1",
                "extremes",
                "tab10",
                200,
                averaged=False,
            )
        )
    return tuple(layers)


def _interferogram_layers(channel: str) -> list[_Layer]:
    """Return the layers of one channel of a GUNW product."""
    unwrapped, wrapped = f"unwrappedInterferogram/{channel}/", f"wrappedInterferogram/{channel}/"
    offsets = f"pixelOffsets/{channel}/"
    named = f"{_NAMED_A} {channel}"
    coherence = f"Interferometric coherence magnitude, {channel}"
    screen = f"Ionosphere phase screen {channel}"
    return [
        _Layer(
            unwrapped + "unwrappedPhase",
            f"{named} Unwrapped Phase",
            f"Unwrapped interferometric phase, {channel}",
            "rad",
            "symmetric",
            "RdBu",
            80,
            frequency=True,
        ),
        _Layer(
            unwrapped + "connectedComponents",
            f"{named} Unwrapped Interferogram Connected Components",
            f"Connected component of the phase unwrapping, {channel}",
            "1",
            "extremes",
            "tab10",
            80,
            averaged=False,
        ),
        _Layer(
            unwrapped + "coherenceMagnitude",
            f"{named} Unwrapped Interferogram Coherence Magnitude",
            coherence,
            "1",
            (0.0, 1.0),
            "grey",
            80,
        ),
        _Layer(
            unwrapped + "ionospherePhaseScreen",
            f"{named} Ionosphere Phase Screen",
            screen,
            "rad",
            "percentiles",
            "viridis",
            80,
        ),
        _Layer(
            unwrapped + "ionospherePhaseScreenUncertainty",
            f"{named} Ionosphere Phase Screen Uncertainty",
            f"Uncertainty of the ionosphere phase screen {channel}",
            "rad",
            "percentiles",
            "viridis",
            80,
        ),
        _Layer(
            wrapped + "coherenceMagnitude",
            f"{named} Wrapped Interferogram Coherence Magnitude",
            coherence,
            "1",
            (0.0, 1.0),
            "grey",
            20,
        ),
        *_offsets(offsets, channel, named),
    ]


def _offset_layers(channel: str, number: int) -> list[_Layer]:
    """Return the layers of one channel and one offset layer of a GOFF product.

    The product numbers its offset layers from 1, the finest resolution, to 3, the coarsest.
    """
    group = f"pixelOffsets/{channel}/layer{number}/"
    of = f"{channel}, layer {number}"
    named = f"{_NAMED_A} {channel} Layer {number}"
    ratio = f"Signal-to-noise ratio of the offsets {of}"
    return [
        *_offsets(group, of, named),
        _Layer(group + "snr", f"{named} SNR", ratio, "1", "percentiles", "viridis", 80),
    ]


def _offsets(group: str, of: str, named: str) -> list[_Layer]:
    """Return the two pixel offsets of a group and the peak of their correlation.

    ``of`` names the channel, and the offset layer, in the description of a layer. ``named`` is the beginning of
    the names that NASA's catalogue gives the layers of the group.
    """
    return [
        _Layer(
            group + "slantRangeOffset",
            f"{named} Slant Range Offset",
            f"Slant range offset, {of}",
            "m",
            "symmetric",
            "RdBu",
            80,
        ),
        _Layer(
            group + "alongTrackOffset",
            f"{named} Along Track Offset",
            f"Along-track offset, {of}",
            "m",
            "symmetric",
            "RdBu",
            80,
        ),
        _Layer(
            group + "correlationSurfacePeak",
            f"{named} Correlation Surface Peak",
            f"Normalized peak of the cross-correlation surface of the offsets, {of}",
            "1",
            (0.0, 1.0),
            "viridis",
            80,
        ),
    ]


def _find(product: ProductType, name: str) -> tuple[Product, str, str | None]:
    """Find a product by its name.

    Returns the product, the identifier of its collection and the address of
    its ISO XML file, which is None when the record of the product names no
    such file.
    """
    name = name.removesuffix(".h5")
    # The catalogue reads * and ? in a name as wildcards, and a product name holds neither.
    if not re.fullmatch(r"[A-Za-z0-9_]+", name):
        raise LayerError("NASA's catalogue does not hold this product.")
    collections = (*COLLECTIONS[product], BETA_COLLECTIONS[product])
    try:
        records = (
            earthaccess.DataGranules()
            .concept_id([collection.concept_id for collection in collections])
            .granule_name(name)
            .get(10)
        )
        found = [record for record in records if record["umm"]["GranuleUR"] == name]
        if not found:
            raise LayerError("NASA's catalogue does not hold this product.")
        return product_from_record(found[0]), found[0]["meta"]["collection-concept-id"], _metadata_file(found[0])
    except LayerError:
        raise
    except CatalogueError as error:
        raise LayerError("The record of the product in NASA's catalogue could not be read.") from error
    except Exception as error:  # the library raises errors of several kinds, of itself and of the network
        raise LayerError("NASA's catalogue did not answer.") from error


def _metadata_file(record: Any) -> str | None:
    """Return the address of the ISO XML file of a product, from its record in the catalogue, or None.

    The file is fetched with the credentials of the request, so only an address
    that begins with ``https://`` and whose host is under ``nasa.gov`` is returned.
    """
    for link in record["umm"].get("RelatedUrls", []):
        address = str(link.get("URL", ""))
        host = urlsplit(address).hostname or ""
        if address.startswith("https://") and address.endswith(".h5.iso.xml") and host.endswith(".nasa.gov"):
            return address
    return None


def _centre_frequency(client: Any, address: str | None, folder: Path) -> float | None:
    """Read the centre frequency of the radar band of a product from its ISO XML file.

    Parameters
    ----------
    client : harmony.Client
        The client of Harmony, which fetches the file with the credentials of the request.
    address : str or None
        The address of the ISO XML file of the product.
    folder : pathlib.Path
        The folder that receives the file.

    Returns
    -------
    float or None
        The value of the additional attribute ``center frequency`` of the file whose description is
        "center frequency of the processed image - frequency A" and whose unit is ``Hz``: the centre
        frequency of the group ``frequencyA`` of the product, in hertz. None when the product has no such
        file, when the file cannot be fetched or read, and when it does not hold exactly one such attribute
        with a finite value above zero. The layer is then received without a centre frequency.
    """
    if address is None:
        return None
    try:
        text = Path(client.download(address, directory=str(folder), overwrite=True).result()).read_text("utf-8")
    except Exception:  # a failure of the network or of Earthdata Login, or a file that is not text
        return None
    values = [
        _field(attribute, "value")
        for attribute in _ATTRIBUTE.findall(text)
        if _field(attribute, "name") == "center frequency"
        and _field(attribute, "description") == _FREQUENCY_A
        and _field(attribute, "parameterUnitsOfMeasure") == "Hz"
    ]
    if len(values) != 1 or values[0] is None:
        return None
    try:
        frequency = float(values[0])
    except ValueError:
        return None
    return frequency if math.isfinite(frequency) and frequency > 0 else None


def _field(attribute: str, name: str) -> str | None:
    """Return the text of a field of an additional attribute of an ISO XML file, or None when it has none."""
    found = re.search(rf"<eos:{name}>\s*<eos:CharacterString>([^<]*)</eos:CharacterString>", attribute)
    return found[1].strip() if found else None


def _overlaps(area: Area, footprint: Sequence[Sequence[tuple[float, float]]]) -> bool:
    """Tell whether an area and the outline of a product have a point in common."""
    for ring in footprint:
        points = [*ring, ring[0]]
        # The catalogue cuts an outline at the meridian of 180 degrees into two rings. A ring that
        # crosses it all the same jumps from one side to the other: its western longitudes are then
        # counted beyond 180, and the area is compared on both sides.
        crosses = any(abs(second[0] - first[0]) > 180 for first, second in itertools.pairwise(points))
        if crosses:
            points = [(x + 360 if x < 0 else x, y) for x, y in points]
        for turn in (0.0, 360.0) if crosses else (0.0,):
            if _box_meets_ring(area.west + turn, area.south, area.east + turn, area.north, points):
                return True
    return False


def _box_meets_ring(west: float, south: float, east: float, north: float, ring: Sequence[tuple[float, float]]) -> bool:
    """Tell whether a box and a closed ring have a point in common."""
    corners = [(west, south), (east, south), (east, north), (west, north)]
    sides = list(itertools.pairwise([*corners, corners[0]]))
    edges = list(itertools.pairwise(ring))
    if any(west <= x <= east and south <= y <= north for x, y in ring):
        return True
    if _inside(corners[0], edges):
        return True
    return any(_cross(edge, side) for edge in edges for side in sides)


def _inside(point: tuple[float, float], edges: Sequence[tuple[tuple[float, float], tuple[float, float]]]) -> bool:
    """Tell whether a point lies inside a ring, by counting the edges that a line to the east of it crosses."""
    x, y = point
    crossings = 0
    for (x1, y1), (x2, y2) in edges:
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            crossings += 1
    return crossings % 2 == 1


def _cross(
    first: tuple[tuple[float, float], tuple[float, float]], second: tuple[tuple[float, float], tuple[float, float]]
) -> bool:
    """Tell whether two segments cross each other."""

    def side(a: tuple[float, float], b: tuple[float, float], c: tuple[float, float]) -> float:
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

    (a, b), (c, d) = first, second
    return side(a, b, c) * side(a, b, d) < 0 and side(c, d, a) * side(c, d, b) < 0


def _too_large(cells: float, most_cells: int | None = None) -> str:
    """Return the sentence for an area whose layer has too many cells. It names the limit in force.

    The cells of the layer are rounded up to a whole million, so that the sentence never states the
    same number twice.
    """
    limit = MOST_CELLS if most_cells is None else most_cells
    receiver = "Lynkeus receives" if most_cells is None else "this server receives"
    return (
        f"The area is too large: the layer would have about {math.ceil(cells / 1e6)} million cells, "
        f"and {receiver} at most {limit / 1e6:.0f} million."
    )


def _day(day: date) -> str:
    """Write a day as the titles of the layers show it, for example ``21 Oct 2026``."""
    return f"{day.day} {_MONTHS[day.month - 1]} {day.year}"


def _client(token: str | None) -> Any:
    """Return a client of Harmony that signs its requests with the token, or with the credentials of the environment."""
    try:
        client = Client() if token is None else Client(token=token)
        _check_certificates_as_the_environment_asks(client)
        return client
    except BadAuthentication:
        refusal = LayerError("Earthdata Login did not accept the credentials of the server.")
    except Exception:
        refusal = LayerError("Earthdata Login did not answer.")
    raise refusal


def _check_certificates_as_the_environment_asks(client: Any) -> None:
    """Let every request of a client of Harmony check certificates against the file that the environment names.

    ``requests`` reads the environment variables ``REQUESTS_CA_BUNDLE`` and ``CURL_CA_BUNDLE`` for a
    request that it prepares itself. harmony-py prepares the request that submits a job on its own,
    and that request would be checked against the list of ``certifi`` alone: on a network whose proxy
    shows certificates of an authority of its own, it would fail while every other request passes.
    """
    bundle = os.environ.get("REQUESTS_CA_BUNDLE") or os.environ.get("CURL_CA_BUNDLE")
    session = getattr(client, "session", None)
    if bundle and session is not None:
        session.verify = bundle


def _ask[Answer](question: Callable[[], Answer]) -> Answer:
    """Put a question to the client of Harmony.

    An error of the client is replaced by an error for the visitor and is not
    kept with it, because it holds the request with the token.
    """
    try:
        return question()
    except LayerError:
        raise
    except Exception as error:
        refusal = _refusal(error)
    raise refusal


def _receive(
    client: Any, collection: str, granule: str, variable: str, area: Area, folder: Path, report: Report
) -> tuple[Path, str]:
    """Ask Harmony for a layer, follow its job and fetch the result into a folder.

    The job of Harmony is cancelled when it fails to give the layer, when it
    takes too long, and when the process is asked to end.
    """
    request = Request(
        collection=Collection(id=collection),
        spatial=BBox(area.west, area.south, area.east, area.north),
        granule_id=[granule],
        variables=[variable],
        format="image/tiff",
    )
    jobs: list[str] = []
    try:
        with _ending_raises() as ending:
            with ending.held_back():
                jobs.append(_submit(client, request))
            _follow(client, jobs[0], report)
        report(85, "Receiving the layer from NASA Harmony.")
        return _fetch(client, jobs[0], folder), jobs[0]
    except _Ended:
        _cancel(client, jobs)
        # The signal is passed on to whatever handled it before Lynkeus did.
        signal.raise_signal(signal.SIGTERM)
        raise LayerError("The layer was cancelled.") from None
    except Exception:
        _cancel(client, jobs)
        raise


def _submit(client: Any, request: Any) -> str:
    """Send a request to Harmony and return the identifier of its job."""
    answer = _ask(lambda: client.submit(request))
    return str(answer["jobID"] if isinstance(answer, dict) else answer)


def _follow(client: Any, job: str, report: Report) -> None:
    """Wait until Harmony finishes a job, and report its progress."""
    start = time.monotonic()
    failures = 0
    while True:
        refusal = None
        try:
            state = client.status(job)
            failures = 0
        except Exception as error:
            failures += 1
            refusal = _refusal(error) if failures >= MOST_FAILURES else None
            state = {"status": "running", "progress": None}
        if refusal is not None:
            raise refusal
        if state["status"] == "successful":
            return
        if state["status"] not in _WAITING:
            raise LayerError(_failure(str(state.get("message", ""))))
        if time.monotonic() - start > MOST_WAIT:
            raise LayerError(f"NASA Harmony did not prepare the layer within {MOST_WAIT / 60:.0f} minutes.")
        if state["progress"] is not None:
            # The job of Harmony takes the part of the progress from 5 to 80.
            report(5 + round(0.75 * min(max(int(state["progress"]), 0), 100)), "NASA Harmony is preparing the layer.")
        _pause(PAUSE)


def _fetch(client: Any, job: str, folder: Path) -> Path:
    """Fetch the GeoTIFF that a finished job of Harmony holds."""
    addresses = _ask(lambda: [address for address in client.result_urls(job) if ".tif" in address.lower()])
    if len(addresses) != 1:
        raise LayerError("NASA Harmony did not return one GeoTIFF for the layer.")
    return Path(_ask(lambda: client.download(addresses[0], directory=str(folder), overwrite=True).result()))


def _cancel(client: Any, jobs: Sequence[str]) -> None:
    """Ask Harmony to cancel a job. Harmony refuses when the job has finished, which needs no action."""
    for job in jobs:
        try:
            client.cancel(job)
        except Exception:  # noqa: S112
            continue


_LICENCE = (
    "Earthdata Login reports that the licence agreement of the data is not accepted; "
    "accept it in your Earthdata Login profile and try again."
)


def _failure(message: str) -> str:
    """Return the sentence for a job that Harmony ended without the layer, from the message of Harmony."""
    text = message.lower()
    if "eula" in text or "license agreement" in text:
        return _LICENCE
    if "no matching granules" in text:
        return "The area lies outside the product."
    if "none of the requested variables" in text:
        return "The product does not hold this layer."
    return "NASA Harmony could not prepare the layer."


def _refusal(error: Exception) -> LayerError:
    """Return the error for the visitor when Earthdata Login or Harmony refuses or fails."""
    reason = str(error.args[0]) if error.args else ""
    status = getattr(getattr(error, "response", None), "status_code", None)
    text = " ".join(str(part) for part in error.args).lower()
    if "eula" in text or "license agreement" in text:
        return LayerError(_LICENCE)
    if reason == "Unauthorized" or status == 401:
        return LayerError("Earthdata Login did not accept the token; sign in again with a new one.")
    if reason == "Forbidden" or status == 403:
        return LayerError("Earthdata Login does not allow this account to receive the product.")
    # An error of the network carries no answer of Harmony.
    if isinstance(error, OSError) and status is None:
        return LayerError("NASA Harmony did not answer.")
    return LayerError("NASA Harmony did not accept the request for the layer.")


class _Ending:
    """What Lynkeus does when the process is asked to end (SIGTERM) while Harmony prepares a layer.

    The request raises ``_Ended`` in the main thread, so that the job of
    Harmony can be cancelled. While the request is held back it is only
    noted, so that the identifier of a job that is being submitted is not
    lost; it is raised when the holding back ends.
    """

    def __init__(self) -> None:
        self._held = False
        self._noted = False

    def __call__(self, number: int, frame: FrameType | None) -> None:
        """Receive the signal."""
        if not self._held:
            raise _Ended
        self._noted = True

    @contextmanager
    def held_back(self) -> Iterator[None]:
        """Hold the request back until the end of the block."""
        self._held = True
        try:
            yield
        finally:
            self._held = False
            if self._noted:
                raise _Ended


@contextmanager
def _ending_raises() -> Iterator[_Ending]:
    """Receive the signal that ends the process (SIGTERM) in Lynkeus for the time of a block."""
    ending = _Ending()
    try:
        before = signal.signal(signal.SIGTERM, ending)
    except ValueError:  # a signal can be handled only in the main thread
        yield ending
        return
    try:
        yield ending
    finally:
        signal.signal(signal.SIGTERM, before)
