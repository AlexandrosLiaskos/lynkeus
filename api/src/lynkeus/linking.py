"""The formats that connect a server of a user with the project server.

A visitor may connect computers of his own to Lynkeus, so that his jobs run
there and their layers are kept there. Such a computer runs the program
Lynkeus Server and is called here an own server; the server of the site is
the project server. The own server opens every connection itself, to the
project server, and no connection is ever opened towards it.

The module holds every message of that connection and of the addresses with
which the interface manages the servers, so that the project server, the
program and the interface read one definition. ``docs/Own_Servers.md``
describes the addresses and the order of the messages.

The pairing follows the device authorization grant of OAuth 2.0 (RFC 8628):
its fields carry the names of that document.
"""

from typing import Annotated, Literal

from pydantic import Field

from lynkeus.layers import Format, LayerDescription, Text
from lynkeus.store import Status

USER_CODE_LETTERS = "BCDFGHJKLMNPQRSTVWXZ"
"""The letters of a user code: the 20 letters without vowels that RFC 8628, section 6.1, proposes."""

PAIRING_TIME = 900
"""The time for which the codes of a pairing are valid, in seconds."""

PAIRING_INTERVAL = 5
"""The least time between two questions of the program about a pairing, in seconds."""

MOST_WAIT = 25
"""The longest time for which the project server holds a question for tasks open, in seconds.

The web servers in front of the project server end a request that receives no answer for 60 seconds.
"""

REPORT_PAUSE = 30
"""The longest time between two reports of an own server, in seconds."""

CONNECTED_TIME = 75
"""The time after the last message of an own server during which it counts as connected, in seconds."""

MOST_BYTES = 524_288
"""The most bytes of a file that one task asks for. The front web server takes a body of at most 1 megabyte."""

READ_TIME = 30
"""The time within which an own server must answer a task that reads a file, in seconds."""

MAX_USER_SERVERS = 8
"""The most own servers of one Earthdata user."""

FIRST_LAYER_CELLS = 25_000_000
"""The most cells of a layer of a server whose message does not state them.

It is the number of the project server and of an older program, which knows no other.
"""

type ServerId = Annotated[str, Field(pattern=r"^[0-9a-f]{16}$")]
"""The name of an own server: 16 random characters."""

type Key = Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{43}$")]
"""A secret of 256 random bits, as 43 characters."""

type UserCode = Annotated[str, Field(pattern=r"^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$")]
"""The code that the visitor compares, for example ``WDJB-MJHT``."""

type JobId = Annotated[str, Field(pattern=r"^[0-9a-f]{32}$")]
"""The name of a job on the project server."""

type LayerId = Annotated[str, Field(pattern=r"^[0-9a-f]{32}$")]
"""The name of a layer, which is also the name of the folder of its files."""

type FileName = Annotated[str, Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*\.(tif|json)$")]
"""The name of one of the two files of a layer."""

type Label = Annotated[str, Field(min_length=1, max_length=80)]
"""A short text that the interface shows: the name of a computer, of its system or of a version."""

type Sentence = Annotated[str, Field(min_length=1, max_length=500)]
"""One sentence for the visitor."""


class Machine(Format):
    """What an own server states about itself when it asks for a pairing.

    Attributes
    ----------
    name : str
        Name of the computer, which the visitor may change later.
    system : str
        Operating system and its version, for example ``Windows 11``.
    version : str
        Version of Lynkeus Server.
    """

    name: Label
    system: Label
    version: Label


class Pairing(Format):
    """The answer to a request for a pairing (RFC 8628, section 3.2).

    Attributes
    ----------
    device_code : str
        Secret with which the program asks whether the visitor has confirmed.
    user_code : str
        Code that the program shows and that the visitor compares on the site.
    verification_uri : str
        Address of the site at which the visitor types the code.
    verification_uri_complete : str
        The same address with the code in it, which the program opens in the browser.
    expires_in : int
        Time for which the codes are valid, in seconds.
    interval : int
        Least time between two questions of the program, in seconds.
    """

    device_code: Key
    user_code: UserCode
    verification_uri: Text
    verification_uri_complete: Text
    expires_in: int = Field(gt=0)
    interval: int = Field(gt=0)


class PairingQuestion(Format):
    """The question of the program whether the visitor has confirmed the pairing."""

    device_code: Key


class PairingRefusal(Format):
    """The answer while a pairing is not confirmed (RFC 8628, section 3.5).

    Attributes
    ----------
    error : str
        ``authorization_pending``: the visitor has not confirmed yet. ``slow_down``: the program asks
        too often. ``expired_token``: the codes are no longer valid. ``access_denied``: the visitor refused.
    """

    error: Literal["authorization_pending", "slow_down", "expired_token", "access_denied"]


class PairingKey(Format):
    """The answer once the visitor has confirmed the pairing. It is given once.

    Attributes
    ----------
    server : str
        Name of the own server.
    key : str
        Secret that the own server sends with every later request. The project server keeps its
        SHA-256 digest only.
    user : str or None
        Earthdata user name of the owner, which the program shows on the computer. The program shows
        no name when the field is absent.
    """

    server: ServerId
    key: Key
    user: Label | None = None


class PairingConfirmation(Format):
    """The confirmation of a pairing by the signed-in visitor."""

    user_code: UserCode


class PairingView(Format):
    """What the site shows before the visitor confirms a pairing: the computer that asked for it."""

    user_code: UserCode
    machine: Machine


class ServerLimits(Format):
    """The limits of an own server, which its owner sets.

    Attributes
    ----------
    running_jobs : int
        Most jobs that run at the same time.
    storage : int
        Most space that the layers may use on the disk, in bytes.
    layer_size : int
        Largest size of the files of one layer, in bytes.
    layer_cells : int
        Most cells of one layer that a job of the server receives. A message without the field comes
        from an older program, which does not know the limit, and counts as ``FIRST_LAYER_CELLS``.
    """

    running_jobs: int = Field(ge=1, le=64)
    storage: int = Field(ge=0)
    layer_size: int = Field(ge=0)
    layer_cells: int = Field(default=FIRST_LAYER_CELLS, ge=1_000_000, le=4_000_000_000)


class ServerState(Format):
    """What an own server reports about itself.

    Attributes
    ----------
    processors : int
        Processors that the program may use.
    memory : int or None
        Memory of the computer, in bytes, or None when it cannot be read.
    disk_free : int
        Free space of the disk that holds the layers, in bytes.
    disk_used : int
        Space that the layers use, in bytes.
    running, waiting : int
        Jobs that run and jobs that wait for their turn.
    layers : int
        Layers that the server keeps.
    limits : ServerLimits
        Limits in force.
    system, version : str
        Operating system, and version of Lynkeus Server.
    """

    processors: int = Field(ge=1)
    memory: int | None = Field(ge=0)
    disk_free: int = Field(ge=0)
    disk_used: int = Field(ge=0)
    running: int = Field(ge=0)
    waiting: int = Field(ge=0)
    layers: int = Field(ge=0)
    limits: ServerLimits
    system: Label
    version: Label


class JobState(Format):
    """The state of a job on an own server.

    Attributes
    ----------
    job : str
        Name of the job on the project server.
    status : {"accepted", "running", "successful", "failed", "dismissed"}
        State of the job.
    progress : int
        Part of the work that is done, in percent.
    message : str
        One sentence about the state, for the visitor. It never holds the Earthdata token.
    started, finished : float or None
        Times at which the work started and ended, in seconds since 1 January 1970 (UTC).
    layer : LayerDescription or None
        Description of the layer of a successful job.
    size : int or None
        Total size of the files of that layer, in bytes.
    """

    job: JobId
    status: Status
    progress: int = Field(ge=0, le=100)
    message: Sentence
    started: float | None = None
    finished: float | None = None
    layer: LayerDescription | None = None
    size: int | None = Field(default=None, ge=0)


class Report(Format):
    """A report of an own server: its state and the jobs whose state changed since the last report."""

    state: ServerState
    jobs: tuple[JobState, ...] = ()


class StartTask(Format):
    """Start a job.

    Attributes
    ----------
    id : str
        Name of the task.
    job : str
        Name of the job on the project server.
    process : str
        Name of the process to run.
    title : str
        Name of the job for the visitor.
    inputs : str
        Inputs of the process as JSON, as the project server validated them.
    token : str or None
        Earthdata token of the visitor. The own server keeps it in memory for this job only.
    """

    id: Key
    kind: Literal["start"] = "start"
    job: JobId
    process: Text
    title: Text
    inputs: Text
    token: str | None = Field(default=None, max_length=4096)


class DismissTask(Format):
    """End a job that waits or runs."""

    id: Key
    kind: Literal["dismiss"] = "dismiss"
    job: JobId


class RenameTask(Format):
    """Give a layer another title, in its description and in its STAC record.

    The GeoTIFF keeps the title of its creation, as on the project server (``lynkeus.jobs``): writing
    the file again would move its parts, and a map that reads the file would receive wrong ones.
    """

    id: Key
    kind: Literal["rename"] = "rename"
    layer: LayerId
    title: Text


class RemoveTask(Format):
    """Delete the files of a layer."""

    id: Key
    kind: Literal["remove"] = "remove"
    layer: LayerId


class ReadTask(Format):
    """Send a part of a file of a layer.

    Attributes
    ----------
    id : str
        Name of the task.
    layer : str
        Name of the layer.
    file : str
        Name of the file.
    start, end : int
        First byte of the part, and the byte after its last one. The part holds at most
        ``MOST_BYTES`` bytes, and it is shorter when the file ends before ``end``.
    """

    id: Key
    kind: Literal["read"] = "read"
    layer: LayerId
    file: FileName
    start: int = Field(ge=0)
    end: int = Field(gt=0)


class LimitsTask(Format):
    """Apply the limits that the owner set on the site."""

    id: Key
    kind: Literal["limits"] = "limits"
    limits: ServerLimits


class ForgetTask(Format):
    """Forget the pairing, because the owner removed the server on the site. The layer files stay on the disk."""

    id: Key
    kind: Literal["forget"] = "forget"


type Task = Annotated[
    StartTask | DismissTask | RenameTask | RemoveTask | ReadTask | LimitsTask | ForgetTask,
    Field(discriminator="kind"),
]
"""A task that the project server gives to an own server."""


class Tasks(Format):
    """The answer to a question for tasks. The list is empty when none arrived during the wait."""

    tasks: tuple[Task, ...] = ()


class Done(Format):
    """The answer of an own server to a task other than reading.

    Attributes
    ----------
    ok : bool
        Whether the task was carried out.
    detail : str or None
        One sentence for the visitor when it was not.
    """

    ok: bool
    detail: Sentence | None = None


class ReadFailure(Format):
    """The answer of an own server that cannot send the part of a file.

    Attributes
    ----------
    status : {404, 416, 500}
        404: the layer or the file does not exist. 416: the part starts after the end of the file.
        500: the file could not be read.
    detail : str
        One sentence for the visitor.
    """

    status: Literal[404, 416, 500]
    detail: Sentence


class Server(Format):
    """An own server, as the interface receives it.

    Attributes
    ----------
    id : str
        Name of the server.
    name : str
        Name that the visitor gave it, at first the name of the computer.
    connected : bool
        Whether the server sent a message during the last ``CONNECTED_TIME`` seconds.
    paired, seen : float
        Times of the pairing and of the last message, in seconds since 1 January 1970 (UTC).
    state : ServerState or None
        Last state that the server reported, or None before its first report.
    knows_cells : bool
        Whether the program of the server knows the limit on the cells of a layer: true when the limits of
        its last report carried the field ``layer_cells``, and false when they lacked it and before the first
        report. The interface states that the server needs the newer program only when ``state`` is not None
        and this is false.
    """

    id: ServerId
    name: Label
    connected: bool
    paired: float
    seen: float
    state: ServerState | None
    knows_cells: bool


class Servers(Format):
    """The own servers of the signed-in visitor, and the most that one user may connect."""

    servers: tuple[Server, ...]
    limit: int = Field(ge=0)


class ServerChange(Format):
    """A change that the owner makes to a server on the site. A field that is absent stays as it is."""

    name: Label | None = None
    limits: ServerLimits | None = None


class ServerName(Format):
    """The own server of a job or of a layer, in the answers about jobs and layers."""

    id: ServerId
    name: Label
