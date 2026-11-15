"""The example messages of the addresses with which the interface manages own servers.

The files of ``tests/data/servers`` are examples of what the project server answers to the interface and of
what the interface sends: the list of the servers of a visitor, a server after its pairing and after a change,
the changes themselves, the view and the confirmation of a pairing, and the server that the state of a job and
an entry of the list of layers name. The tests of the interface (``web/src/servers`` and ``web/src/shared``)
read the same files, so both sides are tested against one text.
"""

import json
from pathlib import Path

import pytest

from lynkeus.layers import Format
from lynkeus.linking import (
    FIRST_LAYER_CELLS,
    PairingConfirmation,
    PairingView,
    Server,
    ServerChange,
    ServerName,
    Servers,
)

DATA = Path(__file__).parent / "data" / "servers"

EXAMPLES: dict[str, type[Format]] = {
    "pairing-confirmation.json": PairingConfirmation,
    "pairing-view.json": PairingView,
    "server-change-limits.json": ServerChange,
    "server-change-name.json": ServerChange,
    "server-changed.json": Server,
    "server-name.json": ServerName,
    "server-paired.json": Server,
    "servers.json": Servers,
}


def test_every_file_of_the_folder_is_an_example_of_a_format() -> None:
    assert sorted(path.name for path in DATA.iterdir()) == sorted(EXAMPLES)


@pytest.mark.parametrize(("name", "form"), EXAMPLES.items())
def test_example_is_read_as_its_format_and_written_back_unchanged(name: str, form: type[Format]) -> None:
    text = (DATA / name).read_text(encoding="utf-8")
    read = form.model_validate_json(text)
    assert read.model_dump(mode="json", exclude_unset=True) == json.loads(text)


def test_examples_cover_the_states_that_the_interface_shows() -> None:
    servers = Servers.model_validate_json((DATA / "servers.json").read_text(encoding="utf-8")).servers
    assert [server.connected for server in servers] == [True, False, False]
    assert [server.state is None for server in servers] == [False, False, True]
    full = servers[1].state
    assert full is not None
    assert full.memory is None
    assert full.disk_used >= full.limits.storage


def test_limits_without_the_cells_of_a_layer_are_read_as_25_million() -> None:
    servers = Servers.model_validate_json((DATA / "servers.json").read_text(encoding="utf-8")).servers
    new, old = servers[0].state, servers[1].state
    assert new is not None
    assert old is not None
    # The first server runs a program that states the limit; the second runs version 0.1.0, which does not.
    assert new.version != "0.1.0"
    assert new.limits.layer_cells == 100_000_000
    assert old.version == "0.1.0"
    assert "layer_cells" not in old.limits.model_fields_set
    assert old.limits.layer_cells == FIRST_LAYER_CELLS == 25_000_000
    change = ServerChange.model_validate_json((DATA / "server-change-limits.json").read_text(encoding="utf-8"))
    assert change.limits is not None
    assert change.limits.layer_cells == 150_000_000
