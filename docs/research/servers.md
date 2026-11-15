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
