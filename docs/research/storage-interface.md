# Research note: states of the sign-in and of the stored layers

This note records how the interface keeps the browser, the project server and the sign-in from disagreeing. The
rule is [docs/Storage.md](../Storage.md), sections "Sign-in states" and "States of a stored layer". For each case
the note gives the state in which the case ends, the one sentence that the visitor reads and the one command that
is offered. The tests named in each section follow the tables: a sentence that changes in the code without the
table, or in the table without the code, fails a test.

## Sources

Read on 15 November 2026.

- [S1] Lynkeus, Storage, `docs/Storage.md`: the rule that this part of the interface follows.
- [S2] MDN Web Docs, Window: storage event. https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event
  The event fires in the other documents that share the storage area, and not in the window that made the
  change. Its `key` is null when the storage was cleared.
- [S3] Lynkeus, Own servers, `docs/Own_Servers.md`: the answers 401, 503 and 504 for the file of a layer that a
  server of the visitor keeps. Their sentences are those of `web/src/contents/fileProblem.ts` and did not change.

## Sign-in states

The page reads `GET /api/session` when it loads, when its tab is shown again and when its window takes the
focus. The store of the session (`web/src/data/session.ts`) tells three states apart, as [S1] does. An answer
of the older server, without `token`, counts as "token held".

| State | Answer of the server | Title bar | Menu of the account | Pane Sign in to Earthdata |
|---|---|---|---|---|
| Not signed in | `{"earthdata": null}` | Earthdata: not signed in | No menu. A press opens the pane. | The three steps and the field for the token. |
| Signed in, token held | `{"earthdata": {"user": "a_user", "token": true}}` | Earthdata: a_user | The project server holds your token and requests data from NASA in your name. | You are signed in to Earthdata as a_user. The project server forgets your token when you sign out, after 30 minutes without use and after 8 hours, and asks for it again when a request to NASA needs it. |
| Signed in, token not held | `{"earthdata": {"user": "a_user", "token": false}}` | Earthdata: a_user | The project server does not hold your token now and asks for it when a request to NASA needs it; everything else works without it. | You are signed in to Earthdata as a_user. The project server does not hold your token now. Give a user token to request data from NASA. |

Choices of Lynkeus:

- The loss of the token is reported nowhere as an end of the sign-in. The message "Your sign-in to Earthdata has
  ended. Sign in again to continue." is shown only when a reading finds that the session itself is gone.
- An answer 401 to any request is not taken as "signed out". The page reads the session again, and the answer of
  the server says which of the two states holds.
- The lists of jobs, of layers and of series belong to the account. When the account of the sign-in changes
  (sign-in, sign-out, sign-in to another account), the three lists are forgotten at once and read again. A list
  that was asked for under another sign-in is dropped when it arrives. The loss of the token changes no account.
- The two typed times of the pane (30 minutes and 8 hours) are the constants that the pane already compared with
  `api/src/lynkeus/sessions.py`; they are not new. The track of the pane Storage moves them to `GET /api/limits`.

Tests: `web/src/data/session.test.ts`, `EarthdataAccount.test.tsx`, `SignInPane.test.tsx`, `follow.test.ts`,
`layers.test.ts`.

## A request that needs the token

| Case | What happens | State in which it ends |
|---|---|---|
| A start of a job (Get layer, an analysis tool, a series, Run again, Get again), on the project server or on a server of the visitor, is answered 401. | The pane of the sign-in opens with the sentence of the server and "The request continues by itself after the sign-in." The form of the tool shows that it is starting the job. | After the sign-in the same request is sent again, once, with the same content, and the job starts. The visitor types nothing twice. |
| Any other request that changes something (POST, PATCH, DELETE) is answered 401. | The same. | The same. |
| The visitor closes the pane of the sign-in, or signs out, while the request waits. | The request is given up (`SignInCancelled`, with the sentence of the server). | The forms of Get layer, of the analysis tools and of the series are as they were before the run, without an error. Get again leaves its row as it was. |
| The request is answered 401 again after the sign-in. | It does not wait a second time. | The sentence of the server is shown as the refusal of the request. |
| A reading (GET) is answered 401. | It does not wait and opens no pane. The session is read again. | The page shows the state that the server answers, and reads its lists again when the account changes. |
| Several requests are answered 401 at the same time. | They wait for one sign-in. The pane shows the sentence of the first. | All of them are sent again after the sign-in. |

Choice of Lynkeus: the waiting is built into the one function that sends the requests of the Data tab (`call` in
`web/src/data/service.ts`), so that every start of a job has it without code of its own. Only a request that
changes something waits, because a reading is repeated by the page itself and must not open a pane when the
page loads.

Tests: `web/src/data/service.test.ts`, `session.test.ts`, `SignInPane.test.tsx`, `DataDialogs.test.tsx`,
`GetLayerPane.test.tsx`, `web/src/analysis/ToolForm.test.tsx`, `SeriesForm.test.tsx`.

## Cases of a stored layer

The browser stores, with each layer of the map, the account that owns it and the request that made it
(`source`). A map that was stored in the older form, without accounts, is still read; such a layer counts as a
layer of the account of the sign-in. The state of each stored layer is computed again when the page opens, at
every change of the sign-in, of the list of the server and of the servers of the visitor (`stateOf` in
`web/src/contents/kept.ts`). Only a layer that is ready is in the store of the map, so no other part of the page
draws or offers a layer in another state. The test `web/src/contents/kept.test.ts` brings about each row of
this table and compares the state, the sentence and the command with it.

| Case | State | What the Contents pane says | Command |
|---|---|---|---|
| The visitor is signed in to the account of the layer, and the list of the server holds the layer. | Ready | Nothing: the layer is drawn. | None |
| The visitor is signed in and the server no longer holds the token. | Ready | Nothing: the layer is drawn. | None |
| The visitor comes back after the session has ended, or has signed out: the browser has kept two layers and nobody is signed in. | Waits for the sign-in | 2 layers of this map belong to the Earthdata account a_user and are not shown. Sign in to that account to show them again. | Sign in |
| The visitor is signed in to another account than the one of the two kept layers. | Waits for the sign-in | 2 layers of this map belong to the Earthdata account a_user, and you are signed in as b_user. They are shown again after a sign-in as a_user. | Remove from this browser |
| The map was stored in the older form, without accounts, and nobody is signed in. | Waits for the sign-in | 1 layer of this map was stored without the name of its Earthdata account and is not shown. Sign in to Earthdata to show it again. | Sign in |
| The map was stored in the older form, without accounts, and the list of the account of the sign-in holds the layer. | Ready | Nothing: the layer is drawn. | None |
| The list of the server does not hold a received layer whose request the browser has kept. | Removed from the server | The project server no longer keeps this layer: it removed the layer after the keeping time, or the layer was removed elsewhere. Get again requests it from NASA with the same choices and gives it this place. | Get again |
| The list of the server does not hold a received layer whose request is not known. | Removed from the server | The project server no longer keeps this layer: it removed the layer after the keeping time, or the layer was removed elsewhere. Request it again with Get layer, in the Data tab. | Remove from the map |
| The list of the server does not hold a result, and holds its two input layers. | Removed from the server | The project server no longer keeps this result: it removed the result after the keeping time, or the result was removed elsewhere. The tool Backscatter, Change made it from the layers "Backscatter HH, 21 Oct 2026" and "Backscatter HH, 2 Nov 2026". | Remove from the map |
| The list of the server holds neither a result nor its input layers. | Removed from the server | The project server no longer keeps this result: it removed the result after the keeping time, or the result was removed elsewhere. The tool Backscatter, Change made it from the product files first.h5 and second.h5. | Remove from the map |
| A removed layer was requested again with Get again, and its job runs. | Removed from the server | This layer was requested again, and its job is running. The new layer takes this place when the job ends. | None |
| The list of the server does not hold a layer that a server of the visitor kept. | Removed from the server | Your server "Office computer" no longer keeps this layer: the layer was removed elsewhere. Get again requests it from NASA with the same choices and gives it this place. | Get again |
| A server of the visitor that is not connected keeps the layer. | Server not connected | Your server "Laboratory server", which keeps this layer, is not connected. Start Lynkeus Server on that computer and try again. | Try again |
| The project server does not answer about the sign-in. | No answer | The project server does not answer, so 2 layers of this map are not shown. The page asks again by itself. | None |
| The visitor is signed in, and the project server does not answer about the list of layers. | No answer | The project server does not answer, so 1 layer of this map is not shown. The page asks again by itself. | None |
| The page has opened, and the project server has not yet answered about the sign-in or about the list. | Not known yet | Nothing: the layer is not drawn, and nothing is said until the first answers arrive. | None |

Where the sentences stand: one notice over the list of the Contents pane for the layers of each account that
wait for the sign-in, and one for the layers about which the project server does not answer; a row at the place
of the layer for a layer that the server removed; and the sentence of the file under the row of a layer whose
server is not connected, as before this change [S3].

Choices of Lynkeus:

- After the sign-in to their account the layers return in their order, each with its display. The browser keeps
  the display of a layer that is not drawn with the layer.
- Get again sends `source` through the function that starts every job, so it waits for the sign-in when the
  server needs the token. The job is recorded with the removed layer in the browser. When the job ends, the new
  layer takes the place, the order and the display of the removed one, also when the page was loaded again in
  between. A job that failed, was cancelled or is no longer listed lets the row offer Get again once more.
- A result names its tool by the title of its method sheet, and its inputs by the names of its input layers when
  the page knows all of them, and otherwise by the product files that the result itself states.
- A layer that passes its date while the page is open: the list of the server is read again every five minutes
  while the page is shown and the browser keeps a layer, and when the page is shown again. A file that answers
  that it no longer exists is taken to the list first. In both ways the layer goes to "Removed from the server"
  without an error message of the map. A file that is gone while the list still holds its layer states the
  problem of the file, as before.
- Before the first answers the layers are not drawn and nothing is said, so that no layer is drawn and taken
  away again. A layer that is on the map stays on it while the list of a new sign-in is on its way.
- While the project server does not answer, the page asks again by itself: after 5 seconds, then after twice the
  time each turn, up to 60 seconds, and only while the page is shown.
- The sentence about a removed layer does not tell the two reasons apart, because the list of the server tells
  only that the layer is gone. The date until which a layer is kept is shown by the Catalog pane (track of the
  pane Storage).

## Sign out

The commands Sign out of the ribbon, of the title bar and of the pane of the sign-in open one dialog, and nothing
is sent before the visitor confirms. The dialog says: "The layers, the series and the jobs of the account
a_user stay on the project server for this account until the date that each one states. Jobs that were already
started go on." and "The layers of the map of this browser are not shown after the sign-out. They return, in
their order and with their display, at the next sign-in to this account." A box, "Also remove what this browser
keeps", is for a shared computer: after the sign-out the layers that the page holds and every stored part are
removed, and the page is loaded anew. After Sign out no layer of the account is drawn: every one of them waits
for the sign-in.

Choice of Lynkeus: the page is loaded anew after the removal, because a page that stays open would store its
parts again at their next change. The empty map is stored before the storage is cleared, so that another window
of the same browser empties its map as well.

Tests: `web/src/data/SignOutDialog.test.tsx`, `web/src/contents/kept.test.ts`.

## Two windows of one browser

| Case | State in which it ends |
|---|---|
| A window changes the layers of the map (adds, removes, moves a layer, changes a display). | The other window receives the stored map [S2], checks it as every stored value and takes it. Each layer then has its state in that window. |
| The second window changes the map afterwards. | It stores the map that it has taken with its own change, so the change of the first window is not lost. |
| A window takes in the map of the other one. | It writes nothing while it takes the map in, and it does not write a text that the storage already holds. The two windows cannot answer each other without end. |
| A window changes the options of the storage, or removes every stored copy. | The other window follows the options at once and stores nothing that the options forbid. Its page stays as it is. |
| A window signs out or signs in. | The cookie of the session is one for the browser. The other window reads the session when its tab is shown or its window takes the focus, and at the first answer 401. |
| A window was opened by a shared link. | The link wins over the stored state, as before: the view, the basemap and the area are parts of their window and are not taken from another window. |

Choice of Lynkeus: only a part that is one state of the browser is shared between the windows (`shared` of
`keepInBrowser`). The layers of the map are such a part, because they are bound to the account and to the list
of the server. The view of the map, the area, the search and the arrangement of the panes belong to their
window: two windows may show two places, and the window that changed such a part last stores it.

Tests: `web/src/shared/storage/storage.test.ts`, `web/src/contents/storedLayers.test.ts`.

## Not confirmed

- Nothing of this note was tried in a browser. The tests run in a simulated browser (happy-dom), which sends no
  `storage` event between two windows by itself; the tests send the event that [S2] describes.
- The web service of `docs/Storage.md` did not exist when this part was written. The tests use stand-ins that
  answer in the formats of that document: `token` in the answer about the session, `source` in an entry of the
  list of layers, and the answer 401 with one sentence.
- Whether the server answers the lists of a visitor who is not signed in with an empty list or with 401. The
  interface accepts both: a reading that is answered 401 opens no pane.
- The look of the notices and of the row of a removed layer at the width of the Contents pane, and the focus
  after the dialog of Sign out closes.
