# Packing Lynkeus Server

Lynkeus Server (`lynkeus.ownserver`) is delivered as one download for each operating system, so that a
visitor needs no Python, no terminal and no setting. `docs/Own_Servers.md` describes the program and its
downloads, and `docs/research/servers.md` records the checks behind the choices.

| File | What it is |
|---|---|
| `lynkeus_server.py` | The start of the packed program |
| `lynkeus-server.spec` | The description of the program for PyInstaller: a folder, with rasterio collected whole |
| `lynkeus-server.iss` | The installer for Windows, for Inno Setup 6.3 or later |
| `pack.py` | Packs the program for the system that runs and makes its download in `dist/` |

To pack the program on a computer, in `api/`:

```sh
uv sync --frozen --group pack
uv run python packing/pack.py
```

The download is made for the system and the processor type of the computer that packs it. On Windows the
compiler of Inno Setup must be installed. To check the packed program against stand-ins for the project
server and for NASA, as the workflow `.github/workflows/server-program.yml` does on each system:

```sh
uv run python -m tests.journey "dist/lynkeus-server/lynkeus-server"
```

The check starts the program, pairs it, lets a job receive a layer, reads the files of the layer back,
ends a second job and ends the pairing (`tests/journey.py`).

The downloads carry no signature of a publisher. Windows and macOS therefore warn when the program is
first opened.
