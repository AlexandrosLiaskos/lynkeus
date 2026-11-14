"""Stand-ins for NASA's services and for an analysis tool, inside the operating-system process of a job.

A job imports the function of its process in a new interpreter, where a change
that a test made to a module does not hold. ``with_stand_ins`` therefore makes
the changes inside the job and then calls the function of the process. A test
states what the stand-ins answer in a plan, a JSON file whose path the
environment variable ``PLAN_SETTING`` names, and reads what they were asked
from the file ``seen.jsonl`` beside it, which holds one event in each line.
"""

import json
import os
import shutil
from collections.abc import Callable, Iterator, Sequence
from concurrent.futures import Future
from pathlib import Path
from typing import Any

import earthaccess
import numpy as np
import pytest
from numpy.typing import NDArray

from lynkeus import harmony
from lynkeus.analysis import TOOLS
from lynkeus.layers import AnalysisResult, LayerDescription
from lynkeus.processes import Work
from tests.records import DATA, LAYERS

PLAN_SETTING = "LYNKEUS_TEST_PLAN"
"""The environment variable that names the plan of the stand-ins."""

TOOL = "stand-in-ratio"
"""The name under which the stand-in tool is listed."""

METHOD = "Reference of the method of the stand-in"
RUNNING = {"status": "running", "progress": 40, "message": "The job is being processed"}
DONE = {"status": "successful", "progress": 100, "message": "The job has completed successfully"}


def ratio(arrays: Sequence[NDArray[np.float32]], descriptions: Sequence[LayerDescription]) -> AnalysisResult:
    """Compute the ratio of the second layer to the first, in decibels.

    This paragraph is not part of the description of the process.
    """
    first, second = arrays
    values = (10 * np.log10(second / first)).astype(np.float32)
    return AnalysisResult(values, "Change of radar backscatter", "dB", (-6.0, 6.0), "RdBu", METHOD)


def seen(plan: Path) -> list[dict[str, Any]]:
    """Return the events that the stand-ins of all jobs recorded, in their order."""
    file = plan.with_name("seen.jsonl")
    return [json.loads(line) for line in file.read_text(encoding="utf-8").splitlines()] if file.is_file() else []


def _note(event: str, **facts: object) -> None:
    """Record an event. A line is written whole, so the jobs that run at once do not mix their lines."""
    line = json.dumps({"event": event, "process": os.getpid(), **facts}) + "\n"
    file = Path(os.environ[PLAN_SETTING]).with_name("seen.jsonl")
    descriptor = os.open(file, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o644)
    try:
        os.write(descriptor, line.encode())
    finally:
        os.close(descriptor)


class Catalogue:
    """A query that answers with the record of one backscatter product, as the catalogue gave it."""

    def concept_id(self, identifiers: list[str]) -> "Catalogue":
        return self

    def granule_name(self, name: str) -> "Catalogue":
        _note("catalogue", name=name)
        return self

    def get(self, limit: int) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = json.loads((DATA / "granule-gcov.json").read_text(encoding="utf-8"))["items"]
        return items[:1]


class Harmony:
    """A stand-in for the client of NASA Harmony, which follows the plan.

    The plan holds ``files``, the file of ``tests/data/layers`` that is handed
    over for each layer, and ``states``, the answers to the questions about
    the job, one after the other; the last one is repeated.
    """

    def __init__(self, plan: dict[str, Any], token: str | None) -> None:
        self.plan = plan
        self.asked = 0
        self.variable = ""
        _note("client", token=token)

    def submit(self, request: Any) -> str:
        (self.variable,) = request.variables
        _note("submit", variable=self.variable, granule=request.granule_id, area=list(request.spatial))
        return "job-1"

    def status(self, job: str) -> dict[str, Any]:
        states: list[dict[str, Any]] = self.plan["states"]
        state = states[min(self.asked, len(states) - 1)]
        self.asked += 1
        _note("status", status=state["status"])
        return dict(state)

    def result_urls(self, job: str) -> Iterator[str]:
        return iter(["https://harmony.earthdata.nasa.gov/service-results/staging/public/job/1/layer.tif"])

    def download(self, address: str, directory: str, overwrite: bool) -> "Future[str]":
        files: dict[str, str] = self.plan["files"]
        target = Path(directory) / "1_layer.tif"
        shutil.copyfile(LAYERS / files[self.variable.rsplit("/", 1)[-1]], target)
        _note("download", folder=Path(directory).name, verbose=os.environ.get("VERBOSE"))
        future: Future[str] = Future()
        future.set_result(str(target))
        return future

    def cancel(self, job: str) -> None:
        _note("cancel", job=job)


def with_stand_ins(run: Callable[[Any, Work], LayerDescription], inputs: Any, work: Work) -> LayerDescription:
    """Call the function of a process with the stand-ins in the place of NASA's services and of a tool."""
    plan: dict[str, Any] = json.loads(Path(os.environ[PLAN_SETTING]).read_text(encoding="utf-8"))
    changes = pytest.MonkeyPatch()
    changes.setattr(earthaccess, "DataGranules", Catalogue)
    changes.setattr(harmony, "Client", lambda token=None: Harmony(plan, token))
    changes.setitem(TOOLS, TOOL, ratio)
    return run(inputs, work)
