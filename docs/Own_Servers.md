# Own servers

A visitor may connect computers of his own to Lynkeus. His jobs then run on such a computer and their
layers are kept on its disk, so the processors, the memory and the disk of the project server no longer
limit them. This document gives the rules of that connection. The formats of every message are in
`api/src/lynkeus/linking.py`, and the sources and checks behind the choices are in
`docs/research/servers.md`.

## Terms

| Term | Meaning |
|---|---|
| Project server | The server of the site, `lynkeus.nkua.cloud`. |
| Own server | A computer of a visitor that runs the program Lynkeus Server. |
| Lynkeus Server | The program that the visitor installs. It holds the same code as the project server: the processes, the jobs and the writing of layers. |
| Owner | The Earthdata user who confirmed the pairing of an own server. |

## Principles

1. The own server opens every connection, to the project server, over HTTPS. Nothing connects to it, so
   it needs no public address, no open port and no certificate, and it listens on no port.
2. An own server belongs to an Earthdata user and not to a session, so the owner finds it from any
   browser in which he signs in. Every address under `/api/servers` needs a signed-in session.
3. The project server keeps the record of every job. A job carries the name of the server on which it
   runs, or none for the project server.
4. A layer of an own server belongs to its owner and not to a session. It is listed in every session in
   which the owner is signed in, and it does not count towards the limits of the project server.
5. A job runs on one server. In this version a tool takes input layers of that server only; the project
   server refuses another combination with status 422 and one sentence.
6. The project server validates the inputs of a job before it passes it on, and the own server validates
   them again. An own server runs only the processes that its own code offers.
7. The limits that come from the hardware of the project server (running jobs, size of a layer, space of
   a session, total space) do not apply to a job of an own server. That server applies the limits that
   its owner set.
8. The Earthdata token of the visitor travels with the task that starts a job. The own server keeps it
   in memory for that job only, and no message or file ever holds it.

## Pairing

The pairing follows the device authorization grant of OAuth 2.0 (RFC 8628).

| Step | Who | Request | Answer |
|---|---|---|---|
| 1 | Program | `POST /api/link/pairings` with a `Machine` | 200 `Pairing` |
| 2 | Program | Shows `user_code` and opens `verification_uri_complete` in the browser | |
| 3 | Interface | `GET /api/servers/pairings/{user_code}` | 200 `PairingView`; 404 when the code is unknown or no longer valid |
| 4 | Interface | Shows the code and the computer, and the visitor presses Connect: `POST /api/servers` with a `PairingConfirmation` | 201 `Server`; 401 when not signed in; 404 as above; 409 when the user has `MAX_USER_SERVERS` servers |
| 5 | Program | Every `interval` seconds: `POST /api/link/pairings/token` with a `PairingQuestion` | 400 `PairingRefusal` until step 4; then 200 `PairingKey`, once |

`verification_uri` is `https://lynkeus.nkua.cloud/?connect` and `verification_uri_complete` adds
`=WDJB-MJHT`. The interface opens the dialog of the servers when the address carries `connect`.
A `PairingKey` also carries `user`, the Earthdata user name of the owner, which the program shows on the
computer. The program keeps `server`, `key` and `user` in its settings file. The project server keeps the
SHA-256 digest of the key only.

The project server answers a question of step 5 with `authorization_pending` before the confirmation, with
`slow_down` when the question comes less than `interval` seconds after the last one that received another
answer, with `expired_token` when the device code names no pairing in progress, and with `access_denied`
when the owner removed the server before the program received its key. A server whose program does not ask
for its key while the codes are valid is removed. A request of the program whose body is not in its format
is answered with 422, at the pairing and afterwards, because 400 at the pairing carries a `PairingRefusal`.

A user code is one of 20 to the power 8 codes. A signed-in user who gives 5 codes that name no pairing
receives 429 at steps 3 and 4 until the oldest of them is 15 minutes old; RFC 8628, section 5.1, recommends
such a limit and gives this number. At most 1000 pairings are in progress, and step 1 is answered with 503
beyond that.

## Connection of a paired server

Every request carries the header `Authorization: Bearer <key>`. The answer 401 means that the owner
removed the server; the program then forgets the pairing and starts a new one.

| Request | Body | Answer |
|---|---|---|
| `POST /api/link/tasks?wait=25` | none | 200 `Tasks`, at once when tasks wait and otherwise after at most `wait` seconds (`MOST_WAIT`) with an empty list |
| `POST /api/link/report` | `Report` | 204 |
| `POST /api/link/tasks/{id}/done` | `Done` | 204; 404 when the task is unknown or already answered |
| `POST /api/link/tasks/{id}/bytes` | The bytes, `application/octet-stream`, with the header `Lynkeus-File-Size` (size of the whole file in bytes) | 204; 404 as above |
| `POST /api/link/tasks/{id}/failure` | `ReadFailure` | 204; 404 as above |

The program keeps one question for tasks open at all times and asks again as soon as it is answered.
It sends a report when it starts, whenever the state of a job changes (at most once a second) and at
least every `REPORT_PAUSE` seconds. A server counts as connected for `CONNECTED_TIME` seconds after its
last message. A report names a job until the project server has answered it with 204.

| Task | The own server | Answer |
|---|---|---|
| `start` | Records the job and starts it when a place is free | `done` |
| `dismiss` | Ends the job | `done` |
| `rename` | Changes the title in the description and in the STAC record | `done` |
| `remove` | Deletes the files of the layer | `done` |
| `read` | Sends at most `MOST_BYTES` bytes of a file | `bytes` or `failure`, within `READ_TIME` seconds |
| `limits` | Applies the limits and keeps them in its settings file | `done` |
| `forget` | Forgets the pairing; the files of the layers stay on the disk | `done` |

The description of a layer of an own server carries the addresses
`/api/servers/{server}/files/{layer}/{file}` in `url` and `record`.

The task `rename` leaves the GeoTIFF as it is, as the project server does for its own layers: writing the
file again would move its parts, and a map that is reading the file would receive wrong ones. The file keeps
the title of its creation in its tag `ImageDescription`.

A report may name a job that an earlier report already named: after a start of the program, its first
reports name every job of the pairing whose record it keeps. An answer `done` with `ok` false carries one
sentence for the visitor, for example when the storage of the server is full.

A server counts as connected from the answer that gives it its key. The project server holds the tasks of
a server in memory, at most 256 for one server, and gives each task once. It may give a task that asks for
the same thing as an earlier one, under another name: `dismiss` for a job that a report names and that the
record holds as dismissed or not at all, `remove` for the layer of such a job when the record holds no layer
of that name, and `limits` when a report states other limits than the owner set on the site. After the
owner removed a server, its next question for tasks within `CONNECTED_TIME` seconds receives `forget`, and
every other request with its key receives 401.

### A server that stops reporting

A job keeps its last state while its server is away, and it continues when the server reports again. The
project server records a job of an own server as failed, with one sentence, in three cases only.

| Case | Sentence |
|---|---|
| The server answers the task `start` with `ok` false | The sentence of the server |
| The project server was restarted before the server answered the task `start`. The tasks are held in memory only, because that task carries the Earthdata token | Lynkeus was restarted before your server took the job. Start the job again. |
| The server no longer knows the job: a report states that the server runs and holds no job (`running` and `waiting` are 0) and does not name the job, although the server had answered the task `start` before its previous report | Your server no longer holds this job. Start the job again. |

For the last case the program sends its reports one after the other, and it counts in `running` and
`waiting` every job that it has recorded and not finished. A task `start` that is not answered within 120
seconds counts as answered, so that the reports decide about its job.

## Addresses for the interface

| Request | Body | Answer |
|---|---|---|
| `GET /api/servers` | | 200 `Servers` |
| `PATCH /api/servers/{id}` | `ServerChange` | 200 `Server` |
| `DELETE /api/servers/{id}` | | 204; the records of its layers are removed and the server receives `forget` |
| `POST /api/processes/{name}/execution?server={id}` | as before | as before |
| `GET /api/servers/{id}/files/{layer}/{file}` | `Range` allowed | 200 or 206 with the bytes; 503 when the server is not connected; 504 when it does not answer in time |

The parameter `server` of an execution is the name of an own server, the word `project`, or absent. When
it is absent, the job goes to the connected own server of the visitor with the fewest unfinished jobs
that holds every input layer, and to the project server when there is none.

The state of a job (`statusInfo`) and every entry of `GET /api/layers` carry the member `server`: `null`
for the project server and otherwise a `ServerName`.

The jobs and the layers of an own server belong to its owner. `GET /api/jobs` and `GET /api/layers` list
them, with those of the session, in every session in which the owner is signed in, and no other visitor
reaches them. The addresses answer for an own server as follows.

| Request | Answer |
|---|---|
| `POST /api/processes/{name}/execution` | 404 when the visitor has no server of the name in `server`; 422 when the input layers are not all kept on the server of the job; 503 when that server is not connected; 429 when it has 100 jobs that wait or run; 507 when the record holds 1000 layers of it |
| `DELETE /api/jobs/{id}` | As before, at once. The server receives `dismiss`, unless it has not received the job yet |
| `PATCH /api/layers/{id}`, `DELETE /api/layers/{id}` | As before, after the server has answered the task `rename` or `remove`; 503 when the server is not connected; 504 when it does not answer within `READ_TIME` seconds; 409 with the sentence of the server when it answers with `ok` false |
| `PATCH /api/servers/{id}` | The name changes at once. The limits are recorded, and the server receives `limits` at once when it is connected and otherwise after its next report. `state.limits` shows the limits that the server applies |
| `GET /api/servers/{id}/files/{layer}/{file}` | 404 when the server keeps no such file; 416 when the range starts after the end of the file; 502 when the server could not read the file. A request for several ranges receives the whole file. When a part fails after the answer has begun, the answer ends before the length that it stated |

## Web servers

| Setting | Value | Reason |
|---|---|---|
| Body of a request under `/api/link/` | at most 1 megabyte | A part of a file holds at most `MOST_BYTES` bytes; the front web server takes 1 megabyte |
| Requests under `/api/link/` | a rate limit of their own, by address | An own server asks more often than a browser |
| Requests under `/api/servers/*/files/` | a rate limit of their own, by address | A map reads many parts of a file |
| Wait for tasks | at most 25 seconds | The web servers end a request without an answer after 60 seconds |

`web/nginx.conf` takes 60 requests a second from one address, with a burst of 240, under
`/api/servers/*/files/`. Under `/api/link/` it takes 150 a second, with a burst of 600, because an own
server makes two requests for every part that a map reads: it sends the part and asks for its next tasks.
At `POST /api/link/pairings`, which needs no key, it takes 6 requests a minute with a burst of 5. It passes
the bytes of a file on as they arrive and keeps none.

The front web server of the machine is not changed.

## Lynkeus Server on the computer

| | Windows | macOS | Linux |
|---|---|---|---|
| Data folder | `%LOCALAPPDATA%\Lynkeus` | `~/Library/Application Support/Lynkeus` | `$XDG_DATA_HOME/lynkeus`, by default `~/.local/share/lynkeus` |

The data folder holds the settings file (`settings.json`: server, key, user, limits), the record
(`lynkeus.sqlite3`), the folder `files` with the two files of every layer, the log of the program
(`log.txt`) and the file `lock`, which a running program holds so that a second one on the same folder is
refused. The program shows the code of the pairing, whether it is connected and to which Earthdata user,
the jobs that run and wait, the space used, and the commands Open Lynkeus, Open the data folder and Quit.
Started with `--no-window` it writes the same on the terminal, for a server without a screen. The options
`--server` and `--data-folder` give another project server and another data folder; an address that does
not start with `https://` is taken only when it names the computer itself, for tests.

### First limits

A new own server derives its first limits from the computer, and its owner changes them on the site.

| Limit | First value |
|---|---|
| Running jobs | One for every processor but one, which stays for the other programs of the computer, and at most as many as fit in half of the memory at 600 megabytes each (a job that writes a layer of the largest size holds about 510). Always from 1 to 64; 2 at most when the memory cannot be read |
| Storage | Half of the free space of the disk that holds the data folder |
| Size of a layer | 500 megabytes, as on the project server, or the storage when that is smaller |

The storage counts every layer in the data folder. The layers of an earlier pairing stay in the folder
`files` after the owner removed the server, and they count until the user of the computer deletes their
folders. The numbers of waiting jobs, of unfinished jobs and of layers have no limit on an own server.

### Ending a job

On Linux and macOS a job is ended as on the project server: its process group receives the signal SIGTERM,
and SIGKILL after 5 seconds. A job that waits for NASA Harmony cancels its request there on SIGTERM. Windows
has neither signal for a process. There the program sets an event of the job, on which a thread of the job
raises SIGTERM inside the job, so the request at Harmony is cancelled in the same way; after 5 seconds the
job is ended with `TerminateProcess`. When a job is ended without those 5 seconds, because the program or
the computer stopped at once, Harmony finishes the request and keeps its result until it expires.

### The downloads

| System | Download | Installation |
|---|---|---|
| Windows | `Lynkeus-Server-<version>-Windows.exe`, an installer made with Inno Setup | Asks for no administrator rights; installs for the present user and adds an entry to the start menu |
| macOS | `Lynkeus-Server-<version>-macOS.dmg`, which holds `Lynkeus Server.app` | The user drags the program to the folder Applications |
| Linux | `Lynkeus-Server-<version>-Linux.tar.gz` | The user unpacks the folder and starts `lynkeus-server` in it |

The files are built by the workflow `.github/workflows/server-program.yml` and attached to the release of a
version tag. The folder of the program on Windows also holds `lynkeus-server.exe`, which writes on the
terminal: a program with a window has no terminal on Windows. The files in `api/packing/` describe the
packing.
