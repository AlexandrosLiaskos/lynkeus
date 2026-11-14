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
