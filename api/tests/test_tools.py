"""Tests of the run of an analysis tool.

No tool is finished yet, so a stand-in is registered for the time of a test.
The layers are files of ``tests/data/layers``, which ``tests/test_writing.py``
describes.
"""

import json
from collections.abc import Sequence
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from numpy.typing import NDArray

from lynkeus.analysis import TOOLS
from lynkeus.layers import AnalysisResult, LayerDescription, ToolRun
from lynkeus.tools import run_tool
from lynkeus.writing import LayerError, read_layer
from tests.records import LAYERS, stac_faults

METHOD = "Reference of the method of the stand-in"
RUN = ToolRun(tool="backscatter-change", inputs=("first", "second"), title="Change of backscatter HH")


def layer(name: str, day: date, product: str) -> tuple[LayerDescription, Path]:
    """Describe a file of the test data as a layer of a session."""
    description = LayerDescription(
        id=name,
        title=f"Layer {name}",
        kind="layer",
        url=f"/files/{name}/{name}.tif",
        quantity="Radar backscatter gamma nought, HH, linear power",
        unit="1",
        range=(0.0, 1.0),
        colours="grey",
        dates=(day,),
        inputs=(f"{product}.h5",),
        program="Lynkeus 0.1.0",
        record=f"/files/{name}/{name}.json",
    )
    return description, LAYERS / f"{name}.tif"


LAYERS_OF_SESSION = {
    "second": layer("gcov-hhhh-20261102-small", date(2026, 11, 2), "product-of-2-november"),
    "first": layer("gcov-hhhh-20261021-small", date(2026, 10, 21), "product-of-21-october"),
    "coherence": layer("gunw-coherence-20261009-20261021", date(2026, 10, 9), "product-of-the-pair"),
}


def ratio(arrays: Sequence[NDArray[np.float32]], descriptions: Sequence[LayerDescription]) -> AnalysisResult:
    """Stand in for an analysis tool: the ratio of the second layer to the first, in decibels."""
    first, second = arrays
    values = (10 * np.log10(second / first)).astype(np.float32)
    return AnalysisResult(values, "Change of radar backscatter", "dB", (-6.0, 6.0), "RdBu", METHOD)


def run(folder: Path, reports: list[tuple[int, str]] | None = None, **changes: Any) -> LayerDescription:
    return run_tool(
        RUN.model_copy(update=changes),
        layers=LAYERS_OF_SESSION,
        layer_id="r7m2q4",
        folder=folder,
        address="/files/r7m2q4",
        report=lambda progress, message: None if reports is None else reports.append((progress, message)),
    )


@pytest.fixture(autouse=True)
def stand_in(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(TOOLS, "backscatter-change", ratio)


def test_result_holds_what_the_tool_computed_from_the_layers_in_their_order(tmp_path: Path) -> None:
    reports: list[tuple[int, str]] = []
    run(tmp_path, reports)
    first, grid = read_layer(LAYERS / "gcov-hhhh-20261021-small.tif")
    second, _ = read_layer(LAYERS / "gcov-hhhh-20261102-small.tif")
    written, written_grid = read_layer(tmp_path / "backscatter-change.tif")
    assert np.array_equal(written, (10 * np.log10(second / first)).astype(np.float32))
    assert written_grid == grid
    assert [progress for progress, _ in reports] == [0, 40, 70, 100]


def test_result_is_described_by_the_tool_and_by_its_layers(tmp_path: Path) -> None:
    description = run(tmp_path)
    assert (description.id, description.title, description.kind) == ("r7m2q4", "Change of backscatter HH", "result")
    assert description.url == "/files/r7m2q4/backscatter-change.tif"
    assert description.record == "/files/r7m2q4/backscatter-change.json"
    assert (description.quantity, description.unit) == ("Change of radar backscatter", "dB")
    assert (description.range, description.colours, description.method) == ((-6.0, 6.0), "RdBu", METHOD)
    assert description.dates == (date(2026, 10, 21), date(2026, 11, 2))
    assert description.inputs == ("product-of-21-october.h5", "product-of-2-november.h5")
    assert description.program == "Lynkeus 0.1.0"


def test_record_of_a_result_names_its_layers_and_its_method(tmp_path: Path) -> None:
    run(tmp_path)
    record = json.loads((tmp_path / "backscatter-change.json").read_text(encoding="utf-8"))
    assert stac_faults(record) == []
    assert record["links"] == [
        {
            "rel": "derived_from",
            "href": "/files/gcov-hhhh-20261021-small/gcov-hhhh-20261021-small.json",
            "type": "application/geo+json",
        },
        {
            "rel": "derived_from",
            "href": "/files/gcov-hhhh-20261102-small/gcov-hhhh-20261102-small.json",
            "type": "application/geo+json",
        },
    ]
    lineage = record["properties"]["processing:lineage"]
    assert "backscatter-change" in lineage
    assert METHOD in lineage
    assert "processing:level" not in record["properties"]
    assert record["properties"]["start_datetime"] == "2026-10-21T00:00:00Z"
    assert record["properties"]["end_datetime"] == "2026-11-02T23:59:59Z"
    assert record["assets"]["data"]["bands"][0]["unit"] == "dB"


def test_layers_on_different_grids_are_refused(tmp_path: Path) -> None:
    with pytest.raises(LayerError, match="do not have the same grid"):
        run(tmp_path, inputs=("first", "coherence"))
    assert list(tmp_path.iterdir()) == []


def test_unknown_tool_or_layer_is_refused(tmp_path: Path) -> None:
    with pytest.raises(LayerError, match="no analysis tool of this name"):
        run(tmp_path, tool="coherence-change")
    with pytest.raises(LayerError, match="no longer exists"):
        run(tmp_path, inputs=("first", "removed"))


def test_result_that_is_not_on_the_grid_is_refused(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def half(arrays: Sequence[NDArray[np.float32]], descriptions: Sequence[LayerDescription]) -> AnalysisResult:
        return AnalysisResult(arrays[0][:64], "Half", "1", (0.0, 1.0), "grey", METHOD)

    monkeypatch.setitem(TOOLS, "backscatter-change", half)
    with pytest.raises(LayerError, match="not on the grid of its layers"):
        run(tmp_path)


def test_result_with_infinite_values_is_refused(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def decibels_of_nothing(
        arrays: Sequence[NDArray[np.float32]], descriptions: Sequence[LayerDescription]
    ) -> AnalysisResult:
        return AnalysisResult(np.full_like(arrays[0], -np.inf), "Nothing", "dB", (-1.0, 0.0), "grey", METHOD)

    monkeypatch.setitem(TOOLS, "backscatter-change", decibels_of_nothing)
    with pytest.raises(LayerError, match="infinite values"):
        run(tmp_path)
    assert list(tmp_path.iterdir()) == []


def test_fault_of_a_tool_is_reported_as_one(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def broken(arrays: Sequence[NDArray[np.float32]], descriptions: Sequence[LayerDescription]) -> AnalysisResult:
        raise ZeroDivisionError("division by zero")

    monkeypatch.setitem(TOOLS, "backscatter-change", broken)
    with pytest.raises(LayerError, match="internal error") as caught:
        run(tmp_path)
    assert isinstance(caught.value.__cause__, ZeroDivisionError)
