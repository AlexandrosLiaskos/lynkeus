# lynkeus (server)

The Python package of Lynkeus. It holds these parts at present:

- `lynkeus.server` is the web service that the interface calls.
- `lynkeus.products` searches NASA's catalogue for NISAR products.
- `lynkeus.layers` defines the formats that connect the interface and the server.
- `lynkeus.analysis` lists the finished analysis tools.
- `lynkeus.team_log` renders the team log, a Markdown file, as a static web page.
- `lynkeus.visits` counts page visits and serves the total.
- `lynkeus.routes` adds the addresses of the sessions, the processes, the jobs and the layers to the web
  service. It uses `lynkeus.sessions` (sessions and their cookie), `lynkeus.earthdata` (check of an Earthdata
  token), `lynkeus.processes` (description of a process and reading of its inputs), `lynkeus.references`
  (reading of an input value given as a link), `lynkeus.jobs` (running of the jobs) and `lynkeus.store` (record
  of the sessions, jobs and layers in one SQLite file).
- `lynkeus.harmony` receives one layer of a NISAR product through NASA Harmony, `lynkeus.writing` writes a layer
  as a Cloud Optimized GeoTIFF with a STAC record, and `lynkeus.tools` runs an analysis tool on layers.
- `lynkeus.offered` lists the processes that the web service offers: `get-layer`, which receives a layer, and
  one process for every analysis tool of `lynkeus.analysis.TOOLS`.

See the README at the top of the repository for the checks and the deployment.

## Analysis tools as processes

A tool that is listed in `lynkeus.analysis.TOOLS` is offered as a process without a change elsewhere in the
server. The process takes three things from the tool.

- The name of the tool in `TOOLS`, in lower-case letters, digits and hyphens, is the name of the process. With
  spaces for its hyphens it is the title of the process: `backscatter-change` gives "Backscatter change".
- The first paragraph of the documentation string of the function of the tool is the description of the
  process. It states in one or two sentences what the tool computes.
- A `lynkeus.writing.LayerError` that the function raises carries one sentence for the visitor, who reads it as
  the message of the failed job, for example when the tool receives a wrong number of layers. Any other error
  is reported to the visitor as an internal error.

A request gives the `id` of each input layer, in the order of the method sheet, and the name of the result:
`POST /api/processes/backscatter-change/execution` with the body
`{"inputs": {"inputs": ["<id>", "<id>"], "title": "<name of the result>"}}`.

## Tools of the kind Series

A tool that gives the values of many dates against time is listed in `lynkeus.analysis.SERIES_TOOLS` and is
offered as a process in the same way. Its result is a series and not a layer.

- The function of the tool receives the arrays of its layers one after another, their descriptions, and the
  row and column of the cell of a point, or no cell for the whole area of the layers. It returns one value
  for each layer with the number of cells from which the value was made (`SeriesResult` in `lynkeus.layers`).
- The one output of the process is `series`, the series description (`SeriesDescription` in `lynkeus.layers`).
  The description holds every value of the series. A series has no file.
- A request gives the `id` of each input layer, in any order, the name of the series and, for a series at a
  point, the point in degrees of longitude and latitude (WGS 84):
  `POST /api/processes/backscatter-series/execution` with the body
  `{"inputs": {"inputs": ["<id>", "<id>"], "title": "<name>", "point": {"longitude": -70.9, "latitude": 42.8}}}`.
  Without `point` the series is that of the whole area of the layers.
- The state of a successful job has the field `series`, with the name of the series, in the place of the field
  `layer`, and `GET /api/jobs/{id}/results` returns the series description.
- `GET /api/series` lists the series of the session, `PATCH /api/series/{id}` with `{"title": "..."}` renames
  one, and `DELETE /api/series/{id}` removes one. `GET /api/layers` lists layers only.
- A series job runs on the project server only, from layers that the project server keeps. A request that
  names an own server of the visitor (`?server=<name>`), or whose input layers are kept on an own server, is
  answered with status 422 and one sentence. The report of an own server carries the description of a layer
  and no other result (`JobState` in `lynkeus.linking`), so an own server cannot return a series.

`docs/research/analysis-series.md`, part 1, describes every field of a series description.
