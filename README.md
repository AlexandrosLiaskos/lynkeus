# Lynkeus

Lynkeus is a web platform for the analysis of surface change with radar data of the NISAR mission.
It is developed by Team Lynkeus, was started for the 2026 NASA Space Apps Challenge (challenge
"Dancing with the SARs"), and is intended for continued use.

Lynkeus is an independent project. It is not sponsored or endorsed by the National Aeronautics and
Space Administration (NASA).

- Site: <https://lynkeus.nkua.cloud/>
- Team log, with every decision and its reasons: <https://lynkeus.nkua.cloud/team-log/>

## Status

Lynkeus is under development. At present the repository holds the page of the application with its
map, the program that publishes the team log as a web page, and the service that counts page visits.
The analysis tools are added as each one is finished.

## Repository

| Place | Contents |
|---|---|
| `api/` | The server: the Python package `lynkeus`, its tests and its container file |
| `web/` | The interface: the TypeScript code, the static files and the web-server configuration |
| `deploy/` | The files that install and run Lynkeus on a server |
| `compose.yaml` | The file that starts the containers |
| `.github/workflows/` | The automatic checks |

In `web/src/`, each element of the interface (header, ribbon, map and footer) has its own folder,
which holds the component of the element and its style.

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

The TypeScript code is compiled in strict mode, formatted with Prettier and checked with ESLint. The
checks need [Node.js](https://nodejs.org/) 22.

```sh
cd web
npm ci
npm run format
npm run lint
npm run types
npm run build
```

## Deployment

Lynkeus runs in containers behind a front web server that ends HTTPS. The front web server reaches
the containers over an external Docker network, which `compose.yaml` names.

```sh
install -d -o 10001 -g 10001 data/visits
docker compose build
docker compose up -d
sh deploy/install-team-log-units.sh /path/to/Team_Log.md
```

The last command installs two systemd units. They publish the team log again whenever its file
changes.

## Third-party software

| Software | Version | Licence | Use |
|---|---|---|---|
| [Python](https://www.python.org/) | 3.13 | PSF-2.0 | Language of the server |
| [Python-Markdown](https://python-markdown.github.io/) | 3.11.3 | BSD-3-Clause | Renders the team log |
| [tzdata](https://github.com/python/tzdata) | 2026.6 | Apache-2.0 | Time zones |
| [nginx](https://nginx.org/) | 1.27 | BSD-2-Clause | Web server of the site |
| [Node.js](https://nodejs.org/) | 22 | MIT | Builds the interface |
| [React](https://react.dev/) | 19.3.1 | MIT | Interface |
| [OpenLayers](https://openlayers.org/) | 10.11.0 | BSD-2-Clause | Map |
| [U.S. Web Design System](https://designsystem.digital.gov/) | 3.14.0 | CC0-1.0 | Base styles, colours and icons |
| [TypeScript](https://www.typescriptlang.org/) | 6.0.3 | Apache-2.0 | Language of the interface |
| [Vite](https://vite.dev/) | 8.3.8 | MIT | Builds the interface |
| [Sass](https://sass-lang.com/) | 1.108.2 | MIT | Compiles the styles |
| [uv](https://docs.astral.sh/uv/) | 0.13.8 | MIT OR Apache-2.0 | Installs the exact versions |
| [Ruff](https://docs.astral.sh/ruff/) | 0.17.5 | MIT | Style check |
| [mypy](https://mypy-lang.org/) | 2.4.1 | MIT | Type check |
| [pytest](https://pytest.org/) | 9.2.0 | MIT | Tests |
| [Prettier](https://prettier.io/) | 3.10.1 | MIT | Style check |
| [ESLint](https://eslint.org/) | 10.15.0 | MIT | Code check |
| [typescript-eslint](https://typescript-eslint.io/) | 8.72.2 | MIT | Code check |
| [eslint-plugin-react-hooks](https://react.dev/reference/eslint-plugin-react-hooks) | 7.1.1 | MIT | Code check |

## Map data

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
