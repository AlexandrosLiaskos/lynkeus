# Contributing

Contributions are welcome through pull requests. The branch `main` receives a change only through a
pull request whose checks have passed.

## Code

- Python follows PEP 8. Ruff formats and checks the code; its settings are in `api/pyproject.toml`.
- Every function carries type annotations, which mypy verifies in strict mode, and a documentation
  string in the numpydoc form. A function that computes a scientific result also documents its
  parameters and its results, with their units.
- TypeScript is compiled in strict mode. Prettier formats the code and ESLint checks it; their
  settings are in `web/`.
- Every function that computes a result has a test.
- Every input is validated, every warning of a checker counts as an error, and no outside program
  is added for what the language already provides.

Run the checks listed in [README.md](README.md) before opening a pull request.

## Parts

The code has three parts, and each folder belongs to one of them.

| Part | Folders |
|---|---|
| Map | `web/src/map/`, `web/src/contents/`, `web/src/statusbar/`, `web/src/view/`, `web/src/share/` |
| Data | `web/src/data/`, `web/src/catalog/`, `api/src/lynkeus/` except `analysis/` |
| Analysis | `web/src/analysis/`, `web/src/help/`, `api/src/lynkeus/analysis/`, `api/tests/analysis/`, `docs/methods/` |

A change stays inside the folders of one part. The files that the parts share are changed only by the
maintainer, who also adds every new library: `web/src/App.tsx`, `web/src/styles.scss`, `web/src/ribbon/`,
`web/src/header/`, `web/src/shared/`, the package files, and the files outside `web/src/` and `api/src/`.

A tab of the ribbon is declared in its own folder. The file `tab.ts` lists its groups and buttons, and
`actions.ts` gives the action of each finished button. A button without an action is shown in grey, so a
button receives its action only when its function is finished.

## Shared elements of the interface

The folder `web/src/shared/` holds the elements that every tab uses. A part uses them as they are and
builds no element of its own for the same purpose. The rules that every pane follows, and the building blocks
that carry them, are in [docs/Interface_Guide.md](docs/Interface_Guide.md).

### Tool pane

The form of a tool opens in a pane on the right of the map, as a tool opens in the Geoprocessing pane of
ArcGIS Pro. The pane is not modal: the map and the ribbon stay in use while it is open. The modal `Dialog`
is only for a confirmation or a notice.

A tool has two parts. In `actions.ts` its ribbon button opens the pane:

```ts
import { openToolPane } from "../shared/dock/dock";

coherence: { run: () => openToolPane("coherence") },
```

A component declares the pane under the same name. It is placed in the component of the tab that
`App.tsx` already holds (`DataDialogs`, `AnalysisDialogs` and the others):

```tsx
import { useState } from "react";
import { ToolPane, ToolPaneGroup, type ToolPaneRun } from "../shared/toolpane/ToolPane";

export function CoherencePane() {
  const [name, setName] = useState("Coherence");
  const [run, setRun] = useState<ToolPaneRun | null>(null);
  const start = () => {
    setRun({ state: "running", text: "Computing the coherence" });
    computeCoherence(name).then(
      () => setRun({ state: "success", text: "The result was added to the map." }),
      (error: Error) => setRun({ state: "error", text: error.message }),
    );
  };
  return (
    <ToolPane id="coherence" title="Coherence" runLabel="Compute" onRun={start} ready={name !== ""} run={run}>
      <label className="usa-label" htmlFor="coherence-name">Name of the result</label>
      <input className="usa-input" id="coherence-name" value={name} onChange={(event) => setName(event.target.value)} />
      <ToolPaneGroup title="Window">…</ToolPaneGroup>
    </ToolPane>
  );
}
```

| Property of `ToolPane` | Meaning |
|---|---|
| `id` | Name of the pane, the same as the name of the ribbon button |
| `title` | Name of the tool, shown at the top of the pane and on its tab |
| `runLabel` | Label of the run button; `Run` when it is not given |
| `onRun` | Called by the run button and by the Enter key in a field, never during a run |
| `ready` | `false` while the tool lacks what it needs; the run button is then inactive |
| `run` | `null` before the first run. During a run `{ state: "running", progress?, text? }`, where `progress` is the share of the work done from 0 to 1. After it `{ state: "success" \| "warning" \| "error", text, details? }`; `details` opens in a dialog from the link View details |
| `onCancel` | Called by the Cancel button, which shows during a run only when this is given |
| `onClose` | Called after the user has closed the pane |
| `children` | The parameters. `ToolPaneGroup` (`title`, `open`) is a group of them that opens and closes |

`web/src/shared/dock/dock.ts` gives the functions that act on the panes:

| Function | What it does |
|---|---|
| `openToolPane(id)` | Opens the pane of a tool, brings it to the front and moves the keyboard focus to its title |
| `closeToolPane(id)` | Closes it. The focus returns to the element that opened the pane |
| `showPane(id)` | Brings an open pane to the front of its side: a tool pane, `"catalog"` or `"contents"` |
| `setPaneOpen(id, open)` in `panes.ts` | Shows or hides the Contents pane or the Catalog pane |

The panes of the right side stand in one stack, and a row of tabs under the stack brings each one to the
front. A pane behind the front one keeps its state. The content of a tool pane is drawn only while the pane
is open: state that the declaring component holds lasts while the pane is closed, and a component inside
the pane starts again when the pane opens. The Escape key in a pane returns the keyboard focus to the map,
and Shift with Escape closes the pane.

### Form elements

A form uses the classes of the U.S. Web Design System: `usa-label`, `usa-input`, `usa-select`,
`usa-textarea`, `usa-checkbox`, `usa-radio`, `usa-fieldset` with `usa-legend`, `usa-error-message` and
`usa-button`. Inside a pane or a dialog these take one size, which `web/src/shared/form/_form.scss` sets:
text of 13 pixels and controls 28 pixels high. A part does not set the size of the text or the height of a
control.

### Explanation of a title

The explanation of a field, of a group of fields, of a section or of a tool never stands under its title.
It goes into the element `Info` of `web/src/shared/info/Info.tsx`: a small circled "i" beside the title,
which shows the explanation in a bubble while the pointer rests on it, while it has the keyboard focus, and
after it is pressed. The class `usa-hint` is not used for a new explanation.

```tsx
import { Info } from "../shared/info/Info";

<div className="info-title">
  <label className="usa-label" htmlFor="buffer-distance">Distance</label>
  <Info id="buffer-distance-info" about="Distance">
    The width of the buffer in metres, as a number greater than zero, for example 250.
  </Info>
</div>
<input className="usa-input" id="buffer-distance" aria-describedby="buffer-distance-info" />
```

| Property of `Info` | Meaning |
|---|---|
| `id` | The id of the element that holds the text. The field, the group or the list that the title names carries it in `aria-describedby`, so that a screen reader reads the explanation with it |
| `about` | The title, as the page shows it. The button is named "Information about" and the title |
| `children` | The explanation |

The four places of an explanation:

| Title | How it is written |
|---|---|
| Label of a field | The `label` and the `Info` stand in a `div` with the class `info-title`, and the field carries `aria-describedby`. The button never stands inside the `label`, whose whole text names the field |
| Legend of a group of fields | The `legend` holds a `span` with the title and the `Info`. The `fieldset` carries `aria-labelledby` with the id of the `span`, and `aria-describedby` |
| Heading of a section | The heading and the `Info` stand in a `div` with the class `info-title`, and the list or the region under the heading carries `aria-describedby` |
| Title of a tool pane | The property `info` of `ToolPane` |

An explanation is written in complete sentences. It says what the field takes, in which unit or format,
and gives one example where a format is asked for. It does not repeat the title, and a title that needs
no explanation has none. A statement of the state of a pane, such as "No view is saved.", is not an
explanation and stays in its place.

### Keyboard focus

The whole page has one indication of the keyboard focus: a solid line of 2 pixels in the primary colour.
It stands inside the edge of an element, against the outside of the border of a field, and 4 pixels outside
a filled button, a check box and a radio button. The settings of the design system in `web/src/styles.scss`
and the file `web/src/shared/_focus.scss` give it. A part does not set `outline` on its elements, and leaves
2 pixels free around a field. A style that should show only for the keyboard uses `:focus-visible`.

### Credits

A layer is credited through its source. Give the source of OpenLayers its `attributions`: the text of the
credit, in which the name of the provider may be a link to an address that starts with `https://`. The element
`Credits` in `web/src/shared/credits/` then writes the credit at the right end of the status bar while the layer
is visible. A part draws no credit of its own. A source whose terms ask for its credit on the map itself is
named in the function `creditsOf` of `credits.ts`, and its credit is drawn in the lower right corner of the map.

### Limits of the server

A limit of the server is a named constant of the module that applies it. The address `GET /api/limits`
(`api/src/lynkeus/limits.py`) reports the limits that a visitor can meet, with the version and the resources of
the service, and the notice of the version in `web/src/header/notice/` is written from its answer. A new
text of the interface about such a limit takes its number from this answer and does not type it. A new limit
is added to the format `Limits` of `limits.py`, to `limits.ts`, and to a sentence of `sentences.ts` that
gives its reason.

## Research and proof

Nothing invented, assumed or left as a placeholder enters `main`. Before a function is built, its sources
are recorded in the research note of its part, in `docs/research/`. The method of each analysis tool is
described in a sheet in `docs/methods/`. The description of a pull request states the sources used, what
was tried on real data, the comparison with a reference, and what is not yet confirmed.

## Commits

Write the subject of a commit in the imperative, in at most 72 characters, and describe one change
in each commit.

## Changes

Record every notable change in [CHANGELOG.md](CHANGELOG.md).
