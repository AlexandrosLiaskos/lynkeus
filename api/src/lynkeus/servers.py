"""The own servers of the visitors, on the side of the project server.

A visitor may connect computers of his own, which run the program Lynkeus
Server. ``docs/Own_Servers.md`` gives the rules of that connection and
``lynkeus.linking`` the format of every message. This module carries the rules
out: the pairing of a server with an Earthdata user, the tasks that the
project server gives to a server, the reports of a server about itself and
about its jobs, and the reading of the files of a layer that a server keeps.

A server opens every connection itself. The project server therefore keeps the
tasks of a server in memory until the server asks for them, and a question
for tasks waits without holding a thread. A task that starts a job carries the
Earthdata token of the visitor, so no task is ever written to a file.

A program that is quit says so (``POST /api/link/leave``), and its server then counts as not connected
at once, until its next message. When the web service itself is stopped, every request that waits for
an own server is answered at once with 503: a question for tasks would otherwise stay open for up to
``MOST_WAIT`` seconds and hold the stop back.

What the record holds about a job whose server stops reporting: the job keeps
its last state while the server is away, and it continues when the server
reports again. A job is recorded as failed when its server states that it runs
and holds no job at all although it confirmed the job earlier, and when the
project server was restarted before the server took the job.

Every own server has a limit of its own on the cells of a layer (``layer_cells``), which its owner
sets with its other limits. The number of the project server (``lynkeus.harmony.MOST_CELLS``) is not
applied to a job of an own server. An older program does not know the limit, and the limits of its
reports lack the field: it receives the other limits only, and a change of the cells of a layer for it is
refused. The record keeps the state of a server with the fields that the server reported, so that it
tells whether the last report carried the field. A task ``limits`` is handed to a server only after a
report that the server sent since it connected has been recorded, because only a report tells which
program the server runs.

The methods of ``Servers`` whose description says "in the web service" run on
the event loop of the web service and touch the tasks in memory. Every other
method reads and writes the record only and may be called from any thread.
"""

import asyncio
import contextlib
import hashlib
import hmac
import json
import math
import re
import secrets
import threading
import time
from collections import deque
from collections.abc import Sequence
from dataclasses import dataclass, field
from http import HTTPStatus

from pydantic import BaseModel, ValidationError

from lynkeus.computer import job_memory
from lynkeus.layers import LayerDescription
from lynkeus.linking import (
    CONNECTED_TIME,
    FIRST_LAYER_CELLS,
    MAX_USER_SERVERS,
    MOST_BYTES,
    PAIRING_INTERVAL,
    PAIRING_TIME,
    READ_TIME,
    USER_CODE_LETTERS,
    DismissTask,
    Done,
    ForgetTask,
    JobState,
    LimitsTask,
    Machine,
    Pairing,
    PairingKey,
    PairingRefusal,
    PairingView,
    ReadFailure,
    ReadTask,
    RemoveTask,
    RenameTask,
    Report,
    Server,
    ServerChange,
    ServerLimits,
    ServerName,
    ServerState,
    StartTask,
    Task,
    Tasks,
)
from lynkeus.processes import Process
from lynkeus.store import PairingRecord, ServerJobRecord, ServerLayerRecord, ServerRecord, Store

SITE = "https://lynkeus.nkua.cloud"
"""The address of the site, at which the visitor confirms a pairing."""

MAX_PAIRINGS = 1000
"""The largest number of pairings in progress. Each is kept for ``PAIRING_TIME`` seconds at most."""

MAX_CODE_ATTEMPTS = 5
"""The most wrong user codes that one Earthdata user may give within ``PAIRING_TIME`` seconds.

RFC 8628, section 5.1, recommends a limit on the attempts and gives this number for a code of 8 letters
out of 20: with 5 attempts within the validity of a code, a guess finds one pairing with a chance of
2 to the power -32.
"""

MAX_SERVER_UNFINISHED_JOBS = 100
"""The largest number of jobs of one own server that wait or run. The project server holds a task for each."""

MAX_SERVER_FINISHED_JOBS = 100
"""The largest number of finished jobs of one own server whose record is kept. The oldest records are removed."""

MAX_SERVER_DISMISSED_JOBS = 100
"""The largest number of dismissed jobs of one own server whose name is still answered with 410 Gone."""

MAX_SERVER_LAYERS = 1000
"""The largest number of layers of one own server that the project server records."""

MAX_SERVER_TASKS = 256
"""The largest number of tasks that the project server holds for one own server."""

TASK_TIME = 120.0
"""The time after which a task that a server received and did not answer is forgotten, in seconds."""

MAX_LABEL = 80
"""The largest length of a ``Label`` of ``lynkeus.linking``, in characters."""

SEEN_PAUSE = 10.0
"""The shortest time between two records of the last message of an own server, in seconds."""

SENT = "The job waits for your server to take it."
DISMISSED = "The job was dismissed."
RESTARTED = "Lynkeus was restarted before your server took the job. Start the job again."
LOST = "Your server no longer holds this job. Start the job again."
NOT_TAKEN = "Your server did not take the job."
WRONG_LAYER = "The job failed because your server reported its layer in a form that Lynkeus does not take."
STOPPING = "Lynkeus is being restarted. Ask again in a moment."

_KEY = re.compile(r"^[A-Za-z0-9_-]{43}$")
_SERVER_ID = re.compile(r"^[0-9a-f]{16}$")
_LAYER_ID = re.compile(r"^[0-9a-f]{32}$")
_FILE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*\.(tif|json)$")
_UNFINISHED = ("accepted", "running")


class ServerRefusedError(Exception):
    """A request about an own server that is not carried out. The message is one sentence for the visitor.

    Attributes
    ----------
    status : http.HTTPStatus
        Status code of the answer.
    wait : int or None
        Time after which the request may be repeated, in seconds.
    """

    def __init__(self, status: HTTPStatus, sentence: str, wait: int | None = None) -> None:
        super().__init__(sentence)
        self.status = status
        self.wait = wait


@dataclass(frozen=True)
class Part:
    """A part of a file, as an own server sent it.

    Attributes
    ----------
    data : bytes
        The bytes of the part.
    size : int
        Size of the whole file, in bytes.
    """

    data: bytes
    size: int


type Answer = Done | Part | ReadFailure
"""The answer of an own server to a task."""


@dataclass
class _Handed:
    task: Task
    time: float


@dataclass
class _Link:
    """The tasks of one own server, in memory."""

    waiting: deque[Task] = field(default_factory=deque)
    handed: dict[str, _Handed] = field(default_factory=dict)
    question: asyncio.Future[None] | None = None


def digest_of(secret: str) -> str:
    """Return the SHA-256 digest of a key or of a device code, in hexadecimal digits."""
    return hashlib.sha256(secret.encode("ascii", "replace")).hexdigest()


def _task_id() -> str:
    return secrets.token_urlsafe(32)


def _same_work(first: Task, second: Task) -> bool:
    """Tell whether two tasks ask for the same thing, whatever their names."""
    return first.model_dump(exclude={"id"}) == second.model_dump(exclude={"id"})


def state_of(server: ServerRecord) -> ServerState | None:
    """Return the last state that an own server reported, or None before its first report.

    A state that was recorded before the limit on the cells of a layer existed states
    ``FIRST_LAYER_CELLS`` cells, because the format gives that number to a message without the field.
    """
    return None if server.state is None else ServerState.model_validate_json(server.state)


def knows_cells(state: ServerState | None) -> bool:
    """Tell whether the program of an own server knows the limit on the cells of a layer.

    It does when the limits of the state carry the field ``layer_cells``: an older program reports its
    limits without it, and the record keeps a state with the fields that the server reported
    (``recorded_state``). Both programs state the version 0.1.0, so the version does not tell them
    apart. A server that has not reported yet counts as an older program, because that program refuses
    a message with a field that it does not know.
    """
    return state is not None and "layer_cells" in state.limits.model_fields_set


def recorded_state(state: ServerState, knows: bool) -> str:
    """Return the state of an own server as the record keeps it.

    Parameters
    ----------
    state : ServerState
        The state.
    knows : bool
        Whether the report of the state carried the field ``layer_cells`` in its limits
        (``knows_cells`` of that report).

    Returns
    -------
    str
        The state in the format ``ServerState``. When ``knows`` is false the limits are written without
        ``layer_cells``, as the server reported them, so that the state read back tells the same.
    """
    return state.model_dump_json(exclude=None if knows else {"limits": {"layer_cells"}})


def layer_cells(server: ServerRecord) -> int:
    """Return the most cells of a layer that a job of an own server receives, as the server last reported it."""
    state = state_of(server)
    return FIRST_LAYER_CELLS if state is None else state.limits.layer_cells


def written_tasks(tasks: Tasks, state: ServerState | None) -> str:
    """Return the tasks of an own server as the JSON text that its program reads.

    Parameters
    ----------
    tasks : Tasks
        The tasks.
    state : ServerState or None
        Last state that the server reported, which tells whether its program knows the limit on the cells
        of a layer.

    Returns
    -------
    str
        The tasks in the format ``Tasks``. For a program that does not know the limit on the cells of a
        layer (``knows_cells``), the limits of a task ``limits`` are written without ``layer_cells``.
    """
    if knows_cells(state):
        return tasks.model_dump_json()
    return tasks.model_dump_json(exclude={"tasks": {"__all__": {"limits": {"layer_cells"}}}})


def owner_cells(limits: ServerLimits | None) -> int | None:
    """Return the limit on the cells of a layer that the owner set, or None when he set none.

    The record keeps ``layer_cells`` in the limits that the owner set only when he named it, and never
    for an older program, which applies ``FIRST_LAYER_CELLS`` whatever is set. Limits recorded without
    the field, also those recorded before the limit existed, leave the number that the server reports.
    """
    return limits.layer_cells if limits is not None and "layer_cells" in limits.model_fields_set else None


def _millions(cells: int) -> str:
    """Write a number of cells in millions, with one decimal when it is not a whole number of millions."""
    return f"{cells / 1e6:.1f}".removesuffix(".0")


def name_of(server: ServerRecord) -> ServerName:
    """Return the name of an own server in the form of the answers about jobs and layers."""
    return ServerName(id=server.id, name=server.name)


def layer_files(description: LayerDescription) -> tuple[str, str]:
    """Return the names of the two files of a layer: the GeoTIFF and the STAC record."""
    return description.url.rsplit("/", 1)[-1], description.record.rsplit("/", 1)[-1]


def layer_fault(server: str, state: JobState) -> str | None:
    """Return what is wrong with the layer that a server reported for a successful job, or None.

    The description must carry the two addresses that ``docs/Own_Servers.md`` gives,
    ``/api/servers/{server}/files/{layer}/{file}``, with the name of this server, the ``id`` of the
    layer and the names of a GeoTIFF and of a STAC record, and the report must give the size of the files.
    """
    layer = state.layer
    if layer is None or state.size is None:
        return "the report gives no layer or no size"
    if not _LAYER_ID.fullmatch(layer.id):
        return "the name of the layer is not 32 hexadecimal digits"
    address = f"/api/servers/{server}/files/{layer.id}/"
    image, record = layer.url.removeprefix(address), layer.record.removeprefix(address)
    if layer.url != address + image or layer.record != address + record:
        return "the addresses of the files are not those of this server and this layer"
    if not (_FILE.fullmatch(image) and image.endswith(".tif") and _FILE.fullmatch(record) and record.endswith(".json")):
        return "the files are not named as a GeoTIFF and a STAC record"
    return None


class Servers:
    """Pairs the own servers, gives them their tasks, and records what they report.

    Parameters
    ----------
    store : Store
        Record of the own servers, of their pairings, jobs and layers.
    site : str
        Address of the site, at which the visitor confirms a pairing.
    """

    def __init__(self, store: Store, site: str = SITE) -> None:
        self._store = store
        self._site = site.rstrip("/")
        self._lock = threading.Lock()
        self._attempts: dict[str, deque[float]] = {}
        self._seen: dict[str, float] = {}
        self._written: dict[str, float] = {}
        self._links: dict[str, _Link] = {}
        self._answers: dict[str, asyncio.Future[Answer]] = {}
        self._removed: dict[str, tuple[ForgetTask, float]] = {}
        self._left: set[str] = set()
        self._reported: set[str] = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._stopping = False

    def start(self) -> None:
        """Bring the record in order after a stop of the project server.

        The tasks were held in memory, so a job that its server had not taken can no longer start.
        It is recorded as failed. When the web service calls this, its event loop is kept, so that
        ``stop`` can end the waiting requests from another thread.
        """
        with contextlib.suppress(RuntimeError):
            self._loop = asyncio.get_running_loop()
        now = time.time()
        self._store.remove_pairings_before(now - PAIRING_TIME)
        for job in self._store.unfinished_server_jobs():
            if job.taken is None:
                self._store.fail_server_job(job.id, RESTARTED, now)

    # Pairing

    def begin_pairing(self, machine: Machine, now: float) -> Pairing:
        """Record a pairing that a program asks for, and return its codes.

        Raises
        ------
        ServerRefusedError
            With 503 when ``MAX_PAIRINGS`` pairings are in progress.
        """
        self._store.remove_pairings_before(now - PAIRING_TIME)
        if self._store.count_pairings() >= MAX_PAIRINGS:
            sentence = "Too many computers ask to be connected at present. Try again in a few minutes."
            raise ServerRefusedError(HTTPStatus.SERVICE_UNAVAILABLE, sentence, 300)
        while True:
            device_code = secrets.token_urlsafe(32)
            letters = "".join(secrets.choice(USER_CODE_LETTERS) for _ in range(8))
            user_code = f"{letters[:4]}-{letters[4:]}"
            record = PairingRecord(
                device_digest=digest_of(device_code),
                user_code=user_code,
                machine=machine.model_dump_json(),
                created=now,
                asked=None,
                server=None,
            )
            if self._store.add_pairing(record):
                break
        address = f"{self._site}/?connect"
        return Pairing(
            device_code=device_code,
            user_code=user_code,
            verification_uri=address,
            verification_uri_complete=f"{address}={user_code}",
            expires_in=PAIRING_TIME,
            interval=PAIRING_INTERVAL,
        )

    def _wrong_code(self, user: str, now: float, count: bool) -> ServerRefusedError | None:
        """Return the refusal of a user who gave too many wrong codes, after counting one more when asked to."""
        with self._lock:
            for name in [name for name, times in self._attempts.items() if times[-1] <= now - PAIRING_TIME]:
                del self._attempts[name]
            times = self._attempts.setdefault(user, deque())
            while times and times[0] <= now - PAIRING_TIME:
                times.popleft()
            if len(times) >= MAX_CODE_ATTEMPTS:
                wait = max(1, int(times[0] + PAIRING_TIME - now) + 1)
                sentence = f"You gave {MAX_CODE_ATTEMPTS} codes that name no pairing. Wait {wait // 60 + 1} minutes."
                return ServerRefusedError(HTTPStatus.TOO_MANY_REQUESTS, sentence, wait)
            if count:
                times.append(now)
            if not times:
                del self._attempts[user]
        return None

    def _unknown_code(self, user: str, now: float) -> ServerRefusedError:
        self._wrong_code(user, now, count=True)
        sentence = "No computer waits to be connected under this code. A code is valid for 15 minutes."
        return ServerRefusedError(HTTPStatus.NOT_FOUND, sentence)

    def view_pairing(self, user: str, user_code: str, now: float) -> PairingView:
        """Return the computer that asked for the pairing with a user code, for a signed-in user.

        Raises
        ------
        ServerRefusedError
            With 404 when the code names no pairing that can still be confirmed, and with 429 when the
            user gave ``MAX_CODE_ATTEMPTS`` wrong codes within ``PAIRING_TIME`` seconds.
        """
        refusal = self._wrong_code(user, now, count=False)
        if refusal is not None:
            raise refusal
        pairing = self._store.pairing_of_code(user_code)
        if pairing is None or pairing.server is not None or now - pairing.created > PAIRING_TIME:
            raise self._unknown_code(user, now)
        return PairingView(user_code=pairing.user_code, machine=Machine.model_validate_json(pairing.machine))

    def confirm_pairing(self, user: str, user_code: str, now: float) -> ServerRecord:
        """Create the own server of a pairing that a signed-in user confirms.

        The server has no key yet: the program receives it with its next question, once.

        Raises
        ------
        ServerRefusedError
            With 404 and 429 as ``view_pairing``, and with 409 when the user has ``MAX_USER_SERVERS`` servers.
        """
        refusal = self._wrong_code(user, now, count=False)
        if refusal is not None:
            raise refusal
        self._store.remove_pairings_before(now - PAIRING_TIME)
        pairing = self._store.pairing_of_code(user_code)
        if pairing is None:
            raise self._unknown_code(user, now)
        server = ServerRecord(
            id=secrets.token_hex(8),
            user=user,
            name=Machine.model_validate_json(pairing.machine).name,
            key_digest=None,
            paired=now,
            seen=None,
            reported=None,
            state=None,
            limits=None,
        )
        outcome = self._store.confirm_pairing(user_code, server, MAX_USER_SERVERS, now - PAIRING_TIME)
        if outcome == "unknown":
            raise self._unknown_code(user, now)
        if outcome == "full":
            sentence = f"You have {MAX_USER_SERVERS} servers, which is the most allowed. Remove one and try again."
            raise ServerRefusedError(HTTPStatus.CONFLICT, sentence)
        return server

    def answer_pairing(self, device_code: str, now: float) -> PairingKey | PairingRefusal:
        """Answer the question of a program whether the visitor has confirmed its pairing.

        Returns
        -------
        PairingKey or PairingRefusal
            The name and the key of the server with the Earthdata user name of its owner, once, after
            the confirmation. Before it
            ``authorization_pending``; ``slow_down`` when the program asks again within
            ``PAIRING_INTERVAL`` seconds; ``expired_token`` when the device code names no pairing in
            progress; ``access_denied`` when the owner removed the server before the program received its key.
        """
        device = digest_of(device_code)
        pairing = self._store.pairing_of_device(device)
        if pairing is None or now - pairing.created > PAIRING_TIME:
            return PairingRefusal(error="expired_token")
        if pairing.asked is not None and now - pairing.asked < PAIRING_INTERVAL:
            return PairingRefusal(error="slow_down")
        self._store.ask_pairing(device, now)
        if pairing.server is None:
            return PairingRefusal(error="authorization_pending")
        key = secrets.token_urlsafe(32)
        server = self._store.give_key(device, digest_of(key), now)
        owner = self._store.server(server) if server is not None else None
        if server is None or owner is None:
            self._store.remove_pairing(device)
            return PairingRefusal(error="access_denied")
        # The name is left out when it is longer than the format of a pairing key takes.
        return PairingKey(server=server, key=key, user=owner.user if len(owner.user) <= MAX_LABEL else None)

    # The servers of a user

    def of_user(self, user: str) -> list[ServerRecord]:
        """Return the own servers of an Earthdata user, the one paired first at the head."""
        self._store.remove_pairings_before(time.time() - PAIRING_TIME)
        return self._store.servers_of(user)

    def owned(self, user: str | None, server: str) -> ServerRecord | None:
        """Return an own server of an Earthdata user, or None when the user has no server of this name."""
        if user is None or not _SERVER_ID.fullmatch(server):
            return None
        record = self._store.server(server)
        return record if record is not None and record.user == user else None

    def layer_of(self, user: str | None, layer: str) -> tuple[ServerRecord, ServerLayerRecord] | None:
        """Return a layer that an own server of an Earthdata user keeps, with that server, or None."""
        if user is None or not _LAYER_ID.fullmatch(layer):
            return None
        for server in self._store.servers_of(user):
            record = self._store.server_layer(server.id, layer)
            if record is not None:
                return server, record
        return None

    def connected(self, server: ServerRecord, now: float) -> bool:
        """Tell whether an own server counts as connected.

        It does when it sent a message during the last ``CONNECTED_TIME`` seconds and its program has
        not said since then that it is quit.
        """
        if server.id in self._left:
            return False
        seen = self._seen.get(server.id, server.seen)
        return server.key_digest is not None and seen is not None and now - seen <= CONNECTED_TIME

    def described(self, server: ServerRecord, now: float) -> Server:
        """Return an own server as the interface receives it."""
        seen = self._seen.get(server.id, server.seen)
        state = state_of(server)
        return Server(
            id=server.id,
            name=server.name,
            connected=self.connected(server, now),
            paired=server.paired,
            seen=server.paired if seen is None else seen,
            state=state,
            knows_cells=knows_cells(state),
        )

    def place(
        self, user: str | None, wanted: str | None, layers: Sequence[str], session_layers: Sequence[str], now: float
    ) -> ServerRecord | None:
        """Choose the server on which a new job runs.

        Parameters
        ----------
        user : str or None
            Name of the Earthdata user who starts the job, or None when the visitor is not signed in.
        wanted : str or None
            Name of an own server, the word ``project``, or None for the automatic choice.
        layers : sequence of str
            Names of the layers that the job reads.
        session_layers : sequence of str
            Names of the layers of the session of the visitor, which the project server keeps.
        now : float
            Present time, in seconds since 1 January 1970 (UTC).

        Returns
        -------
        ServerRecord or None
            The own server, or None for the project server. Without a wish it is the connected own server
            of the user with the fewest unfinished jobs that keeps every input layer, and the project
            server when there is none.

        Raises
        ------
        ServerRefusedError
            With 404 when the user has no server of the wanted name, with 422 when the input layers are
            not all kept on the server of the job, and with 503 when that server is not connected.
        """
        own = self._store.servers_of(user) if user is not None else []
        kept: dict[str, set[str]] = {}
        if own and user is not None:
            named = set(layers) - set(session_layers)
            for layer in self._store.server_layers_of(user):
                if layer.id in named:
                    kept.setdefault(layer.id, set()).add(layer.server)
        names = {server.id: server.name for server in own}
        if wanted is not None and wanted != "project":
            chosen = next((server for server in own if server.id == wanted), None)
            if chosen is None:
                raise ServerRefusedError(HTTPStatus.NOT_FOUND, "You have no server of this name.")
            elsewhere = [layer for layer in layers if chosen.id not in kept.get(layer, ())]
            if elsewhere:
                sentence = (
                    f"The server {chosen.name} does not keep the input layer {elsewhere[0]},"
                    " and a job takes input layers of its own server only."
                )
                raise ServerRefusedError(HTTPStatus.UNPROCESSABLE_CONTENT, sentence)
            if not self.connected(chosen, now):
                raise self._away(chosen)
            return chosen
        if wanted is None:
            ready = [
                server
                for server in own
                if self.connected(server, now) and all(server.id in kept.get(layer, ()) for layer in layers)
            ]
            if ready:
                return min(
                    ready,
                    key=lambda server: (self._store.count_unfinished_server_jobs(server.id), server.paired, server.id),
                )
        holders = {server for layer in layers for server in kept.get(layer, ())}
        if not holders:
            return None
        if wanted is None and len(holders) == 1 and all(kept.get(layer) for layer in layers):
            [holder] = holders
            raise self._away(next(server for server in own if server.id == holder))
        places = ", ".join(sorted(names[holder] for holder in holders))
        sentence = (
            f"The input layers are not all kept on the server of the job (some are on {places}),"
            " and a job takes input layers of its own server only."
        )
        raise ServerRefusedError(HTTPStatus.UNPROCESSABLE_CONTENT, sentence)

    def _away(self, server: ServerRecord) -> ServerRefusedError:
        sentence = f"Your server {server.name} is not connected. Start Lynkeus Server on that computer and try again."
        return ServerRefusedError(HTTPStatus.SERVICE_UNAVAILABLE, sentence, 30)

    # The connection of a paired server

    def forgotten(self, key: str, now: float) -> ForgetTask | None:
        """Return the task that tells a removed server to forget its pairing, in the web service.

        The task is kept for ``CONNECTED_TIME`` seconds after the removal, so that a connected server
        receives it with its next question for tasks. Afterwards the key is answered with 401 alone.
        """
        for digest in [digest for digest, (_, end) in self._removed.items() if end <= now]:
            del self._removed[digest]
        kept = self._removed.get(digest_of(key))
        return kept[0] if kept else None

    def forget_answered(self, key: str, task: str) -> bool:
        """Record that a removed server answered the task to forget its pairing, in the web service."""
        digest = digest_of(key)
        kept = self._removed.get(digest)
        if kept is None or not hmac.compare_digest(kept[0].id, task):
            return False
        del self._removed[digest]
        return True

    def identify(self, key: str, now: float) -> ServerRecord | None:
        """Return the own server that a key names, and record that it sent a message.

        The digest of the key is compared with the recorded digest in constant time.
        """
        if not _KEY.fullmatch(key):
            return None
        digest = digest_of(key)
        server = self._store.server_of_key(digest)
        if server is None or server.key_digest is None or not hmac.compare_digest(server.key_digest, digest):
            return None
        with self._lock:
            if now - self._seen.get(server.id, float("-inf")) > CONNECTED_TIME:
                # The server was away, so another program may run there now: its next report tells.
                self._reported.discard(server.id)
            self._seen[server.id] = now
            self._left.discard(server.id)
            write = now - self._written.get(server.id, float("-inf")) >= SEEN_PAUSE
            if write:
                self._written[server.id] = now
        if write:
            self._store.see_server(server.id, now)
        return server

    def _link(self, server: str) -> _Link:
        return self._links.setdefault(server, _Link())

    def leave(self, server: ServerRecord) -> None:
        """Count an own server as not connected from now until its next message, in the web service.

        The program says this when it is quit. Its open question for tasks ends without a task, and
        every request that waits for an answer of the server is answered as for a server that is not
        connected. The tasks that wait stay for the return of the server, and a task ``limits`` waits
        until its next report (``take``).
        """
        with self._lock:
            self._left.add(server.id)
            self._reported.discard(server.id)
        link = self._links.get(server.id)
        if link is None:
            return
        away = self._away(server)
        for task in (*link.waiting, *(handed.task for handed in link.handed.values())):
            waiting = self._answers.pop(task.id, None)
            if waiting is not None and not waiting.done():
                waiting.set_exception(away)
        if link.question is not None and not link.question.done():
            link.question.set_result(None)

    def has_left(self, server: str) -> bool:
        """Tell whether the program of an own server said that it is quit and has sent no message since."""
        return server in self._left

    def has_reported(self, server: str) -> bool:
        """Tell whether a report that an own server sent since it connected has been recorded.

        A server connects with its first message after a start of the project server, after a pause of
        more than ``CONNECTED_TIME`` seconds, or after its program said that it is quit. Its program may
        then be another one, and only a report tells whether it knows the limit on the cells of a layer.
        """
        with self._lock:
            return server in self._reported

    def keep_reported(self, server: str, tasks: Sequence[Task]) -> None:
        """Keep the tasks that follow from a recorded report of an own server, in the web service.

        After the first report since the server connected, a task ``limits`` that waits from before is
        dropped, because it was made before the project server knew which program the server runs; the
        report has decided about the limits again (``record_report``). From then on a task ``limits`` is
        handed to the server.
        """
        with self._lock:
            first = server not in self._reported
            self._reported.add(server)
        link = self._link(server)
        if first:
            link.waiting = deque(task for task in link.waiting if not isinstance(task, LimitsTask))
        self.send_once(server, tasks)
        if self._ready(server, link) and link.question is not None and not link.question.done():
            link.question.set_result(None)

    def stop(self) -> None:
        """End every request that waits for an own server, because the web service stops.

        Each of them is then answered with 503. The method may be called from any thread and from
        the handler of a signal; the requests are ended on the event loop of the web service.
        """
        if self._loop is not None and not self._loop.is_closed():
            self._loop.call_soon_threadsafe(self._end_waits)

    def _end_waits(self) -> None:
        self._stopping = True
        for link in self._links.values():
            if link.question is not None and not link.question.done():
                link.question.set_result(None)
        for waiting in self._answers.values():
            if not waiting.done():
                waiting.set_exception(self._stopped())
        self._answers.clear()

    def _stopped(self) -> ServerRefusedError:
        return ServerRefusedError(HTTPStatus.SERVICE_UNAVAILABLE, STOPPING, 5)

    def holds(self, server: str, task: Task) -> bool:
        """Tell whether a task that asks for the same thing waits or was handed to the server, in the web service."""
        link = self._links.get(server)
        if link is None:
            return False
        return any(
            _same_work(task, held) for held in (*link.waiting, *(handed.task for handed in link.handed.values()))
        )

    def send(self, server: str, task: Task) -> None:
        """Keep a task for an own server and end its open question for tasks, in the web service.

        Raises
        ------
        ServerRefusedError
            With 503 when the project server holds ``MAX_SERVER_TASKS`` tasks for the server.
        """
        link = self._link(server)
        if len(link.waiting) + len(link.handed) >= MAX_SERVER_TASKS:
            sentence = "Too many requests wait for your server at present. Try again in a moment."
            raise ServerRefusedError(HTTPStatus.SERVICE_UNAVAILABLE, sentence, 5)
        link.waiting.append(task)
        if self._ready(server, link) and link.question is not None and not link.question.done():
            link.question.set_result(None)

    def _ready(self, server: str, link: _Link) -> bool:
        """Tell whether a task waits that may be handed to an own server now (``take``)."""
        return any(not isinstance(task, LimitsTask) for task in link.waiting) or (
            bool(link.waiting) and self.has_reported(server)
        )

    def send_once(self, server: str, tasks: Sequence[Task]) -> None:
        """Keep each task for an own server unless a task that asks for the same thing is held, in the web service."""
        for task in tasks:
            if not self.holds(server, task):
                try:
                    self.send(server, task)
                except ServerRefusedError:
                    # The report that caused the task is repeated, and the task is made again then.
                    return

    async def wait_for_tasks(self, server: str, wait: float) -> None:
        """Wait until a task is held for an own server, for ``wait`` seconds at most, in the web service.

        The wait holds no thread. A server keeps one question open: a newer question ends the older one.

        Raises
        ------
        ServerRefusedError
            With 503 when the web service stops, before the wait or during it.
        """
        link = self._link(server)
        if link.question is not None and not link.question.done():
            link.question.set_result(None)
        if self._stopping:
            raise self._stopped()
        if self._ready(server, link) or wait <= 0:
            return
        question = link.question = asyncio.get_running_loop().create_future()
        try:
            async with asyncio.timeout(wait):
                await question
        except TimeoutError:
            pass
        finally:
            if link.question is question:
                link.question = None
        if self._stopping:
            raise self._stopped()

    def take(self, server: str) -> tuple[Tasks, list[str]]:
        """Hand the waiting tasks to an own server, in the web service.

        A task ``limits`` stays until a report that the server sent since it connected has been recorded
        (``has_reported``): the program sends its first report and its first question for tasks
        together, and the task is written for the program that the report shows.

        Returns
        -------
        tasks : Tasks
            The tasks, in the order in which they were made.
        unanswered : list of str
            Names of the jobs whose task to start them the server received ``TASK_TIME`` seconds ago and
            never answered. The caller records them as taken, so that a later report decides about them.
        """
        link = self._link(server)
        now = time.monotonic()
        unanswered: list[str] = []
        for name in [name for name, handed in link.handed.items() if now - handed.time >= TASK_TIME]:
            task = link.handed.pop(name).task
            if isinstance(task, StartTask):
                unanswered.append(task.job)
        if self.has_reported(server):
            tasks = tuple(link.waiting)
            link.waiting.clear()
        else:
            tasks = tuple(task for task in link.waiting if not isinstance(task, LimitsTask))
            link.waiting = deque(task for task in link.waiting if isinstance(task, LimitsTask))
        for task in tasks:
            link.handed[task.id] = _Handed(task, now)
        return Tasks(tasks=tasks), unanswered

    def handed(self, server: str, task: str) -> Task | None:
        """Return a task that the server received and has not answered, in the web service."""
        link = self._links.get(server)
        handed = link.handed.get(task) if link is not None else None
        return handed.task if handed is not None else None

    def answer(self, server: str, task: str, answer: Answer) -> Task | None:
        """Take the answer of an own server to a task, in the web service.

        Returns
        -------
        Task or None
            The task, or None when the server holds no unanswered task of this name that takes such an
            answer: a part of a file or a failure answers a task that reads, and ``Done`` every other task.
        """
        found = self.handed(server, task)
        if found is None or isinstance(found, ReadTask) == isinstance(answer, Done):
            return None
        del self._links[server].handed[task]
        waiting = self._answers.pop(task, None)
        if waiting is not None and not waiting.done():
            waiting.set_result(answer)
        return found

    async def ask(self, server: ServerRecord, task: Task) -> Answer:
        """Give a task to a connected own server and wait for its answer, in the web service.

        Raises
        ------
        ServerRefusedError
            With 503 when the server is not connected or the web service stops, and with 504 when the
            server does not answer within ``READ_TIME`` seconds.
        """
        if self._stopping:
            raise self._stopped()
        if not self.connected(server, time.time()):
            raise self._away(server)
        answer: asyncio.Future[Answer] = asyncio.get_running_loop().create_future()
        self._answers[task.id] = answer
        try:
            self.send(server.id, task)
            async with asyncio.timeout(READ_TIME):
                return await answer
        except TimeoutError:
            sentence = f"Your server {server.name} did not answer in time. Try again in a moment."
            raise ServerRefusedError(HTTPStatus.GATEWAY_TIMEOUT, sentence, 5) from None
        finally:
            self._answers.pop(task.id, None)
            link = self._links.get(server.id)
            if link is not None:
                link.handed.pop(task.id, None)
                if task in link.waiting:
                    link.waiting.remove(task)

    def record_done(self, server: ServerRecord, task: Task, done: Done, now: float) -> None:
        """Record what follows from the answer of an own server to a task that starts a job or sets limits."""
        if isinstance(task, StartTask):
            if done.ok:
                self._store.take_server_job(task.job, now)
            else:
                self._store.fail_server_job(task.job, done.detail or NOT_TAKEN, now)
        elif isinstance(task, LimitsTask):
            state = state_of(self._store.server(server.id) or server)
            if not done.ok:
                # The server cannot apply these limits, so they are not sent again with every report.
                self._store.set_server_limits(server.id, None)
            elif state is not None:
                applied = state.model_copy(update={"limits": task.limits})
                self._store.change_server_state(server.id, recorded_state(applied, knows_cells(state)))

    def record_report(self, server: ServerRecord, report: Report, now: float) -> tuple[Task, ...]:
        """Record the state of an own server and of the jobs that its report names.

        A report may name a job that an earlier report named, so every state is taken in a way that is
        safe to repeat. A job that the record does not hold as waiting or running on this server is not
        changed. A job that the server confirmed before its previous report is recorded as failed when
        the server now states that it runs and holds no job and the report does not name the job.

        Returns
        -------
        tuple of Task
            Tasks for the server that follow from the report: to end a job that the record does not hold
            or holds as dismissed, to delete the layer of such a job when the record holds no such layer,
            and to apply the limits that the owner set on the site when the server states other limits.
            Those limits keep the number of cells that the server reports when the owner set none
            (``owner_cells``) and when its program does not know the limit (``knows_cells``).
        """
        knows = knows_cells(report.state)
        self._store.set_server_state(server.id, recorded_state(report.state, knows), now)
        with self._lock:
            self._seen[server.id] = self._written[server.id] = now
            self._left.discard(server.id)
        tasks: list[Task] = []
        named = set()
        for state in report.jobs:
            named.add(state.job)
            job = self._store.server_job(state.job)
            if job is None or job.server != server.id or job.status == "dismissed":
                if state.status in _UNFINISHED:
                    tasks.append(DismissTask(id=_task_id(), job=state.job))
                elif state.status == "successful" and self._unrecorded(server, state):
                    tasks.append(RemoveTask(id=_task_id(), layer=state.layer.id if state.layer else ""))
            elif job.status in _UNFINISHED:
                self._record_job(server, job, state, now)
        if report.state.running + report.state.waiting == 0 and server.reported is not None:
            for job in self._store.unfinished_server_jobs(server.id):
                if job.id not in named and job.taken is not None and job.taken < server.reported:
                    self._store.fail_server_job(job.id, LOST, now)
        self._store.keep_latest_server_jobs(server.id, MAX_SERVER_FINISHED_JOBS, MAX_SERVER_DISMISSED_JOBS)
        wanted = None if server.limits is None else ServerLimits.model_validate_json(server.limits)
        if wanted is not None and (not knows or owner_cells(wanted) is None):
            # An older program applies FIRST_LAYER_CELLS and states no other number, and limits that name no
            # number of cells leave the number that the server reports.
            wanted = wanted.model_copy(update={"layer_cells": report.state.limits.layer_cells})
        if wanted is not None and wanted != report.state.limits:
            tasks.append(LimitsTask(id=_task_id(), limits=wanted))
        return tuple(tasks)

    def _unrecorded(self, server: ServerRecord, state: JobState) -> bool:
        """Tell whether a report names a layer of the server that the record does not hold.

        The record of a finished job may be removed while its layer stays, and a dismissed job keeps
        its layer, so a layer is deleted on its server only when the record holds no layer of its name.
        """
        layer = state.layer
        if layer is None or not _LAYER_ID.fullmatch(layer.id):
            return False
        return self._store.server_layer(server.id, layer.id) is None

    def _record_job(self, server: ServerRecord, job: ServerJobRecord, state: JobState, now: float) -> None:
        """Record the state that a server reported for a job that waits or runs.

        The times of the server are kept between the creation of the job and the present time, because
        the clock of a computer may differ from the clock of the project server.
        """

        def kept(instant: float | None) -> float:
            return now if instant is None else max(job.created, min(instant, now))

        if state.status in _UNFINISHED:
            started = kept(state.started) if state.status == "running" or state.started is not None else None
            self._store.report_server_job(job.id, state.status, state.progress, state.message, started, now)
        elif state.status == "successful":
            fault = layer_fault(server.id, state)
            if fault is None and state.layer is not None and state.size is not None:
                finished = kept(state.finished)
                layer = ServerLayerRecord(
                    id=state.layer.id,
                    server=server.id,
                    owner=server.user,
                    description=state.layer.model_dump_json(),
                    size=state.size,
                    created=finished,
                )
                started = min(kept(state.started), finished)
                if not self._store.succeed_server_job(job.id, state.message, started, finished, now, layer):
                    fault = "the server already keeps a layer of this name"
            if fault is not None:
                self._store.fail_server_job(job.id, WRONG_LAYER, now)
        else:
            self._store.fail_server_job(job.id, state.message, kept(state.finished))

    # Jobs and layers of an own server

    def submit[Inputs: BaseModel](
        self, server: ServerRecord, process: Process[Inputs], inputs: Inputs, response: str, token: str | None
    ) -> ServerJobRecord:
        """Record a new job of an own server and keep the task that starts it, in the web service.

        The limits of the project server on running jobs and on the space of layers are not applied:
        the own server applies the limits that its owner set.

        Raises
        ------
        ServerRefusedError
            With 429 when the server has ``MAX_SERVER_UNFINISHED_JOBS`` jobs that wait or run, and with
            507 when the record holds ``MAX_SERVER_LAYERS`` layers of the server.
        """
        unfinished = self._store.count_unfinished_server_jobs(server.id)
        if unfinished >= MAX_SERVER_UNFINISHED_JOBS:
            sentence = (
                f"Your server {server.name} has {unfinished} jobs that wait or run, which is the most that"
                " Lynkeus records. Wait for one to finish."
            )
            raise ServerRefusedError(HTTPStatus.TOO_MANY_REQUESTS, sentence)
        if self._store.count_server_layers(server.id) + unfinished >= MAX_SERVER_LAYERS:
            sentence = (
                f"Lynkeus records at most {MAX_SERVER_LAYERS} layers of one server."
                f" Remove a layer of {server.name} and try again."
            )
            raise ServerRefusedError(HTTPStatus.INSUFFICIENT_STORAGE, sentence)
        now = time.time()
        job = ServerJobRecord(
            id=secrets.token_hex(16),
            server=server.id,
            process=process.id,
            title=process.job_title(inputs),
            inputs=inputs.model_dump_json(),
            response=response,
            status="accepted",
            message=SENT,
            progress=0,
            created=now,
            started=None,
            finished=None,
            updated=now,
            layer=None,
            taken=None,
        )
        task = StartTask(
            id=_task_id(), job=job.id, process=job.process, title=job.title, inputs=job.inputs, token=token
        )
        self._store.add_server_job(job)
        try:
            self.send(server.id, task)
        except ServerRefusedError:
            self._store.fail_server_job(job.id, NOT_TAKEN, now)
            raise
        return job

    def dismiss(self, job: ServerJobRecord) -> ServerJobRecord:
        """Record that a job of an own server was dismissed and tell the server to end it, in the web service.

        A job whose task to start it still waits is never given to the server.
        """
        self._store.dismiss_server_job(job.id, DISMISSED, time.time())
        link = self._link(job.server)
        waiting = [task for task in link.waiting if isinstance(task, StartTask) and task.job == job.id]
        for task in waiting:
            link.waiting.remove(task)
        if not waiting:
            self.send_once(job.server, [DismissTask(id=_task_id(), job=job.id)])
        return self._store.server_job(job.id) or job

    async def _done(self, server: ServerRecord, task: Task) -> None:
        """Give a task to an own server and wait until the server has carried it out, in the web service."""
        answer = await self.ask(server, task)
        if not isinstance(answer, Done) or not answer.ok:
            detail = answer.detail if isinstance(answer, Done) else None
            raise ServerRefusedError(
                HTTPStatus.CONFLICT, detail or f"Your server {server.name} did not carry out the change."
            )

    async def rename_layer(self, server: ServerRecord, layer: ServerLayerRecord, title: str) -> ServerLayerRecord:
        """Give a layer of an own server a new title, on the server and in the record, in the web service.

        Raises
        ------
        ServerRefusedError
            With 503 and 504 as ``ask``, and with 409 when the server did not change the title.
        """
        await self._done(server, RenameTask(id=_task_id(), layer=layer.id, title=title))
        description = LayerDescription.model_validate({**json.loads(layer.description), "title": title})
        self._store.change_server_layer(server.id, layer.id, description.model_dump_json())
        return self._store.server_layer(server.id, layer.id) or layer

    async def remove_layer(self, server: ServerRecord, layer: ServerLayerRecord) -> None:
        """Delete the files of a layer on its own server and remove its record, in the web service.

        Raises
        ------
        ServerRefusedError
            With 503 and 504 as ``ask``, and with 409 when the server did not delete the files.
        """
        await self._done(server, RemoveTask(id=_task_id(), layer=layer.id))
        self._store.remove_server_layer(server.id, layer.id)

    def change(self, server: ServerRecord, change: ServerChange) -> ServerRecord:
        """Record a new name or new limits of an own server, in the web service.

        The limits are sent to the server at once when it is connected and has reported its state since
        it connected (``has_reported``), because the report tells which program it runs. A report that
        states other limits makes them be sent again, so a server that is away, or that has not reported
        yet, receives them after its next report.

        Limits that do not name ``layer_cells`` leave that limit as it is: an interface that does not
        know the limit must not set it to ``FIRST_LAYER_CELLS`` by leaving it out. The record keeps the
        number only when the owner named it or named it before (``owner_cells``), and never for an older
        program; otherwise the number that the server reports holds.

        Raises
        ------
        ServerRefusedError
            With 409 when the limits change ``layer_cells`` and the program of the server does not know
            that limit, and with 422 when ``running_jobs`` jobs of ``layer_cells`` cells need more than
            the memory that the server last reported. ``lynkeus.computer.job_memory`` gives the memory
            of a job, as it does for the first limits of a server. Nothing is recorded then, the name
            included.
        """
        limits = change.limits
        recorded: str | None = None
        if limits is not None:
            state = state_of(server)
            older = state is not None and not knows_cells(state)
            named = "layer_cells" in limits.model_fields_set
            if older and named and limits.layer_cells != FIRST_LAYER_CELLS:
                sentence = (
                    f"To change the cells of a layer of your server {server.name}, download Lynkeus Server"
                    " again and install it on that computer: the program that runs there now receives at most"
                    f" {_millions(FIRST_LAYER_CELLS)} million cells."
                )
                raise ServerRefusedError(HTTPStatus.CONFLICT, sentence)
            before = None if server.limits is None else ServerLimits.model_validate_json(server.limits)
            # The number that the record keeps: none for an older program, which applies FIRST_LAYER_CELLS.
            kept = None if older else (limits.layer_cells if named else owner_cells(before))
            reported = FIRST_LAYER_CELLS if state is None else state.limits.layer_cells
            limits = limits.model_copy(update={"layer_cells": reported if kept is None else kept})
            recorded = limits.model_dump_json(exclude=None if kept is not None else {"layer_cells"})
            memory = None if state is None else state.memory
            needed = limits.running_jobs * job_memory(limits.layer_cells)
            if memory is not None and needed > memory:
                one = limits.running_jobs == 1
                sentence = (
                    f"{limits.running_jobs} running {'job with a layer' if one else 'jobs with layers'} of"
                    f" {_millions(limits.layer_cells)} million cells {'needs' if one else 'need'} about"
                    f" {math.ceil(needed / 1e8) / 10:.1f} gigabytes of memory, and your server {server.name}"
                    f" has {math.floor(memory / 1e8) / 10:.1f} gigabytes."
                )
                raise ServerRefusedError(HTTPStatus.UNPROCESSABLE_CONTENT, sentence)
        if change.name is not None:
            self._store.rename_server(server.id, change.name)
        if limits is not None and recorded is not None:
            self._store.set_server_limits(server.id, recorded)
            if self.connected(server, time.time()) and self.has_reported(server.id):
                self.send_once(server.id, [LimitsTask(id=_task_id(), limits=limits)])
        return self._store.server(server.id) or server

    def remove(self, server: ServerRecord) -> None:
        """Remove an own server with the records of its jobs and layers, in the web service.

        The files of the layers stay on the computer. Every request that waits for the server ends, and
        the server receives the task to forget its pairing with its next question for tasks.
        """
        self._store.remove_server(server.id)
        with self._lock:
            self._seen.pop(server.id, None)
            self._written.pop(server.id, None)
            self._left.discard(server.id)
            self._reported.discard(server.id)
        link = self._links.pop(server.id, None)
        if server.key_digest is not None:
            self._removed[server.key_digest] = (ForgetTask(id=_task_id()), time.time() + CONNECTED_TIME)
        if link is None:
            return
        gone = ServerRefusedError(HTTPStatus.NOT_FOUND, "You have no server of this name.")
        for task in (*link.waiting, *(handed.task for handed in link.handed.values())):
            waiting = self._answers.pop(task.id, None)
            if waiting is not None and not waiting.done():
                waiting.set_exception(gone)
        if link.question is not None and not link.question.done():
            link.question.set_result(None)

    async def read(self, server: ServerRecord, layer: str, file: str, start: int, end: int) -> Part:
        """Read a part of a file of a layer from its own server, in the web service.

        Parameters
        ----------
        server : ServerRecord
            The own server that keeps the layer.
        layer, file : str
            Names of the layer and of the file.
        start, end : int
            First byte of the part, and the byte after its last one. The part holds at most ``MOST_BYTES`` bytes.

        Returns
        -------
        Part
            The bytes from ``start`` to ``end``, or to the end of the file when it ends before, and the
            size of the whole file.

        Raises
        ------
        ServerRefusedError
            With 503 when the server is not connected, with 504 when it does not answer within
            ``READ_TIME`` seconds, with 404 or 416 when the server states that the file does not exist
            or ends before ``start``, and with 502 when it could not read the file or sent other bytes
            than the task asked for.
        """
        if not 0 <= start < end <= start + MOST_BYTES:
            raise ValueError("a part holds at least one byte and at most MOST_BYTES bytes")
        try:
            task = ReadTask(id=_task_id(), layer=layer, file=file, start=start, end=end)
        except ValidationError:
            raise ServerRefusedError(HTTPStatus.NOT_FOUND, "Your server keeps no such file.") from None
        answer = await self.ask(server, task)
        if isinstance(answer, ReadFailure):
            # The project server passes the failure of another server on, so 500 becomes 502.
            status = HTTPStatus.BAD_GATEWAY if answer.status == 500 else HTTPStatus(answer.status)
            raise ServerRefusedError(status, answer.detail)
        if not isinstance(answer, Part) or len(answer.data) != min(end, answer.size) - start:
            sentence = f"Your server {server.name} sent other bytes than Lynkeus asked for."
            raise ServerRefusedError(HTTPStatus.BAD_GATEWAY, sentence)
        return answer
