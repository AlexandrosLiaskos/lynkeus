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
"""

import itertools
import math
import re
import signal
import tempfile
import time
from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from types import FrameType
from typing import Any

import earthaccess
import numpy as np
from harmony import BBox, Client, Collection, Request
from harmony.auth import BadAuthentication
from pydantic import Field

from lynkeus.layers import Area, Format, LayerDescription, LayerRequest, ProductType, Text
from lynkeus.products import COLLECTIONS, CatalogueError, Product, product_from_record
from lynkeus.writing import PROGRAM, LayerError, Rule, grid_of, read_layer, write_layer

MOST_CELLS = 25_000_000
"""The largest number of cells of a layer that Lynkeus receives. ``cells_of`` estimates the cells of an area."""

MOST_WAIT = 1800.0
"""The longest time that Lynkeus waits for a job of Harmony, in seconds."""

PAUSE = 3.0
"""The time between two questions about the state of a job of Harmony, in seconds."""

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

_RECORD = "https://cmr.earthdata.nasa.gov/search/concepts/{identifier}.umm_json"
_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
_LEVELS: dict[ProductType, str] = {"GCOV": "L2", "GUNW": "L2", "GOFF": "L2", "SME2": "L3"}
_WAITING = ("accepted", "running", "running_with_errors")

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

    ``spacing`` is the smallest cell size that the product specification gives
    for the layer, in metres. ``averaged`` is false for classes.
    """

    name: str
    title: str
    quantity: str
    unit: str
    legend: tuple[float, float] | Rule
    colours: str
    spacing: float
    averaged: bool = True


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

    Returns
    -------
    LayerDescription
        The description of the layer. Its values are those of the product, in
        the unit and on the grid of the product.

    Raises
    ------
    LayerError
        If the layer cannot be received. The message is one sentence for the
        visitor, and it never holds the token.
    """
    try:
        return _get_layer(request, token, layer_id, folder, address, report)
    except LayerError:
        raise
    except Exception as error:
        raise LayerError("Lynkeus could not prepare the layer because of an internal error.") from error


def _get_layer(
    request: LayerRequest, token: str | None, layer_id: str, folder: Path, address: str, report: Report
) -> LayerDescription:
    """Receive a layer and write its files."""
    report(0, "Finding the product in NASA's catalogue.")
    product, collection = _find(request.product, request.granule)
    layer = next((layer for layer in _layers(product.product, product.channels) if layer.name == request.layer), None)
    if layer is None:
        raise LayerError("The product does not hold this layer.")
    area = request.area
    if not _overlaps(area, product.footprint):
        raise LayerError("The area lies outside the product.")
    if cells_of(area, layer.spacing) > MOST_CELLS:
        raise LayerError(_too_large(cells_of(area, layer.spacing)))
    variable = _GROUPS[product.product] + layer.name
    with tempfile.TemporaryDirectory(dir=folder, prefix=".harmony-") as received:
        report(5, "Asking NASA Harmony for the layer.")
        file, job = _receive(_client(token), collection, product.id, variable, area, Path(received), report)
        grid = grid_of(file)
        if grid.width * grid.height > MOST_CELLS:
            raise LayerError(_too_large(grid.width * grid.height))
        values, grid = read_layer(file)
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
        lineage=(
            f"Layer {variable} of the NISAR product {product.name}, clipped to the area "
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
                    _Layer(channel + channel, f"Backscatter {channel}", quantity, "1", "percentiles", "grey", 10)
                )
        layers.append(
            _Layer(
                "rtcGammaToSigmaFactor",
                "Factor from gamma nought to sigma nought",
                "Factor that turns radar backscatter gamma nought into sigma nought",
                "1",
                "percentiles",
                "viridis",
                10,
            )
        )
        quantity = "Number of radar looks averaged in a cell"
        layers.append(_Layer("numberOfLooks", "Number of looks", quantity, "1", "percentiles", "viridis", 10))
        quantity = "Number of the subswath of the valid samples of a cell, or 0 where a sample is not valid"
        layers.append(_Layer("mask", "Mask of valid samples", quantity, "1", "extremes", "tab10", 10, averaged=False))
    elif product == "GUNW":
        for channel in channels:
            if channel in ("HH", "VV"):
                layers += _interferogram_layers(channel)
    elif product == "GOFF":
        for channel in channels:
            if channel in ("HH", "VV"):
                layers += [layer for number in (1, 2, 3) for layer in _offset_layers(channel, number)]
    else:
        layers.append(_Layer("soilMoisture", "Soil moisture", "Soil moisture", "m3 m-3", "percentiles", "YlGnBu", 200))
        quantity = "Uncertainty of soil moisture"
        layers.append(_Layer("soilMoistureUncertainty", quantity, quantity, "m3 m-3", "percentiles", "viridis", 200))
    return tuple(layers)


def _interferogram_layers(channel: str) -> list[_Layer]:
    """Return the layers of one channel of a GUNW product."""
    unwrapped, wrapped = f"unwrappedInterferogram/{channel}/", f"wrappedInterferogram/{channel}/"
    offsets = f"pixelOffsets/{channel}/"
    coherence = f"Interferometric coherence magnitude, {channel}"
    screen = f"Ionosphere phase screen {channel}"
    return [
        _Layer(
            unwrapped + "unwrappedPhase",
            f"Unwrapped phase {channel}",
            f"Unwrapped interferometric phase, {channel}",
            "rad",
            "symmetric",
            "RdBu",
            80,
        ),
        _Layer(
            unwrapped + "connectedComponents",
            f"Connected components {channel}",
            f"Connected component of the phase unwrapping, {channel}",
            "1",
            "extremes",
            "tab10",
            80,
            averaged=False,
        ),
        _Layer(unwrapped + "coherenceMagnitude", f"Coherence {channel}, 80 m", coherence, "1", (0.0, 1.0), "grey", 80),
        _Layer(unwrapped + "ionospherePhaseScreen", screen, screen, "rad", "percentiles", "viridis", 80),
        _Layer(
            unwrapped + "ionospherePhaseScreenUncertainty",
            f"Uncertainty of the ionosphere phase screen {channel}",
            f"Uncertainty of the ionosphere phase screen {channel}",
            "rad",
            "percentiles",
            "viridis",
            80,
        ),
        _Layer(wrapped + "coherenceMagnitude", f"Coherence {channel}, 20 m", coherence, "1", (0.0, 1.0), "grey", 20),
        *_offsets(offsets, channel),
    ]


def _offset_layers(channel: str, number: int) -> list[_Layer]:
    """Return the layers of one channel and one offset layer of a GOFF product.

    The product numbers its offset layers from 1, the finest resolution, to 3, the coarsest.
    """
    group = f"pixelOffsets/{channel}/layer{number}/"
    of = f"{channel}, layer {number}"
    ratio = f"Signal-to-noise ratio of the offsets {of}"
    return [*_offsets(group, of), _Layer(group + "snr", ratio, ratio, "1", "percentiles", "viridis", 80)]


def _offsets(group: str, of: str) -> list[_Layer]:
    """Return the two pixel offsets of a group and the peak of their correlation."""
    return [
        _Layer(
            group + "slantRangeOffset",
            f"Slant range offset {of}",
            f"Slant range offset, {of}",
            "m",
            "symmetric",
            "RdBu",
            80,
        ),
        _Layer(
            group + "alongTrackOffset",
            f"Along-track offset {of}",
            f"Along-track offset, {of}",
            "m",
            "symmetric",
            "RdBu",
            80,
        ),
        _Layer(
            group + "correlationSurfacePeak",
            f"Correlation peak of the offsets {of}",
            f"Normalized peak of the cross-correlation surface of the offsets, {of}",
            "1",
            (0.0, 1.0),
            "viridis",
            80,
        ),
    ]


def _find(product: ProductType, name: str) -> tuple[Product, str]:
    """Find a product by its name, and return it with the identifier of its collection."""
    name = name.removesuffix(".h5")
    # The catalogue reads * and ? in a name as wildcards, and a product name holds neither.
    if not re.fullmatch(r"[A-Za-z0-9_]+", name):
        raise LayerError("NASA's catalogue does not hold this product.")
    try:
        records = (
            earthaccess.DataGranules()
            .concept_id([collection.concept_id for collection in COLLECTIONS[product]])
            .granule_name(name)
            .get(10)
        )
        found = [record for record in records if record["umm"]["GranuleUR"] == name]
        if not found:
            raise LayerError("NASA's catalogue does not hold this product.")
        return product_from_record(found[0]), found[0]["meta"]["collection-concept-id"]
    except LayerError:
        raise
    except CatalogueError as error:
        raise LayerError("The record of the product in NASA's catalogue could not be read.") from error
    except Exception as error:  # the library raises errors of several kinds, of itself and of the network
        raise LayerError("NASA's catalogue did not answer.") from error


def _overlaps(area: Area, footprint: Sequence[Sequence[tuple[float, float]]]) -> bool:
    """Tell whether an area and the outline of a product have a point in common."""
    corners = [(area.west, area.south), (area.east, area.south), (area.east, area.north), (area.west, area.north)]
    sides = list(zip(corners, corners[1:] + corners[:1], strict=True))
    for ring in footprint:
        edges = list(itertools.pairwise([*ring, ring[0]]))
        if any(area.west <= x <= area.east and area.south <= y <= area.north for x, y in ring):
            return True
        if _inside(corners[0], edges):
            return True
        if any(_cross(edge, side) for edge in edges for side in sides):
            return True
    return False


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


def _too_large(cells: float) -> str:
    """Return the sentence for an area whose layer has too many cells."""
    return (
        f"The area is too large: the layer would have about {cells / 1e6:.0f} million cells, "
        f"and Lynkeus receives at most {MOST_CELLS / 1e6:.0f} million."
    )


def _day(day: date) -> str:
    """Write a day as the titles of the layers show it, for example ``21 Oct 2026``."""
    return f"{day.day} {_MONTHS[day.month - 1]} {day.year}"


def _client(token: str | None) -> Any:
    """Return a client of Harmony that signs its requests with the token, or with the credentials of the environment."""
    try:
        return Client() if token is None else Client(token=token)
    except BadAuthentication:
        refusal = LayerError("Earthdata Login did not accept the credentials of the server.")
    except Exception:
        refusal = LayerError("Earthdata Login did not answer.")
    raise refusal


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
        time.sleep(PAUSE)


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
