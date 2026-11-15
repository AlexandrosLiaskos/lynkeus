"""Tests of the data folder, the settings file and the resources of the computer of Lynkeus Server."""

import json
import sys
from pathlib import Path, PurePosixPath, PureWindowsPath

import pytest

from lynkeus import computer, jobs
from lynkeus.computer import AlreadyRunningError, Settings, data_folder, first_limits, read_settings, write_settings
from lynkeus.linking import ServerLimits

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
        "limits": {"running_jobs": 3, "storage": 1000, "layer_size": 100},
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
        # The computer of the first trial: 20 processors, 16 gigabytes, 200 gigabytes free.
        (20, 16_000_000_000, 200_000_000_000, (13, 100_000_000_000, 500_000_000)),
        # The project server: 2 processors, 7.9 gigabytes.
        (2, 7_940_000_000, 40_000_000_000, (1, 20_000_000_000, 500_000_000)),
        (1, 1_000_000_000, 600_000_000, (1, 300_000_000, 300_000_000)),
        (8, None, 0, (2, 0, 0)),
        (1, None, 10, (1, 5, 5)),
        (256, 1_000_000_000_000, 10**13, (64, 5 * 10**12, 500_000_000)),
        (4, 600_000_000, 10**9, (1, 500_000_000, 500_000_000)),
    ],
)
def test_first_limits_follow_the_computer(
    processors: int, memory: int | None, free: int, limits: tuple[int, int, int]
) -> None:
    first = first_limits(processors, memory, free)
    assert (first.running_jobs, first.storage, first.layer_size) == limits


def test_first_limits_take_the_size_of_a_layer_of_the_project_server() -> None:
    assert first_limits(4, None, 10**12).layer_size == jobs.MAX_LAYER_SIZE
    assert first_limits(4, None, 10**12).running_jobs == jobs.MAX_RUNNING_JOBS


def test_resources_of_this_computer_are_read(tmp_path: Path) -> None:
    assert computer.processors() >= 1
    memory = computer.memory()
    assert memory is None or memory > 100_000_000
    assert computer.free_space(tmp_path) > 0
    assert 0 < len(computer.system_name()) <= 80
    assert 0 < len(computer.computer_name()) <= 80
