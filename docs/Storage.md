# Storage

What Lynkeus keeps, where, for how long, and how the visitor sees and removes it. This document is the
rule; the code, the pane Storage and the dialog About follow it, and tests compare their numbers and
sentences with the constants of the code.

## Terms

| Term | Meaning |
|---|---|
| Browser storage | The local storage that a browser keeps for the site on one device. |
| Account | An Earthdata user. The project server knows an account by its Earthdata user name. |
| Session | The link of one browser to the project server. A cookie holds its key. |
| Token | The Earthdata user token with which the visitor signs in. |
| Keeping time | 14 days (`KEEP_TIME`). The one duration of this document. |

## Principles

1. Each place has one role. The browser keeps the arrangement of the page. The project server is the
   temporary working store of an account. A computer of the visitor holds the permanent copies: the
   files that he downloads, and the layers of Lynkeus Server. The memory of the web service holds the token.
2. A layer, a series and a job on the project server belong to an account and not to a browser, as the
   layers of an own server already do. They are listed in every browser that is signed in to the account.
3. One duration. A layer or a series is kept until the keeping time after it was made or last extended,
   and it states that moment. A session ends after the keeping time without use. Whatever the project
   server still keeps can therefore be reached from the browser that made it without a new sign-in,
   unless the visitor signed out there.
4. The token is held in memory only, for at most 8 hours and for 30 minutes without use. Its loss ends
   no session and removes nothing. The visitor stays signed in to the account, and the token is asked
   again at the moment at which a request to NASA needs it; the request then continues by itself.
5. Nothing is made for a visitor who does not sign in: no session, no cookie and no record.
6. The browser, the project server and the sign-in never disagree silently. For what exists, the list of
   the server is the truth. Every layer that the browser has stored for the map has one stated state
   (see "States of a stored layer"), and every state other than "ready" has one sentence and one action.
7. The visitor sees everything that is kept for him, with its size and its date, in one pane, and
   removes each part there.
8. Every duration and limit that the interface states is read from `GET /api/limits`. None is typed.
9. The web service never fills the disk. It reads the free space of its data folder before a job starts
   and while the job writes, and it keeps a reserve free.
10. The file of a layer is read by whoever holds its address, without a sign-in, until the layer is
    removed. The address holds 32 random characters. The interface says so where it gives the address,
    and the web server of Lynkeus does not write the random part in its log.

## Sign-in states

| State | `GET /api/session` | What works |
|---|---|---|
| Not signed in | `{"earthdata": null}`, and no cookie is set | The map, the search and everything else that needs no account. |
| Signed in, token held | `{"earthdata": {"user": "<name>", "token": true}}` | Everything. |
| Signed in, token not held | `{"earthdata": {"user": "<name>", "token": false}}` | Everything except a request to NASA: the lists, the files, renaming, removing, extending, the analysis tools on layers that exist, and the servers of the account. |

A session is made by a sign-in and by nothing else. A request that carries an unknown or ended key is
answered as "not signed in", and the answer removes the cookie. A request that needs the token while it
is not held is answered with 401 and one sentence; the interface opens the sign-in with that sentence and
repeats the request after the sign-in. Sign out forgets the token, ends the session and removes the
cookie; what the account keeps on the project server stays until its date. A sign-in as another account in
the same browser ends the link to the first.

## Project server

- `sessions` records the account of a session. `layers`, `series` and `jobs` record their owner, the
  account of the session that started the job.
- The limits of a session become the limits of an account: layers, series, total size and unfinished jobs.
- Every layer and series has the moment until which it is kept. Extending sets it to the present moment
  plus the keeping time. A removal run takes place every 5 minutes; it removes what has passed its
  moment, with the files and the record of the job. The record of a failed or dismissed job is removed
  after the keeping time.
- A record file of an earlier version is brought to the new one without loss. What a session without an
  account owns (made before this version) stays with that session, is kept for the keeping time from the
  moment of the change, and passes to the account at the next sign-in of that session.
- The released program Lynkeus Server (v0.1.0) keeps working with the new project server: the addresses
  under `/api/link/` and their formats do not change.

### Addresses

| Address | Change |
|---|---|
| `GET /api/session` | Answers as in "Sign-in states". Makes no session. |
| `POST /api/session/earthdata` | Makes the session when there is none, records the account, and gives the content of a session without an account to it. |
| `DELETE /api/session/earthdata` | Forgets the token, ends the session and removes the cookie. |
| `GET /api/layers` | Each entry gains `kept_until` (date-time of RFC 3339 in UTC; `null` for a layer of an own server) and `source` (`{"process": "<id>", "inputs": {...}}`, the request that made the layer, or `null` when it is not known). |
| `GET /api/series` | Each entry gains `kept_until`. |
| `POST /api/layers/{name}/extension`, `POST /api/series/{name}/extension` | Keep the layer or the series for the keeping time from now. Answer: the entry. |
| `POST /api/storage/extension` | The same for everything of the account. Answer: 204. |
| `DELETE /api/storage` | End the jobs of the account and remove its layers, series and job records from the project server. The servers of the account and their layers are not touched. Answer: 204. |
| `GET /api/limits` | `limits` names `account_layers`, `account_series`, `account_size` and `account_unfinished_jobs` in the place of the four `session_...` fields, and gains `keep_time` and `free_space_reserve`. `session_idle_time` equals `keep_time`. `resources` gains `free_space`. |
| `POST /api/processes/{name}/execution` | 507 with one sentence when the job would leave less than the reserve free. 401 with one sentence when the process needs the token and it is not held. |

## States of a stored layer

The browser stores, with each layer of the map, the account that owns it and its `source`. When the page
opens, when the sign-in changes and when the list of the server changes, each stored layer has one state.

| State | When | What the Contents pane shows |
|---|---|---|
| Ready | The list of the server holds the layer, and its file answers. | The layer, drawn. |
| Waits for the sign-in | The browser is not signed in to the account of the layer. | The layer is not drawn. One notice over the list names the account and the number of such layers, with the command Sign in. After the sign-in to that account the layers return as they were arranged. Signed in to another account, the notice names the first account and offers to remove its layers from this browser. |
| Removed from the server | The browser is signed in to the account, and the list of the server does not hold the layer. | The layer is not drawn. Its row says that the project server removed it after the keeping time, or that it was removed elsewhere. A received layer offers Get again, which sends its `source` again and gives the new layer the place and the display of the old one. A result names its tool and its inputs. Both offer Remove from the map. |
| Server not connected | The layer is kept by a server of the visitor that is not connected or does not answer. | The sentence of today, with Try again. |
| No answer | The project server does not answer. | One sentence. The page tries again by itself. |

A layer is never drawn in a state other than Ready, and no state is shown as an error of the map.

Further rules of the interface:

- The Catalog shows "Kept until <date>" for each layer and series of the project server, with the
  command Keep 14 more days (the number is read from the limits). Three days before the moment the row
  carries a warning, and the page says once per opening how many layers and series are removed within
  three days, with Keep all and the reminder to download.
- The title bar shows the account in both signed-in states. Its menu says whether the token is held.
- Sign out explains what stays where, and offers to clear also what this browser keeps, for a shared
  computer.
- Two windows of one browser: a change of the browser storage in one window reaches the other.

## Pane Storage

One pane, opened from Options > Storage, with four sections. Each row gives what is kept, its size where
it has one, until when, and the command that removes it.

| Section | Rows |
|---|---|
| This browser | The parts of the browser storage with their switches (as today), the cookie of the session, the cache of the browser. |
| Project server | The account. Layers, series and total size against the limits of the account. The next removal. Keep all. Remove everything of mine from the project server. The token and how long it is held. The log. |
| Your servers | Each server of the account with its layers and its space, and the folder of Lynkeus Server on that computer. Without a server, one sentence on what a server is for. |
| NASA and other services | What Harmony, the catalogue, the basemap services and GitHub receive. |

Not signed in, the section Project server says that nothing is kept for the visitor.

## What is kept

The pane Storage and the dialog About copy these statements.

| Place | Statement |
|---|---|
| Browser | The page keeps in the local storage of the browser the parts of the work that the user lets it keep. The stored copies stay in this browser and are not sent to the server. |
| Cookie | The server sets one cookie when the visitor signs in to Earthdata. It holds a random key that names the session, and it ends after the keeping time without use or at Sign out. A visitor who does not sign in receives no cookie. |
| Token | The Earthdata user token is held in the memory of the web service only. It is never stored in the browser and never written to a disk. |
| Project server | The project server keeps the layers, the series and the jobs of an Earthdata account, under its user name, until the date that each one states. |
| Files | The file of a layer is read by whoever holds its address, until the layer is removed. |
| Log | The web server of Lynkeus writes each request in its log, except the requests to the counter of visits: the address of the visitor, the time, the request, the page that led to it and the name of the browser. It leaves out the random part of the address of a layer file, and it keeps at most 30 megabytes of log. The front web server of the machine, which Lynkeus shares with other sites, writes the same requests in a log of its own. |
| Your computer | A file that you download is yours alone. Lynkeus Server keeps its layers, its record, its settings and its log in one folder of your computer, and the token in memory for one job. |
| NASA | NASA Harmony makes the clipped file of a layer in your name and keeps it for 30 days. The catalogue of NASA receives each search from the project server. NASA GIBS and OpenStreetMap receive the requests of your browser for the images of the basemaps. |

## Backup

The record file of the project server is copied once a day, and 14 copies are kept. The files of the
layers are not copied, because a layer can be requested from NASA again.
