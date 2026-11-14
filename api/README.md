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

See the README at the top of the repository for the checks and the deployment.
