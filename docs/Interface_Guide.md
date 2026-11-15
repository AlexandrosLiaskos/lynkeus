# Interface guide

Every pane, tool pane and dialog of Lynkeus follows the rules of this guide, so that a user who has learned one
pane can read every other one. The rules are short on purpose. A source in square brackets was read for the rule;
a rule without one is a decision of the project. The last part documents the shared building blocks that carry
the rules, so that a part of the interface applies a rule by using a block and not by writing its own style.

## The frame

| Rule | Source |
|---|---|
| The ribbon stands on top, the Contents pane on the left, the Catalog pane and the tool panes on the right, the status bar below. Panes of one side are stacked, with their tabs under the stack. | [P1] |
| The pin in the title bar of a pane makes that pane hide automatically: it leaves the stack and becomes a tab in a strip at the edge of the window, and the other panes stay in the stack. A click on the tab shows the pane over the stack and the map, and the pane hides again when the user works in the map or opens a pane of the stack. The pin of a pane that shows in this way returns it to the stack. A new tool pane opens in the stack. | [P1] |
| The form of a tool opens in a docked tool pane, never in a centred dialog. A dialog is only for a confirmation or for the details of an outcome. | Project, after [P2] |
| An element never looks selected because it has the focus. A blue fill means "chosen", and nothing else. | Project |

## A. Type, colour and spacing

| Rule | Source |
|---|---|
| A pane has two sizes of text: 13 px for labels, values, controls and titles of items, and 12 px for secondary lines and notes. No text is smaller than 12 px. | Project |
| Bold marks only the title of a pane, the title of a section, the title of an item and the legend of a group. | Project |
| Content is written in `ink`, secondary text in `base-darker` or `base-dark`, links and the one filled button in `primary`. Every text colour has a contrast of at least 4.5 to 1 with its background. The grey `base` is used only for an inactive command. | [W1] |
| Lines are `base-lighter`. A tinted background only carries a state: selected (`primary-lighter` with a bar at the left), information, success, warning, error. | Project |
| Distances stand on a grid of 4 px: 4, 8, 12 and 16 px. A pane has 12 px of padding at its sides. Two fields stand 12 px apart and two groups 16 px apart. | Project |
| A pane has one body that scrolls. Its title bar and its foot stay in view, and no scrolling area stands inside another one. | Project |

Contrast with white, computed from the colours of the design system: `ink` 17.2, `base-darker` 9.7, `base-dark`
6.7, `primary` 6.7, `base` 4.6. On the tinted backgrounds the first four stay above 5.3, and `base` falls to 3.7.
The test `web/src/shared/tokens/tokens.test.ts` computes these values at every run of the checks.

## B. Structure of a pane

| Rule | Source |
|---|---|
| A pane reads from top to bottom: the title bar (title, "i", pin, close button), the body made of sections, and the foot. The foot of a tool pane holds the status line and the run button. | [P2] |
| A section is a block that opens and closes. Its header is 28 px high: an arrow, the title in bold, the count of its items in parentheses, and its commands at the right end. | Project |
| The title of a section is a button with `aria-expanded`. The pattern names `aria-controls` as optional; Lynkeus sets it. | [A1] |
| A group of parameters of a tool pane looks the same as a section. | Project |
| A docked pane that runs no tool, such as Getting started, has the title bar and the body of a tool pane and no foot. | Project |

## C. Actions

| Rule | Source |
|---|---|
| A pane or a view has one filled button, for its main action. Every other button is an outline button. | Project; [U2] asks that the button most users should press differs from the others |
| The least important commands are links (buttons that look like links), at most two side by side. | [U1], [U2]; the limit of two is a decision of the project |
| Three or more commands on a list or on an item form a toolbar of icon buttons. An icon button shows the icon alone in a target of 24 px, and its name shows in a tooltip and is its accessible name. Rare commands go into a "More" menu. | [A2], [W2], [A3] |
| The Tab key reaches a toolbar once. Inside it the Left and Right arrow keys move between the buttons. | [A2] |
| A command stands beside the object it acts on, for example "Get layer" on a product, so that the user sees it and need not remember where it is. | [N1] no. 6 |
| The "More" button of an item of a list is named after its item for a screen reader, for example "More commands of Athens". Its tooltip stays "More". | Project |
| A tool pane has at most one secondary command, such as "Restore defaults". It is a link at the left end of the foot, and the run button stands at the right end. | Project |
| An inactive button stays reachable by the keyboard (`aria-disabled`), and the interface says what is missing: the foot of a tool pane, or the tooltip of the button. | Project; [M1] |
| A finished button of the ribbon that lacks something, such as a selected layer, is inactive: its action gives `missing`, one sentence on what the button needs, and the description of the button ends with that sentence. | Project |

## D. Guidance

| Rule | Source |
|---|---|
| Empty state: a pane or a section with nothing to show states in one bold line what is missing and in one sentence how to get it, and offers one button that leads to the next step. | [N1] no. 6 and 10 |
| Notice: a message inside a pane is one compact block with an icon, a bar at the left, at most one button and an X at the right that closes it. It replaces loose paragraphs. An error is announced with the role `alert`, every other notice with the role `status`. A closed notice returns when its text changes or its pane opens again. A notice that a field names in `aria-describedby` belongs to that field and has no X. | [U3]; the X is a decision of the project |
| An explanation stands behind the "i" beside a title, never as text under the title. A unit stands in the label, for example "Distance (m)". | [P2] |
| The error of a field is written in text under that field and is linked to it with `aria-describedby`. It appears after the field is left or the run button is pressed. Every part writes it with the shared `FieldError`, and the field carries `aria-invalid` while the error shows. | [W3] for the text; place and moment are decisions of the project |
| While the run button is inactive, the foot of a tool pane states the first thing that is missing. After a run it states the outcome and offers the link to the next step, and an X at the right end of the outcome closes it until the next run. A run in progress has no X. | [P2], [N1] no. 1; the X is a decision of the project |
| A tool pane that shows an empty state and has an inactive run button says each thing once: the empty state names the next step and offers its button, and the line of the foot says why the run button is inactive. | Project |
| Work that lasts longer than one second shows that it goes on. Work that may last longer than ten seconds shows the share done and can be cancelled. | [N2] |

## E. Data display

| Rule | Source |
|---|---|
| A list of names and values uses readable names, never the name of a field of a catalogue or of a service; that name goes into the "i". The rows stand in groups under short headings. | [N1] no. 2 |
| A long identifier wraps inside its column and can be copied with one button. | Project |
| An item of a list has a title line (bold, 13 px) and at most two secondary lines (12 px). The commands of the selected item appear in the item. | Project |
| A date is written as "30 Oct 2026", a time carries "UTC", and a number carries its unit. | Project |

## F. Wording

| Rule | Source |
|---|---|
| A label is a noun phrase in sentence case, of three words or fewer where possible. | [U1] for sentence case |
| A button names an action: a verb and its object, for example "Get layer", "Search", "Save as CSV". | [U2] |
| A message says what happened and what to do next, in at most two formal sentences, without codes. | [N1] no. 9 |
| An explanation behind an "i" has at most three complete, formal sentences. | Project |
| The same thing has the same word everywhere. The glossary below fixes the words. | [N1] no. 4 |

| Word | Meaning | Not used for it |
|---|---|---|
| product | A NISAR data product that NASA's catalogue lists. | granule, scene |
| layer | What the map shows and the Contents pane lists: data received from NASA or computed by a tool, or shapes that a tool draws (the area, the area of the search, the outlines of the products found). | dataset, raster |
| job | A request of an Earthdata account to receive a layer or to run an analysis tool. | task, request |
| area | The area of a search or of a tool. | region, area of interest |
| outline | The ground outline of a product on the map. | footprint |
| basemap | The bottom layer of the map, which the Map tab chooses and the Contents pane lists last. | background map |
| session | The link of one browser to the project server, which a sign-in makes and a cookie names. The layers, the series and the jobs belong to the account and not to the session. | |
| keeping time | The time for which the project server keeps a layer or a series after it was made or last extended. The interface reads it from the limits of the server. | retention, expiry |
| project server | The server of the site, which keeps the layers, the series and the jobs of an account until the date that each one states. | the server, where a server of the visitor could be meant |
| your server | A computer of the visitor that runs Lynkeus Server and keeps its layers until the visitor removes them. | own server |
| Contents pane | The pane on the left that lists the layers of the map. | layer list, table of contents |
| Catalog pane | The pane on the right that lists products, jobs and layers. | results panel |
| tool pane | The pane on the right that holds the form of one tool. | dialog, sidebar |
| NASA's catalogue | The catalogue that the search asks. The pane is spelt "Catalog", as in ArcGIS Pro. | CMR |
| Earthdata account | The account of the user at NASA, to which the layers, the series and the jobs on the project server belong. "Earthdata Login" names only NASA's service itself. | Earthdata Login account, NASA account |
| user token | The token of Earthdata Login with which the user signs in. | key, password |
| sign in, sign out | | log in, log out |

## G. Focus and motion

| Rule | Source |
|---|---|
| The page has one indication of the keyboard focus, a line of 2 px in the primary colour, which shows only for the keyboard (`web/src/shared/_focus.scss`). | Project |
| A change of state takes 150 ms or less and happens at once for a user who has asked the operating system for less motion (`prefers-reduced-motion`). | [W4] for the preference of the user; the limit is a decision of the project |

## H. What is kept

What Lynkeus keeps, where, for how long, and how the visitor sees and removes it is fixed in [Storage.md](Storage.md).
The pane Storage of the Options tab shows all of it. The rules below are the ones that a text or a row of the
interface follows when it speaks of what is kept.

| Rule | Source |
|---|---|
| A text about what is kept copies a statement of the table "What is kept" of [Storage.md](Storage.md), from `web/src/options/kept.ts`, and a test compares the two. | Project |
| A duration or a limit of what is kept is read from `GET /api/limits` (`limitsStore` and `useLimits` in `web/src/header/notice/limits.ts`) and is never typed. While the limits are not known, the text names the thing without its number, for example "Keep longer". | Project |
| A row of something that is kept states what it is, its size where it has one, until when it is kept and the command that removes it. | Project |
| An amount beside its limit is written as numbers, for example "12 of at most 50", and drawn as a bar with the role `meter`, whose `aria-valuetext` holds the same words. A bar does not show progress. | [A4] |
| A layer or a series of the project server states "Kept until" and its date. From three days before that date its row carries the icon and the tint of a warning, with the words. | Project |

## Sources

Read on 14 November 2026; [A4] on 15 November 2026.

- [W1] W3C, Understanding Success Criterion 1.4.3 Contrast (Minimum), WCAG 2.2. https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- [W2] W3C, Understanding Success Criterion 2.5.8 Target Size (Minimum), WCAG 2.2. https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- [W3] W3C, Understanding Success Criterion 3.3.1 Error Identification, WCAG 2.2. https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html
- [W4] W3C, Understanding Success Criterion 2.3.3 Animation from Interactions (level AAA), WCAG 2.2, and technique C39, Using the CSS prefers-reduced-motion query to prevent motion. https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html and https://www.w3.org/WAI/WCAG21/Techniques/css/C39
- [A1] W3C, WAI-ARIA Authoring Practices 1.2, section 3.10 Disclosure (Show/Hide). https://www.w3.org/TR/2021/NOTE-wai-aria-practices-1.2-20211129/
- [A2] W3C, ARIA Authoring Practices Guide, Toolbar Pattern. https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/
- [A3] W3C, ARIA Authoring Practices Guide, Menu Button Pattern. https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/
- [A4] W3C, ARIA Authoring Practices Guide, Meter Pattern. https://www.w3.org/WAI/ARIA/apg/patterns/meter/
- [M1] MDN Web Docs, ARIA: toolbar role. https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/toolbar_role
- [U1] U.S. Web Design System, Button. https://designsystem.digital.gov/components/button/
- [U2] U.S. Web Design System 1.0, Buttons. https://v1.designsystem.digital.gov/components/buttons/
- [U3] U.S. Web Design System, Alert. https://designsystem.digital.gov/components/alert/
- [N1] J. Nielsen, 10 Usability Heuristics for User Interface Design, Nielsen Norman Group. https://www.nngroup.com/articles/ten-usability-heuristics/
- [N2] J. Nielsen, Response Times: The 3 Important Limits, Nielsen Norman Group. https://www.nngroup.com/articles/response-times-3-important-limits/
- [P1] Esri, Introducing ArcGIS Pro. https://pro.arcgis.com/en/pro-app/latest/get-started/introducing-arcgis-pro.htm
- [P2] Esri, Use a geoprocessing tool, ArcGIS Pro. https://pro.arcgis.com/en/pro-app/latest/help/analysis/geoprocessing/basics/run-geoprocessing-tools.htm

## Building blocks

The blocks are in `web/src/shared/`. The import paths below are written from a folder of a part, such as
`web/src/catalog/`. A block brings its own style; a part adds none for the same purpose.

### Tokens

`web/src/shared/tokens/_tokens.scss` holds the values of part A. A style file takes them with
`@use "../shared/tokens/tokens";`.

| Variable | Value |
|---|---|
| `$text`, `$text-small` | 13 px and 12 px, with the line heights `$line` and `$line-small` |
| `$space-1` to `$space-4` | 4, 8, 12 and 16 px |
| `$pane-padding`, `$field-gap`, `$group-gap` | 12, 12 and 16 px |
| `$row`, `$target`, `$icon` | 28 px (a row of the frame), 24 px (a target), 16 px (an icon) |
| `$ink`, `$secondary`, `$muted`, `$link` | The colours of text |
| `$border`, `$hover`, `$selected`, `$selected-bar` | The line, the grey under the pointer, and the fill and the bar of a selected element |
| `transition($properties...)` | A mixin: a change of 0.1 s that stops under `prefers-reduced-motion` |

```scss
@use "../shared/tokens/tokens";

.catalog-date {
  color: tokens.$secondary;
  font-size: tokens.$text-small;
  line-height: tokens.$line-small;
}
```

### Section

`import { Section } from "../shared/section/Section";`

| Property | Meaning |
|---|---|
| `title` | Name of the section |
| `count` | Number of its items, shown in parentheses after the title |
| `info` | Explanation of the section, behind the "i" beside the title |
| `actions` | Commands at the right end of the header; a press on one leaves the section as it is |
| `defaultOpen` | Whether the section starts open; `true` when it is not given |
| `open`, `onToggle` | For a component that holds the state itself: the state, and the call with the new state |
| `id` | The id of the element of the section |

```tsx
<Section
  title="Layers"
  count={layers.length}
  info="The layers of your Earthdata account."
  actions={<IconButton icon="add" label="Add a layer" onClick={add} />}
>
  <ul className="item-list">…</ul>
</Section>
```

### EmptyState

`import { EmptyState } from "../shared/empty/EmptyState";`

| Property | Meaning |
|---|---|
| `title` | What is missing, in a few words |
| `text` | How the user gets it, in one sentence |
| `action` | `{ label, onClick }`: the button that leads to the next step |

```tsx
{products.length === 0 ? (
  <EmptyState
    title="No products"
    text="Search NASA's catalogue to list the products of an area."
    action={{ label: "Search products", onClick: () => openToolPane("search") }}
  />
) : (
  <ProductList products={products} />
)}
```

### Notice

`import { Notice } from "../shared/notice/Notice";`

| Property | Meaning |
|---|---|
| `kind` | `"info"`, `"success"`, `"warning"` or `"error"`; an error is announced as an alert, the others as a status |
| `id` | The id of the element that holds the text. A field that the notice is about carries it in `aria-describedby`. Such a notice belongs to its field and has no X |
| `action` | `{ label, onClick }`: the one button of the notice |
| `children` | What happened and what to do next, in at most two sentences |

```tsx
{signedIn ? null : (
  <Notice kind="warning" action={{ label: "Sign in", onClick: () => openToolPane("sign-in") }}>
    You are not signed in to Earthdata. A layer is requested with your Earthdata account.
  </Notice>
)}
```

Every other notice has an X at its right end, with the name "Close this message" that the close button of a message
over the map also has. The X hides the notice until its text changes or its pane opens again. When the X had the
keyboard focus, the focus moves to the title of the pane.

### PropertyList

`import { PropertyList } from "../shared/properties/PropertyList";`

| Property | Meaning |
|---|---|
| `groups` | A list of `{ id?, title?, rows }` |
| `groups[].id`, `rows[].id` | A text that names the group among the groups, or the row among the rows of its group, and stays the same while the list changes. Without it a group is known by its title, and a row by its name, with the position among equals. Groups of one title that may change their order take one, for example the id of a layer |
| `rows[].name` | Readable name of the property |
| `rows[].value` | The value: a text, a number or an element |
| `rows[].info` | Explanation behind an "i"; the name of the field in the catalogue or the service belongs here |
| `rows[].copy` | `true` adds a button that copies a value that is a text or a number; a text adds a button that copies that text |

```tsx
<PropertyList
  groups={[
    { title: "Orbit", rows: [{ name: "Track", value: 141 }, { name: "Direction", value: "Ascending" }] },
    {
      title: "Record",
      rows: [
        { name: "Identifier", value: product.id, copy: true, info: "The field GranuleUR of the record." },
        { name: "Size", value: "1.2 GB" },
      ],
    },
  ]}
/>
```

A group and a row keep their elements while other groups and rows enter and leave the list, so the list may grow
while the user works in it. Two groups of one title are both listed.

### Toolbar and IconButton

`import { Toolbar } from "../shared/toolbar/Toolbar";` and
`import { IconButton } from "../shared/toolbar/IconButton";`

| Property | Meaning |
|---|---|
| `Toolbar` `label` | Name of the toolbar for assistive technology |
| `IconButton` `icon` | Id of the icon in `node_modules/@uswds/uswds/dist/img/sprite.svg` |
| `IconButton` `label` | Name of the command: the accessible name and the text of the tooltip |
| `IconButton` `onClick` | The command |
| `IconButton` `pressed` | For a button that switches something on and off: whether it is on (`aria-pressed`) |
| `IconButton` `disabled`, `reason` | An inactive button keeps the focus and does nothing; `reason` says in its tooltip what is missing |

```tsx
<Toolbar label="Commands of the layer">
  <IconButton icon="zoom_in" label="Zoom to the layer" onClick={zoom} />
  <IconButton icon="visibility" label="Show on the map" pressed={visible} onClick={toggle} />
  <IconButton icon="delete" label="Remove" disabled={busy} reason="The layer is being received." onClick={remove} />
  <MenuButton icon="more_vert" label="More" items={[{ label: "Properties", onSelect: showProperties }]} />
</Toolbar>
```

A toolbar is for three or more buttons. One or two icon buttons stand without it.

### Menu and MenuButton

`import { MenuButton } from "../shared/menu/MenuButton";` and
`import { Menu, type MenuItem } from "../shared/menu/Menu";`

| Property | Meaning |
|---|---|
| `MenuButton` `label` | Name of the button: the text that it shows, or the text of its tooltip |
| `MenuButton` `name` | The accessible name of the button and of its menu, where a list holds several buttons of one label: "More commands of" and the name of the item. Without it the label names both |
| `MenuButton` `icon` | With it the button shows the icon alone and its name in a tooltip; without it, its name and an arrow |
| `MenuButton` `items` | A list of `{ label, onSelect, disabled?, checked?, separated? }` |
| `Menu` | The menu alone, for a menu that opens at the pointer: `label`, `items` (`{ id, label, run, disabled?, checked?, separated? }`), `at` (`{ x, y }`), `focus` (`"first"` or `"last"`), `onClose(refocus)`, `id?` |

```tsx
<MenuButton
  label="Save as"
  items={[
    { label: "CSV", onSelect: saveCsv },
    { label: "GeoJSON", onSelect: saveGeoJson },
    { label: "Shapefile", onSelect: saveShapefile, disabled: products.length === 0, separated: true },
  ]}
/>
<MenuButton
  icon="more_vert"
  label="More"
  name={`More commands of ${bookmark.name}`}
  items={[{ label: "Rename", onSelect: rename }, { label: "Remove", onSelect: remove }]}
/>
```

### FieldTitle

`import { FieldTitle, infoId } from "../shared/field/FieldTitle";`

| Property | Meaning |
|---|---|
| `field` | The id of the field that the title names |
| `title` | The title, with the unit in parentheses where the field has one |
| `children` | The explanation, a text of complete sentences |

```tsx
<FieldTitle field="buffer-distance" title="Distance (m)">
  The width of the buffer, as a number greater than zero, for example 250.
</FieldTitle>
<input
  className="usa-input"
  id="buffer-distance"
  aria-describedby={infoId("buffer-distance")}
  value={distance}
  onChange={(event) => setDistance(event.target.value)}
/>
```

### FieldError

`import { describedBy, FieldError } from "../shared/field/FieldError";`

| Property | Meaning |
|---|---|
| `id` | The id of the element of the error. The field carries it in `aria-describedby` while the error shows |
| `children` | What is wrong with the value and what to enter instead, or `null` while the field has no error |
| `describedBy(...ids)` | A function: the value of `aria-describedby` for the ids given; an id that is `null` or empty is left out |

```tsx
<input
  className={fault ? "usa-input usa-input--error" : "usa-input"}
  id="buffer-distance"
  aria-invalid={fault ? true : undefined}
  aria-describedby={describedBy(infoId("buffer-distance"), fault && "buffer-distance-error")}
  value={distance}
  onChange={(event) => setDistance(event.target.value)}
/>
<FieldError id="buffer-distance-error">{fault}</FieldError>
```

The error is announced as an alert when it appears. A message that concerns the whole form, such as an answer of
the server, is a `Notice` under the field; its `id` then stands in `aria-describedby` in the same way, and the
notice has no X, because it belongs to the field.

### ToolPane

`import { ToolPane, ToolPaneGroup, type ToolPaneRun } from "../shared/toolpane/ToolPane";` The properties are
listed in [CONTRIBUTING.md](../CONTRIBUTING.md). Four carry rules of parts C and D:

| Property | Meaning |
|---|---|
| `missing` | The first thing that the tool still lacks, in one sentence. The foot shows it beside the inactive run button while `ready` is `false` |
| `run` | After a run, the outcome, with an X named "Close this message" at its right end. The X returns the foot to what it shows before a run until the run button is pressed again or the outcome changes. It stops no run and removes no layer or result, and a run in progress has no X |
| `run.action` | `{ label, onClick }` in an outcome: the link to the next step, shown after the text of the outcome |
| `secondary` | `{ label, onClick, info? }`: the one secondary command of the tool, a link at the left end of the foot. `info` is its explanation, behind an "i" beside the link |

```tsx
<ToolPane
  id="get-layer"
  title="Get layer"
  onRun={start}
  ready={product !== null}
  missing="Select a product in the Catalog pane."
  run={run}
  secondary={{ label: "Restore defaults", onClick: restore }}
>
  <ToolPaneGroup title="Output">…</ToolPaneGroup>
</ToolPane>
// After the run:
setRun({ state: "success", text: "The layer was added to the map.", action: { label: "Zoom to the layer", onClick: zoom } });
```

### InfoPane

`import { InfoPane } from "../shared/toolpane/InfoPane";`

A pane in the stack of the tool panes that runs no tool: it has the title bar and a body that scrolls, and no
form, no run button and no foot. It opens with `openToolPane(id)` and closes with `closeToolPane(id)`, as a tool
pane does, and its content is drawn only while it is open.

| Property | Meaning |
|---|---|
| `id` | Name of the pane, the same as the name of the ribbon button that opens it |
| `title` | Name of the pane, shown at its top and on its tab |
| `info` | What the pane shows, behind the "i" beside the title |
| `onClose` | Called after the user has closed the pane |
| `children` | The content |

```tsx
<InfoPane id="getting-started" title="Getting started" info="The steps of the work, in order.">
  <ol className="item-list" aria-label="Steps of the work">
    <li className="item">…</li>
  </ol>
</InfoPane>
```

### Tooltip

`import { Tooltip } from "../shared/tooltip/Tooltip";` `IconButton` and `MenuButton` use it already; a part uses
it directly for a button of its own that needs a description.

| Property | Meaning |
|---|---|
| `title` | Name of the element, in bold when a text follows it |
| `text` | One sentence on what the element does; an element whose name says it all has none |
| `note` | A second sentence, for example why the element is inactive |
| `children` | A function that receives the id of the description and returns the element, which carries that id in `aria-describedby` |

```tsx
<Tooltip title="North up" text="Turns the map so that north is at the top.">
  {(describedBy) => (
    <button type="button" className="statusbar-button" aria-describedby={describedBy} onClick={northUp}>
      North up
    </button>
  )}
</Tooltip>
```

The description stands under its element. At the lower edge of the window it stands above the element, and at the
right edge it moves to the left, so it always stays inside the window.

### A ribbon button that lacks something

`import type { ToolActions } from "../ribbon/types";` The file `actions.ts` of a tab gives the action of each
finished button. An action may state what the button needs before it can run:

| Property of an action | Meaning |
|---|---|
| `run` | What the button does |
| `pressed` | For a button that stays switched on: whether it is on |
| `missing` | One sentence on what the button needs, for example "Select a layer in the Contents pane.", or `undefined` when it lacks nothing. The button is then inactive, it stays reachable by the keyboard, and its description ends with this sentence |

```ts
export function useMapActions(): ToolActions<MapToolId> {
  const map = useMap();
  const selected = useStore(selectedLayerStore);
  return {
    "zoom-in": { run: () => zoomBy(map, 1) },
    "zoom-to-layer": {
      run: () => void zoomToLayer(map),
      missing: selected ? undefined : "Select a layer in the Contents pane.",
    },
  };
}
```

### List rows and the padding of a pane

These are classes of `web/src/shared/list/_list.scss` and `web/src/shared/pane/_pane.scss`, without a component.

| Class | Meaning |
|---|---|
| `item-list` | The list; with `item-list--selectable` the item under the pointer is shaded |
| `item` | One item; `item--selected`, `aria-selected="true"` or `aria-current="true"` marks the selected one |
| `item-main`, `item-title`, `item-line` | The text of an item: the title line and the secondary lines |
| `item-actions` | The commands of an item, at its right end |
| `pane-bleed` | An element that reaches the two edges of the pane, across its padding |

```tsx
<ul className="item-list item-list--selectable pane-bleed">
  <li className={selected ? "item item--selected" : "item"} onClick={select}>
    <div className="item-main">
      <p className="item-title">21 Oct 2026, 01:23 UTC</p>
      <p className="item-line">Track 141, frame 71, ascending</p>
    </div>
    {selected ? <div className="item-actions">…</div> : null}
  </li>
</ul>
```
