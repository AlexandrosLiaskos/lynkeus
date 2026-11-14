"""Tests of the version, the resources and the limits of the web service."""

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from lynkeus import __version__, harmony, jobs, limits, products, server, sessions

GIBIBYTE = 1024**3


def group(folder: Path, *, cpu: str | None = None, memory: str | None = None) -> Path:
    """Write the files of a control group in a folder, and return the folder."""
    if cpu is not None:
        (folder / "cpu.max").write_text(cpu, encoding="ascii")
    if memory is not None:
        (folder / "memory.max").write_text(memory, encoding="ascii")
    return folder


@pytest.fixture
def machine(monkeypatch: pytest.MonkeyPatch) -> None:
    """Stand in for a machine of 4 processors and 8 GiB of memory."""
    monkeypatch.setattr(limits, "machine_processors", lambda: 4)
    monkeypatch.setattr(limits, "machine_memory", lambda: 8 * GIBIBYTE)


@pytest.mark.parametrize(
    ("text", "processors"),
    [("200000 100000\n", 2.0), ("150000 100000\n", 1.5), ("50000 100000", 0.5), ("100000 50000", 2.0)],
)
def test_the_processor_limit_is_the_first_value_divided_by_the_second(
    tmp_path: Path, text: str, processors: float
) -> None:
    assert limits.processor_limit(group(tmp_path, cpu=text)) == processors


@pytest.mark.parametrize(
    "text",
    ["max 100000\n", "", "200000", "200000 100000 1", "many 100000", "-1 100000", "0 100000", "100000 0", "1.5 1"],
)
def test_a_group_without_a_processor_limit_or_with_an_unreadable_one_gives_none(tmp_path: Path, text: str) -> None:
    assert limits.processor_limit(group(tmp_path, cpu=text)) is None


def test_a_folder_without_the_files_of_a_control_group_gives_no_limit(tmp_path: Path) -> None:
    assert limits.processor_limit(tmp_path) is None
    assert limits.memory_limit(tmp_path) is None
    assert limits.processor_limit(tmp_path / "absent") is None
    assert limits.memory_limit(tmp_path / "absent") is None


def test_a_file_that_is_not_text_gives_no_limit(tmp_path: Path) -> None:
    (tmp_path / "cpu.max").write_bytes(b"\xff\xfe 100000")
    (tmp_path / "memory.max").write_bytes(b"\xff\xfe")
    assert limits.processor_limit(tmp_path) is None
    assert limits.memory_limit(tmp_path) is None


def test_the_memory_limit_is_read_in_bytes(tmp_path: Path) -> None:
    assert limits.memory_limit(group(tmp_path, memory="2147483648\n")) == 2 * GIBIBYTE


@pytest.mark.parametrize("text", ["max\n", "", "0", "-1", "2g", "2147483648 0", "1.5"])
def test_a_group_without_a_memory_limit_or_with_an_unreadable_one_gives_none(tmp_path: Path, text: str) -> None:
    assert limits.memory_limit(group(tmp_path, memory=text)) is None


def test_the_machine_states_its_processors_and_its_memory() -> None:
    processors, memory = limits.machine_processors(), limits.machine_memory()
    assert processors is not None and processors >= 1
    assert memory is not None and memory >= 2**20


def test_processors_that_the_system_does_not_state_are_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(os, "process_cpu_count", lambda: None)
    assert limits.machine_processors() is None


@pytest.mark.parametrize("answer", [-1, 0])
def test_memory_that_the_system_does_not_state_is_none(monkeypatch: pytest.MonkeyPatch, answer: int) -> None:
    monkeypatch.setattr(os, "sysconf", lambda name: answer)
    assert limits.machine_memory() is None


@pytest.mark.parametrize("error", [ValueError("unrecognized configuration name"), OSError(22, "Invalid argument")])
def test_memory_that_the_system_cannot_be_asked_for_is_none(monkeypatch: pytest.MonkeyPatch, error: Exception) -> None:
    def fail(name: str) -> int:
        raise error

    monkeypatch.setattr(os, "sysconf", fail)
    assert limits.machine_memory() is None


def test_memory_on_a_system_without_the_question_is_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delattr(os, "sysconf")
    assert limits.machine_memory() is None


@pytest.mark.usefixtures("machine")
def test_the_resources_are_the_limits_of_the_group_when_they_are_smaller(tmp_path: Path) -> None:
    folder = group(tmp_path, cpu="150000 100000", memory=str(2 * GIBIBYTE))
    assert limits.resources(folder) == limits.Resources(processors=1.5, memory=2 * GIBIBYTE)


@pytest.mark.usefixtures("machine")
def test_the_resources_are_those_of_the_machine_when_they_are_smaller(tmp_path: Path) -> None:
    folder = group(tmp_path, cpu="800000 100000", memory=str(16 * GIBIBYTE))
    assert limits.resources(folder) == limits.Resources(processors=4, memory=8 * GIBIBYTE)


@pytest.mark.usefixtures("machine")
def test_the_resources_are_those_of_the_machine_when_the_group_sets_no_limit(tmp_path: Path) -> None:
    assert limits.resources(group(tmp_path, cpu="max 100000", memory="max")) == limits.Resources(
        processors=4, memory=8 * GIBIBYTE
    )
    assert limits.resources(tmp_path / "absent") == limits.Resources(processors=4, memory=8 * GIBIBYTE)


def test_the_resources_are_the_limits_of_the_group_when_the_machine_is_not_known(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(limits, "machine_processors", lambda: None)
    monkeypatch.setattr(limits, "machine_memory", lambda: None)
    folder = group(tmp_path, cpu="200000 100000", memory=str(GIBIBYTE))
    assert limits.resources(folder) == limits.Resources(processors=2, memory=GIBIBYTE)


def test_resources_that_cannot_be_read_are_none(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(limits, "machine_processors", lambda: None)
    monkeypatch.setattr(limits, "machine_memory", lambda: None)
    assert limits.resources(tmp_path) == limits.Resources(processors=None, memory=None)


@pytest.mark.usefixtures("machine")
@pytest.mark.parametrize(("text", "processors"), [("33333 100000", 0.33), ("1 100000", 0.01), ("166667 100000", 1.67)])
def test_the_processors_are_rounded_to_two_places_and_stay_above_zero(
    tmp_path: Path, text: str, processors: float
) -> None:
    assert limits.resources(group(tmp_path, cpu=text)).processors == processors


def test_every_limit_is_the_constant_of_the_module_that_applies_it() -> None:
    assert limits.limits() == limits.Limits(
        layer_cells=harmony.MOST_CELLS,
        larger_layer=limits.LARGER_LAYER,
        layer_size=jobs.MAX_LAYER_SIZE,
        running_jobs=jobs.MAX_RUNNING_JOBS,
        waiting_jobs=jobs.MAX_WAITING_JOBS,
        job_time=jobs.JOB_TIME,
        session_unfinished_jobs=jobs.MAX_SESSION_UNFINISHED_JOBS,
        session_layers=jobs.MAX_SESSION_LAYERS,
        session_size=jobs.MAX_SESSION_SIZE,
        total_size=jobs.MAX_TOTAL_SIZE,
        search_products=products.MOST_PRODUCTS,
        session_idle_time=sessions.SESSION_IDLE_TIME,
        earthdata_idle_time=sessions.EARTHDATA_IDLE_TIME,
        earthdata_time=sessions.EARTHDATA_TIME,
    )


def test_a_limit_is_read_when_the_answer_is_made_and_is_not_a_copy(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(harmony, "MOST_CELLS", 36_000_000)
    monkeypatch.setattr(jobs, "MAX_RUNNING_JOBS", 3)
    monkeypatch.setattr(products, "MOST_PRODUCTS", 100)
    monkeypatch.setattr(sessions, "EARTHDATA_TIME", 3600.0)
    monkeypatch.setattr(limits, "LARGER_LAYER", "coarser")
    answer = limits.limits()
    assert (answer.layer_cells, answer.running_jobs, answer.search_products) == (36_000_000, 3, 100)
    assert (answer.earthdata_time, answer.larger_layer) == (3600.0, "coarser")


def test_a_larger_layer_is_refused_at_present() -> None:
    assert limits.LARGER_LAYER == "refused"


@pytest.mark.usefixtures("machine")
def test_the_answer_holds_the_version_the_resources_and_the_limits(tmp_path: Path) -> None:
    answer = limits.service_limits(group(tmp_path, memory=str(2 * GIBIBYTE)))
    assert answer == limits.ServiceLimits(
        version=__version__,
        resources=limits.Resources(processors=4, memory=2 * GIBIBYTE),
        limits=limits.limits(),
    )


@pytest.mark.parametrize("change", [{"processors": 0}, {"memory": 0}, {"memory": -1}, {"disk": 1}])
def test_the_format_of_the_resources_refuses_what_is_not_an_amount(change: dict[str, int]) -> None:
    with pytest.raises(ValidationError):
        limits.Resources(**{"processors": 2, "memory": GIBIBYTE, **change})


def test_the_format_of_the_limits_refuses_a_limit_of_zero_and_an_unknown_choice() -> None:
    values = limits.limits().model_dump()
    with pytest.raises(ValidationError):
        limits.Limits(**{**values, "layer_cells": 0})
    with pytest.raises(ValidationError):
        limits.Limits(**{**values, "larger_layer": "smaller"})


@pytest.mark.usefixtures("machine")
def test_the_address_answers_every_visitor_and_creates_no_session(tmp_path: Path) -> None:
    folder = group(tmp_path, cpu="max 100000", memory=str(2 * GIBIBYTE))
    app = server.create_app()
    app.dependency_overrides[limits.control_group] = lambda: folder
    response = TestClient(app).get("/api/limits")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert "set-cookie" not in response.headers
    assert response.json() == limits.service_limits(folder).model_dump(mode="json")
    assert response.json()["version"] == __version__
    assert response.json()["resources"] == {"processors": 4, "memory": 2 * GIBIBYTE}
    assert set(response.json()["limits"]) == set(limits.Limits.model_fields)


def test_the_address_answers_when_the_resources_cannot_be_read(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(limits, "machine_processors", lambda: None)
    monkeypatch.setattr(limits, "machine_memory", lambda: None)
    app = server.create_app()
    app.dependency_overrides[limits.control_group] = lambda: tmp_path
    response = TestClient(app).get("/api/limits")
    assert response.status_code == 200
    assert response.json()["resources"] == {"processors": None, "memory": None}


def test_the_service_reads_the_folder_of_its_own_control_group() -> None:
    assert limits.control_group() == Path("/sys/fs/cgroup")
    assert TestClient(server.create_app()).get("/api/limits").status_code == 200
