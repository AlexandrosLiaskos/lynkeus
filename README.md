# Lynkeus

Lynkeus is a web platform for the analysis of surface change with radar data of the NISAR mission.
It is developed by Team Lynkeus, was started for the 2026 NASA Space Apps Challenge (challenge
"Dancing with the SARs"), and is intended for continued use.

Lynkeus is an independent project. It is not sponsored or endorsed by the National Aeronautics and
Space Administration (NASA).

- Site: <https://lynkeus.nkua.cloud/>
- Team log, with every decision and its reasons: <https://lynkeus.nkua.cloud/team-log/>

## Status

Lynkeus is under development. At present the application searches NASA's catalogue for NISAR products
and shows the products found in a list and on the map. The repository also holds the formats that
connect the interface and the server, the program that publishes the team log as a web page, and the
service that counts page visits. A button of the ribbon is grey until its function is finished.

## Repository

| Place | Contents |
|---|---|
| `api/` | The server: the Python package `lynkeus`, its tests and its container file |
| `web/` | The interface: the TypeScript code, the static files and the web-server configuration |
| `docs/` | The research notes of the parts and the method sheets of the analysis tools |
| `deploy/` | The files that install and run Lynkeus on a server |
| `compose.yaml` | The file that starts the containers |
| `.github/workflows/` | The automatic checks |

In `web/src/`, each element of the interface has its own folder, which holds the component of the
element and its style. Each tab of the ribbon is declared in its own folder (`map/`, `data/`,
`analysis/`, `view/`, `share/` and `help/`), and `ribbon/` joins them. The folder `shared/` holds what
every part uses: the tool pane, the stack of panes beside the map, the dialog, the messages, the
description of a button, the styles of the form elements and of the keyboard focus, and the formats of
a layer. The server holds the same formats in `api/src/lynkeus/layers.py`.

## Running Lynkeus on your own computer

The interface needs Git and [Node.js](https://nodejs.org/) 22.12 or later.

```sh
git clone https://github.com/AlexandrosLiaskos/lynkeus
cd lynkeus/web
npm ci
npm run dev
```

The last command serves the application page at <http://localhost:5173/> and shows each saved change
at once. The server needs Python 3.13 and [uv](https://docs.astral.sh/uv/).

```sh
cd lynkeus/api
uv sync
uv run uvicorn lynkeus.server:app --port 8000
```

The page of `npm run dev` passes its requests to this server, so both commands run at the same time,
each in its own terminal.

## Checks

The Python code follows PEP 8, carries type annotations and numpydoc documentation strings, and has
a test for every function that computes a result. The checks need [uv](https://docs.astral.sh/uv/).

```sh
cd api
uv sync
uv run ruff format --check .
uv run ruff check .
uv run mypy
uv run pytest
```

The TypeScript code is compiled in strict mode, formatted with Prettier, checked with ESLint and
tested with Vitest. The checks need [Node.js](https://nodejs.org/) 22.12 or later.

```sh
cd web
npm ci
npm run format
npm run lint
npm run types
npm test
npm run build
```

## Deployment

Lynkeus runs in containers behind a front web server that ends HTTPS. The front web server reaches
the containers over an external Docker network, which `compose.yaml` names.

```sh
install -d -o 10001 -g 10001 data/visits data/api data/api/files
docker compose build
docker compose up -d
sh deploy/install-team-log-units.sh /path/to/Team_Log.md
```

The first command creates the folders that the containers write, owned by the user of the
containers (number 10001). The folder `data/api` holds the record of the sessions, jobs and layers
(`lynkeus.sqlite3`) and, in `files/`, the two files of every layer. The container of the web service
writes the folder, and the container of the web server reads `files/` and serves it under `/files/`.
A restart of the web service keeps the layers and the finished jobs of every session. It ends the
jobs that wait or run and records them as failed, and it forgets every Earthdata token.

The web service runs as one process, because it holds the running jobs and the Earthdata tokens in
its memory. It reads three settings from the environment.

| Setting | Meaning | Without it |
|---|---|---|
| `LYNKEUS_DATA_FOLDER` | Folder of the record and of the files of the layers | A temporary folder, removed when the service stops |
| `LYNKEUS_EARTHDATA_KEYS` | Address of the public keys with which an Earthdata token is checked, for tests | The address of NASA Earthdata Login |
| `LYNKEUS_COOKIE_SECURE` | `false` lets the cookie of a session pass over plain HTTP, for tests | The cookie passes over HTTPS only |

The last command installs two systemd units. They publish the team log again whenever its file
changes.

## Third-party software

| Software | Version | Licence | Use |
|---|---|---|---|
| [Python](https://www.python.org/) | 3.13 | PSF-2.0 | Language of the server |
| [FastAPI](https://fastapi.tiangolo.com/) | 0.162.7 | MIT | Web service of the server |
| [Uvicorn](https://www.uvicorn.org/) | 0.54.0 | BSD-3-Clause | Runs the web service |
| [earthaccess](https://earthaccess.readthedocs.io/) | 0.19.0 | MIT | Searches NASA's catalogue |
| [Python-Markdown](https://python-markdown.github.io/) | 3.11.3 | BSD-3-Clause | Renders the team log |
| [tzdata](https://github.com/python/tzdata) | 2026.6 | Apache-2.0 | Time zones |
| [NumPy](https://numpy.org/) | 2.5.4 | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 | Arrays of the layers |
| [pydantic](https://docs.pydantic.dev/) | 2.14.3 | MIT | Checks the formats |
| [nginx](https://nginx.org/) | 1.27 | BSD-2-Clause | Web server of the site |
| [Node.js](https://nodejs.org/) | 22 | MIT | Builds the interface |
| [React](https://react.dev/) | 19.3.1 | MIT | Interface |
| [OpenLayers](https://openlayers.org/) | 10.11.0 | BSD-2-Clause | Map |
| [U.S. Web Design System](https://designsystem.digital.gov/) | 3.14.0 | CC0-1.0 | Base styles, colours, icons, forms, dialog and alerts |
| [TypeScript](https://www.typescriptlang.org/) | 6.0.3 | Apache-2.0 | Language of the interface |
| [Vite](https://vite.dev/) | 8.3.8 | MIT | Builds the interface |
| [Sass](https://sass-lang.com/) | 1.108.2 | MIT | Compiles the styles |
| [uv](https://docs.astral.sh/uv/) | 0.13.8 | MIT OR Apache-2.0 | Installs the exact versions |
| [Ruff](https://docs.astral.sh/ruff/) | 0.17.5 | MIT | Style check |
| [mypy](https://mypy-lang.org/) | 2.4.1 | MIT | Type check |
| [pytest](https://pytest.org/) | 9.2.0 | MIT | Tests |
| [httpx2](https://github.com/pydantic/httpx2) | 2.16.0 | BSD-3-Clause | Tests of the web service |
| [Vitest](https://vitest.dev/) | 5.1.0 | MIT | Tests of the interface |
| [happy-dom](https://github.com/capricorn86/happy-dom) | 21.0.4 | MIT | Simulated browser for the tests |
| [Testing Library](https://testing-library.com/) | React 16.3.3, DOM 10.4.2, user-event 14.6.10 | MIT | Tests of the components |
| [Prettier](https://prettier.io/) | 3.10.1 | MIT | Style check |
| [ESLint](https://eslint.org/) | 10.15.0 | MIT | Code check |
| [typescript-eslint](https://typescript-eslint.io/) | 8.72.2 | MIT | Code check |
| [eslint-plugin-react-hooks](https://react.dev/reference/eslint-plugin-react-hooks) | 7.1.1 | MIT | Code check |

## Data

The products that the search lists are found in NASA's Common Metadata Repository (CMR), which holds
the records of the NISAR products of the NASA Alaska Satellite Facility Distributed Active Archive
Center (ASF DAAC). The search reads the validated and the provisional collections of four product
types: GCOV, GUNW, GOFF and SME2.

The background maps of the application come from two services.

- Blue Marble: we acknowledge the use of imagery provided by services from NASA's Global Imagery
  Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).
- OpenStreetMap: © OpenStreetMap contributors, available under the
  [Open Database License](https://www.openstreetmap.org/copyright).

## Team image

The image in the top bar of the site is a star map of the constellation Lynx, drawn by the team.
The positions, brightnesses and colours of the stars come from the Yale Bright Star Catalogue
(5th revised edition, NASA HEASARC copy), and the boundary from the constellation boundaries of
the International Astronomical Union.

## Citation and licence

To cite Lynkeus, use the entry in [CITATION.cff](CITATION.cff). The code is released under the
[Apache License 2.0](LICENSE).
