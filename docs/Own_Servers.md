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
The program keeps `server` and `key` in its settings file. The project server keeps the SHA-256 digest
of the key only.

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
| `rename` | Changes the title in the description and in the two files | `done` |
| `remove` | Deletes the files of the layer | `done` |
| `read` | Sends at most `MOST_BYTES` bytes of a file | `bytes` or `failure`, within `READ_TIME` seconds |
| `limits` | Applies the limits and keeps them in its settings file | `done` |
| `forget` | Forgets the pairing; the files of the layers stay on the disk | `done` |

The description of a layer of an own server carries the addresses
`/api/servers/{server}/files/{layer}/{file}` in `url` and `record`.

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

## Web servers

| Setting | Value | Reason |
|---|---|---|
| Body of a request under `/api/link/` | at most 1 megabyte | A part of a file holds at most `MOST_BYTES` bytes; the front web server takes 1 megabyte |
| Requests under `/api/link/` | a rate limit of their own, by address | An own server asks more often than a browser |
| Requests under `/api/servers/*/files/` | a rate limit of their own, by address | A map reads many parts of a file |
| Wait for tasks | at most 25 seconds | The web servers end a request without an answer after 60 seconds |

The front web server of the machine is not changed.

## Lynkeus Server on the computer

| | Windows | macOS | Linux |
|---|---|---|---|
| Data folder | `%LOCALAPPDATA%\Lynkeus` | `~/Library/Application Support/Lynkeus` | `$XDG_DATA_HOME/lynkeus`, by default `~/.local/share/lynkeus` |

The data folder holds the settings file (`settings.json`: server, key, limits), the record
(`lynkeus.sqlite3`) and the folder `files` with the two files of every layer. The program shows the
code of the pairing, whether it is connected, and the commands Open Lynkeus, Open the data folder and
Quit. Started with `--no-window` it writes the same on the terminal, for a server without a screen.
