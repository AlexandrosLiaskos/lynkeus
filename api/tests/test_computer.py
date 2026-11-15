"""Tests of the data folder, the settings file and the resources of the computer of Lynkeus Server."""

import json
import sys
from pathlib import Path, PurePosixPath, PureWindowsPath

import pytest

from lynkeus import computer, harmony, jobs
from lynkeus.computer import (
    AlreadyRunningError,
    Settings,
    cells_in_memory,
    data_folder,
    first_limits,
    job_memory,
    layer_size,
    read_settings,
    write_settings,
)
from lynkeus.linking import FIRST_LAYER_CELLS, ServerLimits

KEY = "k" * 43
LIMITS = ServerLimits(running_jobs=3, storage=1_000, layer_size=100)


def test_data_folder_is_that_of_each_operating_system() -> None:
    home = Path("/home/a")
    assert data_folder("linux", {}, home) == home / ".local" / "share" / "lynkeus"
    assert data_folder("linux", {"XDG_DATA_HOME": "/srv/data"}, home) == Path("/srv/data/lynkeus")
    # The specification asks for an absolute path, and another value is passed over.
    assert data_folder("linux", {"XDG_DATA_HOME": "data"}, home) == home / ".local" / "share" / "lynkeus"
    assert data_folder("darwin", {"XDG_DATA_HOME": "/srv/data"}, home) == (
        home / "Library" / "Application Support" / "Lynkeus"
    )
    assert PurePosixPath(data_folder("win32", {"LOCALAPPDATA": "/users/a/local"}, home)) == PurePosixPath(
        "/users/a/local/Lynkeus"
    )
    assert data_folder("win32", {}, home) == home / "AppData" / "Local" / "Lynkeus"
    assert str(PureWindowsPath(r"C:\Users\a\AppData\Local") / "Lynkeus") == r"C:\Users\a\AppData\Local\Lynkeus"


def test_data_folder_of_this_computer_lies_in_the_home_of_its_user(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("XDG_DATA_HOME", raising=False)
    assert data_folder().is_relative_to(Path.home())


def test_settings_are_written_and_read(tmp_path: Path) -> None:
    assert read_settings(tmp_path) == Settings()
    settings = Settings(server="0123456789abcdef", key=KEY, user="a_visitor", limits=LIMITS)
    write_settings(tmp_path, settings)
    assert read_settings(tmp_path) == settings
    assert sorted(path.name for path in tmp_path.iterdir()) == ["settings.json"]
    assert json.loads((tmp_path / "settings.json").read_text(encoding="utf-8")) == {
        "server": "0123456789abcdef",
        "key": KEY,
        "user": "a_visitor",
        "limits": {"running_jobs": 3, "storage": 1000, "layer_size": 100, "layer_cells": 25000000},
    }
    if sys.platform != "win32":
        assert (tmp_path / "settings.json").stat().st_mode & 0o777 == 0o600
    write_settings(tmp_path, Settings(limits=LIMITS))
    assert read_settings(tmp_path) == Settings(limits=LIMITS)


@pytest.mark.parametrize(
    "text",
    [
        "",
        "no json",
        "[]",
        '{"server": "0123456789abcdef"}',
        '{"key": "short", "server": "0123456789abcdef"}',
        '{"a": 1}',
    ],
)
def test_settings_file_that_cannot_be_read_is_kept_aside(tmp_path: Path, text: str) -> None:
    (tmp_path / "settings.json").write_text(text, encoding="utf-8")
    assert read_settings(tmp_path) == Settings()
    assert [path.name for path in tmp_path.iterdir()] == ["settings-unreadable.json"]
    assert (tmp_path / "settings-unreadable.json").read_text(encoding="utf-8") == text


def test_settings_of_a_paired_server_hold_its_name_and_its_key() -> None:
    with pytest.raises(ValueError, match="a paired server has a name and a key"):
        Settings(key=KEY)
    with pytest.raises(ValueError, match="only a paired server has an owner"):
        Settings(user="a_visitor")


def test_data_folder_is_held_by_one_program(tmp_path: Path) -> None:
    held = computer.hold(tmp_path)
    with pytest.raises(AlreadyRunningError, match=r"Lynkeus Server already runs on this computer with the data folder"):
        computer.hold(tmp_path)
    held.close()
    computer.hold(tmp_path).close()


@pytest.mark.parametrize(
    ("processors", "memory", "free", "limits"),
    [
        # The computer of the owner: 20 processors, 16 gigabytes, 200 gigabytes free.
        (20, 16_000_000_000, 200_000_000_000, (2, 100_000_000_000, 1_265_000_000, 237_000_000)),
        # The project machine: 2 processors, 7.9 gigabytes.
        (2, 7_940_000_000, 40_000_000_000, (1, 20_000_000_000, 593_000_000, 111_000_000)),
        (1, 1_000_000_000, 600_000_000, (1, 300_000_000, 17_000_000, 3_000_000)),
        (8, None, 0, (2, 0, 0, 25_000_000)),
        (1, None, 10, (1, 5, 5, 25_000_000)),
        (256, 1_000_000_000_000, 10_000_000_000_000, (7, 5_000_000_000_000, 21_334_333_334, 4_000_000_000)),
        (4, 600_000_000, 1_000_000_000, (1, 500_000_000, 6_333_334, 1_000_000)),
        (16, 32_000_000_000, 1_000_000_000_000, (2, 500_000_000_000, 2_598_333_334, 487_000_000)),
    ],
)
def test_first_limits_follow_the_computer(
    processors: int, memory: int | None, free: int, limits: tuple[int, int, int, int]
) -> None:
    first = first_limits(processors, memory, free)
    assert (first.running_jobs, first.storage, first.layer_size, first.layer_cells) == limits
    if memory is not None and computer.LEAST_LAYER_CELLS < first.layer_cells < computer.MOST_LAYER_CELLS:
        # A job of the first cells fits in a quarter of the memory, and the running jobs in half of it.
        assert job_memory(first.layer_cells) <= memory // 4 < job_memory(first.layer_cells + computer.MILLION)
        assert first.running_jobs * job_memory(first.layer_cells) <= memory // 2


def test_first_limits_without_the_memory_are_those_of_the_project_server() -> None:
    first = first_limits(4, None, 10**12)
    assert (first.layer_cells, first.running_jobs) == (FIRST_LAYER_CELLS, jobs.MAX_RUNNING_JOBS)
    assert first.layer_size == layer_size(FIRST_LAYER_CELLS) == 134_333_334
    assert first.layer_size < jobs.MAX_LAYER_SIZE


def test_memory_of_a_job_follows_the_cells_of_its_layer() -> None:
    assert job_memory(0) == computer.JOB_BASE_MEMORY == 200_000_000
    assert job_memory(25_000_000) == 600_000_000
    assert job_memory(100_000_000) == 1_800_000_000
    assert job_memory(100_000_000) - job_memory(99_000_000) == computer.CELL_MEMORY * 1_000_000


def test_most_cells_of_a_job_that_fits_in_a_memory_are_whole_millions() -> None:
    assert cells_in_memory(job_memory(50_000_000)) == 50_000_000
    assert cells_in_memory(job_memory(50_000_000) - 1) == 49_000_000
    assert cells_in_memory(4_000_000_000) == 237_000_000
    # A limit on the cells of a layer lies between 1 million and 4000 million.
    assert cells_in_memory(0) == 1_000_000
    assert cells_in_memory(10**15) == 4_000_000_000


def test_size_of_a_layer_is_that_of_its_cells_without_compression() -> None:
    # 4 bytes a cell, a third more for the reduced copies, and one megabyte for the headers and the record.
    assert layer_size(3_000_000) == 17_000_000
    assert layer_size(25_000_000) == 134_333_334
    assert layer_size(100_000_000) == 534_333_334


def test_limits_kept_by_version_0_1_0_receive_the_cells_of_a_layer(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(computer, "processors", lambda: 20)
    monkeypatch.setattr(computer, "memory", lambda: 16_000_000_000)
    monkeypatch.setattr(computer, "free_space", lambda folder: 200_000_000_000)
    kept = {
        "server": "0123456789abcdef",
        "key": KEY,
        "user": "a_visitor",
        "limits": {"running_jobs": 13, "storage": 100_000_000_000, "layer_size": 500_000_000},
    }
    (tmp_path / "settings.json").write_text(json.dumps(kept), encoding="utf-8")
    settings = read_settings(tmp_path)
    # The pairing stays. The cells are the first value of the computer; the 13 jobs of version 0.1.0 would
    # not fit in the memory with layers of that size, and its 500 megabytes would end such a job.
    assert (settings.server, settings.key, settings.user) == ("0123456789abcdef", KEY, "a_visitor")
    assert settings.limits == ServerLimits(
        running_jobs=2, storage=100_000_000_000, layer_size=1_265_000_000, layer_cells=237_000_000
    )
    assert [path.name for path in tmp_path.iterdir()] == ["settings.json"]
    # What the owner set lower or larger stays, and the size of a layer never passes the storage.
    kept["limits"] = {"running_jobs": 1, "storage": 1_000_000_000, "layer_size": 3_000_000_000}
    (tmp_path / "settings.json").write_text(json.dumps(kept), encoding="utf-8")
    assert read_settings(tmp_path).limits == ServerLimits(
        running_jobs=1, storage=1_000_000_000, layer_size=3_000_000_000, layer_cells=237_000_000
    )
    kept["limits"] = {"running_jobs": 2, "storage": 1_000_000_000, "layer_size": 500_000_000}
    (tmp_path / "settings.json").write_text(json.dumps(kept), encoding="utf-8")
    assert read_settings(tmp_path).limits == ServerLimits(
        running_jobs=2, storage=1_000_000_000, layer_size=1_000_000_000, layer_cells=237_000_000
    )


def test_limits_with_the_cells_of_a_layer_are_read_as_they_are(tmp_path: Path) -> None:
    limits = ServerLimits(running_jobs=13, storage=1_000, layer_size=100, layer_cells=30_000_000)
    write_settings(tmp_path, Settings(limits=limits))
    assert read_settings(tmp_path).limits == limits


def test_resources_of_this_computer_are_read(tmp_path: Path) -> None:
    assert computer.processors() >= 1
    memory = computer.memory()
    assert memory is None or memory > 100_000_000
    assert computer.free_space(tmp_path) > 0
    assert 0 < len(computer.system_name()) <= 80
    assert 0 < len(computer.computer_name()) <= 80


def test_time_of_a_job_grows_with_the_cells_above_those_of_the_project_server() -> None:
    assert computer.job_time(1_000_000) == jobs.JOB_TIME
    assert computer.job_time(harmony.MOST_CELLS) == jobs.JOB_TIME
    # 24 seconds for every further million cells: the 600 seconds that the project server leaves for 25 million.
    assert computer.CELL_TIME * harmony.MOST_CELLS == pytest.approx(jobs.JOB_TIME - harmony.MOST_WAIT)
    assert computer.job_time(26_000_000) == pytest.approx(2424)
    assert computer.job_time(255_000_000) == pytest.approx(7920)


def test_rule_of_the_memory_lies_above_every_job_that_was_measured() -> None:
    # The cells of the layer and the most memory that its job held, in bytes (docs/research/servers.md).
    measured = [(15_000_000, 390_000_000), (52_063_330, 970_264_576), (104_294_556, 1_746_235_392)]
    for cells, memory in measured:
        assert memory < computer.job_memory(cells) < 1.15 * memory
    assert computer.job_memory(harmony.MOST_CELLS) == 600_000_000
