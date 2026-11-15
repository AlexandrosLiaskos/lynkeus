"""The computer on which Lynkeus Server runs: its data folder, its settings file and its resources.

``docs/Own_Servers.md`` gives the data folder of each operating system and what it holds. The
settings file holds the name and the key of the server, so only the user of the computer may read it.
"""

import contextlib
import json
import os
import platform
import shutil
import sys
from collections.abc import Mapping
from pathlib import Path
from typing import IO, Self

from pydantic import ValidationError, model_validator

from lynkeus import jobs, limits
from lynkeus.layers import Format
from lynkeus.linking import FIRST_LAYER_CELLS, Key, Label, ServerId, ServerLimits

SETTINGS = "settings.json"
"""The name of the settings file in the data folder."""

RECORD = "lynkeus.sqlite3"
"""The name of the record of the jobs and layers in the data folder."""

FILES = "files"
"""The name of the folder of the files of the layers in the data folder."""

LOG = "log.txt"
"""The name of the file in the data folder in which the program records what it did and every error."""

LOCK = "lock"
"""The name of the file in the data folder that a running program holds locked."""

JOB_BASE_MEMORY = 200_000_000
"""The memory that a job holds whatever the cells of its layer, in bytes: the interpreter and its libraries."""

CELL_MEMORY = 16
"""The memory that a job holds for every cell of the layer that it receives, in bytes.

``job_memory`` gives the memory of a job from these two numbers. They come from two jobs that received
real layers of 52 and 104 million cells in a container of 4 GB (``docs/research/servers.md``): the jobs
held 970 MB and 1,746 MB at most, which is 197 MB and 14.9 bytes for every cell. Both numbers are
rounded up, and the rule lies 6 to 7 % above the two jobs. For 25 million cells it gives 600 MB.
"""

CELL_TIME = 24e-6
"""The time that a job has for every cell of its layer above 25 million, in seconds.

It is the time that a job of the project server has after the longest wait for NASA Harmony, for every
cell of its largest layer: 600 seconds for 25 million cells. ``job_time`` gives the longest time of a job
from it.
"""

MILLION = 1_000_000
"""The step of a limit on the cells of a layer."""

LEAST_LAYER_CELLS = 1_000_000
"""The smallest limit on the cells of a layer that ``lynkeus.linking.ServerLimits`` takes."""

MOST_LAYER_CELLS = 4_000_000_000
"""The largest limit on the cells of a layer that ``lynkeus.linking.ServerLimits`` takes."""

CELL_SIZE = 4
"""The size of a cell in the file of a layer without compression, in bytes: a 32-bit real number."""

MOST_RUNNING_JOBS = 64
"""The largest number of running jobs that ``lynkeus.linking.ServerLimits`` takes."""


class AlreadyRunningError(Exception):
    """Another Lynkeus Server already runs on the data folder. The message is a sentence for the user."""


class Settings(Format):
    """What the settings file holds.

    Attributes
    ----------
    server : str or None
        Name of this own server on the project server, or None while it is not paired.
    key : str or None
        Secret that the program sends with every request of a paired server.
    user : str or None
        Earthdata user name of the owner, when the project server stated it.
    limits : ServerLimits or None
        Limits of the server, or None before the first limits are derived.
    """

    server: ServerId | None = None
    key: Key | None = None
    user: Label | None = None
    limits: ServerLimits | None = None

    @model_validator(mode="after")
    def _is_paired_or_not(self) -> Self:
        if (self.server is None) != (self.key is None):
            raise ValueError("a paired server has a name and a key")
        if self.user is not None and self.server is None:
            raise ValueError("only a paired server has an owner")
        return self


def data_folder(
    system: str | None = None, environment: Mapping[str, str] | None = None, home: Path | None = None
) -> Path:
    r"""Return the data folder of Lynkeus Server on this computer.

    Parameters
    ----------
    system : str, optional
        Name of the operating system as ``sys.platform`` gives it. Without it, the system that runs.
    environment : mapping of str to str, optional
        Environment variables. Without it, those of the program.
    home : pathlib.Path, optional
        Home folder of the user. Without it, the one that the operating system states.

    Returns
    -------
    pathlib.Path
        ``%LOCALAPPDATA%\Lynkeus`` on Windows, ``~/Library/Application Support/Lynkeus`` on macOS, and
        elsewhere ``$XDG_DATA_HOME/lynkeus``, which is ``~/.local/share/lynkeus`` when the variable is
        not set or is not an absolute path (XDG Base Directory Specification).
    """
    system = sys.platform if system is None else system
    environment = os.environ if environment is None else environment
    home = Path.home() if home is None else home
    if system == "win32":
        local = environment.get("LOCALAPPDATA")
        return (Path(local) if local else home / "AppData" / "Local") / "Lynkeus"
    if system == "darwin":
        return home / "Library" / "Application Support" / "Lynkeus"
    shared = environment.get("XDG_DATA_HOME", "")
    return (Path(shared) if shared.startswith("/") else home / ".local" / "share") / "lynkeus"


def read_settings(folder: Path) -> Settings:
    """Read the settings file of a data folder.

    A file that is missing gives the settings of a new server. A file that cannot be read as settings
    is kept under the name ``settings-unreadable.json`` and also gives the settings of a new server, so
    that a damaged file does not stop the program. Limits that an older program kept, which knew no limit
    on the cells of a layer, receive that limit by the rule of the first limits (``limits_with_cells``); the
    pairing stays.
    """
    path = folder / SETTINGS
    try:
        kept = json.loads(path.read_text(encoding="utf-8"))
        old = kept.get("limits") if isinstance(kept, dict) else None
        if isinstance(old, dict) and "layer_cells" not in old:
            # The file was written by an older program, which knew no limit on the cells of a layer.
            kept["limits"] = limits_with_cells(old, first_limits(processors(), memory(), free_space(folder)))
        return Settings.model_validate(kept)
    except FileNotFoundError:
        return Settings()
    except (OSError, ValueError, ValidationError):
        with contextlib.suppress(OSError):
            path.replace(folder / "settings-unreadable.json")
        return Settings()


def write_settings(folder: Path, settings: Settings) -> None:
    """Write the settings file of a data folder, whole or not at all. Only the user of the computer may read it."""
    path = folder / SETTINGS
    temporary = path.with_name(SETTINGS + ".tmp")
    text = json.dumps(settings.model_dump(mode="json"), indent=2) + "\n"
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as file:
        file.write(text)
    temporary.replace(path)


def hold(folder: Path) -> IO[bytes]:
    """Lock the data folder for this program, until the file returned is closed or the program ends.

    Raises
    ------
    AlreadyRunningError
        When another Lynkeus Server holds the folder.
    """
    file = (folder / LOCK).open("ab")
    try:
        if sys.platform == "win32":
            import msvcrt  # the module exists on Windows only

            file.seek(0)
            msvcrt.locking(file.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl  # the module does not exist on Windows

            fcntl.flock(file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        file.close()
        raise AlreadyRunningError(
            f"Lynkeus Server already runs on this computer with the data folder {folder}."
        ) from None
    return file


def processors() -> int:
    """Return the number of processors that the operating system lets the program use."""
    return limits.machine_processors() or 1


def memory() -> int | None:
    """Return the memory of the computer in bytes, or None when the operating system does not state it."""
    if sys.platform == "win32":
        import ctypes  # used on Windows only

        class Status(ctypes.Structure):
            """The structure MEMORYSTATUSEX of the Windows function GlobalMemoryStatusEx."""

            _fields_ = (
                ("length", ctypes.c_ulong),
                ("load", ctypes.c_ulong),
                ("total", ctypes.c_ulonglong),
                ("available", ctypes.c_ulonglong),
                ("total_page_file", ctypes.c_ulonglong),
                ("available_page_file", ctypes.c_ulonglong),
                ("total_virtual", ctypes.c_ulonglong),
                ("available_virtual", ctypes.c_ulonglong),
                ("available_extended_virtual", ctypes.c_ulonglong),
            )

        status = Status()
        status.length = ctypes.sizeof(Status)
        if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            return None
        return int(status.total) or None
    return limits.machine_memory()


def free_space(folder: Path) -> int:
    """Return the free space of the disk that holds a folder, in bytes."""
    return shutil.disk_usage(folder).free


def job_memory(cells: int) -> int:
    """Return the memory that a job holds while it receives and writes a layer, in bytes.

    Parameters
    ----------
    cells : int
        Cells of the layer.

    Returns
    -------
    int
        ``JOB_BASE_MEMORY`` and ``CELL_MEMORY`` for every cell. The project server uses this rule to
        tell whether the running jobs of an own server fit in its memory (``docs/Own_Servers.md``).
    """
    return JOB_BASE_MEMORY + CELL_MEMORY * max(cells, 0)


def job_time(cells: int) -> float:
    """Return the longest time that a job may run on a server that receives layers of a number of cells.

    Parameters
    ----------
    cells : int
        Largest number of cells of a layer of the server.

    Returns
    -------
    float
        The time in seconds: ``lynkeus.jobs.JOB_TIME`` for a layer of 25 million cells or fewer, and
        ``CELL_TIME`` more for every further cell. The wait for NASA Harmony did not grow with the
        cells of the layers measured, so the further time is for the transfer, the reading and the
        writing of the layer, which grow with its cells.
    """
    return jobs.JOB_TIME + max(cells - FIRST_LAYER_CELLS, 0) * CELL_TIME


def cells_in_memory(memory: int) -> int:
    """Return the most cells of a layer whose job fits in an amount of memory, in whole millions.

    Parameters
    ----------
    memory : int
        Memory for the job, in bytes.

    Returns
    -------
    int
        The largest whole number of millions of cells for which ``job_memory`` is at most ``memory``,
        and never less than 1 million or more than 4000 million, the range of a limit.
    """
    cells = max(memory - JOB_BASE_MEMORY, 0) // CELL_MEMORY // MILLION * MILLION
    return max(LEAST_LAYER_CELLS, min(cells, MOST_LAYER_CELLS))


def layer_size(cells: int) -> int:
    """Return the size of the two files of a layer of a number of cells that does not compress, in bytes.

    The GeoTIFF holds 4 bytes for a cell and a third more for its reduced copies. One megabyte is added
    for the headers of the file and for the STAC record.
    """
    return -(-cells * CELL_SIZE * 4 // 3) + MILLION


def first_limits(processors: int, memory: int | None, free: int) -> ServerLimits:
    """Derive the first limits of a new own server from the computer. The owner changes them on the site.

    Parameters
    ----------
    processors : int
        Processors that the program may use.
    memory : int or None
        Memory of the computer, in bytes, or None when it is not known.
    free : int
        Free space of the disk that holds the layers, in bytes.

    Returns
    -------
    ServerLimits
        Cells of a layer: those of a job that fits in a quarter of the memory (``cells_in_memory``),
        and 25 million when the memory is not known. Running jobs: as many jobs of that size as fit in
        half of the memory, at most one for every processor but one, which stays for the other programs
        of the computer; when the memory is not known, at most the two of the project server. Always
        from 1 to 64. Storage: half of the free space, as on the project server. Size of a layer: that
        of a file of the cells of a layer without compression (``layer_size``), or the storage when
        that is smaller.
    """
    cells = FIRST_LAYER_CELLS if memory is None else cells_in_memory(memory // 4)
    for_processors = max(processors - 1, 1)
    for_memory = jobs.MAX_RUNNING_JOBS if memory is None else memory // 2 // job_memory(cells)
    storage = max(free, 0) // 2
    return ServerLimits(
        running_jobs=max(1, min(for_processors, for_memory, MOST_RUNNING_JOBS)),
        storage=storage,
        layer_size=min(layer_size(cells), storage),
        layer_cells=cells,
    )


def limits_with_cells(kept: Mapping[str, object], first: ServerLimits) -> dict[str, object]:
    """Add the cells of a layer to limits that an older program kept, which knew no such limit.

    Parameters
    ----------
    kept : mapping
        The limits as the settings file holds them, without ``layer_cells``.
    first : ServerLimits
        The first limits of this computer.

    Returns
    -------
    dict
        The limits with the first value of the cells of a layer. So that a job of that many cells is
        neither ended for its size nor short of memory, the size of a layer is raised to its first
        value when it is smaller, and the running jobs are lowered to their first value when they are
        more. The storage stays as the owner set it, and the size of a layer never passes it.
    """
    changed = dict(kept)
    changed["layer_cells"] = first.layer_cells
    running, size, storage = changed.get("running_jobs"), changed.get("layer_size"), changed.get("storage")
    if isinstance(running, int) and running > first.running_jobs:
        changed["running_jobs"] = first.running_jobs
    if isinstance(size, int) and isinstance(storage, int) and size < layer_size(first.layer_cells):
        changed["layer_size"] = min(layer_size(first.layer_cells), storage)
    return changed


def system_name() -> str:
    """Return the operating system and its version, for example ``Windows 11`` or ``macOS 15.1``."""
    if sys.platform == "win32":
        name = f"Windows {platform.release()}"
    elif sys.platform == "darwin":
        name = f"macOS {platform.mac_ver()[0]}"
    else:
        try:
            name = platform.freedesktop_os_release().get("PRETTY_NAME", "")
        except OSError:
            name = ""
        name = name or f"{platform.system()} {platform.release()}"
    return name.strip()[:80] or "Unknown system"


def computer_name() -> str:
    """Return the name of the computer on its network, or ``Computer`` when it has none."""
    return platform.node().strip()[:80] or "Computer"
