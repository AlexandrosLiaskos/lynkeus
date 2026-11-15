"""Tests of the connection of an own server with the project server.

The program runs on a folder of the test against ``tests/project.py``, a stand-in for the project
server that reads every message with the formats of ``lynkeus.linking``. The jobs run the stand-in
process of ``tests/standin.py`` in operating-system processes of their own. No test contacts the
project server or NASA.
"""

import json
import re
import secrets
import ssl
import sys
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import certifi
import pytest
from pydantic import ValidationError

from lynkeus import __version__, computer, jobs, link
from lynkeus.computer import AlreadyRunningError, Settings, read_settings, write_settings
from lynkeus.link import AwayError, Link, ProjectServer, job_limits
from lynkeus.linking import (
    FIRST_LAYER_CELLS,
    MOST_BYTES,
    DismissTask,
    Done,
    ForgetTask,
    LimitsTask,
    ReadFailure,
    ReadTask,
    RemoveTask,
    RenameTask,
    ServerLimits,
    StartTask,
    Tasks,
)
from tests.nasaweb import CERTIFICATES
from tests.project import Project, project, task_name
from tests.standin import SIGNED_IN, STAND_IN

SERVER = "0123456789abcdef"
LIMITS = ServerLimits(running_jobs=2, storage=50_000_000, layer_size=5_000_000)
TOKEN = "an-earthdata-token-that-no-file-may-hold"  # noqa: S105 - it protects nothing


@pytest.fixture
def site(monkeypatch: pytest.MonkeyPatch) -> Iterator[Project]:
    # A proxy that the environment of the machine names is not used for the tests.
    for name in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
        monkeypatch.delenv(name, raising=False)
    with project() as server:
        yield server


@contextmanager
def running(folder: Path, site: Project) -> Iterator[Link]:
    """Run Lynkeus Server on a folder against the stand-in until the block ends."""
    server = Link(folder, [STAND_IN, SIGNED_IN], site.address)
    server.start()
    try:
        yield server
    finally:
        server.stop()


def pair(folder: Path, site: Project, limits: ServerLimits = LIMITS) -> None:
    """Write the settings of a paired server, and let the stand-in know its key."""
    site.server, site.key = SERVER, secrets.token_urlsafe(32)
    folder.mkdir(exist_ok=True)
    write_settings(folder, Settings(server=SERVER, key=site.key, user="a_visitor", limits=limits))


@pytest.fixture
def server(tmp_path: Path, site: Project) -> Iterator[Link]:
    """Run a paired own server."""
    pair(tmp_path / "data", site)
    with running(tmp_path / "data", site) as own:
        yield own


def start(site: Project, process: str = "stand-in", token: str | None = None, **inputs: object) -> str:
    """Give the task that starts a job of the stand-in process, and return the name of the job."""
    job = secrets.token_hex(16)
    task = StartTask(
        id=task_name(),
        job=job,
        process=process,
        title=f"Title of {job[:4]}",
        inputs=json.dumps({"name": "a", **inputs}),
        token=token,
    )
    assert site.give(task) == Done(ok=True)
    return job


def read(site: Project, layer: str, file: str, first: int, end: int) -> tuple[bytes, int] | ReadFailure:
    answer = site.give(ReadTask(id=task_name(), layer=layer, file=file, start=first, end=end))
    assert not isinstance(answer, Done)
    return answer


# Pairing


def test_program_shows_the_code_and_keeps_the_key_of_a_confirmed_pairing(tmp_path: Path, site: Project) -> None:
    with running(tmp_path, site) as own:
        code = site.code()
        view = site.until(lambda: own.view() if own.view().code else None, "the code in the program")
        assert (view.code, view.paired, view.user) == (code, False, None)
        assert view.address == f"{site.address}/?connect"
        assert view.complete == f"{site.address}/?connect={code}"
        machine = site.machines[code]
        assert (machine.name, machine.system, machine.version) == (
            computer.computer_name(),
            computer.system_name(),
            __version__,
        )
        name = site.confirm(code)
        first = site.report(lambda report: True, "the first report")
        view = own.view()
        assert (view.code, view.paired, view.connected, view.user) == (None, True, True, "a_visitor")
    settings = read_settings(tmp_path)
    assert (settings.server, settings.key, settings.user) == (name, site.key, "a_visitor")
    expected = computer.first_limits(computer.processors(), computer.memory(), computer.free_space(tmp_path))
    assert settings.limits is not None
    assert (settings.limits.running_jobs, settings.limits.layer_size) == (expected.running_jobs, expected.layer_size)
    assert first.state.limits == settings.limits
    assert (first.state.system, first.state.version) == (computer.system_name(), __version__)
    assert (first.state.running, first.state.waiting, first.state.layers, first.state.disk_used) == (0, 0, 0, 0)
    assert first.jobs == ()
    if sys.platform != "win32":
        assert (tmp_path / computer.SETTINGS).stat().st_mode & 0o777 == 0o600
    assert site.faults == []


def test_program_shows_no_name_when_the_project_server_states_none(tmp_path: Path, site: Project) -> None:
    with running(tmp_path, site) as own:
        site.confirm(site.code(), user=None)
        site.report(lambda report: True, "the first report")
        assert (own.view().paired, own.view().user) == (True, None)


def test_program_asks_less_often_when_told_and_starts_again_when_the_codes_expire(
    tmp_path: Path, site: Project, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(link, "SLOW_DOWN", 1)
    site.refusals = ["slow_down", "expired_token"]
    with running(tmp_path, site):
        first = site.code()
        second = site.until(lambda: next((code for code in site.codes.values() if code != first), None), "a new code")
        site.confirm(second)
        site.report(lambda report: True, "the first report")
        asked = [path for path in site.asked if path.startswith("/api/link/pairings")]
        assert asked.count("/api/link/pairings") == 2
    assert site.faults == []


def test_program_starts_a_new_pairing_when_its_key_is_no_longer_known(server: Link, site: Project) -> None:
    site.report(lambda report: True, "the first report")
    site.remove()
    code = site.code()
    assert read_settings(server.folder) == Settings(limits=LIMITS)
    # A program whose server was removed does not leave: the project server no longer knows it.
    assert site.leaves == []
    name = site.confirm(code)
    site.report(lambda report: True, "the first report of the new pairing")
    assert name != SERVER
    assert read_settings(server.folder).server == name


def test_program_that_is_quit_tells_the_project_server_once(tmp_path: Path, site: Project) -> None:
    pair(tmp_path, site)
    with running(tmp_path, site):
        site.report(lambda report: True, "the first report")
        assert site.leaves == []
    # The leave follows the last report, so that no later message shows the server as connected again.
    assert site.asked.count("/api/link/leave") == 1
    assert site.asked[-1] == "/api/link/leave"
    assert len(site.leaves) == 1
    assert site.leaves[0] >= site.report_times[-1]
    assert site.faults == []


def test_program_that_is_quit_while_a_pairing_waits_does_not_leave(tmp_path: Path, site: Project) -> None:
    with running(tmp_path, site):
        site.code()
    assert site.leaves == []
    assert "/api/link/leave" not in site.asked


def test_program_that_is_quit_waits_two_seconds_at_most_for_the_answer_to_its_leave(
    tmp_path: Path, site: Project
) -> None:
    assert link.LEAVE_TIME == 2.0
    pair(tmp_path, site)
    site.leave_time = 6.0
    with running(tmp_path, site):
        site.report(lambda report: True, "the first report")
        quit_at = time.monotonic()
    assert len(site.leaves) == 1
    assert link.LEAVE_TIME - 0.1 <= time.monotonic() - quit_at < link.LEAVE_TIME + 2


def test_program_is_quit_also_when_the_project_server_is_away(tmp_path: Path, site: Project) -> None:
    pair(tmp_path, site)
    with running(tmp_path, site) as own:
        site.report(lambda report: True, "the first report")
        site.end()
        site.until(lambda: not own.view().connected or None, "the program to notice")
        quit_at = time.monotonic()
    assert time.monotonic() - quit_at < link.LEAVE_TIME + 2
    assert site.leaves == []


def test_second_program_on_the_same_data_folder_is_refused(server: Link, site: Project) -> None:
    with pytest.raises(AlreadyRunningError, match="already runs on this computer with the data folder"):
        Link(server.folder, [STAND_IN], site.address)


@pytest.mark.parametrize(
    "address",
    ["http://lynkeus.nkua.cloud", "ftp://lynkeus.nkua.cloud", "https://", "https://a.b/path", "https://u:p@a.b", "x"],
)
def test_address_of_the_project_server_is_checked(address: str) -> None:
    with pytest.raises(ValueError, match="address of the project server"):
        ProjectServer(address)


def test_address_of_this_computer_is_taken_without_https() -> None:
    assert ProjectServer("http://127.0.0.1:8000/").address == "http://127.0.0.1:8000"
    assert ProjectServer("http://localhost:8000").address == "http://localhost:8000"
    assert ProjectServer().address == "https://lynkeus.nkua.cloud"


# Jobs


def test_job_runs_and_its_states_are_reported(server: Link, site: Project) -> None:
    job = start(site, seconds=1.5)
    running_state = site.job(job, "running")
    assert (running_state.layer, running_state.size, running_state.finished) == (None, None, None)
    assert running_state.started is not None
    view = server.view()
    assert [(shown.title, shown.status) for shown in view.jobs] == [(f"Title of {job[:4]}", "running")]
    state = site.job(job)
    assert (state.status, state.progress, state.message) == ("successful", 100, jobs.READY)
    assert state.layer is not None
    assert state.finished is not None
    # The addresses of the two files are those of the rules, and the files are in the data folder.
    address = f"/api/servers/{SERVER}/files/{state.layer.id}"
    assert (state.layer.url, state.layer.record) == (f"{address}/a.tif", f"{address}/a.json")
    folder = server.folder / "files" / state.layer.id
    assert sorted(path.name for path in folder.iterdir()) == ["a.json", "a.tif"]
    assert state.size == sum(path.stat().st_size for path in folder.iterdir())
    report = site.report(lambda report: report.state.layers == 1, "a report with the layer")
    assert (report.state.disk_used, report.state.running) == (state.size, 0)
    assert server.view().jobs == ()
    assert site.faults == []


def test_token_reaches_the_job_and_no_file_and_no_report(server: Link, site: Project) -> None:
    job = start(site, "signed-in", TOKEN, end="token")
    state = site.job(job)
    assert (state.status, state.message) == ("failed", "NASA refused the token [Earthdata token].")
    kept = [path for path in server.folder.rglob("*") if path.is_file()]
    assert len(kept) >= 3
    assert all(TOKEN.encode() not in path.read_bytes() for path in kept)
    assert all(TOKEN not in report.model_dump_json() for report in site.reports)


def test_job_that_the_server_cannot_run_is_refused_with_a_sentence(server: Link, site: Project) -> None:
    def refusal(**changes: object) -> str:
        fields = {"job": secrets.token_hex(16), "process": "stand-in", "title": "A", "inputs": '{"name": "a"}'}
        answer = site.give(StartTask.model_validate({"id": task_name(), **fields, **changes}))
        assert isinstance(answer, Done)
        assert not answer.ok
        return answer.detail or ""

    assert refusal(process="other").startswith("This server does not offer the process other.")
    assert refusal(inputs='{"name": "NOT VALID"}').startswith("This server does not accept the inputs of the job.")
    assert refusal(inputs="no json").startswith("This server does not accept the inputs of the job.")
    assert refusal(process="signed-in").startswith("The job needs the Earthdata token of the visitor")
    assert site.until(lambda: site.reports[-1] if site.reports else None, "a report").jobs == ()


def test_task_that_is_given_twice_starts_one_job(server: Link, site: Project) -> None:
    job = start(site, seconds=0.5)
    again = StartTask(id=task_name(), job=job, process="stand-in", title="Again", inputs='{"name": "b"}')
    assert site.give(again) == Done(ok=True)
    assert site.job(job).status == "successful"
    assert [path.name for path in (server.folder / "files").iterdir()] == [site.job(job).layer.id]  # type: ignore[union-attr]


def test_jobs_run_and_wait_by_the_limits_of_the_owner(tmp_path: Path, site: Project) -> None:
    pair(tmp_path, site, LIMITS.model_copy(update={"running_jobs": 1}))
    with running(tmp_path, site):
        first, second = start(site, seconds=30), start(site, seconds=30)
        site.job(first, "running")
        report = site.report(lambda report: report.state.waiting == 1, "a report with a waiting job")
        assert (report.state.running, report.state.limits.running_jobs) == (1, 1)
        assert site.job(second, "accepted").message == jobs.WAITING
        # The owner allows two jobs on the site: the second starts, and the settings file keeps the limits.
        assert site.give(LimitsTask(id=task_name(), limits=LIMITS)) == Done(ok=True)
        site.job(second, "running")
        report = site.report(lambda report: report.state.running == 2, "a report with two running jobs")
        assert report.state.limits == LIMITS
        assert read_settings(tmp_path).limits == LIMITS
    assert site.faults == []


def test_layer_larger_than_the_limit_of_the_owner_ends_the_job(tmp_path: Path, site: Project) -> None:
    pair(tmp_path, site, LIMITS.model_copy(update={"layer_size": 1000}))
    with running(tmp_path, site):
        state = site.job(start(site, size=5000))
        assert (state.status, state.message) == (
            "failed",
            "The job was ended because its layer is larger than 0.001 megabytes.",
        )
        assert list((tmp_path / "files").iterdir()) == []


def test_storage_of_the_owner_limits_the_layers(tmp_path: Path, site: Project) -> None:
    pair(tmp_path, site, LIMITS.model_copy(update={"storage": 3000}))
    with running(tmp_path, site):
        assert site.job(start(site)).status == "successful"
        # The second layer of 2000 bytes does not fit in what is left of 3000 bytes.
        state = site.job(start(site))
        assert (state.status, state.message) == (
            "failed",
            "The layer does not fit in the space that is left for your layers. Remove a layer and start again.",
        )
        assert site.give(LimitsTask(id=task_name(), limits=LIMITS.model_copy(update={"storage": 2000}))) == Done(
            ok=True
        )
        task = StartTask(
            id=task_name(), job=secrets.token_hex(16), process="stand-in", title="A", inputs='{"name": "a"}'
        )
        answer = site.give(task)
        assert answer == Done(
            ok=False,
            detail="The layers on this server use the 2e-06 gigabytes that its owner allows. "
            "Remove a layer or raise the storage of the server, and start again.",
        )


def test_dismissed_job_is_ended_and_reported(server: Link, site: Project) -> None:
    job = start(site, seconds=30)
    site.job(job, "running")
    assert site.give(DismissTask(id=task_name(), job=job)) == Done(ok=True)
    state = site.job(job, "dismissed")
    assert (state.message, state.layer) == (jobs.DISMISSED, None)
    files = server.folder / "files"
    site.until(lambda: not list(files.iterdir()), "the removal of the folder of the job", jobs.END_TIME + 10)
    assert site.report(lambda report: report.state.running == 0, "a report without a running job").jobs is not None
    answer = site.give(DismissTask(id=task_name(), job=secrets.token_hex(16)))
    assert answer == Done(ok=False, detail="The server has no job of this name.")


def test_job_that_a_stop_of_the_program_ended_is_reported_before_and_after(tmp_path: Path, site: Project) -> None:
    pair(tmp_path, site)
    with running(tmp_path, site):
        job = start(site, seconds=30)
        site.job(job, "running")
    # The program reports the end of the job while it stops.
    state = site.job(job, "failed", wait=1)
    assert state.message == jobs.RESTARTED
    site.reports.clear()
    with running(tmp_path, site):
        assert site.job(job, "failed").message == jobs.RESTARTED


# Layers


@pytest.fixture
def layer(server: Link, site: Project) -> str:
    """Return the name of a layer of 600 000 bytes that the server keeps."""
    state = site.job(start(site, size=600_000))
    assert state.layer is not None
    return state.layer.id


def test_layer_is_renamed_in_its_description_and_in_its_record(server: Link, site: Project, layer: str) -> None:
    assert site.give(RenameTask(id=task_name(), layer=layer, title="A new title")) == Done(ok=True)
    record = json.loads((server.folder / "files" / layer / "a.json").read_text(encoding="utf-8"))
    assert record["properties"]["title"] == "A new title"
    answer = site.give(RenameTask(id=task_name(), layer=secrets.token_hex(16), title="A"))
    assert answer == Done(ok=False, detail="The server holds no layer of this name.")


def test_layer_is_removed_with_its_files(server: Link, site: Project, layer: str) -> None:
    assert site.give(RemoveTask(id=task_name(), layer=layer)) == Done(ok=True)
    assert list((server.folder / "files").iterdir()) == []
    assert site.report(lambda report: report.state.layers == 0, "a report without the layer").state.disk_used == 0
    assert site.give(RemoveTask(id=task_name(), layer=layer)) == Done(
        ok=False, detail="The server holds no layer of this name."
    )


def test_parts_of_the_two_files_of_a_layer_are_sent(server: Link, site: Project, layer: str) -> None:
    image = (server.folder / "files" / layer / "a.tif").read_bytes()
    record = (server.folder / "files" / layer / "a.json").read_bytes()
    assert len(image) == 600_000
    assert read(site, layer, "a.tif", 0, 100) == (image[:100], 600_000)
    assert read(site, layer, "a.tif", 599_000, 599_990) == (image[599_000:599_990], 600_000)
    # A part ends with the file, and it holds at most MOST_BYTES bytes.
    assert read(site, layer, "a.tif", 599_990, 700_000) == (image[599_990:], 600_000)
    assert read(site, layer, "a.tif", 10, 600_000) == (image[10 : 10 + MOST_BYTES], 600_000)
    assert read(site, layer, "a.json", 0, 10_000) == (record, len(record))
    after = ReadFailure(status=416, detail="The part starts after the end of the file.")
    assert read(site, layer, "a.tif", 600_000, 600_001) == after
    assert read(site, layer, "a.tif", 20, 10) == after
    assert site.faults == []


def test_no_other_file_of_the_computer_can_be_read(server: Link, site: Project, layer: str) -> None:
    missing = ReadFailure(status=404, detail="The server holds no such file of a layer.")
    folder = server.folder / "files" / layer
    (folder / "other.json").write_text("{}", encoding="utf-8")
    (server.folder / "files" / ("0" * 32)).mkdir()
    (server.folder / "files" / ("0" * 32) / "a.tif").write_bytes(b"not a layer of the record")
    # A name that the formats take, of a file that the record of the layer does not name.
    assert read(site, layer, "other.json", 0, 10) == missing
    assert read(site, layer, "settings.json", 0, 10) == missing
    assert read(site, "0" * 32, "a.tif", 0, 10) == missing
    assert read(site, secrets.token_hex(16), "a.tif", 0, 10) == missing
    # A name that leaves the folder is refused by the format of the task.
    for name in ("../settings.json", "..\\settings.json", "/etc/passwd", "a/../../settings.json", "a.tif/..", "A.TIF"):
        with pytest.raises(ValidationError):
            ReadTask(id=task_name(), layer=layer, file=name, start=0, end=10)
    for name in ("..", "../files/" + layer, layer + "/..", "/"):
        with pytest.raises(ValidationError):
            ReadTask(id=task_name(), layer=name, file="a.tif", start=0, end=10)
    # And were such a task to reach the program, it would read nothing.
    for name, file in (
        (layer, "../../settings.json"),
        (layer, str(server.folder / "settings.json")),
        (f"../files/{layer}", "a.tif"),
        ("..", "settings.json"),
    ):
        task = ReadTask.model_construct(id=task_name(), kind="read", layer=name, file=file, start=0, end=10)
        assert server.part(SERVER, task) == missing
    # A link in the place of a file of the layer is not followed.
    if sys.platform != "win32":
        (folder / "a.tif").unlink()
        (folder / "a.tif").symlink_to(server.folder / "settings.json")
        assert read(site, layer, "a.tif", 0, 10) == missing
    assert site.faults == []


def test_task_of_an_unknown_kind_is_not_read() -> None:
    with pytest.raises(ValidationError):
        Tasks.model_validate({"tasks": [{"id": task_name(), "kind": "run", "command": "anything"}]})


# Forgetting


def test_forgotten_pairing_leaves_the_files_and_a_new_pairing_follows(server: Link, site: Project, layer: str) -> None:
    job = start(site, seconds=30)
    site.job(job, "running")
    assert site.give(ForgetTask(id=task_name())) == Done(ok=True)
    code = site.code()
    assert read_settings(server.folder) == Settings(limits=LIMITS)
    # A program that was told to forget its pairing does not leave.
    assert site.leaves == []
    files = server.folder / "files"
    assert sorted(path.name for path in (files / layer).iterdir()) == ["a.json", "a.tif"]
    name = site.confirm(code)
    report = site.report(lambda report: True, "the first report of the new pairing")
    # The layer of the earlier pairing counts towards the storage and is not named to the project server.
    assert (report.state.layers, report.state.disk_used > 600_000, report.jobs) == (1, True, ())
    assert [path.name for path in files.iterdir()] == [layer]
    state = site.job(start(site))
    assert state.layer is not None
    assert state.layer.url.startswith(f"/api/servers/{name}/files/")
    assert read(site, layer, "a.tif", 0, 10) == ReadFailure(
        status=404, detail="The server holds no such file of a layer."
    )


def test_layer_whose_folder_was_deleted_by_hand_is_no_longer_kept(tmp_path: Path, site: Project) -> None:
    pair(tmp_path, site)
    with running(tmp_path, site):
        state = site.job(start(site))
        assert state.layer is not None
    for path in (tmp_path / "files" / state.layer.id).iterdir():
        path.unlink()
    (tmp_path / "files" / state.layer.id).rmdir()
    site.reports.clear()
    with running(tmp_path, site):
        report = site.report(lambda report: True, "the first report")
        assert (report.state.layers, report.state.disk_used) == (0, 0)


# The connection


def test_one_question_for_tasks_is_open_at_all_times(server: Link, site: Project) -> None:
    site.wait = 0.3
    site.until(lambda: len(site.questions) >= 8 or None, "eight questions for tasks")
    gaps = [later - earlier for earlier, later in zip(site.questions[2:], site.questions[3:], strict=False)]
    # A question follows the answer to the one before at once.
    assert max(gaps) < 0.3 + 0.25
    assert site.most_open_questions == 1
    # A question is also open while tasks are carried out: each answer arrives while the next question waits.
    site.wait = 25.0
    time.sleep(0.5)
    for _ in range(3):
        start(site, seconds=0.2)
    assert site.open_at_answers == [1, 1, 1]
    assert site.most_open_questions == 1


def test_reports_follow_changes_at_most_once_a_second_and_come_without_changes(
    server: Link, site: Project, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(link, "REPORT_PAUSE", 2)
    site.report(lambda report: True, "the first report")
    job = start(site, seconds=3)
    site.job(job)
    gaps = [later - earlier for earlier, later in zip(site.report_times, site.report_times[1:], strict=False)]
    assert min(gaps) >= link.CHANGE_PAUSE - 0.05
    # The stand-in process reports its progress twenty times a second for three seconds.
    assert 3 <= len(site.reports) <= 8
    number = len(site.reports)
    site.until(lambda: len(site.reports) >= number + 2 or None, "two reports without a change", wait=6)
    assert all(report.jobs == () for report in site.reports[number:])


def test_program_waits_and_tries_again_while_the_project_server_is_away(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(link, "LONGEST_RETRY", 1.0)
    with project() as first:
        pair(tmp_path, first)
        key, port = first.key, first.server_address[1]
        with running(tmp_path, first) as own:
            job = start(first, seconds=4)
            first.job(job, "running")
            first.end()
            first.until(lambda: not own.view().connected or None, "the program to notice")
            assert own.view().problem == "The project server does not answer. Lynkeus Server tries again."
            # The job goes on while the project server is away.
            first.until(lambda: (not own.view().jobs) or None, "the end of the job")
            with project(port) as second:
                second.server, second.key = SERVER, key
                assert second.job(job).status == "successful"
                second.until(lambda: own.view().connected or None, "the program to be connected again")
                assert own.view().problem is None
                assert second.give(RemoveTask(id=task_name(), layer=second.job(job).layer.id)) == Done(ok=True)  # type: ignore[union-attr]
                assert second.faults == []


def test_request_is_answered_or_reported_as_not_answered(site: Project) -> None:
    server = ProjectServer(site.address)
    try:
        assert server.ask("/api/link/report", b"{}") == (401, b"")
        assert server.ask("/api/link/pairings", b"{}") == (422, b"")
    finally:
        server.interrupt()
    # Nothing listens on the port 9 of this computer.
    with pytest.raises(AwayError, match=re.escape("The project server does not answer. Lynkeus Server tries again.")):
        ProjectServer("http://127.0.0.1:9").ask("/api/link/report", b"{}", wait=2)


def test_certificate_of_the_project_server_is_checked(monkeypatch: pytest.MonkeyPatch) -> None:
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(CERTIFICATES / "server.pem")
    with Project() as secure:
        secure.socket = context.wrap_socket(secure.socket, server_side=True)
        thread = threading.Thread(target=secure.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True)
        thread.start()
        try:
            address = f"https://localhost:{secure.server_address[1]}"
            # The authority of the tests is not one that the computer trusts, so nothing is sent.
            unknown = ProjectServer(address)
            with pytest.raises(AwayError, match="The certificate of the project server could not be verified"):
                unknown.ask("/api/link/report", b"{}", key="a-key")
            assert secure.asked == []
            # With that authority trusted, the certificate is accepted for the names that it carries only.
            monkeypatch.setattr(certifi, "where", lambda: str(CERTIFICATES / "ca.pem"))
            trusted = ProjectServer(address)
            assert trusted.ask("/api/link/report", b"{}", key="a-key") == (401, b"")
            trusted.interrupt()
            other = ProjectServer(f"https://127.0.0.2:{secure.server_address[1]}")
            with pytest.raises(AwayError):
                other.ask("/api/link/report", b"{}", key="a-key", wait=2)
            assert secure.asked == ["/api/link/report"]
        finally:
            secure.end()
            thread.join()


def test_limits_of_the_jobs_are_those_of_the_owner() -> None:
    limits = job_limits(ServerLimits(running_jobs=7, storage=10_000, layer_size=400), others=3_000)
    assert limits == jobs.Limits(
        running_jobs=7,
        layer_size=400,
        session_size=7_000,
        total_size=10_000,
        waiting_jobs=None,
        session_unfinished_jobs=None,
        session_layers=None,
        layer_cells=25_000_000,
        work_size=400 + 3 * computer.layer_size(25_000_000),
        job_time=jobs.JOB_TIME,
    )
    assert job_limits(ServerLimits(running_jobs=1, storage=10, layer_size=10), others=30).session_size == 0


def test_cells_of_a_layer_of_the_owner_set_the_time_and_the_folder_of_a_job() -> None:
    size = computer.layer_size(255_000_000)
    owner = ServerLimits(running_jobs=2, storage=10**11, layer_size=size, layer_cells=255_000_000)
    limits = job_limits(owner, others=0)
    assert limits.layer_cells == 255_000_000
    # The folder of a running job holds the layer and its temporary files: 64/3 bytes for a cell.
    assert limits.work_size == 4 * size
    assert limits.work_size >= 255_000_000 * 64 // 3
    # 24 seconds for every million cells above 25 million.
    assert limits.job_time == pytest.approx(2400 + 230 * 24)
    assert job_limits(owner.model_copy(update={"layer_cells": 1_000_000}), others=0).job_time == jobs.JOB_TIME


def test_body_of_every_report_states_the_cells_of_a_layer(
    server: Link, site: Project, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The project server tells a program that knows the limit on the cells of a layer by this field in the
    # limits of its reports. The limits of the test hold the number that a message without the field counts
    # as, which a report that left out the values of the format would leave out.
    assert LIMITS.layer_cells == FIRST_LAYER_CELLS
    monkeypatch.setattr(link, "REPORT_PAUSE", 2)
    site.report(lambda report: True, "the first report")
    limits = LIMITS.model_copy(update={"layer_cells": 90_000_000})
    assert site.give(LimitsTask(id=task_name(), limits=limits)) == Done(ok=True)
    site.report(lambda report: report.state.limits == limits, "a report of the new limits")
    cells = [json.loads(body)["state"]["limits"]["layer_cells"] for body in site.report_bodies]
    assert cells[0] == FIRST_LAYER_CELLS
    assert cells[-1] == 90_000_000
    assert site.faults == []
