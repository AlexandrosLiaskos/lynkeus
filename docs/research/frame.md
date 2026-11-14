# Research note: frame of the page

This note records, for each shared element of the page, how GIS programs offer it, which standard applies,
which existing function Lynkeus uses for it, the limits found and what could not be confirmed. Every source was
read on the date given. The notes on the description of a button, the dialog, the messages and the first frame
of a pane are in [data.md](data.md).

## Tool pane

| | |
|---|---|
| ArcGIS Pro | A tool opens in the Geoprocessing pane, with its parameters and, on a second tab, its environments. The Run button is at the bottom of the pane. After a run starts, a status banner is added to the bottom of the pane, with a progress bar that shows the percentage completed and a cancel button. When the tool completes, the banner states with an icon and a message whether it succeeded, completed with warnings or failed. The link View Details opens the same information in a detached window, with the tabs Parameters, Environments and Messages. The Back button at the top of the pane returns to the page viewed before, and the Run menu resets the parameters ([Use a geoprocessing tool](https://pro.arcgis.com/en/pro-app/latest/help/analysis/geoprocessing/basics/run-geoprocessing-tools.htm), [Help within the application](https://pro.arcgis.com/en/pro-app/latest/get-started/help-within-the-app.htm)). |
| QGIS | An algorithm opens in a dialog, not in a docked panel. The dialog has the tabs Parameters and Log and a set of buttons at the bottom; after a run the button Change Parameters shows while the Log tab is active ([The Toolbox, QGIS 3.44](https://docs.qgis.org/3.44/en/docs/user_manual/processing/toolbox.html)). The Processing Toolbox itself, which lists the algorithms, is docked at the right side of the window ([Training manual, QGIS 3.40](https://docs.qgis.org/3.40/en/docs/training_manual/processing/set_up.html)). |
| Function used | The component `ToolPane` in `web/src/shared/toolpane/`, with the form elements and the colours of the alert of the U.S. Web Design System 3.14.0. The bar of a run is the `progress` element of the browser, the details open in the `Dialog`, and a group of parameters is the `details` element of the browser. |
| Choices of Lynkeus | Lynkeus follows ArcGIS Pro: the form is in a pane, the run button at its foot, and the progress and the outcome under the button. The run button is at the right end of the foot. An inactive run button stays in the order of the keyboard, as an unfinished button of the ribbon does. The Enter key in a field runs the tool. These choices come from no source. |
| Limits | A tool pane has no Back button, no tab of environments and no Run menu, because Lynkeus has no list of tools inside the pane, no environments and no saved parameters. The outcome has no pop-up on hover; its details open only from the link. Lynkeus keeps no history of runs. |
| Tried | Chromium, through Playwright 1.65.1, on a private copy of the page with a trial tool that held every form element, in a window of 1440 by 900 pixels. The pane opened 288 pixels wide beside a map of 1152 pixels. With the pane open, the Zoom in button of the ribbon and a drag of the map worked, and the pane stayed open. A run showed "Requesting the layer (40 %)" with the bar and the Cancel link, then "The layer was added to the map." with the link View details, which opened the details in a dialog; the Escape key closed the dialog, left the pane open and returned the focus to the link. A failed run showed its sentence on the colours of an error. No error was written to the console and no request failed. |
| Read on | 14 Nov 2026 |

## Stack of panes

| | |
|---|---|
| ArcGIS Pro | The Contents and Catalog panes are docked on opposite sides of the window, or one is stacked on the other. Stacked panes have tabs at the bottom that switch from one pane to the other ([Introducing ArcGIS Pro, version 2.6](https://pro.arcgis.com/en/pro-app/2.6/get-started/introducing-arcgis-pro.htm)). The Escape key returns the keyboard focus to the map from the Contents pane, and Shift with Escape closes an active pane ([ArcGIS Pro keyboard shortcuts, version 3.0](https://pro.arcgis.com/en/pro-app/3.0/get-started/arcgis-pro-keyboard-shortcuts.htm)). |
| QGIS | Not read for the docking of panels. |
| Standard | The tabs follow the tabs pattern: an element with the role `tablist` holds elements with the role `tab`, each tab names its panel in `aria-controls`, only the selected tab is in the order of the Tab key, the left and right arrow keys move between the tabs, and Home and End, which are optional, go to the first and the last tab ([ARIA Authoring Practices Guide, Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)). The edge is a window splitter: the role `separator`, `aria-valuenow`, `aria-valuemin` and `aria-valuemax`, the arrow keys, and Home and End, which are optional ([ARIA Authoring Practices Guide, Window Splitter](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/)). |
| Function used | The components `Dock` and `DockPane` and the functions of `dock.ts`, in `web/src/shared/dock/`. `Pane` and `ToolPane` are built on `DockPane`. The edge uses pointer capture of the browser for dragging. |
| Choices of Lynkeus | The Contents pane is on the left, and the Catalog pane and every tool pane are stacked on the right. The tabs follow the order in which the panes appeared. A pane that appears comes to the front; when the front pane closes, the pane before it comes to the front. A tab is selected as soon as an arrow key reaches it. The Escape key returns the focus to the map from every pane, which ArcGIS Pro documents only for the Contents pane. When a tool pane opens, the focus moves to its title; when it closes, the focus returns to the element that opened it or, when that element has left the page, to the map. In a window narrower than 640 pixels a side covers the map. A side takes at most half of the window less 32 pixels. These choices come from no source. |
| Limits | A pane cannot be dragged to the other side, float or hide by itself. The splitter does not collapse the pane on the Enter key, which the pattern describes. In a window narrower than 640 pixels the edge is not shown, so the width cannot be changed there. |
| Tried | Chromium, through Playwright 1.65.1, 1440 by 900 pixels. After a real search of products the Catalog pane appeared in front of the open tool pane, with the tabs "Get layer" and "Catalog" in a row 29 pixels high; a third pane added a third tab. The right arrow key on a tab selected the next tab and its pane. Two presses of the left arrow key on the edge changed the width from 288 to 320 pixels; dragging the edge by 100 pixels gave 420 pixels, `aria-valuenow` read 420 and the map was 1020 pixels wide. Closing the front pane brought the pane before it to the front. Shift with Escape in a field closed the tool pane; Escape moved the focus to the map and left the pane open. In a window of 390 by 800 pixels the tool pane covered the map (390 pixels wide), the page did not scroll sideways, and the close button returned to the map. |
| Read on | 14 Nov 2026 |

## Keyboard focus

| | |
|---|---|
| Standard | Web Content Accessibility Guidelines 2.2 ([W3C Recommendation](https://www.w3.org/TR/WCAG22/)). Criterion 2.4.7 (level AA): the keyboard focus indicator is visible. Criterion 2.4.11 (AA): the focused element is not entirely hidden by content of the author. Criterion 1.4.11 (AA): what identifies a component or its state has a contrast of at least 3 to 1 with the adjacent colours. Criterion 2.4.13 (AAA): the indicator is at least as large as a perimeter 2 CSS pixels thick around the unfocused element, and has a contrast of at least 3 to 1 between the focused and the unfocused state. A solid line of 2 pixels inside the element against its outer edge is the smallest indicator that is still such a perimeter; a line further inside has to be thicker ([Understanding Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)). |
| Design system | The U.S. Web Design System 3.14.0 gives every element that can take the focus an outline on `:focus`, with the settings `$theme-focus-color` (`blue-40v`), `$theme-focus-width` (`0.5`, 4 pixels), `$theme-focus-style` (`solid`) and `$theme-focus-offset` (`0`). A check box and a radio button take the outline 4 pixels outside their box (read in the Sass files of the npm package: `uswds-core/src/styles/settings/_settings-general.scss`, `uswds-elements/src/styles/_focus.scss`, `usa-checkbox`, `usa-radio`). |
| ArcGIS Pro and Office | Not read. No page that describes how these programs draw the keyboard focus was found, and the programs were not at hand. |
| Before | A line of 4 pixels in `blue-40v` (contrast 3.2 to 1 with white), on every focused field. It showed on the first field of a dialog also when a click had opened the dialog, because the browser counts the first focus of a dialog as focus from the keyboard. |
| Choices of Lynkeus | One line for the whole page: solid, 2 pixels, in the colour `primary`, set through the settings of the design system, so that every component of the design system takes it. It stands inside the edge of an element, so that a container which scrolls does not cut it. On a field it stands against the outside of the border, because the border of a field has the same lightness as the line (contrast 1.0 to 1) and a line inside would also hide the red border of a wrong value. On a filled button, a check box and a radio button it stays 4 pixels outside, as in the design system. The map takes a second, white line inside the first one, because the pictures of the map can have any colour. The line shows under `:focus-visible`, which the browser sets after a key press and on every element that takes typed text. A pane and a dialog give their first focus to their title, as the ARIA Authoring Practices Guide advises for a dialog whose content has to be read from its start ([Dialog (Modal)](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)); the title shows the line only when the keyboard opened the pane or the dialog. A description of a ribbon button shows on focus only when the keyboard moved the focus. |
| Measured | The colour `primary` (rgb 0, 94, 162) has a contrast of 6.72 to 1 with white, 5.90 with the grey of the ribbon and the title bars, 5.39 with the blue of a pressed button, and 5.13 with the grey of a hovered button. With the colours of the map it has none that can be stated, which is why the map has the white line; the two lines have 6.72 to 1 with each other. |
| Limits | The line inside an element meets the size of criterion 2.4.13. On the map the criterion is not met for every picture: a pixel of medium lightness has less than 3 to 1 with both lines. A field that a click focuses shows the line, because it takes typed text; the browser decides this and the page does not change it. |
| Tried | Chromium, through Playwright 1.65.1, 1440 by 900 pixels. After a click on a ribbon button the title of the new pane had the focus and no line (`:focus-visible` false); after the Enter key on the same button the title had the line. The Tab key then went through the close button, the select, the text field, the radio buttons, the date field, the check boxes, the group names and the fields of the open group, each with a solid line of 2 pixels in rgb(0, 94, 162). A click on a check box showed no line. A dialog opened by a click gave the focus to its heading without a line; opened by the Enter key, with the line; the next Tab key went to the first field. After a pane that a click had opened was closed by a click, the focus was on the ribbon button, without a line and without its description. |
| Not confirmed | The page was not tried with a screen reader, in Firefox or Safari, on a touch screen, or with the forced colours of the operating system. |
| Read on | 14 Nov 2026 |

## Form elements

| | |
|---|---|
| Standard | Criterion 2.5.8 of the Web Content Accessibility Guidelines 2.2 (level AA): a target for the pointer is at least 24 by 24 CSS pixels, or has that much room around it ([W3C Recommendation](https://www.w3.org/TR/WCAG22/)). |
| Design system | The form elements of the U.S. Web Design System 3.14.0, measured in Chromium before this change: text of 16 pixels, and fields and buttons 40 pixels high. |
| ArcGIS Pro and QGIS | Not read for the sizes of their form elements. |
| Function used | The classes of the design system, with the sizes that `web/src/shared/form/_form.scss` sets inside a pane and a dialog. |
| Choices of Lynkeus | Text of 13 pixels, as in the ribbon and the panes; hints and error texts of 12 pixels; fields, selects and buttons 28 pixels high, as the tabs and the title bar of a pane; a check box and a radio button of 16 pixels in a line of 24 pixels; a button that looks like a link 24 pixels high. These numbers come from no source. |
| Measured | Chromium, 1440 by 900 pixels, in a pane 288 pixels wide: text field, select and date field 271 by 28 pixels with text of 13 pixels; run button 28 pixels high; label of a check box 24 pixels high; close button of a pane 24 by 24 pixels; name of a group 28 pixels high; the links Cancel and View details 24 pixels high. Contrast with the background: labels 17.22 to 1, hints 4.59, error text 6.98, border of a field 6.74, text of the run button 6.72 and of the inactive run button 5.79. |
| Limits | The date field is the one of the browser, which writes the date in the order of the user's language. |
| Read on | 14 Nov 2026 |


## Review of the frame

The elements of the frame were looked at in Chromium, through Playwright 1.65.1, in windows of 1920 by 1080, 1440
by 900, 1024 by 768 and 390 by 800 pixels, and their sizes and colours were measured. The table lists what was
found and changed. The numbers come from the measurements; the choices come from no source.

| Element | Found | Changed to |
|---|---|---|
| Description of a ribbon button | It stood directly under its button and covered the name of the group, and with it the top of a message. | It stands under the panel of the ribbon, 4 pixels below it. The clear strip between the button and the description belongs to the description, so the pointer can cross it: the description stayed while the pointer moved from the button onto it, and hid when the pointer left, as criterion 1.4.13 asks. |
| Messages | They stood over the top of the map, where the descriptions of the ribbon buttons show. In a window of 390 pixels with a pane open, they were squeezed into the 86 pixels that the pane left, and one message was 508 pixels high. Their text was 14 pixels, and they had a shadow. | They stand over the foot of the map, 36 pixels above its lower edge, above the scale and the credits of the map, so a description and a message do not meet. In a narrow window they stand over the pane that covers the map (374 pixels wide). Their text is 13 pixels. A line of 1 pixel replaces the shadow. |
| Pressed button of the ribbon | Its border (rgb 115, 179, 231) had a contrast of 2.25 to 1 with the white panel, under the 3 to 1 of criterion 1.4.11 for the sign of a state. | The border is the colour `primary`: 6.72 to 1 with the panel and 5.39 with the fill of the button. |
| Unfinished button of the ribbon | Its label (rgb 169, 174, 177) had a contrast of 2.24 to 1. The criteria exempt an inactive element, but the button can take the focus and its description is read. | The colour `disabled` of the design system (rgb 117, 117, 117): 4.61 to 1. |
| Heights of the ribbon | The line height of the labels gave heights with fractions of a pixel (a button of 72.8 pixels, a ribbon of 123.4), so the lines under the ribbon fell between pixels. | Whole pixels: a button of 72 pixels and a ribbon of 124. |
| Dialog | The modal of the design system is made for a web page: a heading of 22 pixels, a close button of 42 pixels, padding of 32 pixels and corners of 8 pixels. The search dialog was 596 pixels high. | A heading of 16 pixels, a close button of 32 pixels, padding of 16 pixels and corners of 4 pixels. The same dialog is 432 pixels high. |
| Close button of a pane | A target of 17 by 17 pixels, under the 24 pixels of criterion 2.5.8. The target was changed with the stack of panes; its icon stayed at 13 pixels. | 24 by 24 pixels, with an icon of 16 pixels. |
| Hint inside a field group | The field group kept the text size of the design system, 16 pixels, so the lines of a hint of 12 pixels stood 22 pixels apart. | The field group takes the text size of the form, and the lines of a hint stand 16 pixels apart. |
| Button that looks like a link | Inside a pane or a dialog it took the height and the padding of a filled button (28 pixels high, 12 pixels of padding at each side). | 24 pixels high, without padding, as the form styles state. |
| Scroll bars | The panel of the ribbon in a narrow window, the content of a pane and the tabs of a stack had the wide scroll bar of the browser. | The thin scroll bar of the browser (`scrollbar-width: thin`). |

Measured and left as it is: the header (32 pixels high, name of 14 pixels, 15.11 to 1), the tabs of the ribbon (28
pixels high; the selected tab 5.90 to 1), the names of the groups (11 pixels, 6.74 to 1), the labels of the
buttons (12 pixels, 17.22 to 1), the title of a pane (13 pixels, 15.11 to 1), the tabs of a stack (28 pixels high;
the selected tab 6.72 to 1), and the text of a message (15.42 to 1 on the warning colour). The page did not scroll
sideways at any of the four widths. At 390 pixels the panel of the ribbon scrolls sideways (835 pixels of buttons
in 380).

Not changed, because the folders belong to other parts: the scale of the map and its credits keep the look that
OpenLayers gives them.
