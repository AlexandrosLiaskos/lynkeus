# Research note: storage of the web service

This note records the sources read and the checks made for the part of `docs/Storage.md` that the web
service, the web server and the containers carry out: the sign-in states, the ownership by account, the
keeping time, the record file, the free space of the disk and the log. It states what each source decided,
which numbers are choices of Lynkeus, what was proved on real data and what could not be confirmed.
Everything was read, run or measured on 15 November 2026.

## Sources

| Subject | Source | What it states | What it decided |
|---|---|---|---|
| Session | [Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) of OWASP | The identifier holds at least 64 bits of entropy from a secure random generator and carries no meaning. It is renewed after any change of the privilege level. The end of a session is enforced on the server, with a limit on the time without use and a limit on the whole time, and with a sign-out that ends the session. Usual limits on the time without use are 2 to 5 minutes for an application of high value and 15 to 30 minutes for one of low risk; a limit on the whole time of 4 to 8 hours suits a working day | The key of 256 bits; a new key at every sign-in; the end of the session on the server at Sign out; the two limits of the token (30 minutes without use, 8 hours in all). The time without use of the session itself is a choice of Lynkeus (decision 3) |
| Cookie | [Cookies: HTTP State Management Mechanism](https://datatracker.ietf.org/doc/draft-ietf-httpbis-rfc6265bis/) (the draft that replaces RFC 6265; `docs/research/data.md` records its state) | A server removes a cookie with a `Set-Cookie` field whose expiry lies in the past; a `Max-Age` of zero or less gives the earliest date that the browser can represent. The age of a cookie should be 400 days or less | The answer that removes the cookie carries `Max-Age=0` and an `Expires` in the past, with the same name and path. The age of 14 days is far below the limit |
| Answer to a missing sign-in | RFC 9110, HTTP Semantics, section 15.5.2 ([rfc-editor.org](https://www.rfc-editor.org/rfc/rfc9110.html)) | A server that answers 401 must send the field `WWW-Authenticate` with at least one challenge, and the client may repeat the request with new credentials | Every 401 of the web service carries `WWW-Authenticate: Bearer realm="Earthdata Login"`, also the new one for a token that is no longer held |
| Form of an error | RFC 9457, Problem Details for HTTP APIs ([rfc-editor.org](https://www.rfc-editor.org/rfc/rfc9457.xml)) | It obsoletes RFC 7807. The member `detail` is an explanation for a person that is specific to this occurrence. The type `about:blank` says that the problem means no more than its status code, and the title should then be the phrase of the status | The answers keep their form (`type`, `title`, `status`, `detail`) and the media type `application/problem+json`. The code and the changelog now name RFC 9457 |
| Keeping time of a service that NASA funds | ASF HyP3, [HyP3 Basic](https://hyp3-docs.asf.alaska.edu/about/hyp3_basic/) | HyP3 Basic is funded by NASA. Its products are retained for 14 days and then deleted; HyP3+ retains them for 30 days | The keeping time of 14 days |
| Keeping time of NASA Harmony | NASA Harmony, the list of the jobs of the account that ran the proof below, read on 15 November 2026 | The three newest jobs of the account, which the proof made at 20:59, 21:01 and 21:02 UTC, each state a `dataExpiration` exactly 30 days after their `createdAt`, for example 2026-11-15T21:02:03.484Z and 2026-12-15T21:02:03.484Z (step 12 of `sequence.json`) | The sentence of `docs/Storage.md` that Harmony keeps the clipped file for 30 days. A layer that Lynkeus has removed can therefore be requested again with its `source` |
| Change of a table | SQLite, [ALTER TABLE](https://www.sqlite.org/lang_altertable.html), section 7 | SQLite adds and renames columns only. Any other change is made in these steps: switch the foreign keys off, start a transaction, create the table `new_X` in the new form, copy the rows, drop `X`, rename `new_X` to `X`, create the indexes again, run `PRAGMA foreign_key_check`, commit, and switch the foreign keys on. The other order (rename the old table first) can damage references | `Store._bring_forward`, which follows these steps for the tables of the jobs, the layers and the series |
| Log of nginx | nginx, [Module ngx_http_log_module](https://nginx.org/en/docs/http/ngx_http_log_module.html); F5, [Configuring Logging](https://docs.nginx.com/nginx/admin-guide/monitoring/logging/) | Several logs can be named on one level, and a request is then written to all of them. An `access_log` on a level takes the place of those of the level above. `access_log off` cancels the logs of its level | The log is named inside `server`. Named beside `server`, it was a second log beside the log `main` of the image, and every request was written twice, once with its whole address (measured, see The log) |

## Decisions

| | Subject | Decision | Reason |
|---|---|---|---|
| 1 | When a session is made | `POST /api/session/earthdata` makes it, after Earthdata Login has accepted the token. `GET /api/session` and the start of a job make none | Principle 5 of `docs/Storage.md`. A job belongs to an account, so the start of a job by a visitor who is not signed in is answered with 401 and "Sign in to Earthdata to start this job.", also for a process that sends no request to NASA |
| 2 | Key and cookie | A key of 256 bits from `secrets`, of which the record holds the SHA-256 digest. A new key at every sign-in. The cookie `lynkeus_session` has `HttpOnly`, `Secure`, `SameSite=strict`, `Path=/api` and `Max-Age` 1209600. `GET /api/session` sends the cookie of a known session again, so that its age starts again when the page opens | OWASP. The age equals the time without use of the session, so the browser and the server drop it together |
| 3 | End of a session | After `KEEP_TIME` (14 days) without use, at Sign out, when its browser signs in to another account, and when its account has more than 10 sessions or the server more than 5,000. The session has no limit on its whole time | Principle 3 of `docs/Storage.md`: what the server keeps can be reached from the browser that made it. This departs from the limits of OWASP, which are meant for a session that carries the rights of the user. The rights towards NASA are carried by the token, which keeps both limits of OWASP. A session without the token reaches the working store of its account on the project server and the servers of the account, and nothing at NASA. The missing limit on the whole time is named under Not confirmed |
| 4 | Sign out | `DELETE /api/session/earthdata` forgets the token, removes the record of the session and removes the cookie. The jobs, layers and series of the account stay. A session without an account is left as it is, because no visitor is signed in to it and its end would remove the layers that it holds | OWASP: a sign-out ends the session on the server. `docs/Storage.md`, Sign-in states |
| 5 | A key that names no session | Every address that asks for the session answers as for a visitor who is not signed in, and its answer removes the cookie. These are the addresses of `lynkeus.routes` and `lynkeus.server_routes`. An address that asks for no session (`/api/limits`, `/api/processes`, the search) does not look at the cookie and leaves it | The page asks `GET /api/session` whenever it opens, so a browser drops a dead cookie at its next opening |
| 6 | Number of sessions | 10 for one account (`MAX_ACCOUNT_SESSIONS`); the sign-in beyond it ends the session of the account that was unused for the longest time. 5,000 in all (`MAX_SESSIONS`, as before); beyond it the session unused for the longest time that holds no token ends, and when every session holds a token the sign-in is answered with 503 | Both numbers are choices of Lynkeus. A session now needs a token that Earthdata Login accepts, so the sessions of the server can no longer be filled without an account; the limit of an account keeps one account from filling them |
| 7 | Owner | The tables `jobs`, `layers` and `series` have the columns `owner` (the Earthdata user name) and `session`, and a row holds exactly one of the two (`lynkeus.store.Holder`). The project server writes the owner. The lists, the limits, renaming, removal, extension and the input layers of a tool select by the holder | `docs/Storage.md`, Project server. A row with a session and no owner is what a record file of an earlier version holds, and what Lynkeus Server writes for its pairing |
| 8 | Content of a session without an account | It stays with the session. The start of the service gives it the keeping time and counts the session as used at that moment, so that the session lasts as long as its content. At the next sign-in of the session the content passes to the account in one change (`Store.give_to_account`). The limits of the account are not applied at that moment: an account above a limit keeps what it has and starts no new job until it is below the limit | `docs/Storage.md`, Project server |
| 9 | Another account in the same browser | The sign-in ends the session of the first account and makes a new session. Nothing passes from the first account to the second | `docs/Storage.md`, Sign-in states |
| 10 | Keeping time | `KEEP_TIME` = 14 days, in `lynkeus.jobs`. `SESSION_IDLE_TIME` is that constant. A layer and a series record `kept_until`, their creation plus the keeping time | HyP3 Basic keeps its products for the same time |
| 11 | Removal run | Every 300 seconds (`REMOVAL_PAUSE`, as before), and once when the service starts. It ends the unused sessions, removes each layer and series whose moment has passed, with the files and the record of the job, and removes the records of the failed and of the dismissed jobs that last changed more than the keeping time ago. A fault in a run is written in the log, and the next run takes place | `docs/Storage.md`. The record of a successful job is removed with its layer or series, as before |
| 12 | Extension | `kept_until` becomes the present moment plus the keeping time. For a layer of an own server the answer is its entry as it is, with `kept_until` `null` | That server keeps the layer without an end, so there is nothing to extend, and the interface can send Keep all without telling the two kinds apart |
| 13 | `source` | The layer row records `{"process": ..., "inputs": {...}}` in a column of its own, written in the same change that records the layer, from the process and the inputs of its job. It therefore outlives the record of the job, which is removed when the job is dismissed or when the account has more than 100 finished jobs. For a file of an earlier version the column is filled from the job of each layer while the record still holds that job, and is `null` otherwise. The table of the layers of own servers has the same column | The interface sends `source` again after the layer is gone (`docs/Storage.md`, States of a stored layer) |
| 14 | `DELETE /api/storage` | It ends the unfinished jobs of the account, and removes the records of its jobs, layers and series in one change and then the files. It does not end the session and does not touch the tables of the own servers | `docs/Storage.md`, Addresses |
| 15 | Record file | Version 4. A file of version 1, 2 or 3 is brought forward when it is opened, inside one transaction, by the steps of SQLite named above; every row keeps its number, which decides the order of two rows of the same time. A file whose check of the foreign keys fails is left as a whole file of its version and is not opened | No loss, and no file that is half changed |
| 16 | Lynkeus Server | The program opens its record with the same module, so its file is brought forward in the same way. Its limits have no keeping time and no reserve of free space (`lynkeus.link.job_limits`): its layers have no moment of removal, and its owner sets its storage | The layers of an own server are the permanent copies (principle 1 of `docs/Storage.md`) |
| 17 | Free space | `FREE_SPACE_RESERVE` = 5 gigabytes. The service reads the free space of the disk of the folder of the files (`shutil.disk_usage`): a job that makes a layer is refused with 507 when less than the reserve plus the largest folder of a job (500 megabytes) is free, a waiting job is not started in the same case, and a running job is ended when less than the reserve is free, at the measurement that takes place every 2 seconds. A disk that cannot be read counts as full. A job that makes a series writes no file and is not checked | Principle 9 of `docs/Storage.md`. The number is a choice of Lynkeus: ten times the largest layer. It covers what two jobs write between two measurements, a new build of the two images beside the running ones (the two images take 918 and 78 megabytes), the record file with its copies, the logs, and the other sites of the machine |
| 18 | `MAX_TOTAL_SIZE` | It stays 20 gigabytes. Its description no longer says that it is half of the free space of the machine | The disk of the machine had between 16 and 18 gigabytes free on the day read, so Lynkeus could not take 20. The number is now the most that Lynkeus takes of a shared disk, and the free space is read |
| 19 | Token that is not held | `POST /api/processes/{name}/execution` of a process that needs Earthdata answers 401 with "Enter your Earthdata token again to start this job, because the server no longer holds it." (`lynkeus.routes.ENTER_AGAIN`). A process that needs no token starts, on the project server and on an own server | `docs/Storage.md`, Sign-in states. The start of a job is the only request of the web service that carries the token to NASA; the search asks the catalogue without it |
| 20 | Log of the web server | The format `lynkeus` is the format `main` of the image with two variables replaced by maps: the request line, and the page that led to the request. Each map writes "-" in the place of the 32 characters after `/files/`, and of the names of the server and of the layer in `/api/servers/<server>/files/<layer>/`. A missing file of a layer is not written in the log of the errors (`log_not_found off`) | Principle 10 of `docs/Storage.md` |
| 21 | Logs of the containers | `compose.yaml` states the driver `json-file` with 3 files of 10 megabytes for each of the three services | The machine applied the same limits as its default (read with `docker inspect` from the running containers); the repository now states them itself |

## Proof on real data

The sequence of the task ran on 15 November 2026, from 20:58 to 21:05 UTC, on a private copy of the web
service: the image of `api/` of the branch, and nginx:1.27-alpine with `web/nginx.conf` of the branch, on a
Docker network of their own beside the live site, which was not touched. A driver on the same machine played
two browsers. It asked Earthdata Login for a user token and held it in memory only. The record
`docs/research/records/storage/sequence.json` holds every request with its status, its headers and its answer;
`service.json` in that folder states what ran. The record holds no token, no key of a session and no name of
the Earthdata user. The layer was the backscatter HHHH of the GCOV product of 21 October 2026, track 141,
frame 67, clipped to the area -71.00, 42.75, -70.95, 42.80.

| Step | Request | Observed |
|---|---|---|
| 1 | `GET /api/session`, `GET /api/layers` and the start of a job, without a cookie | 200 `{"earthdata": null}`, 200 with no layer, and 401 "Sign in to Earthdata to start this job." No answer set a cookie, and the record file held no session |
| 2 | `POST /api/session/earthdata` | 200. The cookie: `HttpOnly; Max-Age=1209600; Path=/api; SameSite=strict`, with a key of 43 characters. `GET /api/session` then: `{"earthdata": {"user": ..., "token": true}}`. The cookie lacks `Secure` because the private service took plain HTTP (`LYNKEUS_COOKIE_SECURE=false`) |
| 3 | Get layer | 201, and the job was successful after 140 seconds |
| 4 | `GET /api/layers` | One entry of 795,662 bytes, created 2026-11-15T21:01:19Z, `kept_until` 2026-11-29T21:01:19Z (14.0 days), `source` `{"process": "get-layer", "inputs": {...}}` with the four inputs of the request. The first 16 bytes of its file were read through the web server with status 206, with the cookie and without it |
| 5 | A second browser | Before its sign-in: no layer. After its sign-in to the same account: the same entry, and the job in `GET /api/jobs`. The record held 2 sessions, 1 job and 1 layer |
| 6 | Restart of the web service | `GET /api/session`: `{"earthdata": {"user": ..., "token": false}}`. The layer was listed and its file read (206). The tool Backscatter, One date ran on it as a job and was successful after 8 seconds; its file was read. Get layer answered 401 with `WWW-Authenticate: Bearer realm="Earthdata Login"` and "Enter your Earthdata token again to start this job, because the server no longer holds it." `GET /api/servers` answered 200 |
| 7 | `POST /api/layers/{name}/extension`, `POST /api/storage/extension` | 200 with the entry, `kept_until` 2026-11-29T21:01:34Z; and 204 |
| 8 | The service was stopped, and the record file was changed: the layer to be kept for 3 more days, the result of the tool to have passed its moment 60 seconds before. The service was started | The removal run of the start removed the result: `GET /api/layers` held the layer only, with `kept_until` 2026-11-18T21:01:35Z; the job of the result answered 404; its file answered 404; its folder was gone, and the record held 1 job and 1 layer. The extension of the layer then gave `kept_until` 2026-11-29T21:01:43Z |
| 9 | The token was given again | `GET /api/session`: token true. The same Get layer was accepted with 201 and was successful |
| 10 | `DELETE /api/storage` | 204. The two layers of the account, their files and the records of its jobs were gone. The visitor stayed signed in, in both browsers. The server of the account (see the next part), its job and its layer stayed |
| 11 | Sign out | 204 with `Set-Cookie: lynkeus_session=""; ...; Max-Age=0; Path=/api`. `GET /api/session` then: `{"earthdata": null}` and no cookie. The second browser stayed signed in. The record held 1 session |

## The released program Lynkeus Server v0.1.0

`docs/Storage.md` rules that the released program keeps working with the new project server. Four facts
show it.

1. The formats of the messages are the file `api/src/lynkeus/linking.py`. The file of the branch is the file of
   the tag `v0.1.0` (commit 049dc92), byte for byte: both have the SHA-256 digest
   a8ab3e0c990114445c9c6e9db8d48add14f97489fee65b2234194b0d54ee3ce6.
2. The eight addresses under `/api/link/` are those of the tag
   (`tests/test_server_routes.py::test_addresses_of_the_program_are_those_that_the_released_program_calls`).
   In `lynkeus.server_routes` and `lynkeus.servers` the branch changes one function, which finds the account
   of a request for the addresses of the interface, and the name of one parameter.
3. The program of the tag ran against the private service of the proof above (step 9 of `sequence.json`):
   `python -m lynkeus.ownserver --no-window` from the folder `api/src` of the tag, which read its own code
   (version 0.1.0, record of version 3). It asked for a pairing and showed its code. The signed-in visitor
   confirmed the code, and the server was connected 4 seconds later and reported the version 0.1.0. Get
   layer with the parameter `server` ran on the program and was successful after 160 seconds. The entry of
   its layer had `kept_until` `null` and its `source`. The first 16 bytes of its file were read through the
   project server (206, of 790,809 bytes). The layer received a new title (task `rename`), the extension
   answered with the entry as it was, `DELETE /api/storage` left the server, its job and its layer, and the
   removal of the layer emptied the folder `files` of the program (task `remove`). The log of the program
   holds no error.
4. The record file of the program is opened by the same module as that of the project server. A file of each
   earlier version, as a paired program leaves it, is brought forward when the new program starts, and the
   program then reads, removes and makes layers on it
   (`tests/test_link.py::test_record_file_of_an_earlier_version_of_the_program_is_brought_forward_and_its_layers_stay`).

Not run: the packed program of the release v0.1.0 (the installer of Windows, the disk image of macOS or the
archive of Linux). The proof ran the source of the tag with the libraries of the image of the web service,
whose versions `api/uv.lock` fixes and which the tag and the branch share.

## The log

The web server was run with the settings of the branch in a container without a network, and requests were
sent from inside it (`docs/research/records/storage/web_server_log.txt`).

1. With the log named beside `server`, every request was written twice: once in the format `main` of the
   image, with the whole address, and once in the new format. Named inside `server`, the log is written once.
2. A request for `/files/<32 characters>/gcov-hhhh-20261021.tif` is written as
   `GET /files/-/gcov-hhhh-20261021.tif`, and a request for a file of an own server as
   `GET /api/servers/-/files/-/gcov-hhhh-20261021.tif`. A page that led to a request is written in the same
   way. An empty page is written as "-", as before.
3. The name of a layer is the name of the folder of its files. The first run of the proof on real data showed
   it in the log, in the addresses of renaming, removal and extension (`/api/layers/<32 characters>`). The
   format now writes `/api/layers/-` there too. In the second run, of 209 lines of requests none held the name
   of a layer folder, in the log of the requests and in the log of the errors (step 12 of `sequence.json`).
4. The log of the errors of nginx wrote a missing file with its whole path. `log_not_found off` in the
   location of the files stops that for a layer that was removed.
5. Still written: the name of an own server in the addresses `/api/servers/<name>` and in the parameter
   `server` of the start of a job (2 lines of the run). That name opens nothing without the sign-in of its
   owner. A fault of the web server other than a missing file, for example a file that cannot be read, would be
   written in the log of the errors with its path.

## What other parts meet

1. `GET /api/session` answers `{"earthdata": null}` or `{"earthdata": {"user": ..., "token": true or false}}`,
   and sets a cookie only for a session that exists. An answer to a request whose cookie names no session
   removes the cookie.
2. `GET /api/limits`: `limits` has `account_unfinished_jobs`, `account_layers`, `account_series`,
   `account_size`, `free_space_reserve` and `keep_time`, and no longer `session_unfinished_jobs`,
   `session_layers` and `session_size`. `resources` has `free_space`, which may be `null`.
3. The entries of `GET /api/layers` have `kept_until` and `source`, and those of `GET /api/series` `kept_until`.
4. The start of a job by a visitor who is not signed in answers 401 for every process.
5. Sentences: "You have no job of this name.", "You have no layer of this name." and "You have no series of
   this name." (before: "Your session has no ..."); "You may keep at most N layers. Remove a layer and try
   again." and the same for series (before: "A session holds at most ..."); "Your layers use the N gigabytes
   that you may keep. Remove a layer and try again."; "The server has too little free space on its disk for a
   new layer at present."; "The job was not started because the server has too little free space on its
   disk."; "The job was ended because the server has too little free space on its disk."; "Sign in to
   Earthdata to keep or remove what the project server keeps for your account."; the title of the links to
   `/api/jobs` is "Jobs of the account".
6. Constants: `MAX_SESSION_...` in `lynkeus.jobs` are `MAX_ACCOUNT_...`; `SESSION_IDLE_TIME` in
   `lynkeus.sessions` is written `SESSION_IDLE_TIME = KEEP_TIME`, and `KEEP_TIME = 14 * 24 * 3600.0` stands in
   `lynkeus.jobs`. The function `_session_or_new` of `lynkeus.routes` no longer exists.
7. `web/nginx.conf` has two lines `access_log`: `access_log /var/log/nginx/access.log lynkeus;` inside
   `server`, and `access_log off;` for the counter of visits.

## Differences from the task and from earlier notes

1. The task names `docs/research/contents.md` as the list of the research notes. That file is the research
   note of the Contents pane, and the folder has no list, so this note was added to none.
2. `docs/research/data.md` does not record the 30 days of NASA Harmony. They were read again for this note
   (Sources).
3. The answer of `GET /api/limits` had three limits of a session with the prefix `session_`, not four. The
   answer now has the four limits of an account that `docs/Storage.md` names; `account_series` is new in it.
4. `docs/Storage.md` asks that the log leaves out the random part of the address of a layer file. The same
   characters are the name of the layer under `/api/layers/`, so the format leaves them out there too (The
   log, point 3). The document does not name those addresses.
5. Earlier notes state what this feature changes: `docs/research/data.md` (a session is removed after 7 days;
   20 gigabytes are half of the free space; limits "in a session"), `docs/research/analysis-series.md` (the
   constants `MAX_SESSION_SERIES` and `MAX_SESSION_LAYERS`), and `docs/research/share.md` (the layers of a
   session). They are records of their day and were left as they are.
6. The part Backup of `docs/Storage.md` (a daily copy of the record file, 14 copies) is not a part of the web
   service and was not built here.

## Not confirmed

1. The session has no limit on its whole time, which OWASP asks of every session. A session that is used at
   least once in 14 days lasts until Sign out. Whoever held its cookie could, without the token, read, rename
   and remove the layers of the account and connect, change and remove its servers; he could send no request
   to NASA. The cookie cannot be read by a script of the page (`HttpOnly`), passes over HTTPS only and is not
   sent with a request from another site. Whether a limit on the whole time is wanted is a decision of the
   project.
2. The reserve of 5 gigabytes is a choice. No measurement of what the other sites of the machine write in a
   day was made.
3. The definition of the status 507 was not read again; the web service used the status before this feature
   for a full store.
4. The limits of the logs in `compose.yaml` were read back from `docker compose config`, and the same limits
   were read from the running containers, where the machine applies them as its default. A container was not
   started from the changed file on the live site.
5. Nothing was tried in a browser.
