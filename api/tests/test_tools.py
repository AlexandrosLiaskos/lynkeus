# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""Tests of the run of an analysis tool.

No tool is finished yet, so a stand-in is registered for the time of a test.
The layers are files of ``tests/data/layers``, which ``tests/test_writing.py``
describes.
"""

import json
from collections.abc import Sequence
from dataclasses import replace
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
import pytest
import rasterio
from numpy.typing import NDArray

from lynkeus import __version__
from lynkeus.analysis import TOOLS
from lynkeus.analysis.backscatter import backscatter_state
from lynkeus.layers import AnalysisResult, LayerDescription, ToolRun
from lynkeus.tools import run_tool
from lynkeus.writing import LayerError, read_layer, write_layer
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
    assert description.program == f"Lynkeus {__version__}"
    assert description.ends is None


def test_result_carries_the_words_that_the_tool_gives_for_the_ends_of_its_legend(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def with_words(arrays: Sequence[NDArray[np.float32]], descriptions: Sequence[LayerDescription]) -> AnalysisResult:
        return replace(ratio(arrays, descriptions), ends=("decrease", "increase"))

    monkeypatch.setitem(TOOLS, "backscatter-change", with_words)
    description = run(tmp_path)
    assert description.ends == ("decrease", "increase")
    assert description.model_dump(mode="json")["ends"] == ["decrease", "increase"]
    record = json.loads((tmp_path / "backscatter-change.json").read_text(encoding="utf-8"))
    assert stac_faults(record) == []
    assert "decrease" not in json.dumps(record)


def test_result_carries_the_note_of_its_tool_and_its_record_repeats_it(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    note = "3 of the 9 cells are left out."

    def with_note(arrays: Sequence[NDArray[np.float32]], descriptions: Sequence[LayerDescription]) -> AnalysisResult:
        return replace(ratio(arrays, descriptions), note=note)

    plain = tmp_path / "plain"
    plain.mkdir()
    assert run(plain).note is None
    monkeypatch.setitem(TOOLS, "backscatter-change", with_note)
    description = run(tmp_path)
    assert description.note == note
    record = json.loads((tmp_path / "backscatter-change.json").read_text(encoding="utf-8"))
    assert stac_faults(record) == []
    lineage = record["properties"]["processing:lineage"]
    assert lineage.endswith(f"{METHOD}. {note} Reduced copies made by averaging the values.")


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
    assert lineage.endswith("Reduced copies made by averaging the values.")
    assert "processing:level" not in record["properties"]
    assert record["properties"]["start_datetime"] == "2026-10-21T00:00:00Z"
    assert record["properties"]["end_datetime"] == "2026-11-02T23:59:59Z"
    assert record["assets"]["data"]["bands"][0]["unit"] == "dB"


def test_reduced_copy_of_a_result_in_decibels_is_the_tool_applied_to_the_reduced_copy_of_its_layer(
    tmp_path: Path,
) -> None:
    granule = "NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001"
    power, grid = read_layer(LAYERS / "gcov-hhhh-20261021.tif")
    (tmp_path / "layer").mkdir()
    (tmp_path / "result").mkdir()
    received = write_layer(
        power,
        grid,
        layer_id="layer",
        folder=tmp_path / "layer",
        address="/files/layer",
        name="gcov-hhhh-20261021",
        title="Backscatter HH, 21 Oct 2026",
        kind="layer",
        quantity="Radar backscatter gamma nought, HH, linear power",
        unit="1",
        legend="percentiles",
        colours="grey",
        dates=(date(2026, 10, 21),),
        inputs=(f"{granule}.h5",),
        layer="HHHH",
        lineage="Layer HHHH of the product.",
    )
    description = run_tool(
        ToolRun(tool="backscatter-state", inputs=("layer",), title="Backscatter HH in dB"),
        layers={"layer": (received, tmp_path / "layer" / "gcov-hhhh-20261021.tif")},
        layer_id="result",
        folder=tmp_path / "result",
        address="/files/result",
        report=lambda progress, message: None,
    )
    assert (description.unit, description.kind) == ("dB", "result")
    with rasterio.open(tmp_path / "result" / "backscatter-state.tif", overview_level=0) as source:
        of_result = source.read(1)
    with rasterio.open(tmp_path / "layer" / "gcov-hhhh-20261021.tif", overview_level=0) as source:
        of_layer = source.read(1)
    assert of_result.shape == of_layer.shape == (280, 300)
    np.testing.assert_allclose(of_result, 10 * np.log10(of_layer), rtol=0, atol=2e-5)
    written, _ = read_layer(tmp_path / "result" / "backscatter-state.tif")
    assert written.tobytes() == backscatter_state([power], [received]).values.tobytes()
    record = json.loads((tmp_path / "result" / "backscatter-state.json").read_text(encoding="utf-8"))
    assert stac_faults(record) == []
    lineage = record["properties"]["processing:lineage"]
    assert lineage.endswith("Reduced copies made as the decibels of the mean of the linear power.")


def test_layers_on_different_grids_are_refused(tmp_path: Path) -> None:
    with pytest.raises(LayerError, match="do not have the same grid"):
        run(tmp_path, inputs=("first", "coherence"))
    assert list(tmp_path.iterdir()) == []


def test_unknown_tool_or_layer_is_refused(tmp_path: Path) -> None:
    with pytest.raises(LayerError, match="no analysis tool of this name"):
        run(tmp_path, tool="coherence-forecast")
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
