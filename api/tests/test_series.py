"""Tests of the series: their formats, their run, their record and their addresses.

The stand-in process of this file returns a series as the processes of the tools of the kind Series do. The
layers are files of ``tests/data/layers``, which ``tests/test_writing.py`` describes.
"""

import json
import math
import time
from collections.abc import Iterator
from datetime import date
from pathlib import Path
from typing import Any, Literal

import numpy as np
import pytest
import rasterio
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from rasterio.warp import transform

from lynkeus import jobs, offered
from lynkeus.analysis import SERIES_TOOLS
from lynkeus.layers import (
    Area,
    Format,
    LayerDescription,
    Point,
    SeriesDescription,
    SeriesEntry,
    SeriesRun,
    Text,
)
from lynkeus.processes import SERIES_OUTPUT, InputError, Process, Work
from lynkeus.routes import install
from lynkeus.store import JobRecord, SeriesRecord, Store
from lynkeus.tools import area_of, cell_of, run_series
from lynkeus.writing import PROGRAM, LayerError, grid_of
from tests.records import LAYERS
from tests.standin import STAND_IN, key_server
from tests.test_server_routes import problem, running, started, state
from tests.test_server_routes import start as start_on

GCOV_21_OCT = "NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001"
GCOV_2_NOV = "NISAR_L2_PR_GCOV_034_141_D_067_4005_DHDH_A_20261102T234330_20261102T234405_P05036_N_F_J_001"
GUNW = (
    "NISAR_L2_PR_GUNW_0{}_141_D_067_0{}_4000_SH_2026{}T234330_2026{}T234405_"
    "2026{}T234330_2026{}T234405_P05036_N_F_J_001"
)
COHERENCE = "wrappedInterferogram/HH/coherenceMagnitude"
AREA = Area(west=-71.2, south=42.6, east=-70.75, north=42.95)


def description(**changes: Any) -> dict[str, Any]:
    """Return a series description of two dates at a point, as JSON values."""
    series = {
        "id": "series-1",
        "title": "Backscatter HH at the bridge",
        "kind": "series",
        "quantity": "Radar backscatter gamma0",
        "unit": "dB",
        "reduction": "mean-power",
        "range": None,
        "point": {"longitude": -70.9, "latitude": 42.8},
        "cell": {"row": 3, "column": 4, "longitude": -70.90001, "latitude": 42.80001},
        "area": AREA.model_dump(),
        "entries": [
            {"dates": ["2026-10-21"], "value": -9.5, "cells": 1},
            {"dates": ["2026-11-02"], "value": None, "cells": 0},
        ],
        "inputs": [f"{GCOV_21_OCT}.h5", f"{GCOV_2_NOV}.h5"],
        "layer": "HHHH",
        "program": "Lynkeus 0.1.0",
        "method": "Reference of the method",
    }
    return {**series, **changes}


# The formats


def test_series_description_holds_its_values_and_no_address_of_a_file() -> None:
    series = SeriesDescription.model_validate(description())
    assert series.kind == "series"
    assert [(entry.dates, entry.value, entry.cells) for entry in series.entries] == [
        ((date(2026, 10, 21),), -9.5, 1),
        ((date(2026, 11, 2),), None, 0),
    ]
    assert not {"url", "record", "colours"} & set(SeriesDescription.model_fields)
    assert SeriesDescription.model_validate_json(series.model_dump_json()) == series
    whole_area = SeriesDescription.model_validate(description(point=None, cell=None, range=[0, 1]))
    assert (whole_area.point, whole_area.cell, whole_area.range) == (None, None, (0.0, 1.0))


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"kind": "result"}, "series"),
        ({"cell": None}, "a series at a point has its point and its cell"),
        ({"point": None}, "a series at a point has its point and its cell"),
        ({"inputs": [f"{GCOV_21_OCT}.h5"]}, "one product file for each of its entries"),
        ({"range": [1, 0]}, "lowest value of the range"),
        ({"entries": []}, "at least 1 item"),
        ({"entries": [{"dates": ["2026-10-21"], "value": 1.0, "cells": 0}] * 2}, "has a value when, and only when"),
        ({"entries": [{"dates": ["2026-10-21"], "value": None, "cells": 2}] * 2}, "has a value when, and only when"),
        ({"entries": [{"dates": ["2026-10-21"], "value": 1.0, "cells": 1}] * 2}, "different dates, the earliest first"),
        (
            {
                "entries": [
                    {"dates": ["2026-11-02"], "value": 1.0, "cells": 1},
                    {"dates": ["2026-10-21"], "value": 1.0, "cells": 1},
                ]
            },
            "different dates, the earliest first",
        ),
        ({"entries": [{"dates": [], "value": 1.0, "cells": 1}] * 2}, "at least 1 item"),
        ({"url": "/files/series-1/series.json"}, "Extra inputs are not permitted"),
        ({"id": "Series 1"}, "should match pattern"),
    ],
)
def test_series_description_that_is_not_consistent_is_refused(changes: dict[str, Any], message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        SeriesDescription.model_validate(description(**changes))


def test_series_is_not_read_as_a_layer_and_a_layer_not_as_a_series() -> None:
    with pytest.raises(ValidationError):
        LayerDescription.model_validate(description())
    with pytest.raises(ValidationError):
        SeriesEntry(dates=(date(2026, 10, 21),), value=float("nan"), cells=1)
    with pytest.raises(ValidationError, match="at least 2 items"):
        SeriesRun(tool="backscatter-series", inputs=("one",), title="A series")
    run = SeriesRun(tool="backscatter-series", inputs=("one", "two"), title="A series")
    assert run.point is None
    with pytest.raises(ValidationError):
        Point(longitude=181, latitude=0)


# The run of a tool of the kind Series


def layer(name: str, file: str, product: str, *days: date, inside: str = "HHHH") -> tuple[LayerDescription, Path]:
    """Describe a file of the test data as a layer that a session received from a product."""
    about = LayerDescription(
        id=name,
        title=f"Layer {name}",
        kind="layer",
        url=f"/files/{name}/{name}.tif",
        quantity="Quantity of the product",
        unit="1",
        range=(0.0, 1.0),
        colours="grey",
        dates=days,
        inputs=(f"{product}.h5",),
        layer=inside,
        program="Lynkeus 0.1.0",
        record=f"/files/{name}/{name}.json",
    )
    return about, LAYERS / file


OCTOBER, NOVEMBER = "gcov-hhhh-20261021-small.tif", "gcov-hhhh-20261102-small.tif"
PAIR = "gunw-coherence-20261009-20261021.tif"
LAYERS_OF_SESSION = {
    "november": layer("november", NOVEMBER, GCOV_2_NOV, date(2026, 11, 2)),
    "october": layer("october", OCTOBER, GCOV_21_OCT, date(2026, 10, 21)),
    "pair-1": layer(
        "pair-1",
        PAIR,
        GUNW.format("32", "33", "1009", "1009", "1021", "1021"),
        date(2026, 10, 9),
        date(2026, 10, 21),
        inside=COHERENCE,
    ),
    # The same file stands for a second pair, so that a series of coherence can be run on the test data.
    "pair-2": layer(
        "pair-2",
        PAIR,
        GUNW.format("33", "34", "1021", "1021", "1102", "1102"),
        date(2026, 10, 21),
        date(2026, 11, 2),
        inside=COHERENCE,
    ),
}


def values_of(file: str) -> Any:
    with rasterio.open(LAYERS / file) as source:
        return source.read(1)


def centre_of(file: str, row: float, column: float) -> Point:
    """Return a place of a file of the test data in longitude and latitude, by its row and column."""
    with rasterio.open(LAYERS / file) as source:
        x, y = source.transform @ (column, row)
        (longitude,), (latitude,) = transform(source.crs, "EPSG:4326", [x], [y])
    return Point(longitude=longitude, latitude=latitude)


def run(reports: list[tuple[int, str]] | None = None, **changes: Any) -> SeriesDescription:
    request = SeriesRun(tool="backscatter-series", inputs=("november", "october"), title="Backscatter HH")
    return run_series(
        request.model_copy(update=changes),
        layers=LAYERS_OF_SESSION,
        series_id="s3r1es",
        report=lambda progress, message: None if reports is None else reports.append((progress, message)),
    )


def decibels_of_mean(power: Any) -> tuple[float, int]:
    valid = power[(power > 0) & np.isfinite(power)].astype(np.float64)
    return 10 * math.log10(valid.mean()), valid.size


def test_series_of_an_area_gives_each_date_with_the_number_of_its_cells() -> None:
    reports: list[tuple[int, str]] = []
    series = run(reports)
    first, cells_1 = decibels_of_mean(values_of(OCTOBER))
    second, cells_2 = decibels_of_mean(values_of(NOVEMBER))
    assert [(entry.dates, entry.cells) for entry in series.entries] == [
        ((date(2026, 10, 21),), cells_1),
        ((date(2026, 11, 2),), cells_2),
    ]
    assert [entry.value for entry in series.entries] == [
        pytest.approx(first, abs=1e-9),
        pytest.approx(second, abs=1e-9),
    ]
    assert series.inputs == (f"{GCOV_21_OCT}.h5", f"{GCOV_2_NOV}.h5")
    assert (series.id, series.title, series.kind, series.program) == ("s3r1es", "Backscatter HH", "series", PROGRAM)
    assert (series.quantity, series.unit, series.reduction, series.range) == (
        "Radar backscatter gamma0",
        "dB",
        "mean-power",
        None,
    )
    assert (series.layer, series.point, series.cell) == ("HHHH", None, None)
    assert "NISAR_GCOV_Time_Series_Example" in series.method
    assert reports[0] == (0, "Reading the grids of the layers.")
    assert [message for _, message in reports[1:-1]] == ["Reading layer 1 of 2.", "Reading layer 2 of 2."]
    assert reports[-1] == (100, "The series is ready.")
    assert [progress for progress, _ in reports] == sorted(progress for progress, _ in reports)


def test_area_of_a_series_is_the_rectangle_around_the_grid_of_the_layers() -> None:
    grid = grid_of(LAYERS / OCTOBER)
    area = area_of(grid)
    assert area == run().area
    corners = [centre_of(OCTOBER, row, column) for row in (0, grid.height) for column in (0, grid.width)]
    assert area.west <= min(corner.longitude for corner in corners) < max(corner.longitude for corner in corners)
    assert max(corner.longitude for corner in corners) <= area.east
    assert area.south <= min(corner.latitude for corner in corners)
    assert max(corner.latitude for corner in corners) <= area.north
    # The rectangle is at most one thousandth of a degree larger than the corners on each side.
    assert min(corner.longitude for corner in corners) - area.west < 1e-3
    assert area.north - max(corner.latitude for corner in corners) < 1e-3


def test_series_at_a_point_reads_the_cell_that_holds_the_point() -> None:
    power = values_of(OCTOBER)
    rows, columns = np.nonzero(power > 0)
    row, column = int(rows[len(rows) // 2]), int(columns[len(columns) // 2])
    # A point in the lower right quarter of the cell, away from its centre.
    point = centre_of(OCTOBER, row + 0.8, column + 0.7)
    series = run(point=point)
    assert series.point == point
    assert series.cell is not None
    assert (series.cell.row, series.cell.column) == (row, column)
    centre = centre_of(OCTOBER, row + 0.5, column + 0.5)
    assert series.cell.longitude == pytest.approx(centre.longitude, abs=1e-9)
    assert series.cell.latitude == pytest.approx(centre.latitude, abs=1e-9)
    later = values_of(NOVEMBER)[row, column]
    expected = [10 * math.log10(float(power[row, column])), 10 * math.log10(float(later)) if later > 0 else None]
    assert [entry.value for entry in series.entries] == [pytest.approx(value, abs=1e-9) for value in expected]
    assert [entry.cells for entry in series.entries] == [1, 1 if later > 0 else 0]


def test_cell_of_a_point_is_found_at_the_corners_and_refused_outside_the_grid() -> None:
    grid = grid_of(LAYERS / OCTOBER)
    inside = 1e-6
    first = cell_of(grid, centre_of(OCTOBER, inside, inside))
    assert (first.row, first.column) == (0, 0)
    last = cell_of(grid, centre_of(OCTOBER, grid.height - inside, grid.width - inside))
    assert (last.row, last.column) == (grid.height - 1, grid.width - 1)
    for row, column in [(-0.5, 1), (1, -0.5), (grid.height + 0.5, 1), (1, grid.width + 0.5)]:
        with pytest.raises(LayerError, match=r"^The point lies outside the area of the layers\.$"):
            cell_of(grid, centre_of(OCTOBER, row, column))
    with pytest.raises(LayerError, match="outside the area of the layers"):
        run(point=Point(longitude=10.0, latitude=-45.0))


def test_series_of_coherence_runs_on_pairs() -> None:
    series = run(tool="coherence-series", inputs=("pair-2", "pair-1"))
    coherence = values_of(PAIR)
    held = coherence[~np.isnan(coherence)].astype(np.float64)
    assert [entry.dates for entry in series.entries] == [
        (date(2026, 10, 9), date(2026, 10, 21)),
        (date(2026, 10, 21), date(2026, 11, 2)),
    ]
    assert [entry.value for entry in series.entries] == [pytest.approx(held.mean(), abs=1e-12)] * 2
    assert [entry.cells for entry in series.entries] == [held.size] * 2
    assert (series.unit, series.reduction, series.range, series.layer) == ("1", "mean", (0.0, 1.0), COHERENCE)


def test_series_that_cannot_be_run_is_refused_with_a_sentence() -> None:
    with pytest.raises(LayerError, match=r"^Lynkeus has no analysis tool of this name\.$"):
        run(tool="backscatter-change")
    with pytest.raises(LayerError, match=r"^A layer of the analysis no longer exists\.$"):
        run(inputs=("october", "removed"))
    with pytest.raises(LayerError, match=r"^The layers of the analysis do not have the same grid\.$"):
        run(inputs=("october", "pair-1"))
    with pytest.raises(LayerError, match="is not a layer received from one NISAR GUNW product"):
        run(tool="coherence-series")


def test_fault_of_a_series_tool_becomes_a_general_sentence(monkeypatch: pytest.MonkeyPatch) -> None:
    def broken(*_: object) -> Any:
        raise KeyError("a detail that the visitor must not see")

    monkeypatch.setitem(SERIES_TOOLS, "backscatter-series", broken)
    with pytest.raises(LayerError, match=r"^Lynkeus could not compute the series because of an internal error\.$"):
        run()


# The record


@pytest.fixture
def store(tmp_path: Path) -> Iterator[Store]:
    record = Store(tmp_path / "record.sqlite3")
    record.add_session("s1", "digest-1", 100.0)
    record.add_session("s2", "digest-2", 200.0)
    yield record
    record.close()


def _job(name: str, session: str = "s1") -> JobRecord:
    return JobRecord(
        name, session, "stand-in", "Title", "{}", "raw", "accepted", "Waits.", 0, 1.0, None, None, 1.0, None
    )


def test_store_keeps_the_series_of_a_successful_job(store: Store) -> None:
    store.add_job(_job("j1"))
    series = SeriesRecord("e1", "s1", "{}", 5.0)
    assert not store.succeed_job_with_series("j1", "Ready.", series)
    assert store.series("e1") is None
    store.start_job("j1", "Started.", 2.0)
    assert store.succeed_job_with_series("j1", "Ready.", series)
    done = store.job("j1")
    assert done is not None
    assert (done.status, done.progress, done.layer, done.finished) == ("successful", 100, "e1", 5.0)
    assert store.series("e1") == series
    assert store.layer("e1") is None
    assert (store.series_of("s1"), store.series_of("s2"), store.layers_of("s1")) == ([series], [], [])
    store.change_series("e1", '{"title": "New"}')
    changed = store.series("e1")
    assert changed is not None
    assert changed.description == '{"title": "New"}'
    store.remove_series("e1")
    assert (store.series("e1"), store.job("j1")) == (None, None)


def test_series_are_listed_the_newest_first_and_removed_with_their_session(store: Store) -> None:
    for number in (1, 2, 3):
        store.add_job(_job(f"j{number}"))
        store.start_job(f"j{number}", "Started.", 2.0)
        store.succeed_job_with_series(f"j{number}", "Ready.", SeriesRecord(f"e{number}", "s1", "{}", float(number)))
    assert [series.id for series in store.series_of("s1")] == ["e3", "e2", "e1"]
    store.dismiss_job("j1", "Dismissed.", 9.0)
    store.dismiss_job("j2", "Dismissed.", 9.0)
    store.dismiss_job("j3", "Dismissed.", 9.0)
    # A session that holds only a series is not a session without content.
    assert store.sessions_without_content() == ["s2"]
    store.remove_session("s1")
    assert store.series_of("s1") == []
    assert store.series("e1") is None


# The addresses, with a stand-in process that returns a series


class StandInSeriesInputs(Format):
    """The inputs of the stand-in process of a series."""

    name: Text
    uses: tuple[Text, ...] = ()
    end: Literal["series", "layer", "other-name"] = "series"


def stand_in_series(inputs: StandInSeriesInputs, work: Work) -> SeriesDescription | LayerDescription:
    """Return a series, or end in the way that the inputs ask for."""
    work.report(50, "The stand-in makes a series.")
    if inputs.end == "layer":
        return LayerDescription.model_validate(
            {
                "id": work.layer_id,
                "title": inputs.name,
                "kind": "layer",
                "url": f"{work.address}/a.tif",
                "quantity": "Stand-in",
                "unit": "1",
                "range": [0, 1],
                "colours": "grey",
                "dates": ["2026-11-14"],
                "inputs": ["stand-in"],
                "program": "stand-in",
                "record": f"{work.address}/a.json",
            }
        )
    name = "other" if inputs.end == "other-name" else work.layer_id
    return SeriesDescription.model_validate(description(id=name, title=inputs.name))


def stand_in_title(inputs: StandInSeriesInputs) -> str:
    return f"Series {inputs.name}"


def stand_in_uses(inputs: StandInSeriesInputs) -> tuple[str, ...]:
    return inputs.uses


STAND_IN_SERIES = Process(
    id="stand-in-series",
    title="Stand-in series",
    description="Returns a series of two dates.",
    inputs=StandInSeriesInputs,
    run=stand_in_series,
    job_title=stand_in_title,
    layers=stand_in_uses,
    output=SERIES_OUTPUT,
)


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    app = FastAPI()
    with key_server() as keys:
        install(app, [STAND_IN, STAND_IN_SERIES], folder=tmp_path, keys_address=keys.address)
        with TestClient(app, base_url="https://testserver") as visitor:
            yield visitor


def start(client: TestClient, process: str = "stand-in-series", **body: Any) -> dict[str, Any]:
    response = client.post(f"/api/processes/{process}/execution", json={"inputs": {"name": "a"}, **body})
    assert response.status_code == 201, response.text
    info: dict[str, Any] = response.json()
    return info


def wait(client: TestClient, job: str) -> dict[str, Any]:
    limit = time.monotonic() + 60
    while time.monotonic() < limit:
        info: dict[str, Any] = client.get(f"/api/jobs/{job}").json()
        if info["status"] in ("successful", "failed"):
            return info
        time.sleep(0.05)
    raise AssertionError(f"the job stayed in the state {info['status']}")


def test_process_of_a_series_describes_its_one_output_as_a_series(client: TestClient) -> None:
    described = client.get("/api/processes/stand-in-series").json()
    assert set(described["outputs"]) == {"series"}
    schema = described["outputs"]["series"]["schema"]
    assert set(schema["properties"]) == set(SeriesDescription.model_fields)
    assert schema["properties"]["kind"]["enum"] == ["series"]
    entry = schema["properties"]["entries"]["items"]
    assert set(entry["properties"]) == {"dates", "value", "cells"}
    assert (entry["properties"]["value"]["type"], entry["properties"]["value"]["nullable"]) == ("number", True)
    assert schema["properties"]["point"]["nullable"] is True
    assert set(schema["properties"]["point"]["properties"]) == {"longitude", "latitude"}
    # The process of a layer is described as before.
    assert set(client.get("/api/processes/stand-in").json()["outputs"]) == {"layer"}


def test_job_of_a_series_ends_with_a_series_and_no_layer(client: TestClient, tmp_path: Path) -> None:
    job = start(client)
    assert (job["processID"], job["title"]) == ("stand-in-series", "Series a")
    done = wait(client, job["jobID"])
    assert (done["status"], done["message"], done["progress"]) == ("successful", "The series is ready.", 100)
    assert "layer" not in done
    result = client.get(f"/api/jobs/{job['jobID']}/results")
    assert result.status_code == 200
    series = result.json()
    assert series == SeriesDescription.model_validate(series).model_dump(mode="json")
    assert (series["id"], series["kind"], series["title"]) == (done["series"], "series", "a")
    assert client.get("/api/layers").json() == {"layers": []}
    listed = client.get("/api/series").json()["series"]
    assert [set(entry) for entry in listed] == [{"series", "created"}]
    assert listed[0]["series"] == series
    listed_jobs = client.get("/api/jobs").json()["jobs"]
    assert [entry["series"] for entry in listed_jobs] == [series["id"]]
    # A series has no file: the folder of the job is removed.
    limit = time.monotonic() + 10
    while list((tmp_path / "files").iterdir()) and time.monotonic() < limit:
        time.sleep(0.05)
    assert list((tmp_path / "files").iterdir()) == []


def test_results_of_a_series_follow_the_form_that_the_request_chose(client: TestClient) -> None:
    job = start(client, response="document", outputs={"series": {"transmissionMode": "value"}})
    done = wait(client, job["jobID"])
    document = client.get(f"/api/jobs/{job['jobID']}/results").json()
    assert set(document) == {"series"}
    assert document["series"]["value"]["id"] == done["series"]
    wrong: list[dict[str, Any]] = [{"layer": {}}, {}, {"series": {}, "layer": {}}]
    for outputs in wrong:
        refused = client.post(
            "/api/processes/stand-in-series/execution", json={"inputs": {"name": "a"}, "outputs": outputs}
        )
        assert refused.status_code == 400
        assert "must name the one output of the process, which is series" in refused.json()["detail"]
    refused = client.post(
        "/api/processes/stand-in/execution", json={"inputs": {"name": "a"}, "outputs": {"series": {}}}
    )
    assert "must name the one output of the process, which is layer" in refused.json()["detail"]


def test_series_is_renamed_and_removed_by_its_own_addresses(client: TestClient) -> None:
    job = start(client)
    name = wait(client, job["jobID"])["series"]
    renamed = client.patch(f"/api/series/{name}", json={"title": "  The bridge  "})
    assert renamed.status_code == 200
    assert renamed.json()["series"]["title"] == "The bridge"
    assert client.get("/api/series").json()["series"][0]["series"]["title"] == "The bridge"
    assert client.patch(f"/api/series/{name}", json={"title": ""}).status_code == 400
    assert client.patch("/api/series/unknown", json={"title": "A"}).status_code == 404
    # The addresses of the layers do not know a series.
    assert client.patch(f"/api/layers/{name}", json={"title": "A"}).status_code == 404
    assert client.delete(f"/api/layers/{name}").status_code == 404
    assert client.delete(f"/api/series/{name}").status_code == 204
    assert client.delete(f"/api/series/{name}").status_code == 404
    assert client.get("/api/series").json() == {"series": []}
    assert client.get(f"/api/jobs/{job['jobID']}").status_code == 404


def test_series_of_another_session_is_not_seen(client: TestClient) -> None:
    job = start(client)
    name = wait(client, job["jobID"])["series"]
    other = TestClient(client.app, base_url="https://testserver")
    assert other.get("/api/series").json() == {"series": []}
    assert other.patch(f"/api/series/{name}", json={"title": "A"}).status_code == 404
    assert other.delete(f"/api/series/{name}").status_code == 404
    assert len(client.get("/api/series").json()["series"]) == 1


def test_result_of_a_dismissed_job_record_is_kept_and_a_removed_series_is_gone(client: TestClient) -> None:
    job = start(client)
    name = wait(client, job["jobID"])["series"]
    assert client.delete(f"/api/jobs/{job['jobID']}").status_code == 200
    assert [entry["series"]["id"] for entry in client.get("/api/series").json()["series"]] == [name]


@pytest.mark.parametrize("end", ["layer", "other-name"])
def test_process_of_a_series_that_returns_something_else_fails(client: TestClient, end: str) -> None:
    job = start(client, inputs={"name": "a", "end": end})
    done = wait(client, job["jobID"])
    assert (done["status"], done["message"]) == ("failed", jobs.FAULT)
    assert "series" not in done
    assert client.get("/api/series").json() == {"series": []}
    assert client.get("/api/layers").json() == {"layers": []}


def test_session_holds_a_limited_number_of_series(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(jobs, "MAX_SESSION_SERIES", 1)
    wait(client, start(client)["jobID"])
    refused = client.post("/api/processes/stand-in-series/execution", json={"inputs": {"name": "b"}})
    assert refused.status_code == 507
    assert refused.json()["detail"] == "A session holds at most 1 series. Remove a series and try again."
    # The limit of the series does not stop a job that makes a layer.
    assert client.post("/api/processes/stand-in/execution", json={"inputs": {"name": "c"}}).status_code == 201


def test_series_job_runs_on_the_project_server_and_reads_no_layer_of_an_own_server(tmp_path: Path) -> None:
    with key_server() as keys, running(tmp_path, keys, [STAND_IN, STAND_IN_SERIES]) as site:
        visitor, machine = site.visit("a_user"), site.machine("Field laptop")
        server = machine.pair(visitor)
        with machine.serving():
            # Without a wish a job that produces a layer goes to the connected own server.
            there = started(visitor)
            assert there["server"]["name"] == "Field laptop"
            assert state(visitor, there["jobID"])["status"] == "successful"
            on_own = visitor.get(f"/api/jobs/{there['jobID']}/results").json()["id"]
            ours = started(visitor, server="project")
            assert state(visitor, ours["jobID"])["status"] == "successful"
            on_project = visitor.get(f"/api/jobs/{ours['jobID']}/results").json()["id"]
            # A series job goes to the project server, with the word project and without a wish.
            jobs_of_series = []
            for wish, uses in ((None, []), ("project", []), (None, [on_project]), ("project", [on_project])):
                job = started(visitor, "stand-in-series", wish, uses=uses)
                assert job["server"] is None
                done = state(visitor, job["jobID"])
                assert (done["status"], done["server"], done["series"]) == ("successful", None, done["series"])
                assert "layer" not in done
                result = visitor.get(f"/api/jobs/{job['jobID']}/results").json()
                assert (result["kind"], result["id"]) == ("series", done["series"])
                jobs_of_series.append(job["jobID"])
            assert len(visitor.get("/api/series").json()["series"]) == 4
            assert not set(jobs_of_series) & set(machine.jobs)
            # A series job is not sent to an own server.
            named = start_on(visitor, "stand-in-series", server)
            problem(named, 422)
            assert named.json()["detail"] == (
                "A series is computed on the project server only, so the parameter server must be absent"
                " or the word project."
            )
            # A layer that an own server keeps is not read: the request is refused with one sentence.
            for wish, uses in ((None, [on_own]), ("project", [on_own]), (None, [on_project, on_own])):
                refused = start_on(visitor, "stand-in-series", wish, uses=uses)
                problem(refused, 422)
                assert refused.json()["detail"] == (
                    "The input layers are not all kept on the server of the job (some are on Field laptop),"
                    " and a job takes input layers of its own server only."
                )
            assert len(visitor.get("/api/series").json()["series"]) == 4
            assert not set(jobs_of_series) & set(machine.jobs)
            assert len(machine.jobs) == 1


# The processes of the tools of the kind Series


def test_every_series_tool_is_offered_as_a_process_whose_output_is_a_series() -> None:
    processes = {process.id: process for process in offered.processes()}
    for name, function in SERIES_TOOLS.items():
        process = processes[name]
        assert process.output == "series"
        assert process.title == name.replace("-", " ").capitalize()
        assert process.description.endswith(".")
        described = process.describe()
        assert list(described["inputs"]) == ["inputs", "title", "point"]
        assert (described["inputs"]["inputs"]["minOccurs"], described["inputs"]["inputs"]["maxOccurs"]) == (2, 50)
        assert described["inputs"]["point"]["minOccurs"] == 0
        assert set(described["inputs"]["point"]["schema"]["properties"]) == {"longitude", "latitude"}
        assert set(described["outputs"]) == {"series"}
        assert offered.series_process(name, function).describe() == described
    assert processes["backscatter-series"].description == (
        "Give the radar backscatter of many dates, at a point or as the mean of the area, in decibels."
    )
    assert processes["backscatter-change"].output == "layer"


def test_series_tool_with_a_wrong_name_or_without_a_documentation_string_is_refused() -> None:
    def silent(*_: object) -> Any:
        raise NotImplementedError

    with pytest.raises(ValueError, match="has no documentation string"):
        offered.series_process("backscatter-series", silent)
    with pytest.raises(ValueError, match="lower-case letters, digits and hyphens"):
        offered.series_process("Backscatter series", SERIES_TOOLS["backscatter-series"])


def test_inputs_of_a_series_process_are_checked() -> None:
    process = offered.series_process("backscatter-series", SERIES_TOOLS["backscatter-series"])
    read = process.read_inputs(
        {"inputs": ["a", "b"], "title": " A series ", "point": {"longitude": 1, "latitude": 2}}, lambda _: None
    )
    assert (read.inputs, read.title, read.point) == (("a", "b"), "A series", Point(longitude=1, latitude=2))
    assert process.read_inputs({"inputs": ["a", "b"], "title": "A"}, lambda _: None).point is None
    assert process.read_inputs(
        {"inputs": ["a", "b"], "title": "A", "point": {"value": {"longitude": 1, "latitude": 2}}}, lambda _: None
    ).point == Point(longitude=1, latitude=2)
    for wrong in (
        {"inputs": ["a"], "title": "A"},
        {"inputs": ["a", "a"], "title": "A"},
        {"inputs": ["a", "b"], "title": "A", "point": {"longitude": 200, "latitude": 2}},
        {"inputs": ["a", "b"], "title": "A", "point": {"longitude": 1}},
        {"inputs": ["a", "b"], "title": "A", "cell": [1, 2]},
    ):
        with pytest.raises(InputError, match="is not valid"):
            process.read_inputs(wrong, lambda _: None)


def test_function_of_a_series_process_runs_the_tool_on_the_layers_of_the_session(tmp_path: Path) -> None:
    process = offered.series_process("backscatter-series", SERIES_TOOLS["backscatter-series"])
    reports: list[int] = []
    work = Work(
        layer_id="s3r1es",
        folder=tmp_path,
        address="/files/s3r1es",
        token=None,
        layers=LAYERS_OF_SESSION,
        report=lambda progress, _: reports.append(progress),
    )
    inputs = process.read_inputs({"inputs": ["october", "november"], "title": "Backscatter HH"}, lambda _: None)
    series = process.run(inputs, work)
    assert isinstance(series, SeriesDescription)
    assert series == run()
    assert process.job_title(inputs) == "Backscatter HH"
    assert list(tmp_path.iterdir()) == []
    assert json.loads(series.model_dump_json())["entries"][0]["dates"] == ["2026-10-21"]
