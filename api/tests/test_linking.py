# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
"""The formats that connect a server of a user with the project server."""

import pytest
from pydantic import TypeAdapter, ValidationError

from lynkeus.layers import LayerDescription
from lynkeus.link import MOST_REPORTED_JOBS
from lynkeus.linking import (
    MOST_BYTES,
    MOST_REPORT_JOBS,
    USER_CODE_LETTERS,
    DismissTask,
    ForgetTask,
    JobState,
    LimitsTask,
    Pairing,
    ReadTask,
    RemoveTask,
    RenameTask,
    Report,
    ServerLimits,
    StartTask,
    Task,
    Tasks,
)

KEY = "k" * 43
JOB = "0123456789abcdef" * 2
LAYER = "fedcba9876543210" * 2
LIMITS = ServerLimits(running_jobs=4, storage=10**11, layer_size=10**10)

TASKS: tuple[Task, ...] = (
    StartTask(id=KEY, job=JOB, process="get-layer", title="Backscatter HH", inputs="{}", token=None),
    DismissTask(id=KEY, job=JOB),
    RenameTask(id=KEY, layer=LAYER, title="Backscatter HH, 21 Oct 2026"),
    RemoveTask(id=KEY, layer=LAYER),
    ReadTask(id=KEY, layer=LAYER, file="gcov-hhhh-20261021.tif", start=0, end=MOST_BYTES),
    LimitsTask(id=KEY, limits=LIMITS),
    ForgetTask(id=KEY),
)


def test_every_task_is_read_back_as_its_own_kind() -> None:
    read = Tasks.model_validate_json(Tasks(tasks=TASKS).model_dump_json())
    assert read.tasks == TASKS
    assert [type(task) for task in read.tasks] == [type(task) for task in TASKS]


def test_task_of_unknown_kind_is_refused() -> None:
    with pytest.raises(ValidationError):
        TypeAdapter(Task).validate_python({"id": KEY, "kind": "run", "job": JOB})


@pytest.mark.parametrize("file", ["../lynkeus.sqlite3", "a/b.tif", "layer.tiff", ".hidden.tif", "LAYER.tif", ""])
def test_file_outside_the_two_files_of_a_layer_is_refused(file: str) -> None:
    with pytest.raises(ValidationError):
        ReadTask(id=KEY, layer=LAYER, file=file, start=0, end=1)


def pairing(user_code: str) -> Pairing:
    return Pairing(
        device_code=KEY,
        user_code=user_code,
        verification_uri="https://lynkeus.nkua.cloud/?connect",
        verification_uri_complete=f"https://lynkeus.nkua.cloud/?connect={user_code}",
        expires_in=900,
        interval=5,
    )


def test_user_code_holds_two_groups_of_four_letters_without_vowels() -> None:
    assert pairing("WDJB-MJHT").user_code == "WDJB-MJHT"
    assert pairing(f"{USER_CODE_LETTERS[:4]}-{USER_CODE_LETTERS[-4:]}").user_code == "BCDF-VWXZ"
    for wrong in ("WDJBMJHT", "WDJB-MJH", "wdjb-mjht", "WDJA-MJHT", "WDJB-MJH1"):
        with pytest.raises(ValidationError):
            pairing(wrong)


def test_report_of_a_job_carries_the_centre_frequency_of_its_layer() -> None:
    layer = LayerDescription(
        id="gunw-unwrappedphase-20261009-20261021",
        title="Unwrapped phase HH, 9 Oct 2026 to 21 Oct 2026",
        kind="layer",
        url="/files/layer/gunw-unwrappedphase-20261009-20261021.tif",
        quantity="Unwrapped interferometric phase, HH",
        unit="rad",
        range=(-4.0, 4.0),
        colours="RdBu",
        dates=("2026-10-09", "2026-10-21"),  # type: ignore[arg-type]
        inputs=("product-file.h5",),
        layer="unwrappedInterferogram/HH/unwrappedPhase",
        frequency=1239000000.0,
        program="Lynkeus 0.1.0",
        record="/files/layer/gunw-unwrappedphase-20261009-20261021.json",
    )
    state = JobState(job=JOB, status="successful", progress=100, message="The layer is ready.", layer=layer, size=1)
    report = state.model_dump_json()
    read = JobState.model_validate_json(report)
    assert read.layer is not None
    assert read.layer.frequency == 1239000000.0
    # A server program that predates the field reports a layer without it, and the layer is read without a frequency.
    earlier = report.replace(',"frequency":1239000000.0', "")
    assert earlier != report
    before = JobState.model_validate_json(earlier)
    assert before.layer is not None
    assert before.layer.frequency is None


def test_report_names_a_limited_number_of_jobs_and_the_program_stays_far_below_it() -> None:
    jobs = Report.model_json_schema()["properties"]["jobs"]
    assert jobs["maxItems"] == MOST_REPORT_JOBS
    assert 5 * MOST_REPORTED_JOBS <= MOST_REPORT_JOBS
