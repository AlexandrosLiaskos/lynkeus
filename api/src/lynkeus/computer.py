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
from lynkeus.linking import Key, Label, ServerId, ServerLimits

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

JOB_MEMORY = 600_000_000
"""The memory that one job is given in the first limits, in bytes.

A job that writes a layer of the largest size holds about 510 megabytes (``compose.yaml``).
"""

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
    that a damaged file does not stop the program.
    """
    path = folder / SETTINGS
    try:
        return Settings.model_validate_json(path.read_text(encoding="utf-8"))
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
        Running jobs: one for every processor but one, which stays for the other programs of the
        computer, and at most as many as fit in half of the memory at ``JOB_MEMORY`` each; when the
        memory is not known, at most the two of the project server. Always from 1 to 64. Storage: half
        of the free space, as on the project server. Size of a layer: that of the project server
        (``lynkeus.jobs.MAX_LAYER_SIZE``), or the storage when that is smaller.
    """
    for_processors = max(processors - 1, 1)
    for_memory = jobs.MAX_RUNNING_JOBS if memory is None else memory // 2 // JOB_MEMORY
    storage = max(free, 0) // 2
    return ServerLimits(
        running_jobs=max(1, min(for_processors, for_memory, MOST_RUNNING_JOBS)),
        storage=storage,
        layer_size=min(jobs.MAX_LAYER_SIZE, storage),
    )


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
