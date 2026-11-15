"""Tests of the program Lynkeus Server: what it writes, and its run on the terminal.

The program is started as ``python -m lynkeus.ownserver --no-window`` on a folder of the test,
against the stand-in for the project server of ``tests/project.py``.
"""

import subprocess
import sys
import threading
from collections.abc import Iterator
from pathlib import Path

import pytest

from lynkeus import __version__, computer, jobs, ownserver
from lynkeus.link import JobView, View
from lynkeus.ownserver import connection_text, jobs_text, lines, site_address, size_text, space_text
from tests.journey import journey
from tests.project import WAIT, Project, project

SITE = "https://lynkeus.nkua.cloud"


def view(**changes: object) -> View:
    fields: dict[str, object] = {
        "version": "0.1.0",
        "folder": Path("/data"),
        "site": SITE,
        "code": None,
        "address": None,
        "complete": None,
        "paired": False,
        "connected": False,
        "user": None,
        "problem": None,
        "jobs": (),
        "used": 0,
        "storage": None,
        "layers": 0,
    }
    return View(**{**fields, **changes})  # type: ignore[arg-type]


PAIRING = {
    "code": "WDJB-MJHT",
    "address": f"{SITE}/?connect",
    "complete": f"{SITE}/?connect=WDJB-MJHT",
    "connected": True,
}
JOBS = (
    JobView("Backscatter HH of a product", "running", 40, "NASA Harmony is preparing the layer."),
    JobView("Coherence", "accepted", 0, "The job waits for its turn."),
)


@pytest.mark.parametrize(
    ("size", "text"),
    [
        (0, "0 bytes"),
        (999, "999 bytes"),
        (1_000, "1 kB"),
        (1_540, "1.54 kB"),
        (123_456_789, "123 MB"),
        (1_500_000_000, "1.5 GB"),
        (999_999_999_999, "1000 GB"),
        (2_000_000_000_000, "2 TB"),
        (5 * 10**15, "5000 TB"),
    ],
)
def test_size_is_written_with_the_unit_that_suits_it(size: int, text: str) -> None:
    assert size_text(size) == text


def test_program_writes_the_code_of_a_pairing_with_its_address() -> None:
    assert lines(view(**PAIRING)) == [
        "Lynkeus Server 0.1.0",
        f"Data folder: {Path('/data')}",
        f"To connect this computer, open {SITE}/?connect=WDJB-MJHT in a browser, sign in to Earthdata "
        "and confirm the code WDJB-MJHT.",
        "Not connected yet. Confirm the code on the site of Lynkeus.",
    ]


def test_program_writes_whether_it_is_connected_and_to_which_user() -> None:
    assert connection_text(view(paired=True, connected=True, user="a_visitor")) == "Connected to Lynkeus as a_visitor."
    assert connection_text(view(paired=True, connected=True)) == "Connected to Lynkeus."
    away = "The project server does not answer. Lynkeus Server tries again."
    assert connection_text(view(paired=True, user="a_visitor", problem=away)) == f"Not connected. {away}"
    assert connection_text(view()) == "Not connected. Lynkeus Server is asking the project server."
    assert connection_text(view(**{**PAIRING, "connected": False, "problem": away})) == f"Not connected. {away}"


def test_program_writes_the_jobs_and_the_space_of_a_paired_server() -> None:
    shown = view(
        paired=True, connected=True, user="a_visitor", jobs=JOBS, used=1_500_000_000, storage=10**11, layers=12
    )
    assert lines(shown)[2:] == [
        "Connected to Lynkeus as a_visitor.",
        "Jobs: 1 running, 1 waiting.",
        "  Running: Backscatter HH of a product. NASA Harmony is preparing the layer.",
        "  Waiting: Coherence. The job waits for its turn.",
        "Space used: 1.5 GB of 100 GB, in 12 layers.",
    ]
    assert jobs_text(view()) == "Jobs: 0 running, 0 waiting."
    assert space_text(view(used=10, layers=1)) == "Space used: 10 bytes, in 1 layer."


def test_only_an_address_of_the_project_server_is_opened() -> None:
    assert site_address(view()) == f"{SITE}/"
    assert site_address(view(**PAIRING)) == f"{SITE}/?connect=WDJB-MJHT"
    assert site_address(view(**{**PAIRING, "complete": "https://example.org/?connect=WDJB-MJHT"})) == f"{SITE}/"
    assert site_address(view(**{**PAIRING, "complete": f"{SITE}.example.org/?connect=WDJB-MJHT"})) == f"{SITE}/"


def test_version_of_the_program_is_that_of_the_package(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as stop:
        ownserver.main(["--version"])
    assert stop.value.code == 0
    assert capsys.readouterr().out == f"Lynkeus Server {__version__}\n"


def test_address_that_is_not_one_of_a_project_server_stops_the_program(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code = ownserver.main(["--no-window", "--server", "http://example.org", "--data-folder", str(tmp_path)])
    assert code == 2
    assert capsys.readouterr().err == (
        "Lynkeus Server cannot start: the address of the project server must start with https://.\n"
    )


class Program:
    """The program on the terminal, with the lines that it has written."""

    def __init__(self, folder: Path, site: Project) -> None:
        command = [sys.executable, "-m", "lynkeus.ownserver", "--no-window", "--server", site.address]
        self.process = subprocess.Popen(  # noqa: S603 - the interpreter of the tests runs the program
            [*command, "--data-folder", str(folder)],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
        )
        self.site = site
        self.written: list[str] = []
        self.reader = threading.Thread(target=self._read, daemon=True)
        self.reader.start()

    def _read(self) -> None:
        assert self.process.stdout is not None
        for line in self.process.stdout:
            with self.site.changed:
                self.written.append(line.rstrip("\n"))
                self.site.changed.notify_all()

    def line(self, start: str) -> str:
        """Wait for a line that starts with a text, and return it."""
        return self.site.until(
            lambda: next((line for line in self.written if line.startswith(start)), None), f"the line {start}"
        )

    def end(self) -> int:
        self.process.terminate()
        code = self.process.wait(WAIT)
        self.reader.join(WAIT)
        assert self.process.stdout is not None
        self.process.stdout.close()
        return code


@pytest.fixture
def site() -> Iterator[Project]:
    with project() as server:
        yield server


def test_program_runs_on_the_terminal_until_it_is_asked_to_end(tmp_path: Path, site: Project) -> None:
    program = Program(tmp_path, site)
    try:
        assert program.line("Lynkeus Server runs.") == "Lynkeus Server runs. Press Ctrl+C to quit."
        assert program.line("Data folder: ") == f"Data folder: {tmp_path}"
        code = site.code()
        assert program.line("To connect this computer") == (
            f"To connect this computer, open {site.address}/?connect={code} in a browser, sign in to Earthdata "
            f"and confirm the code {code}."
        )
        site.confirm(code)
        program.line("Connected to Lynkeus as a_visitor.")
        program.line("Jobs: 0 running, 0 waiting.")
        program.line("Space used: 0 bytes of ")
        # A second program on the same data folder is refused with one sentence.
        second = subprocess.run(  # noqa: S603 - the interpreter of the tests runs the program
            [sys.executable, "-m", "lynkeus.ownserver", "--no-window", "--data-folder", str(tmp_path)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=WAIT,
            check=False,
        )
        assert (second.returncode, second.stdout) == (1, "")
        assert second.stderr == f"Lynkeus Server already runs on this computer with the data folder {tmp_path}.\n"
    finally:
        code_of_end = program.end()
    assert code_of_end == 0
    assert program.written[-1] == "Ending the jobs and quitting."
    # The program that was asked to end told the project server, once and as its last request.
    assert site.asked.count("/api/link/leave") == 1
    assert site.asked[-1] == "/api/link/leave"
    assert sorted(path.name for path in tmp_path.iterdir()) == [
        "files",
        "lock",
        "log.txt",
        "lynkeus.sqlite3",
        "settings.json",
    ]
    assert computer.read_settings(tmp_path).key == site.key
    assert "started on the data folder" in (tmp_path / "log.txt").read_text(encoding="utf-8")
    assert site.faults == []


def test_program_receives_a_layer_and_follows_every_task_from_its_start_to_the_end_of_its_pairing(
    tmp_path: Path,
) -> None:
    measured = journey([sys.executable, "-m", "lynkeus.ownserver", "--no-window"], tmp_path)
    assert set(measured) == {"start", "system", "job", "layer", "cancel", "leave"}
    assert measured["system"] == computer.system_name()
    # The request at Harmony is cancelled within the time that an ended job is given.
    assert measured["cancel"] < jobs.END_TIME + 5
