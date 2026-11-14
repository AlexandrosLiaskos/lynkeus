"""The version, the resources and the limits of the web service, in one answer.

The interface writes its notice about the version from this answer, so that
no number of a limit is written in two places. ``service_limits`` reads the
resources when it is called: the processors that the service may use and the
memory that it may hold. The limits are the named constants of the modules
that apply them, read when the answer is made.

A container finds the limits of its own control group (cgroup v2) in the
files ``cpu.max`` and ``memory.max`` of the folder ``/sys/fs/cgroup``, as the
documentation of the Linux kernel describes them. The answer gives the
smaller of the limit of the control group and the amount of the machine. A
value that cannot be read is given as ``None``.
"""

import os
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI
from pydantic import Field

from lynkeus import __version__, harmony, jobs, products, sessions
from lynkeus.layers import Format

CONTROL_GROUP = Path("/sys/fs/cgroup")
"""The folder in which a process finds the files of its own control group (cgroup v2)."""

type LargerLayer = Literal["refused", "coarser"]

LARGER_LAYER: LargerLayer = "refused"
"""What Lynkeus does with an area whose layer would hold more cells than ``lynkeus.harmony.MOST_CELLS``.

``refused``: the request is refused. ``coarser``: the layer is received at a coarser cell size. The interface
chooses the sentence of its notice by this value.
"""


class Resources(Format):
    """What the web service may use of its machine.

    Attributes
    ----------
    processors : float or None
        Number of processors that the service may use, or None when it could
        not be read. It is not a whole number when the control group allows a
        part of a processor.
    memory : int or None
        Memory that the service may hold, in bytes, or None when it could not
        be read.
    """

    processors: float | None = Field(gt=0)
    memory: int | None = Field(gt=0)


class Limits(Format):
    """The limits of the web service, each one a named constant of the module that applies it.

    Attributes
    ----------
    layer_cells : int
        Largest number of cells of one layer (``lynkeus.harmony.MOST_CELLS``).
    larger_layer : {"refused", "coarser"}
        What happens to an area whose layer would hold more cells (``LARGER_LAYER``).
    layer_size : int
        Largest size of the files of one layer, in bytes (``lynkeus.jobs.MAX_LAYER_SIZE``).
    running_jobs : int
        Largest number of jobs that run at once (``lynkeus.jobs.MAX_RUNNING_JOBS``).
    waiting_jobs : int
        Largest number of jobs of all sessions that wait (``lynkeus.jobs.MAX_WAITING_JOBS``).
    job_time : float
        Longest time that a job may run, in seconds (``lynkeus.jobs.JOB_TIME``).
    session_unfinished_jobs : int
        Largest number of jobs of one session that wait or run
        (``lynkeus.jobs.MAX_SESSION_UNFINISHED_JOBS``).
    session_layers : int
        Largest number of layers of one session (``lynkeus.jobs.MAX_SESSION_LAYERS``).
    session_size : int
        Largest total size of the layers of one session, in bytes (``lynkeus.jobs.MAX_SESSION_SIZE``).
    total_size : int
        Largest total size of the layers of all sessions, in bytes (``lynkeus.jobs.MAX_TOTAL_SIZE``).
    search_products : int
        Largest number of products in one answer of a search (``lynkeus.products.MOST_PRODUCTS``).
    session_idle_time : float
        Time without use after which a session is removed, in seconds
        (``lynkeus.sessions.SESSION_IDLE_TIME``).
    earthdata_idle_time : float
        Time without use after which a sign-in to Earthdata ends, in seconds
        (``lynkeus.sessions.EARTHDATA_IDLE_TIME``).
    earthdata_time : float
        Longest time of a sign-in to Earthdata, in seconds (``lynkeus.sessions.EARTHDATA_TIME``).
    """

    layer_cells: int = Field(gt=0)
    larger_layer: LargerLayer
    layer_size: int = Field(gt=0)
    running_jobs: int = Field(gt=0)
    waiting_jobs: int = Field(gt=0)
    job_time: float = Field(gt=0)
    session_unfinished_jobs: int = Field(gt=0)
    session_layers: int = Field(gt=0)
    session_size: int = Field(gt=0)
    total_size: int = Field(gt=0)
    search_products: int = Field(gt=0)
    session_idle_time: float = Field(gt=0)
    earthdata_idle_time: float = Field(gt=0)
    earthdata_time: float = Field(gt=0)


class ServiceLimits(Format):
    """The answer of ``GET /api/limits``.

    Attributes
    ----------
    version : str
        Version of Lynkeus that the service runs.
    resources : Resources
        What the service may use of its machine.
    limits : Limits
        The limits of the service.
    """

    version: str = Field(min_length=1)
    resources: Resources
    limits: Limits


def _text(file: Path) -> str | None:
    """Return the text of a small file without the space around it, or None when it cannot be read."""
    try:
        return file.read_text(encoding="ascii").strip()
    except (OSError, ValueError):
        return None


def processor_limit(folder: Path = CONTROL_GROUP) -> float | None:
    """Read the number of processors that a control group allows.

    The file ``cpu.max`` holds two values, ``$MAX $PERIOD``: the group may
    use the processors for ``$MAX`` in each ``$PERIOD``. The word ``max`` in
    the place of ``$MAX`` means that the group has no limit.

    Parameters
    ----------
    folder : pathlib.Path
        Folder of the files of the control group.

    Returns
    -------
    float or None
        ``$MAX`` divided by ``$PERIOD``, or None when the group has no limit
        or the file cannot be read.
    """
    words = (_text(folder / "cpu.max") or "").split()
    if len(words) != 2 or not all(word.isdecimal() for word in words):
        return None
    most, period = int(words[0]), int(words[1])
    return most / period if most > 0 and period > 0 else None


def memory_limit(folder: Path = CONTROL_GROUP) -> int | None:
    """Read the memory that a control group allows.

    The file ``memory.max`` holds the limit in bytes, or the word ``max``
    when the group has no limit.

    Parameters
    ----------
    folder : pathlib.Path
        Folder of the files of the control group.

    Returns
    -------
    int or None
        The limit in bytes, or None when the group has no limit or the file
        cannot be read.
    """
    text = _text(folder / "memory.max")
    if text is None or not text.isdecimal() or int(text) == 0:
        return None
    return int(text)


def machine_processors() -> int | None:
    """Return the number of processors that the operating system lets this process use, or None when it is not known."""
    return os.process_cpu_count() or None


def machine_memory() -> int | None:
    """Return the memory of the machine in bytes, or None when the operating system does not state it."""
    try:
        pages, size = os.sysconf("SC_PHYS_PAGES"), os.sysconf("SC_PAGE_SIZE")
    except (AttributeError, OSError, ValueError):
        return None
    return pages * size if pages > 0 and size > 0 else None


def _smaller[Number: (int, float)](first: Number | None, second: Number | None) -> Number | None:
    """Return the smaller of two amounts, the one that is known, or None when neither is known."""
    if first is None or second is None:
        return second if first is None else first
    return min(first, second)


def resources(folder: Path = CONTROL_GROUP) -> Resources:
    """Read what the service may use of its machine.

    Parameters
    ----------
    folder : pathlib.Path
        Folder of the files of the control group of the service.

    Returns
    -------
    Resources
        The smaller of the limit of the control group and the amount of the
        machine, for the processors and for the memory. The number of
        processors is rounded to two decimal places and is at least 0.01.
    """
    processors = _smaller(processor_limit(folder), machine_processors())
    if processors is not None:
        processors = max(round(processors, 2), 0.01)
    return Resources(processors=processors, memory=_smaller(memory_limit(folder), machine_memory()))


def limits() -> Limits:
    """Return the limits of the service, read from the modules that apply them."""
    return Limits(
        layer_cells=harmony.MOST_CELLS,
        larger_layer=LARGER_LAYER,
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


def service_limits(folder: Path = CONTROL_GROUP) -> ServiceLimits:
    """Return the version, the resources and the limits of the service.

    Parameters
    ----------
    folder : pathlib.Path
        Folder of the files of the control group of the service.
    """
    return ServiceLimits(version=__version__, resources=resources(folder), limits=limits())


def control_group() -> Path:
    """Return the folder of the files of the control group of the service."""
    return CONTROL_GROUP


def install_limits(app: FastAPI) -> None:
    """Add to a web service the address ``GET /api/limits``.

    The address answers every visitor and creates no session.
    """

    @app.get("/api/limits")
    def service(folder: Annotated[Path, Depends(control_group)]) -> ServiceLimits:
        """Report the version of Lynkeus, the resources of the service and its limits."""
        return service_limits(folder)
