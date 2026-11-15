# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""Tests of the processes that the server offers.

No test contacts NASA. A job runs the function of an offered process in an
operating-system process of its own, through the addresses of the web
service. Inside the job, ``tests/nasa.py`` puts stand-ins in the place of
NASA's catalogue, of the client of NASA Harmony and of an analysis tool, since
no tool is finished yet. The files that the stand-in for Harmony hands over are
those of ``tests/data/layers``, which ``tests/test_writing.py`` describes.
"""

import dataclasses
import json
import time
from collections.abc import Iterator
from functools import partial
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from rio_cogeo.cogeo import cog_validate

from lynkeus import __version__, harmony, jobs, offered, server
from lynkeus.analysis import SERIES_TOOLS, TOOLS
from lynkeus.layers import LayerRequest
from lynkeus.processes import Work
from lynkeus.routes import install
from lynkeus.writing import LayerError, read_layer
from tests import nasa
from tests.records import LAYERS, stac_faults
from tests.standin import key_server, token

PRODUCT = "NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001"
AREA = {"west": -71.2, "south": 42.6, "east": -70.75, "north": 42.95}
REQUEST = {"product": "GCOV", "granule": PRODUCT, "layer": "HHHH", "area": AREA}
FILES = {"HHHH": "gcov-hhhh-20261021-small.tif", "HVHV": "gcov-hhhh-20261102-small.tif"}
WAIT = 120.0
"""The longest time that a test waits for a job, in seconds. A job starts a new interpreter."""


class Site:
    """The web service with the offered processes on a folder, one visitor, and the plan of the stand-ins."""

    def __init__(self, client: TestClient, folder: Path, plan: Path) -> None:
        self.client = client
        self.files = folder / "files"
        self.plan = plan
        self.token = token("a_visitor")
        self.arrange()

    def arrange(self, **changes: object) -> None:
        """Write the plan of the stand-ins: a job of Harmony that succeeds at once, unless changed."""
        self.plan.write_text(json.dumps({"files": FILES, "states": [nasa.DONE], **changes}), encoding="utf-8")

    def seen(self, event: str) -> list[dict[str, Any]]:
        return [entry for entry in nasa.seen(self.plan) if entry["event"] == event]

    def sign_in(self) -> None:
        assert self.client.post("/api/session/earthdata", json={"token": self.token}).status_code == 200

    def start(self, process: str, **inputs: object) -> dict[str, Any]:
        response = self.client.post(f"/api/processes/{process}/execution", json={"inputs": inputs})
        assert response.status_code == 201, response.text
        info: dict[str, Any] = response.json()
        return info

    def wait(self, job: str) -> dict[str, Any]:
        """Wait until a job has finished, and return its state."""
        limit = time.monotonic() + WAIT
        while time.monotonic() < limit:
            info: dict[str, Any] = self.client.get(f"/api/jobs/{job}").json()
            if info["status"] in ("successful", "failed"):
                return info
            time.sleep(0.1)
        raise AssertionError(f"the job stayed in the state {info['status']}")

    def result(self, job: str) -> dict[str, Any]:
        info = self.wait(job)
        assert info["status"] == "successful", info["message"]
        description: dict[str, Any] = self.client.get(f"/api/jobs/{job}/results").json()
        assert info["layer"] == description["id"]
        return description

    def layers(self) -> list[dict[str, Any]]:
        return [entry["layer"] for entry in self.client.get("/api/layers").json()["layers"]]

    def folders(self, number: int) -> list[str]:
        """Return the names of the folders of the layers, after waiting until an ended job has left none behind."""
        limit = time.monotonic() + jobs.END_TIME + 10
        while len(list(self.files.iterdir())) != number and time.monotonic() < limit:
            time.sleep(0.1)
        return sorted(path.name for path in self.files.iterdir())

    def path(self, address: str) -> Path:
        """Return the path of a file of a layer from its address for the browser."""
        return self.files / address.removeprefix("/files/")


@pytest.fixture
def site(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Site]:
    plan = tmp_path / "plan.json"
    monkeypatch.setenv(nasa.PLAN_SETTING, str(plan))
    monkeypatch.setitem(TOOLS, nasa.TOOL, nasa.ratio)
    # Every offered process is installed as it is, with the stand-ins made inside its job.
    processes = [
        dataclasses.replace(process, run=partial(nasa.with_stand_ins, process.run)) for process in offered.processes()
    ]
    app = FastAPI()
    with key_server() as keys:
        install(app, processes, folder=tmp_path / "data", keys_address=keys.address)
        with TestClient(app, base_url="https://testserver") as client:
            yield Site(client, tmp_path / "data", plan)


# The list and the descriptions


def test_server_offers_get_layer_and_one_process_for_every_tool(monkeypatch: pytest.MonkeyPatch) -> None:
    assert nasa.TOOL not in TOOLS
    assert [process.id for process in offered.processes()] == ["get-layer", *TOOLS, *SERIES_TOOLS]
    with TestClient(server.create_app(), base_url="https://testserver") as client:
        summaries = client.get("/api/processes").json()["processes"]
        assert [summary["id"] for summary in summaries] == ["get-layer", *TOOLS, *SERIES_TOOLS]
        assert client.get(f"/api/processes/{nasa.TOOL}").status_code == 404
    first = summaries[0]
    assert (first["title"], first["version"]) == ("Get layer", __version__)
    assert first["description"].startswith("Receives one layer of a NISAR product from NASA Harmony")
    assert first["jobControlOptions"] == ["async-execute", "dismiss"]
    assert first["additionalParameters"] == {"parameters": [{"name": "most-cells", "value": [harmony.MOST_CELLS]}]}
    assert first["links"][1]["href"] == "/api/processes/get-layer/execution"
    # A tool that enters the list is offered by the web service without any other change.
    monkeypatch.setitem(TOOLS, nasa.TOOL, nasa.ratio)
    with TestClient(server.create_app(), base_url="https://testserver") as client:
        summaries = client.get("/api/processes").json()["processes"]
        assert [summary["id"] for summary in summaries] == ["get-layer", *TOOLS, *SERIES_TOOLS]
        described = client.get(f"/api/processes/{nasa.TOOL}").json()
    added = summaries[len(TOOLS)]
    assert (added["id"], added["title"]) == (nasa.TOOL, "Stand in ratio")
    assert described["description"] == "Compute the ratio of the second layer to the first, in decibels."
    assert list(described["inputs"]) == ["inputs", "title"]


def test_get_layer_is_described_by_the_format_of_a_layer_request() -> None:
    process = offered.GET_LAYER
    assert process.inputs is LayerRequest
    assert process.run is offered.receive_layer
    assert process.needs_earthdata
    assert process.errors == (LayerError,)
    described = process.describe()
    inputs = described["inputs"]
    assert list(inputs) == ["product", "granule", "layer", "area"]
    assert all((entry["minOccurs"], entry["maxOccurs"]) == (1, 1) for entry in inputs.values())
    assert inputs["product"]["schema"] == {"type": "string", "enum": ["GCOV", "GUNW", "GOFF", "SME2"]}
    assert inputs["granule"]["schema"] == {"type": "string", "minLength": 1}
    area = inputs["area"]["schema"]
    assert area["required"] == ["west", "south", "east", "north"]
    assert area["properties"]["west"] == {"title": "West", "type": "number", "minimum": -180, "maximum": 180}
    assert area["properties"]["north"] == {"title": "North", "type": "number", "minimum": -90, "maximum": 90}
    assert set(described["outputs"]) == {"layer"}
    assert described["additionalParameters"]["parameters"] == [{"name": "most-cells", "value": [25_000_000]}]


def test_process_of_a_tool_takes_its_name_and_the_first_paragraph_of_its_documentation_string() -> None:
    process = offered.tool_process("backscatter-change", nasa.ratio)
    assert (process.id, process.title) == ("backscatter-change", "Backscatter change")
    assert process.description == "Compute the ratio of the second layer to the first, in decibels."
    assert not process.needs_earthdata
    assert process.errors == (LayerError,)
    described = process.describe()
    assert "additionalParameters" not in described
    assert described["inputs"] == {
        "inputs": {
            "title": "Input layers",
            "description": (
                "The id of each input layer, in the order that the method sheet of the tool gives. "
                "A layer is given once."
            ),
            "minOccurs": 1,
            "maxOccurs": jobs.MAX_ACCOUNT_LAYERS,
            "schema": {"type": "string", "minLength": 1},
        },
        "title": {
            "title": "Title",
            "description": "Name of the result.",
            "minOccurs": 1,
            "maxOccurs": 1,
            "schema": {"type": "string", "minLength": 1, "maxLength": 200},
        },
    }
    assert offered.tool_process("soil-moisture-series", nasa.ratio).title == "Soil moisture series"


def test_tool_with_a_wrong_name_or_without_a_documentation_string_is_refused() -> None:
    def silent(arrays: Any, descriptions: Any) -> Any:
        return None

    with pytest.raises(ValueError, match="has no documentation string"):
        offered.tool_process("backscatter-change", silent)
    with pytest.raises(ValueError, match="lower-case letters, digits and hyphens"):
        offered.tool_process("Backscatter change", nasa.ratio)


def test_every_tool_of_the_list_can_be_offered() -> None:
    # This test fails when a tool enters the list with a name or a function that cannot be offered.
    for name, function in TOOLS.items():
        process = offered.tool_process(name, function)
        assert process.description.endswith(".")


def test_job_is_named_by_the_layer_and_the_product() -> None:
    request = LayerRequest.model_validate(REQUEST)
    assert offered.layer_job_title(request) == f"Frequency A HHHH of {PRODUCT}"
    coherence = request.model_copy(
        update={"product": "GUNW", "granule": "pair.h5", "layer": "wrappedInterferogram/VV/coherenceMagnitude"}
    )
    assert offered.layer_job_title(coherence) == "Frequency A VV Wrapped Interferogram Coherence Magnitude of pair"
    assert offered.layer_job_title(request.model_copy(update={"layer": "other"})) == f"other of {PRODUCT}"
    inputs = offered.ToolInputs(inputs=("a", "b"), title="  Change of backscatter HH ")
    assert offered.result_job_title(inputs) == "Change of backscatter HH"


def test_get_layer_is_given_the_limit_of_the_server_on_the_cells_of_a_layer(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    given: list[int | None] = []
    monkeypatch.setenv("VERBOSE", "TRUE")
    monkeypatch.setattr(offered, "get_layer", lambda inputs, **values: given.append(values["most_cells"]))
    work = Work(layer_id="k3v9x2", folder=tmp_path, address="/files/k3v9x2", token=None, layers={}, report=print)
    request = LayerRequest.model_validate(REQUEST)
    offered.receive_layer(request, work)
    offered.receive_layer(request, dataclasses.replace(work, layer_cells=90_000_000))
    # None leaves the limit of the project server in force.
    assert given == [None, 90_000_000]


def test_job_may_run_longer_than_the_longest_wait_for_harmony() -> None:
    # After the wait, a job still fetches the layer and writes its files.
    assert jobs.JOB_TIME >= harmony.MOST_WAIT + 600


# The requests


def test_get_layer_needs_the_sign_in_to_earthdata(site: Site) -> None:
    response = site.client.post("/api/processes/get-layer/execution", json={"inputs": REQUEST})
    assert response.status_code == 401
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json()["detail"] == "Sign in to Earthdata to start this job."
    assert response.headers["www-authenticate"] == 'Bearer realm="Earthdata Login"'
    assert site.client.get("/api/jobs").json()["jobs"] == []
    assert nasa.seen(site.plan) == []


@pytest.mark.parametrize(
    ("process", "inputs", "detail"),
    [
        ("get-layer", {**REQUEST, "product": "RSLC"}, "The input product is not valid"),
        ("get-layer", {**REQUEST, "area": {**AREA, "west": -70.0}}, "The input area is not valid: west must be"),
        ("get-layer", {"product": "GCOV", "granule": PRODUCT, "area": AREA}, "The input layer is not valid"),
        (nasa.TOOL, {"inputs": [], "title": "Change"}, "The input inputs is not valid"),
        (nasa.TOOL, {"inputs": ["a", "a"], "title": "Change"}, "The input inputs is not valid: a layer is given more"),
        (nasa.TOOL, {"inputs": ["a"] * 51, "title": "Change"}, "The input inputs is not valid"),
        (nasa.TOOL, {"inputs": ["a", "b"], "title": "  "}, "The input title is not valid"),
        (nasa.TOOL, {"inputs": ["a", "b"], "title": "x" * 201}, "The input title is not valid"),
        (nasa.TOOL, {"inputs": ["a", "b"], "title": "Change", "tool": "other"}, "The input tool is not valid"),
    ],
)
def test_wrong_inputs_are_answered_with_400_and_start_no_job(
    site: Site, process: str, inputs: dict[str, Any], detail: str
) -> None:
    response = site.client.post(f"/api/processes/{process}/execution", json={"inputs": inputs})
    assert response.status_code == 400, response.text
    assert response.json()["detail"].startswith(detail), response.json()["detail"]
    assert site.client.get("/api/jobs").json()["jobs"] == []


# The jobs


def test_layer_is_received_in_a_job_and_listed_in_the_session(site: Site) -> None:
    site.sign_in()
    started = site.start("get-layer", **REQUEST)
    assert (started["processID"], started["title"]) == ("get-layer", f"Frequency A HHHH of {PRODUCT}")
    assert started["inputs"] == REQUEST
    info = site.wait(started["jobID"])
    assert (info["status"], info["message"], info["progress"]) == ("successful", "The layer is ready.", 100)
    description = site.result(started["jobID"])
    name = description["id"]
    # The machinery of the jobs keeps a layer only under these three names.
    assert name == info["layer"]
    assert description["url"] == f"/files/{name}/gcov-hhhh-20261021.tif"
    assert description["record"] == f"/files/{name}/gcov-hhhh-20261021.json"
    assert (description["title"], description["kind"]) == ("Frequency A HHHH, 21 Oct 2026", "layer")
    assert description["inputs"] == [f"{PRODUCT}.h5"]
    assert site.layers() == [description]
    # The folder of the layer holds its two files and nothing that the job left behind.
    assert [path.name for path in site.files.iterdir()] == [name]
    assert sorted(path.name for path in (site.files / name).iterdir()) == [
        "gcov-hhhh-20261021.json",
        "gcov-hhhh-20261021.tif",
    ]
    written, grid = read_layer(site.path(description["url"]))
    handed, handed_grid = read_layer(LAYERS / FILES["HHHH"])
    assert np.array_equal(written, handed, equal_nan=True)
    assert grid == handed_grid
    valid, errors, warnings = cog_validate(str(site.path(description["url"])), strict=True, quiet=True)
    assert (valid, errors, warnings) == (True, [], [])
    record = json.loads(site.path(description["record"]).read_text(encoding="utf-8"))
    assert stac_faults(record) == []
    assert record["id"] == name
    # The job gave the token of the visitor to Harmony, asked for the layer of the request, and
    # kept the name of the fetched file out of the log.
    assert [entry["token"] for entry in site.seen("client")] == [site.token]
    assert [entry["name"] for entry in site.seen("catalogue")] == [PRODUCT]
    [request] = site.seen("submit")
    assert request["variable"] == "/science/LSAR/GCOV/grids/frequencyA/HHHH"
    assert request["granule"] == ["G4405194348-ASF"]
    assert request["area"] == [-71.2, 42.6, -70.75, 42.95]
    [download] = site.seen("download")
    assert download["verbose"] == "FALSE"
    assert download["folder"].startswith(".harmony-")
    assert site.seen("cancel") == []
    assert site.token not in site.client.get("/api/jobs").text + json.dumps(record) + json.dumps(description)


def test_tool_runs_on_two_layers_of_the_session(site: Site) -> None:
    site.sign_in()
    jobs_of_layers = [site.start("get-layer", **{**REQUEST, "layer": layer})["jobID"] for layer in ("HHHH", "HVHV")]
    first, second = (site.result(job) for job in jobs_of_layers)
    # Each job ran in an operating-system process of its own.
    assert len({entry["process"] for entry in site.seen("client")}) == 2
    title = "Change of backscatter, 21 Oct to 2 Nov 2026"
    started = site.start(nasa.TOOL, inputs=[first["id"], second["id"]], title=title)
    assert (started["processID"], started["title"]) == (nasa.TOOL, title)
    result = site.result(started["jobID"])
    name = result["id"]
    assert name not in (first["id"], second["id"])
    assert result["url"] == f"/files/{name}/{nasa.TOOL}.tif"
    assert result["record"] == f"/files/{name}/{nasa.TOOL}.json"
    assert (result["title"], result["kind"], result["method"]) == (title, "result", nasa.METHOD)
    assert (result["quantity"], result["unit"], result["range"]) == ("Change of radar backscatter", "dB", [-6.0, 6.0])
    assert site.layers()[0] == result
    assert sorted(layer["id"] for layer in site.layers()) == sorted([first["id"], second["id"], name])
    assert sorted(path.name for path in (site.files / name).iterdir()) == [f"{nasa.TOOL}.json", f"{nasa.TOOL}.tif"]
    before, _ = read_layer(LAYERS / FILES["HHHH"])
    after, grid = read_layer(LAYERS / FILES["HVHV"])
    written, written_grid = read_layer(site.path(result["url"]))
    assert np.array_equal(written, (10 * np.log10(after / before)).astype(np.float32), equal_nan=True)
    assert written_grid == grid
    record = json.loads(site.path(result["record"]).read_text(encoding="utf-8"))
    assert stac_faults(record) == []
    assert [link["href"] for link in record["links"] if link["rel"] == "derived_from"] == [
        first["record"],
        second["record"],
    ]
    # A tool asks nothing of NASA and needs no sign-in.
    assert len(site.seen("client")) == 2
    site.client.delete("/api/session/earthdata")
    # A layer that the session does not hold is reported in one sentence, and the job leaves no folder.
    failed = site.wait(site.start(nasa.TOOL, inputs=[first["id"], "0" * 32], title=title)["jobID"])
    assert (failed["status"], failed["message"]) == ("failed", "A layer of the analysis no longer exists.")
    assert site.folders(3) == sorted([first["id"], second["id"], name])


def test_sentence_of_a_layer_that_harmony_does_not_give_reaches_the_visitor(site: Site) -> None:
    site.sign_in()
    refused = {"status": "failed", "progress": 0, "message": "the job failed: No matching granules found."}
    site.arrange(states=[refused])
    job = site.start("get-layer", **REQUEST)["jobID"]
    info = site.wait(job)
    assert (info["status"], info["message"]) == ("failed", "The area lies outside the product.")
    response = site.client.get(f"/api/jobs/{job}/results")
    assert (response.status_code, response.json()["detail"]) == (500, "The area lies outside the product.")
    # The job of Harmony was cancelled, and the folder of the job is removed with what it held.
    assert [entry["job"] for entry in site.seen("cancel")] == ["job-1"]
    assert site.folders(0) == []
    assert site.layers() == []
    # A sentence that comes before Harmony is asked reaches the visitor in the same way.
    info = site.wait(site.start("get-layer", **{**REQUEST, "layer": "VVVV"})["jobID"])
    assert (info["status"], info["message"]) == ("failed", "The product does not hold this layer.")
    assert len(site.seen("submit")) == 1
    assert site.folders(0) == []


def test_dismissed_job_cancels_the_job_of_harmony_and_leaves_no_file(site: Site) -> None:
    site.sign_in()
    site.arrange(states=[nasa.RUNNING])
    job = site.start("get-layer", **REQUEST)["jobID"]
    limit = time.monotonic() + WAIT
    while not site.seen("status") and time.monotonic() < limit:
        time.sleep(0.1)
    assert site.seen("status")
    [folder] = site.files.iterdir()
    # The job waits for Harmony, with the folder for the fetched file inside the folder of the layer.
    assert [path.name[:9] for path in folder.iterdir()] == [".harmony-"]
    assert site.client.delete(f"/api/jobs/{job}").json()["status"] == "dismissed"
    assert site.folders(0) == []
    # The signal that ends the job reached the function of the process in the main thread of the
    # job, where it cancels the job of Harmony before the job ends.
    assert [entry["job"] for entry in site.seen("cancel")] == ["job-1"]
    assert site.layers() == []
