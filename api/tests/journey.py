"""The journey of Lynkeus Server from its start to its quit, as a check of the whole program.

The program is started as its user starts it, in a process of its own: with the interpreter
(``python -m lynkeus.ownserver``) or as the packed program of a download. It runs against the
stand-in for the project server (``tests/project.py``) and the stand-in for NASA on the network
(``tests/nasaweb.py``), so its own code is used unchanged from the pairing to the files of a layer.
The file that the stand-in for Harmony hands over is one that NASA Harmony returned for a real NISAR
product (``tests/data/layers``, described in ``tests/test_writing.py``).

Run as a program, it checks a packed Lynkeus Server and writes what it measured as JSON::

    python -m tests.journey --window dist/lynkeus-server/lynkeus-server
"""

import argparse
import json
import os
import secrets
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
from collections.abc import Sequence
from contextlib import closing
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from rio_cogeo.cogeo import cog_validate

from lynkeus import computer, jobs
from lynkeus.linking import (
    MOST_BYTES,
    DismissTask,
    Done,
    ForgetTask,
    LimitsTask,
    ReadTask,
    RenameTask,
    ServerLimits,
    StartTask,
)
from lynkeus.writing import read_layer
from tests.nasaweb import DONE, RUNNING, nasa
from tests.project import Project, project, task_name
from tests.records import LAYERS, stac_faults

PRODUCT = "NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001"
REQUEST = {
    "product": "GCOV",
    "granule": PRODUCT,
    "layer": "HHHH",
    "area": {"west": -71.2, "south": 42.6, "east": -70.75, "north": 42.95},
}
VARIABLE = "/science/LSAR/GCOV/grids/frequencyA/HHHH"
FILE = LAYERS / "gcov-hhhh-20261021.tif"
TOKEN = "a-token-of-the-journey-that-no-file-may-hold"  # noqa: S105 - it protects nothing
QUIT_TIME = 15.0
"""The longest time that the check waits for the leave of a program that is quit, in seconds.

It is shorter than the time for which a question for tasks stays open (``lynkeus.linking.MOST_WAIT``): a
program that is quit must not wait for the answer to its open question before it leaves.
"""
START_TIME = 180.0
"""The longest time that the check waits for a start of the program or of a job, in seconds."""
CARRIES_MAP_DATA = (Path(rasterio.__file__).parent / "proj_data" / "proj.db").is_file()
"""Whether the installed rasterio carries map data of its own, as the wheels of PyPI do and those of conda do not."""


def other_map_data(folder: Path) -> dict[str, str]:
    """Make the map data of another program in a folder, and return the variables with which a computer names it.

    PostGIS, QGIS and other programs name their own map data in ``PROJ_DATA``, ``PROJ_LIB`` and ``GDAL_DATA``
    for the whole computer. The database of the coordinate systems in the folder is one of another version
    of PROJ, which PROJ refuses, so that a program that read it could not write a layer. That was the failure
    of the first Lynkeus Server on a Windows computer with PostGIS.
    """
    folder.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(folder / "proj.db")) as database, database:
        database.execute("CREATE TABLE IF NOT EXISTS metadata (key TEXT NOT NULL PRIMARY KEY, value TEXT NOT NULL)")
        database.executemany(
            "INSERT OR REPLACE INTO metadata VALUES (?, ?)",
            [("DATABASE.LAYOUT.VERSION.MAJOR", "0"), ("DATABASE.LAYOUT.VERSION.MINOR", "0")],
        )
    return {variable: str(folder) for variable in ("PROJ_DATA", "PROJ_LIB", "GDAL_DATA")}


def _whole_file(site: Project, layer: str, file: str) -> bytes:
    """Read a file of a layer through tasks, in parts of the largest size, and return its bytes."""
    parts: list[bytes] = []
    size = 1
    while (read := sum(len(part) for part in parts)) < size:
        answer = site.give(ReadTask(id=task_name(), layer=layer, file=file, start=read, end=read + MOST_BYTES))
        assert isinstance(answer, tuple), answer
        part, size = answer
        parts.append(part)
    return b"".join(parts)


def _start(site: Project, title: str) -> str:
    """Give the task that starts a job of ``get-layer``, and return the name of the job."""
    job = secrets.token_hex(16)
    task = StartTask(id=task_name(), job=job, process="get-layer", title=title, inputs=json.dumps(REQUEST), token=TOKEN)
    assert site.give(task, START_TIME) == Done(ok=True)
    return job


def _quit(program: subprocess.Popen[bytes], window: bool) -> None:
    """Ask the program to end, as its user does when he quits it.

    Linux and macOS send the signal SIGTERM, which the program takes as Quit. Windows has no such
    signal for another program: the window is closed with the system program ``taskkill``, and the
    program on the terminal receives the key Ctrl+Break.
    """
    if sys.platform == "win32":
        if window:
            subprocess.run(["taskkill", "/PID", str(program.pid)], check=True, capture_output=True)  # noqa: S603, S607 - a program of Windows
        else:
            program.send_signal(signal.CTRL_BREAK_EVENT)
    else:
        program.terminate()


def journey(command: Sequence[str], folder: Path, whole: bool = True, window: bool = False) -> dict[str, Any]:
    """Run Lynkeus Server through its journey, and return what was measured.

    The computer names the map data of another program in ``PROJ_DATA``, ``PROJ_LIB`` and ``GDAL_DATA``
    (``other_map_data``), as a computer with PostGIS does. The program must use the map data that came with it.

    Parameters
    ----------
    command : sequence of str
        The command that starts the program, without the address of the project server and the data folder.
    folder : pathlib.Path
        An empty folder for the data folder of the program and for its output.
    whole : bool
        False leaves out the jobs and the layers, which is what a check of the window needs: the program
        is paired, reports and is quit.
    window : bool
        Whether the command starts the program with its window. Windows quits such a program in another way.

    Returns
    -------
    dict
        ``start``: the time from the start of the program to its request for a pairing, in seconds.
        ``job``: the time from the task that starts a job to the report of its layer, in seconds.
        ``layer``: the size of the files of the layer, in bytes. ``cancel``: the time from the task
        that dismisses a job to the request that cancels it at the stand-in for Harmony, in seconds.
        ``leave``: the time from the request to end the program to its leave at the stand-in for the
        project server, in seconds. ``system``: the operating system that the program reported.

    Raises
    ------
    AssertionError
        When the program does not do what ``docs/Own_Servers.md`` rules.
    """
    data = folder / "data"
    output = folder / "output.txt"
    measured: dict[str, Any] = {}
    with project() as site, nasa(FILE) as web, output.open("wb") as written:
        environment = {
            **os.environ,
            **web.environment(),
            **other_map_data(folder / "map-data"),
            "PYTHONUNBUFFERED": "1",
        }
        group = 0
        if sys.platform == "win32":
            # Windows sends the key Ctrl+Break to a program that leads a group of its own.
            group = subprocess.CREATE_NEW_PROCESS_GROUP
        started = time.monotonic()
        program = subprocess.Popen(  # noqa: S603 - the command is the program under check
            [*command, "--server", site.address, "--data-folder", str(data)],
            stdout=written,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            env=environment,
            creationflags=group,
        )
        try:
            code = site.until(lambda: next(iter(site.codes.values()), None), "a request for a pairing", START_TIME)
            measured["start"] = round(time.monotonic() - started, 1)
            server = site.confirm(code)
            first = site.report(lambda report: True, "the first report")
            measured["system"] = first.state.system
            assert first.state.limits == computer.read_settings(data).limits
            if whole:
                _jobs_and_layers(site, web, data, server, measured)
                # The pairing was forgotten, and a program that forgot its pairing does not leave. The new
                # pairing that it asked for is confirmed, so that the program that is quit is a paired one.
                assert site.leaves == []
                again = site.code()
                site.confirm(again)
                site.until(lambda: again not in site.codes.values() or None, "the key of the new pairing to be fetched")
                site.report(lambda report: True, "the first report of the new pairing")
            assert site.faults == [], site.faults
            assert program.poll() is None, "the program ended by itself"
            # The program is quit: it tells the project server once, as its last request, and ends.
            assert site.leaves == []
            asked = time.monotonic()
            _quit(program, window)
            site.until(lambda: site.leaves or None, "the leave of the program that is quit", QUIT_TIME)
            measured["leave"] = round(time.monotonic() - asked, 1)
            assert program.wait(START_TIME) == 0
            assert (len(site.leaves), site.asked[-1]) == (1, "/api/link/leave")
            if CARRIES_MAP_DATA:
                # The computer named the map data of another program, and the program used its own.
                text_of_log = (data / computer.LOG).read_text(encoding="utf-8")
                assert "other programs in PROJ_DATA, PROJ_LIB, GDAL_DATA" in text_of_log
            assert site.faults == [], site.faults
        except BaseException:
            written.flush()
            sys.stderr.write(f"Output of the program:\n{output.read_text(encoding='utf-8', errors='replace')}\n")
            log = data / computer.LOG
            if log.is_file():
                sys.stderr.write(f"Log of the program:\n{log.read_text(encoding='utf-8', errors='replace')}\n")
            sys.stderr.write(f"Events of the stand-in for NASA:\n{json.dumps(web.events, indent=1)}\n")
            sys.stderr.write(f"Last requests to the stand-in for the project server:\n{site.asked[-20:]}\n")
            raise
        finally:
            if program.poll() is None:
                program.kill()
                program.wait(60)
    return measured


def _jobs_and_layers(site: Project, web: Any, data: Path, server: str, measured: dict[str, Any]) -> None:
    """Receive a layer, read it, rename it, end a second job and end the pairing."""
    files = data / computer.FILES
    # A job receives a layer through the stand-in for NASA, and its states are reported.
    web.states = [RUNNING, DONE]
    asked = time.monotonic()
    job = _start(site, "Backscatter HH of the journey")
    site.job(job, "running", wait=START_TIME)
    state = site.job(job, wait=START_TIME)
    measured["job"] = round(time.monotonic() - asked, 1)
    assert state.status == "successful", state.message
    assert state.layer is not None
    assert state.size is not None
    layer = state.layer
    measured["layer"] = state.size
    address = f"/api/servers/{server}/files/{layer.id}/"
    assert layer.url.startswith(address)
    assert layer.record.startswith(address)
    assert layer.inputs == (f"{PRODUCT}.h5",)
    [submitted] = web.seen("submit")
    assert VARIABLE in submitted["asked"], submitted
    assert all(event["signed"] == TOKEN for event in web.seen("submit") + web.seen("status") + web.seen("download"))
    # The two files are read through tasks. They are those of the data folder, a valid Cloud Optimized
    # GeoTIFF with the values that Harmony handed over, and a valid STAC record.
    image, record = layer.url.removeprefix(address), layer.record.removeprefix(address)
    received = {name: _whole_file(site, layer.id, name) for name in (image, record)}
    assert sorted(path.name for path in (files / layer.id).iterdir()) == sorted(received)
    assert all((files / layer.id / name).read_bytes() == content for name, content in received.items())
    assert sum(len(content) for content in received.values()) == state.size
    with tempfile.TemporaryDirectory() as folder:
        copy = Path(folder) / image
        copy.write_bytes(received[image])
        valid, errors, warnings = cog_validate(str(copy), quiet=True)
        assert (valid, errors, warnings) == (True, [], [])
        values, grid = read_layer(copy)
        expected, expected_grid = read_layer(FILE)
        assert grid == expected_grid
        assert np.array_equal(values, expected, equal_nan=True)
    assert stac_faults(json.loads(received[record])) == []
    # The title changes in the record, and the limits of the owner reach the settings file and the next report.
    assert site.give(RenameTask(id=task_name(), layer=layer.id, title="Another title")) == Done(ok=True)
    assert json.loads((files / layer.id / record).read_text(encoding="utf-8"))["properties"]["title"] == "Another title"
    limits = ServerLimits(running_jobs=1, storage=10 * state.size, layer_size=2 * state.size)
    assert site.give(LimitsTask(id=task_name(), limits=limits)) == Done(ok=True)
    site.report(lambda report: report.state.limits == limits and report.state.layers == 1, "a report with the limits")
    assert computer.read_settings(data).limits == limits
    # A job that waits for Harmony is dismissed: it cancels its request at Harmony and is reported as dismissed.
    web.states = [RUNNING]
    second = _start(site, "A job that is dismissed")
    site.job(second, "running", wait=START_TIME)

    def asked_about_second_job() -> bool | None:
        submitted = web.seen("submit")
        return (
            len(submitted) == 2 and any(event["job"] == submitted[1]["job"] for event in web.seen("status"))
        ) or None

    site.until(asked_about_second_job, "a question of the second job to Harmony", START_TIME)
    asked = time.monotonic()
    assert site.give(DismissTask(id=task_name(), job=second)) == Done(ok=True)
    assert site.job(second, "dismissed").message == jobs.DISMISSED
    cancelled = site.until(lambda: web.seen("cancel") or None, "the request that cancels the job at Harmony", 30)
    measured["cancel"] = round(time.monotonic() - asked, 1)
    assert [event["job"] for event in cancelled] == [web.seen("submit")[1]["job"]]
    site.until(lambda: len(list(files.iterdir())) == 1 or None, "the removal of the folder of the dismissed job", 30)
    # The token is in no file of the data folder. Windows lets no other program read the file that is held locked.
    kept = [path for path in data.rglob("*") if path.is_file() and path.name != computer.LOCK]
    assert len(kept) >= 5
    assert all(TOKEN.encode() not in path.read_bytes() for path in kept)
    # The owner removes the server: the pairing is forgotten, the files stay and a new pairing is asked for.
    assert site.give(ForgetTask(id=task_name())) == Done(ok=True)
    site.until(lambda: len(site.codes) == 1 or None, "a request for a new pairing", START_TIME)
    settings = computer.read_settings(data)
    assert (settings.server, settings.key, settings.limits) == (None, None, limits)
    assert sorted(path.name for path in (files / layer.id).iterdir()) == sorted(received)


def main(given: Sequence[str] | None = None) -> int:
    """Check a packed Lynkeus Server, and write what was measured as JSON."""
    parser = argparse.ArgumentParser(description="Checks a packed Lynkeus Server against stand-ins.")
    parser.add_argument("program", type=Path, help="the program that writes on the terminal")
    parser.add_argument("--window", type=Path, help="the program with the window, when it is another file")
    parser.add_argument("--result", type=Path, help="file that receives what was measured, as JSON")
    arguments = parser.parse_args(given)
    measured: dict[str, Any] = {}
    with tempfile.TemporaryDirectory() as folder:
        measured["terminal"] = journey([str(arguments.program), "--no-window"], Path(folder))
    if arguments.window is not None:
        with tempfile.TemporaryDirectory() as folder:
            measured["window"] = journey([str(arguments.window)], Path(folder), whole=False, window=True)
    text = json.dumps(measured, indent=2)
    sys.stdout.write(text + "\n")
    if arguments.result is not None:
        arguments.result.write_text(text + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
