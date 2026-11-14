# Research note: Data tab, Catalog pane, server and frame of the page

This note records, for each function of this part, how GIS programs offer it, which existing function Lynkeus
uses for it, the limits found and what could not be confirmed. Every source was read on the date given.

## Description of a button

| | |
|---|---|
| ArcGIS Pro | A ScreenTip with information about the command appears when the pointer rests on a button of the ribbon ([Help within the application](https://doc.esri.com/en/arcgis-pro/latest/get-started/help-within-the-app.html)). A command has a `Tooltip`, a brief description, and a `DisabledTooltip`, a supplementary text that appears only when the command is disabled ([ArcGIS Pro SDK, MapTool class](https://doc.esri.com/en/arcgis-pro/latest/sdk/api-reference/topic9985.html)). |
| QGIS | Not read. |
| Standard | A tooltip is referenced by `aria-describedby` on the element that it describes, never receives focus and closes on the Escape key. It stays visible while the pointer is on it, as criterion 1.4.13 of the Web Content Accessibility Guidelines 2.1 asks ([MDN, ARIA: tooltip role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/tooltip_role)). |
| Function used | The component `Tooltip` in `web/src/shared/tooltip/`, with the colours of the U.S. Web Design System 3.14.0. The tooltip of the design system (`packages/usa-tooltip` in the npm package) was read and not used: its body is placed inside the wrapper of its trigger, and the panel of the ribbon scrolls sideways, which would cut a description that stands under a button. |
| Limits | A touch screen has no resting pointer, so the description reaches a touch user only through assistive technology. |
| Tried | Chromium, through Playwright 1.65.1: the description shows after the pointer rests on a button, stays when the pointer moves onto it, hides when the pointer leaves, after a click and on the Escape key, and shows at once on keyboard focus. |
| Read on | 14 Nov 2026 |

## Dialog

| | |
|---|---|
| Design system | The modal is labelled by its heading through `aria-labelledby`, keeps the keyboard focus inside it, and returns the focus to the element that opened it ([Modal](https://designsystem.digital.gov/components/modal/), [Modal accessibility tests](https://designsystem.digital.gov/components/modal/accessibility-tests/)). Since version 3.14.0 the focus moves, on opening, to the first enabled button of the footer ([release notes](https://github.com/uswds/uswds/releases)). |
| Function used | The `dialog` element of the browser, opened with `showModal()`, with the styles of the package `usa-modal` of the design system. `showModal()` displays the dialog in the top layer with a `::backdrop`, and the rest of the document becomes inert. It has been available in all main browsers since March 2022 ([MDN, HTMLDialogElement: showModal()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal)). |
| Read and not used | The script of the modal of the design system, which moves elements of the page and so cannot share them with React. The `Modal` of `@trussworks/react-uswds` 13.0.1 (type definitions and code of the npm package): it keeps its open state inside itself and offers no callback for closing, so the part that opened it cannot learn that the Escape key closed it. |
| Limits | The browser places the first focus on the first element of the dialog that can take it, not on the first button of the footer. Between two rounds of the Tab key the focus passes once through the browser's own controls; no element of the page behind the dialog can take it. |
| Tried | Chromium, through Playwright 1.65.1: the Escape key, the close button and a click outside the dialog close it; the focus returns to the button that opened it; over 16 presses of the Tab key the focus was on an element of the dialog 14 times and on the browser's own controls twice. In the tests, happy-dom 21.0.4 provides `showModal()`; jsdom 31.0.1 does not. |
| Read on | 14 Nov 2026 |

## Messages

| | |
|---|---|
| QGIS | The message bar has four levels: Info, Warning, Critical and Success. A message takes a duration in seconds. A critical message must be dismissed by the user, and a message of information or success leaves after a default time ([QgsMessageBar](https://api.qgis.org/api/classQgsMessageBar.html), [PyQGIS Developer Cookbook, Communicating with the user](https://docs.qgis.org/3.40/en/docs/pyqgis_developer_cookbook/communicating.html)). |
| ArcGIS Pro | Not read. |
| Function used | The alert of the U.S. Web Design System 3.14.0 (package `usa-alert`), in its slim form, with the four kinds success, info, warning and error. An error carries the role `alert` and the other kinds the role `status`. |
| Limits | The alert of the design system has no close button; Lynkeus adds one. A message of success or a notice leaves after 8 seconds, which is a choice of Lynkeus and comes from no source. It stays while the pointer or the keyboard focus rests on it. |
| Tried | Chromium, through Playwright 1.65.1: the four kinds show with the icons of the design system; the close button removes one message; after 8.5 seconds the success and the notice had left, and the error and the warning remained. |
| Read on | 14 Nov 2026 |

## Pane frame

| | |
|---|---|
| ArcGIS Pro | The Contents and Catalog panes are open on either side of the map when the program is first opened. A pane can be closed, and the group Windows of the View tab opens the Contents and Catalog panes again and resets them ([Introduction to ArcGIS Pro](https://pro.arcgis.com/en/pro-app/3.4/get-started/get-started.htm)). A pane is resized by dragging one of its sides ([Introducing ArcGIS Pro](https://pro.arcgis.com/en/pro-app/3.2/get-started/introducing-arcgis-pro.htm)). |
| QGIS | Not read. |
| Standard | The edge that resizes a pane is a window splitter: an element with the role `separator` that can take focus, states its position in `aria-valuenow`, and moves with the arrow keys ([WAI-ARIA Authoring Practices 1.2, Window Splitter](https://www.w3.org/TR/2021/NOTE-wai-aria-practices-1.2-20211129/)). |
| Function used | The component `Pane` in `web/src/shared/pane/`. It uses pointer capture of the browser for dragging. |
| Limits | A pane keeps its side. It cannot float, be stacked on the other pane or hide by itself, as in ArcGIS Pro. The keys Home and End give the smallest and the largest width; the page read does not name them for the splitter. In a window narrower than 1024 pixels both panes start closed. |
| Tried | Chromium, through Playwright 1.65.1, in a window of 1440 by 900 pixels: dragging the edge of the left pane by 100 pixels changed its width from 288 to 388 pixels, and `aria-valuenow` read 388; two presses of the left arrow key on the edge of the right pane changed its width from 288 to 320 pixels; after the right pane was closed the map took its place (width 732 to 1052 pixels). In a window of 390 pixels both panes were closed and the page did not scroll sideways. |
| Read on | 14 Nov 2026 |

## Tests of the interface

| | |
|---|---|
| Function used | Vitest 5.1.0 (it accepts Vite 8 and needs Node.js 22.12 or later), happy-dom 21.0.4 as the simulated browser, and Testing Library (`@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2, `@testing-library/user-event` 14.6.10). The versions and their requirements were read from the npm registry. |
| Limits | A simulated browser does not lay out the page, so sizes and positions are checked in a real browser. `npm audit` reports no known vulnerability in the libraries of the page, and seven of moderate severity in the checking tools, through `typescript-eslint` 8.72.2. |
| Read on | 14 Nov 2026 |
