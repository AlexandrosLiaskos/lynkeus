"""Tests of the layers received through NASA Harmony.

No test contacts NASA. A stand-in takes the place of the client of Harmony:
it records what is asked and hands over a file of ``tests/data/layers``,
which ``tests/test_writing.py`` describes. The records of the products are
those of ``tests/test_products.py``. ``harmony-variables.json`` holds the
layers that the capabilities of Harmony listed for each NISAR collection on
14 November 2026 (https://harmony.earthdata.nasa.gov/capabilities).
"""

import itertools
import json
import os
import shutil
import signal
import time
from collections.abc import Iterator
from concurrent.futures import Future
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import earthaccess
import numpy as np
import pytest
import rasterio
from harmony.auth import BadAuthentication

from lynkeus import harmony
from lynkeus.harmony import LayerChoice, cells_of, get_layer, layers_of
from lynkeus.layers import Area, LayerRequest
from lynkeus.products import COLLECTIONS, product_from_record
from lynkeus.writing import LayerError, read_layer
from tests.records import DATA, LAYERS, stac_faults

AREA = Area(west=-71.2, south=42.6, east=-70.75, north=42.95)
BACKSCATTER = "NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001"
RUNNING = {"status": "running", "progress": 40, "message": "The job is being processed"}
DONE = {"status": "successful", "progress": 100, "message": "The job has completed successfully"}
TOKEN = "token-of-the-visitor"  # noqa: S105


def record(name: str) -> dict[str, Any]:
    items: list[dict[str, Any]] = json.loads((DATA / f"{name}.json").read_text(encoding="utf-8"))["items"]
    return items[0]


class Catalogue:
    """A query that records what is asked of the catalogue and answers with fixed records."""

    def __init__(self, records: list[dict[str, Any]]) -> None:
        self.records = records
        self.asked: dict[str, Any] = {}

    def concept_id(self, identifiers: list[str]) -> "Catalogue":
        self.asked["concept_id"] = identifiers
        return self

    def granule_name(self, name: str) -> "Catalogue":
        self.asked["granule_name"] = name
        return self

    def get(self, limit: int) -> list[dict[str, Any]]:
        return self.records


class Harmony:
    """A stand-in for the client of NASA Harmony.

    It answers the questions about its job with ``states``, one after the
    other, and repeats the last one. A state that is an exception is raised.
    """

    def __init__(self, file: Path, states: list[Any] | None = None) -> None:
        self.file = file
        self.states = states or [RUNNING, DONE]
        self.refusal: Exception | None = None
        self.addresses = ["https://harmony.earthdata.nasa.gov/service-results/staging/public/job/1/layer.tif"]
        self.requests: list[Any] = []
        self.cancelled: list[str] = []
        self.end_while_submitting = False

    def submit(self, request: Any) -> str:
        self.requests.append(request)
        if self.refusal is not None:
            raise self.refusal
        if self.end_while_submitting:
            os.kill(os.getpid(), signal.SIGTERM)
        return "job-1"

    def status(self, job: str) -> dict[str, Any]:
        state = self.states.pop(0) if len(self.states) > 1 else self.states[0]
        if state == "end":
            os.kill(os.getpid(), signal.SIGTERM)
            return RUNNING
        if isinstance(state, Exception):
            raise state
        return dict(state)

    def result_urls(self, job: str) -> Iterator[str]:
        return iter(self.addresses)

    def download(self, address: str, directory: str, overwrite: bool) -> "Future[str]":
        target = Path(directory) / "1_layer.tif"
        shutil.copyfile(self.file, target)
        future: Future[str] = Future()
        future.set_result(str(target))
        return future

    def cancel(self, job: str) -> None:
        self.cancelled.append(job)


class Visit:
    """What a test needs to receive a layer: the stand-ins, the folder and the reports."""

    def __init__(self, monkeypatch: pytest.MonkeyPatch, folder: Path, file: str, product: str = "granule-gcov") -> None:
        self.client = Harmony(LAYERS / file)
        self.catalogue = Catalogue([record(product)])
        self.folder = folder
        self.tokens: list[str | None] = []
        self.reports: list[tuple[int, str]] = []
        monkeypatch.setattr(earthaccess, "DataGranules", lambda: self.catalogue)
        monkeypatch.setattr(harmony, "_client", self.sign)
        monkeypatch.setattr(harmony, "PAUSE", 0.0)

    def sign(self, token: str | None) -> Harmony:
        self.tokens.append(token)
        return self.client

    def get(self, **changes: Any) -> Any:
        fields = {"product": "GCOV", "granule": BACKSCATTER, "layer": "HHHH", "area": AREA, **changes}
        return get_layer(
            LayerRequest(**fields),
            token=TOKEN,
            layer_id="k3v9x2",
            folder=self.folder,
            address="/files/k3v9x2",
            report=lambda progress, message: self.reports.append((progress, message)),
        )


@pytest.fixture
def visit(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Visit:
    return Visit(monkeypatch, tmp_path, "gcov-hhhh-20261021.tif")


def test_backscatter_product_offers_the_term_of_each_channel() -> None:
    assert layers_of("GCOV", ("HH", "HV")) == (
        LayerChoice(name="HHHH", title="Backscatter HH", spacing=10),
        LayerChoice(name="HVHV", title="Backscatter HV", spacing=10),
        LayerChoice(name="rtcGammaToSigmaFactor", title="Factor from gamma nought to sigma nought", spacing=10),
        LayerChoice(name="numberOfLooks", title="Number of looks", spacing=10),
        LayerChoice(name="mask", title="Mask of valid samples", spacing=10),
    )
    assert [layer.name for layer in layers_of("GCOV", ("VV", "VH"))][:2] == ["VVVV", "VHVH"]
    # Harmony lists no term of the compact channels.
    assert [layer.name for layer in layers_of("GCOV", ("RH", "RV"))] == [
        "rtcGammaToSigmaFactor",
        "numberOfLooks",
        "mask",
    ]


def test_interferogram_product_offers_the_layers_of_its_channel() -> None:
    assert [(layer.name, layer.title) for layer in layers_of("GUNW", ("HH",))] == [
        ("unwrappedInterferogram/HH/unwrappedPhase", "Unwrapped phase HH"),
        ("unwrappedInterferogram/HH/connectedComponents", "Connected components HH"),
        ("unwrappedInterferogram/HH/coherenceMagnitude", "Coherence HH, 80 m"),
        ("unwrappedInterferogram/HH/ionospherePhaseScreen", "Ionosphere phase screen HH"),
        (
            "unwrappedInterferogram/HH/ionospherePhaseScreenUncertainty",
            "Uncertainty of the ionosphere phase screen HH",
        ),
        ("wrappedInterferogram/HH/coherenceMagnitude", "Coherence HH, 20 m"),
        ("pixelOffsets/HH/slantRangeOffset", "Slant range offset HH"),
        ("pixelOffsets/HH/alongTrackOffset", "Along-track offset HH"),
        ("pixelOffsets/HH/correlationSurfacePeak", "Correlation peak of the offsets HH"),
    ]
    # Only the coherence of the wrapped interferogram is at 20 m.
    assert [layer.spacing for layer in layers_of("GUNW", ("HH",))] == [80, 80, 80, 80, 80, 20, 80, 80, 80]
    assert len(layers_of("GUNW", ("HH", "VV"))) == 18
    assert layers_of("GUNW", ("HV",)) == ()


def test_offset_product_offers_its_three_offset_layers() -> None:
    offered = layers_of("GOFF", ("HH",))
    assert [(layer.name, layer.title) for layer in offered[:4]] == [
        ("pixelOffsets/HH/layer1/slantRangeOffset", "Slant range offset HH, layer 1"),
        ("pixelOffsets/HH/layer1/alongTrackOffset", "Along-track offset HH, layer 1"),
        ("pixelOffsets/HH/layer1/correlationSurfacePeak", "Correlation peak of the offsets HH, layer 1"),
        ("pixelOffsets/HH/layer1/snr", "Signal-to-noise ratio of the offsets HH, layer 1"),
    ]
    assert [layer.name.split("/")[2] for layer in offered] == ["layer1"] * 4 + ["layer2"] * 4 + ["layer3"] * 4
    assert {layer.spacing for layer in offered} == {80}


def test_soil_moisture_product_offers_the_same_layers_for_every_channel() -> None:
    assert layers_of("SME2", ("HH", "HV")) == layers_of("SME2", ())
    assert layers_of("SME2", ()) == (
        LayerChoice(name="soilMoisture", title="Soil moisture", spacing=200),
        LayerChoice(name="soilMoistureUncertainty", title="Uncertainty of soil moisture", spacing=200),
    )


def test_every_layer_offered_is_one_that_harmony_lists() -> None:
    listed: dict[str, list[str]] = json.loads((DATA / "harmony-variables.json").read_text(encoding="utf-8"))
    channels = {"GCOV": ("HH", "HV", "VH", "VV"), "GUNW": ("HH", "VV"), "GOFF": ("HH", "VV"), "SME2": ("HH", "HV")}
    for product, collections in COLLECTIONS.items():
        offered = layers_of(product, channels[product])
        assert offered
        assert len({layer.name for layer in offered}) == len(offered)
        for collection in collections:
            for layer in offered:
                assert harmony._GROUPS[product] + layer.name in listed[collection.short_name], layer.name


def test_number_of_cells_of_an_area_agrees_with_a_file_of_harmony() -> None:
    # The backscatter that Harmony clipped to this area at 10 m held data in 14,316,413 cells.
    assert cells_of(AREA, 10) == pytest.approx(14_316_413, rel=0.005)
    assert cells_of(AREA, 20) == pytest.approx(cells_of(AREA, 10) / 4)


def test_area_is_compared_with_the_outline_of_the_product() -> None:
    footprint = product_from_record(record("granule-gcov")).footprint
    assert harmony._overlaps(AREA, footprint)
    # The outline lies inside the area, and the area inside the outline.
    assert harmony._overlaps(Area(west=-80, south=35, east=-60, north=50), footprint)
    assert harmony._overlaps(Area(west=-71.0, south=42.75, east=-70.95, north=42.8), footprint)
    # The area crosses a side of the outline without holding a corner of it.
    assert harmony._overlaps(Area(west=-72.6, south=42.5, east=-72.2, north=42.6), footprint)
    assert not harmony._overlaps(Area(west=10, south=10, east=10.05, north=10.05), footprint)
    # The box around the outline holds this area, and the outline itself does not.
    assert not harmony._overlaps(Area(west=-69.2, south=43.6, east=-68.9, north=43.9), footprint)


def test_outline_cut_at_the_meridian_of_180_degrees_is_compared_on_both_sides() -> None:
    # The record of a product near Antarctica, as the catalogue returned it on 14 November 2026:
    # its outline is two rings, one from 177.7 to 180 degrees and one from -180 to -176.0 degrees.
    footprint = product_from_record(record("granule-across-180")).footprint
    assert len(footprint) == 2
    assert all(abs(second[0] - first[0]) < 180 for ring in footprint for first, second in itertools.pairwise(ring))
    assert harmony._overlaps(Area(west=179.0, south=-66, east=179.5, north=-65.5), footprint)
    assert harmony._overlaps(Area(west=-179.5, south=-66, east=-179.0, north=-65.5), footprint)
    assert not harmony._overlaps(Area(west=170, south=-66, east=171, north=-65.5), footprint)
    assert not harmony._overlaps(Area(west=-170, south=-66, east=-169, north=-65.5), footprint)


def test_ring_that_crosses_the_meridian_of_180_degrees_is_compared_on_both_sides() -> None:
    # No record of the catalogue read so far holds such a ring; this one is made for the test.
    ring = ((179.0, 10.0), (-179.0, 10.0), (-179.0, 12.0), (179.0, 12.0), (179.0, 10.0))
    assert harmony._overlaps(Area(west=179.4, south=10.4, east=179.6, north=10.6), (ring,))
    assert harmony._overlaps(Area(west=-179.6, south=10.4, east=-179.4, north=10.6), (ring,))
    assert harmony._overlaps(Area(west=178, south=11, east=179.5, north=13), (ring,))
    assert not harmony._overlaps(Area(west=0, south=10.4, east=1, north=10.6), (ring,))
    assert not harmony._overlaps(Area(west=177, south=10.4, east=178, north=10.6), (ring,))


def test_layer_is_received_and_written(visit: Visit) -> None:
    description = visit.get()
    assert description.id == "k3v9x2"
    assert description.title == "Backscatter HH, 21 Oct 2026"
    assert (description.kind, description.method) == ("layer", None)
    assert description.url == "/files/k3v9x2/gcov-hhhh-20261021.tif"
    assert description.record == "/files/k3v9x2/gcov-hhhh-20261021.json"
    assert description.quantity == "Radar backscatter gamma nought, HH, linear power"
    assert (description.unit, description.colours) == ("1", "grey")
    assert description.dates == (date(2026, 10, 21),)
    assert description.inputs == (f"{BACKSCATTER}.h5",)
    assert description.layer == "HHHH"
    assert sorted(path.name for path in visit.folder.iterdir()) == ["gcov-hhhh-20261021.json", "gcov-hhhh-20261021.tif"]
    written, _ = read_layer(visit.folder / "gcov-hhhh-20261021.tif")
    with rasterio.open(LAYERS / "gcov-hhhh-20261021.tif") as source:
        assert np.array_equal(written, source.read(1), equal_nan=True)
    assert description.range == tuple(float(value) for value in np.percentile(written, (2, 98)))


def test_harmony_is_asked_for_the_layer_of_the_product_in_the_area(visit: Visit) -> None:
    visit.get()
    assert visit.catalogue.asked == {"concept_id": ["C3622241360-ASF", "C2854338529-ASF"], "granule_name": BACKSCATTER}
    assert visit.tokens == [TOKEN]
    (request,) = visit.client.requests
    assert request.is_valid()
    assert request.collection.id == "C3622241360-ASF"
    assert request.granule_id == ["G4405194348-ASF"]
    assert request.variables == ["/science/LSAR/GCOV/grids/frequencyA/HHHH"]
    assert tuple(request.spatial) == (-71.2, 42.6, -70.75, 42.95)
    assert request.format == "image/tiff"
    assert visit.client.cancelled == []


def test_progress_follows_the_job_of_harmony(visit: Visit) -> None:
    visit.client.states = [{**RUNNING, "progress": 0}, {**RUNNING, "progress": 40}, {**RUNNING, "progress": 100}, DONE]
    visit.get()
    progress = [value for value, _ in visit.reports]
    assert progress == sorted(progress)
    assert progress == [0, 5, 5, 35, 80, 85, 90, 100]
    assert visit.reports[3] == (35, "NASA Harmony is preparing the layer.")
    assert visit.reports[-1] == (100, "The layer is ready.")


def test_record_names_the_product_and_the_job(visit: Visit) -> None:
    visit.get()
    item = json.loads((visit.folder / "gcov-hhhh-20261021.json").read_text(encoding="utf-8"))
    assert stac_faults(item) == []
    assert item["properties"]["processing:level"] == "L2"
    lineage = item["properties"]["processing:lineage"]
    assert "/science/LSAR/GCOV/grids/frequencyA/HHHH" in lineage
    assert BACKSCATTER in lineage
    assert "job job-1" in lineage
    assert "-71.2, 42.6, -70.75, 42.95" in lineage
    assert item["links"][0]["rel"] == "via"
    assert item["links"][0]["href"] == "https://cmr.earthdata.nasa.gov/search/concepts/G4405194348-ASF.umm_json"
    assert item["assets"]["data"]["bands"][0]["name"] == "HHHH"


def test_soil_moisture_keeps_its_unit_and_loses_its_no_data_value(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    visit = Visit(monkeypatch, tmp_path, "sme2-soilmoisture-20261009.tif", "granule-sme2")
    name = record("granule-sme2")["umm"]["GranuleUR"]
    description = visit.get(product="SME2", granule=f"{name}.h5", layer="soilMoisture")
    assert description.title == "Soil moisture, 9 Oct 2026"
    assert (description.quantity, description.unit, description.colours) == ("Soil moisture", "m3 m-3", "YlGnBu")
    assert description.layer == "soilMoisture"
    assert description.url == "/files/k3v9x2/sme2-soilmoisture-20261009.tif"
    assert description.inputs == (f"{name}.h5",)
    assert 0.08 <= description.range[0] < description.range[1] <= 0.6
    assert visit.client.requests[0].collection.id == "C2854344945-ASF"
    assert visit.client.requests[0].variables == ["/science/LSAR/SME2/grids/soilMoisture"]
    values, grid = read_layer(tmp_path / "sme2-soilmoisture-20261009.tif")
    assert grid.crs == "EPSG:6933"
    assert int(np.isnan(values).sum()) == 35424 - 29238
    with rasterio.open(tmp_path / "sme2-soilmoisture-20261009.tif") as source:
        assert np.isnan(source.nodata)
        assert float(np.nanmin(source.read(1))) == pytest.approx(0.08)
    item = json.loads((tmp_path / "sme2-soilmoisture-20261009.json").read_text(encoding="utf-8"))
    assert item["properties"]["processing:level"] == "L3"
    assert stac_faults(item) == []


def test_classes_of_an_interferogram_are_received_as_classes(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    visit = Visit(monkeypatch, tmp_path, "gunw-connectedcomponents-20261009-20261021.tif", "granule-gunw")
    name = record("granule-gunw")["umm"]["GranuleUR"]
    layer = "unwrappedInterferogram/HH/connectedComponents"
    description = visit.get(
        product="GUNW", granule=name, layer=layer, area=Area(west=-71, south=42.75, east=-70.95, north=42.8)
    )
    assert description.title == "Connected components HH, 9 Oct 2026 to 21 Oct 2026"
    assert description.dates == (date(2026, 10, 9), date(2026, 10, 21))
    assert description.layer == layer
    assert (description.unit, description.range, description.colours) == ("1", (0.0, 1.0), "tab10")
    name = "gunw-unwrappedinterferogram-hh-connectedcomponents-20261009-20261021"
    assert description.url == f"/files/k3v9x2/{name}.tif"
    values, _ = read_layer(tmp_path / f"{name}.tif")
    assert set(np.unique(values[~np.isnan(values)])) == {0.0, 1.0}
    item = json.loads((tmp_path / f"{name}.json").read_text(encoding="utf-8"))
    assert "reduced copies made by taking the most frequent value" in item["properties"]["processing:lineage"]
    assert item["assets"]["data"]["bands"][0]["name"] == layer
    assert stac_faults(item) == []


def test_product_that_the_catalogue_does_not_hold_is_refused(visit: Visit) -> None:
    visit.catalogue.records = []
    with pytest.raises(LayerError, match="does not hold this product"):
        visit.get()
    # A name with a wildcard is not sent to the catalogue.
    visit.catalogue.asked.clear()
    with pytest.raises(LayerError, match="does not hold this product"):
        visit.get(granule="NISAR_L2_PR_GCOV_*")
    assert visit.catalogue.asked == {}
    # A product whose name only starts like the one asked for is not taken in its place.
    visit.catalogue.records = [record("granule-gcov")]
    with pytest.raises(LayerError, match="does not hold this product"):
        visit.get(granule=BACKSCATTER[:-4])
    assert visit.client.requests == []


def test_failure_of_the_catalogue_is_reported(visit: Visit, monkeypatch: pytest.MonkeyPatch) -> None:
    def fail() -> Catalogue:
        raise ConnectionError("no network")

    monkeypatch.setattr(earthaccess, "DataGranules", fail)
    with pytest.raises(LayerError, match="catalogue did not answer"):
        visit.get()


def test_layer_that_the_product_does_not_hold_is_refused(visit: Visit) -> None:
    # The product has the channels HH and HV.
    for layer in ("VVVV", "HHHV", "soilMoisture"):
        with pytest.raises(LayerError, match="does not hold this layer"):
            visit.get(layer=layer)
    assert visit.client.requests == []


def test_area_outside_the_product_is_refused(visit: Visit) -> None:
    with pytest.raises(LayerError, match="outside the product"):
        visit.get(area=Area(west=10, south=10, east=10.05, north=10.05))
    assert visit.client.requests == []


def test_area_that_gives_too_many_cells_is_refused(visit: Visit) -> None:
    # One degree in each direction at 10 m gives about 91 million cells.
    with pytest.raises(
        LayerError, match=r"too large: the layer would have about 91 million cells, .* at most 25 million"
    ):
        visit.get(area=Area(west=-71.5, south=42.4, east=-70.5, north=43.4))
    assert visit.client.requests == []


def test_file_with_too_many_cells_is_refused(visit: Visit, monkeypatch: pytest.MonkeyPatch) -> None:
    # The file of the stand-in has 336,000 cells, more than the area was estimated to give.
    monkeypatch.setattr(harmony, "MOST_CELLS", 300_000)
    monkeypatch.setattr(harmony, "cells_of", lambda area, spacing: 1000.0)
    with pytest.raises(LayerError, match="too large"):
        visit.get()
    assert list(visit.folder.iterdir()) == []


def test_layer_without_data_in_the_area_is_refused(visit: Visit, tmp_path_factory: pytest.TempPathFactory) -> None:
    empty = tmp_path_factory.mktemp("empty") / "empty.tif"
    with rasterio.open(LAYERS / "gcov-hhhh-20261021-small.tif") as source:
        profile = source.profile
    with rasterio.open(empty, "w", **profile) as target:
        target.write(np.full((128, 128), np.nan, dtype=np.float32), 1)
    visit.client.file = empty
    with pytest.raises(LayerError, match="holds no data in the area"):
        visit.get()
    assert list(visit.folder.iterdir()) == []


@pytest.mark.parametrize(
    ("refusal", "sentence"),
    [
        (
            Exception("Unauthorized", "Error: You are not authorized to access the requested resource"),
            "did not accept the token",
        ),
        (
            Exception("Forbidden", "Error: You are not allowed to access the requested resource"),
            "does not allow this account",
        ),
        (Exception("Forbidden", "Error: accept the following EULA(s) and resubmit the request"), "licence agreement"),
        (Exception("Bad Request", "Error: the request is not valid"), "did not accept the request"),
        (ConnectionError("no network"), "NASA Harmony did not answer"),
    ],
)
def test_refusal_of_a_request_is_a_sentence_without_the_token(visit: Visit, refusal: Exception, sentence: str) -> None:
    # The error of the client carries the request, and with it the token.
    refusal.request = f"Authorization: Bearer {TOKEN}"  # type: ignore[attr-defined]
    visit.client.refusal = refusal
    with pytest.raises(LayerError, match=sentence) as caught:
        visit.get()
    assert TOKEN not in str(caught.value)
    assert caught.value.__cause__ is None
    assert caught.value.__context__ is None
    assert visit.client.cancelled == []
    assert list(visit.folder.iterdir()) == []


@pytest.mark.parametrize(
    ("message", "sentence"),
    [
        ("WorkItem failed: the service stopped", "NASA Harmony could not prepare the layer"),
        # The two messages that Harmony gave on 14 November 2026 for a box outside the product
        # and for a layer that the product file does not hold.
        ("No matching granules found.", "The area lies outside the product"),
        (
            "WorkItem failed: asfhyp3/harmony-gdal:0.0.3: "
            "None of the requested variables are present in the source file.",
            "The product does not hold this layer",
        ),
        ("The user has not accepted the EULA", "licence agreement"),
    ],
)
def test_failed_job_of_harmony_is_reported(visit: Visit, message: str, sentence: str) -> None:
    visit.client.states = [RUNNING, {"status": "failed", "progress": 0, "message": message}]
    with pytest.raises(LayerError, match=sentence):
        visit.get()
    assert list(visit.folder.iterdir()) == []


def test_job_that_takes_too_long_is_cancelled(visit: Visit, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(harmony, "MOST_WAIT", 0.0)
    visit.client.states = [RUNNING]
    with pytest.raises(LayerError, match="did not prepare the layer within 0 minutes"):
        visit.get()
    assert visit.client.cancelled == ["job-1"]


def test_job_is_cancelled_when_harmony_stops_answering(visit: Visit) -> None:
    # Two questions without an answer are tolerated, and the third one is not.
    visit.client.states = [ConnectionError("no network"), ConnectionError("no network"), RUNNING, DONE]
    assert visit.get().id == "k3v9x2"
    visit.client.states = [ConnectionError("no network")]
    with pytest.raises(LayerError, match="NASA Harmony did not answer") as caught:
        visit.get(layer="HVHV")
    assert caught.value.__context__ is None
    assert visit.client.cancelled == ["job-1"]


def test_result_that_is_not_one_geotiff_is_refused(visit: Visit) -> None:
    visit.client.addresses = []
    with pytest.raises(LayerError, match="did not return one GeoTIFF"):
        visit.get()


@pytest.mark.parametrize("moment", ["while following", "while submitting"])
def test_job_of_harmony_is_cancelled_when_the_process_is_asked_to_end(visit: Visit, moment: str) -> None:
    received: list[int] = []
    before = signal.signal(signal.SIGTERM, lambda number, frame: received.append(number))
    try:
        if moment == "while following":
            visit.client.states = [RUNNING, "end", RUNNING]
        else:
            visit.client.end_while_submitting = True
            visit.client.states = [RUNNING]
        with pytest.raises(LayerError, match="was cancelled"):
            visit.get()
        # The handler that was in place before receives the signal after the job is cancelled, and is in place again.
        assert visit.client.cancelled == ["job-1"]
        assert received == [signal.SIGTERM]
        assert signal.getsignal(signal.SIGTERM) is not signal.SIG_DFL
        os.kill(os.getpid(), signal.SIGTERM)
        assert received == [signal.SIGTERM, signal.SIGTERM]
    finally:
        signal.signal(signal.SIGTERM, before)
    assert list(visit.folder.iterdir()) == []


def test_received_file_is_kept_in_a_plain_folder_of_the_layer_that_is_removed(
    visit: Visit, monkeypatch: pytest.MonkeyPatch
) -> None:
    folders: list[tuple[Path, int]] = []
    download = visit.client.download

    def noted(address: str, directory: str, overwrite: bool) -> "Future[str]":
        folders.append((Path(directory), Path(directory).stat().st_mode & 0o777))
        return download(address, directory, overwrite)

    monkeypatch.setattr(visit.client, "download", noted)
    plain = visit.folder / "plain"
    plain.mkdir()
    visit.get()
    [(received, mode)] = folders
    assert (received.parent, received.name[:9], len(received.name)) == (visit.folder, ".harmony-", 25)
    # The folder has the permissions of any new folder, and not those of ``tempfile``, for the present user alone.
    assert mode == plain.stat().st_mode & 0o777
    assert not received.exists()
    assert sorted(path.suffix for path in visit.folder.iterdir()) == ["", ".json", ".tif"]


def test_folder_of_the_received_file_is_removed_at_a_later_try(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    tries: list[Path] = []
    remove = shutil.rmtree

    def refused_twice(folder: Path, ignore_errors: bool) -> None:
        tries.append(folder)
        if len(tries) > 2:
            remove(folder, ignore_errors=ignore_errors)

    monkeypatch.setattr(harmony, "STEP", 0.01)
    monkeypatch.setattr(shutil, "rmtree", refused_twice)
    with harmony._folder_for_received_file(tmp_path) as received:
        (received / "1_layer.tif").write_bytes(b"a file")
    assert len(tries) == 3
    assert list(tmp_path.iterdir()) == []


def test_pause_passes_in_short_parts(monkeypatch: pytest.MonkeyPatch) -> None:
    parts: list[float] = []
    sleep = time.sleep

    def noted(seconds: float) -> None:
        parts.append(seconds)
        sleep(seconds)

    monkeypatch.setattr(time, "sleep", noted)
    start = time.monotonic()
    harmony._pause(0.5)
    assert 0.5 <= time.monotonic() - start < 2
    assert len(parts) >= 3
    assert max(parts) <= harmony.STEP


def test_fault_of_lynkeus_is_reported_as_one(visit: Visit) -> None:
    visit.client.states = [{"progress": 40}]
    with pytest.raises(LayerError, match="internal error") as caught:
        visit.get()
    assert isinstance(caught.value.__cause__, KeyError)


class Signed:
    """A stand-in for the class of the client, which records how it is made."""

    made: list[dict[str, Any]]
    refusal: Exception | None

    def __init__(self, **choices: Any) -> None:
        self.made.append(choices)
        if self.refusal is not None:
            raise self.refusal


def test_client_signs_with_the_token_or_with_the_credentials_of_the_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    Signed.made, Signed.refusal = [], None
    monkeypatch.setattr(harmony, "Client", Signed)
    harmony._client(TOKEN)
    harmony._client(None)
    assert Signed.made == [{"token": TOKEN}, {}]
    Signed.refusal = BadAuthentication("Authentication: incorrect or missing credentials during credential validation.")
    with pytest.raises(LayerError, match="did not accept the credentials of the server") as caught:
        harmony._client(None)
    assert caught.value.__context__ is None
    Signed.refusal = ConnectionError("no network")
    with pytest.raises(LayerError, match="Earthdata Login did not answer"):
        harmony._client(None)


def test_client_checks_certificates_against_the_file_that_the_environment_names(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class Sending:
        """A stand-in for the class of the client, with the session that sends its requests."""

        def __init__(self, **choices: Any) -> None:
            self.session = SimpleNamespace(verify=True)

    monkeypatch.setattr(harmony, "Client", Sending)
    monkeypatch.delenv("REQUESTS_CA_BUNDLE", raising=False)
    monkeypatch.delenv("CURL_CA_BUNDLE", raising=False)
    assert harmony._client(TOKEN).session.verify is True
    monkeypatch.setenv("CURL_CA_BUNDLE", "/etc/authority-of-curl.pem")
    assert harmony._client(TOKEN).session.verify == "/etc/authority-of-curl.pem"
    monkeypatch.setenv("REQUESTS_CA_BUNDLE", "/etc/authority.pem")
    assert harmony._client(None).session.verify == "/etc/authority.pem"
