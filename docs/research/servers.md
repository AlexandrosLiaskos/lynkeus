# Research note: own servers

This note records the sources read and the checks made before the connection of own servers
(`docs/Own_Servers.md`) was built, what each one decided, and what could not be confirmed.
Everything was read or measured on 15 November 2026.

## Sources

| Subject | Source | What it states | What it decided |
|---|---|---|---|
| Pairing a program with a signed-in user | RFC 8628, OAuth 2.0 Device Authorization Grant ([rfc-editor.org](https://www.rfc-editor.org/rfc/rfc8628.txt)), sections 3.1 to 3.5 | The device receives a device code, a user code and a verification address; an address that already carries the code is allowed; the server should show the code and ask the user to confirm that it matches the one on the device; the device asks at an interval until the user has confirmed | The steps and the field names of the pairing |
| Running jobs on a machine of the user | GitHub self-hosted runners ([community discussion 26630](https://github.com/orgs/community/discussions/26630)) | The runner connects to GitHub over HTTPS on port 443 with a long poll of 50 seconds; no inbound connection is needed | The own server opens every connection; long polling |
| Connecting a personal computer to a science service | Globus Connect Personal ([Stanford Globus pages](https://globus.stanford.edu/scenarios.html)) | The program needs no public address and works behind a firewall or a home router, as long as it can open connections outwards | The same |
| A page of the site reading from a program on the same computer | Chrome, Local Network Access ([Chrome for Developers](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access)) | Since Chrome 142 a public site needs a permission of the user, asked in a prompt, to reach an address of the same computer (`127.0.0.1`) | The browser does not read from the own server directly; the bytes of a layer pass through the project server |

Not read: the page of GitHub Docs on the communication of self-hosted runners itself (its content was
read as quoted by others), the firewall page of the Globus documentation, and the rules of Firefox and
Safari for requests to the same computer. The 20 letters of a user code (RFC 8628, section 6.1) were
written from memory and not read again.

## Checks on the servers

| Check | Result |
|---|---|
| Front web server of the machine (nginx 1.27.5), site `lynkeus.nkua.cloud` | No setting for the size of a body, so the default of 1 megabyte applies; no setting for the wait, so the default of 60 seconds applies; no headers for WebSocket |
| Web server of Lynkeus (`web/nginx.conf`), `/api/` | Body at most 64 kilobytes; 120 requests a minute for each address; wait of 60 seconds |
| Requests from a Windows computer to `/api/health` over one kept connection | 0.06 seconds each (median of 9); the connection was still usable after 70 seconds without a request |
| Download from the site to that computer | At least 43 megabits a second (one file of 1.4 megabytes, too small for a firm value) |

Not measured: the upload speed from an own server to the project server, which limits how fast a map
reads a layer of that server. No address of the site takes a large body yet.

## Checks of the packed program

The server was packed with PyInstaller 6.22.3 on Windows 11 (build 26200) with Python 3.13.18 and rasterio 1.5.2
(GDAL 3.12.2), from commit 7234560.

| Check | Result |
|---|---|
| Packing without options for rasterio | The program stops: the module `rasterio.serde` and the data files of GDAL are missing |
| Packing with `--collect-all rasterio` | The program builds the web service and, in a newly started process, writes a Cloud Optimized GeoTIFF (tiles of 512 cells, two overviews, DEFLATE) whose values read back identical. The values were generated numbers |
| One file (75.6 megabytes) | 23 to 28 seconds to start |
| Folder (196 megabytes, 3092 files) | 4 to 8 seconds to start |

Not confirmed:

1. Inside the sandbox in which the check ran, the packed program could not write into a folder made by
   `tempfile.mkdtemp`, while the same code run by the Python interpreter could. `lynkeus.harmony` makes
   such a folder (`tempfile.TemporaryDirectory`) when it receives a layer. Whether this happens on a
   normal Windows desktop is not known.
2. The same sandbox refuses named pipes, through which a job reports to the server
   (`multiprocessing.Pipe`), so no job of the packed program was run through `lynkeus.jobs`.
3. On Windows a job is ended with `terminate`, without the signal with which `lynkeus.harmony` cancels
   its request at NASA Harmony. Whether Harmony then keeps working on the request was not checked.
4. Nothing was packed or run on macOS or on Linux.
5. A program without a signature of its publisher brings a warning of the system when it is first
   opened on Windows and on macOS. The wording of the warning was not looked at.

Items 1 to 4 were answered when the program was built. The next part records how.

## The program Lynkeus Server

The program (`lynkeus.link`, `lynkeus.computer`, `lynkeus.ownserver`, `api/packing/`) was built and checked
on 15 November 2026.

### Sources

| Subject | Source | What it states | What it decided |
|---|---|---|---|
| The folder of the file that Harmony hands over | Python documentation, `os.mkdir` and What's New in Python 3.13 ([docs.python.org](https://docs.python.org/3/library/os.html)) | Since Python 3.13, a folder made with the mode `0o700` on Windows may be used by the present user and by administrators only; `tempfile.mkdtemp` makes its folders with that mode | `lynkeus.harmony` makes the folder with `Path.mkdir`, which gives it the permissions of the folder of the layer. This explains item 1 above: a program that runs with reduced rights inside a sandbox is not the present user for Windows |
| Jobs in a packed program | PyInstaller 6.22.3, Common Issues and Pitfalls ([pyinstaller.org](https://pyinstaller.org/en/stable/common-issues-and-pitfalls.html)) | A packed program that starts processes with `multiprocessing` must call `multiprocessing.freeze_support()` first; without it the program starts itself again without end | The start of the packed program (`api/packing/lynkeus_server.py`) calls it before anything else |
| An installer without administrator rights | Inno Setup help, `[Setup]: PrivilegesRequired` ([jrsoftware.org](https://jrsoftware.org/ishelp/topic_setup_privilegesrequired.htm)) | With the value `lowest` the installer never asks for administrator rights and installs for the present user | `PrivilegesRequired=lowest`, with the program in `%LOCALAPPDATA%\Programs\Lynkeus Server` |
| The requests of the client of Harmony | Code of harmony-py 1.8.0 as installed (`harmony/client.py`, `harmony/auth.py`) | A job is cancelled with `GET /jobs/{id}/cancel`. The request that submits a job is prepared by the library and sent with `Session.send`. `download` makes a folder of its own with `tempfile.TemporaryDirectory` beside the file that it writes | The stand-in for Harmony on the network (`api/tests/nasaweb.py`). `lynkeus.harmony` sets the certificate file of the environment on the session of the client, see the checks. The folder of the library itself cannot be changed by Lynkeus |
| The pages of the catalogue | Code of earthaccess 0.19.0 as installed (`earthaccess/utils/_search.py`) | The records are asked for page by page, with the header `cmr-search-after`, until a page is empty | The stand-in for the catalogue on the network |

Not read: the documentation of Microsoft on signals in a program for Windows (`signal`, `raise`), and the
documentation of Python on `signal.raise_signal`. That a thread of a job can raise SIGTERM inside the job on
Windows, and that the handler of `lynkeus.harmony` then runs, rests on the check on Windows below and not
on a source. The rules of Windows SmartScreen and of macOS Gatekeeper for a program without a signature
were not read.

### Checks

The whole program was checked by its journey (`api/tests/journey.py`): the program is started in a
process of its own against a stand-in for the project server (`api/tests/project.py`), which reads every
message with the formats of `lynkeus.linking`, and against a stand-in for NASA's catalogue and for NASA
Harmony on the network (`api/tests/nasaweb.py`). The program is paired; a job of `get-layer` receives a
layer and its states are reported; the two files of the layer are read back through tasks, and are a valid
Cloud Optimized GeoTIFF with the values handed over and a valid STAC record; the layer is renamed; the
limits are changed; a second job is dismissed while it waits for Harmony; and the pairing is forgotten.
The file that the stand-in for Harmony hands over is `gcov-hhhh-20261021.tif` of `api/tests/data/layers`,
which NASA Harmony returned for a real NISAR product. No check received a layer from NASA itself, which
needs the Earthdata token of a person.

| Check | Result |
|---|---|
| Journey with the interpreter (`python -m lynkeus.ownserver --no-window`), container `python:3.13-slim` (Debian 13) on the project server | Passed. It is also a test of the automatic checks |
| Journey with the program packed in that container | Passed: the program asked for a pairing 1.1 seconds after its start, the layer was reported 9.0 seconds after the task, and the request at Harmony was cancelled 0.2 seconds after the task that dismissed the job |
| First run of the journey on Windows (packed program, GitHub runner) | The first job stayed in the state running after its layer was written. The server had set an event to ask the job to end, and an event waits for every thread that waits on it: the job had ended by itself. A semaphore, which never waits, replaced the event (`lynkeus.jobs`) |
| First run of the journey with the stand-in for NASA | The request that submits a job was refused with an unknown authority while every other request passed: `requests` reads `REQUESTS_CA_BUNDLE` only for a request that it prepares itself. On a network whose proxy shows certificates of its own authority the same would happen, so `lynkeus.harmony` sets the file on the session of the client |

The workflow `.github/workflows/server-program.yml` packed the program on three GitHub runners, installed
or unpacked each download as a visitor does, and ran the journey with the packed program, with
`--no-window` and then, as far as the first report, with the window (run 43700076118, commit 1aae886).

| | Windows | macOS | Linux |
|---|---|---|---|
| Runner | `windows-latest` (Windows Server 2025) | `macos-latest` (macOS 26.7.2) | `ubuntu-latest` (Ubuntu 26.04.1) |
| Download | Installer, 83.3 megabytes | Disk image, 90.7 megabytes | `.tar.gz`, 121.9 megabytes |
| Folder of the program | 221 megabytes, 4101 files | 158 megabytes, 2650 files | 300 megabytes, 2799 files |
| Start, to the request for a pairing | 1.4 seconds; 1.7 with the window | 1.9 seconds; 3.6 with the window | 0.7 seconds; 0.9 with the window |
| Job, from its task to the report of its layer | 8.0 seconds | 8.8 seconds | 8.0 seconds |
| Dismissed job, from its task to the request that cancels it at the stand-in for Harmony | 0.8 seconds | 1.1 seconds | 1.0 seconds |

On Windows the request at Harmony is therefore cancelled when a job is dismissed (item 3 above), a job of
the packed program runs through `lynkeus.jobs` (item 2), and the packed program receives a layer although
harmony-py makes a folder with `tempfile` (item 1). The program was packed and run on macOS and on Linux
(item 4).

### Not confirmed

1. No layer was received from NASA by the program: every job of the checks spoke to the stand-ins.
2. The program was not run on a desktop computer of a person. On the runners the window was opened but
   not looked at: the check shows that the program with the window starts, is paired and reports. Its
   buttons, the question before quitting while jobs run, and the opening of the browser were not pressed
   or seen.
3. The download for macOS is for the processor type of the runner (Apple silicon). No download for a Mac
   with an Intel processor was made.
4. The download for Linux was packed on Ubuntu 26.04 and run there and, packed apart, on Debian 13. Which
   older systems run it is not known: a packed program needs the C library of the system on which it was
   packed, or a newer one.
5. The downloads carry no signature of a publisher (item 5 above). What Windows and macOS show when such a
   program is first opened was not looked at.
6. No request of the program reached the project server itself: the checks used the stand-in, over HTTP on
   the same computer, and one test checks the certificate of an HTTPS stand-in. The program was not run
   behind a proxy of an institution either. It uses the proxy that the system or the environment names
   (`urllib.request.getproxies`), which no check exercised for the project server.
7. On Windows a job that is ended does not end a program that it started, because there are no process
   groups. No process of Lynkeus starts another program at present.
8. When the program is ended at once by the system (not by Quit or by a signal), its running jobs go on
   until they finish, and they are recorded as interrupted at the next start. This was not checked.
