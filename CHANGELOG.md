# Changelog

All notable changes to Lynkeus are recorded in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The site of the project, with the team log as a web page that is generated from its Markdown file.
- The service that counts page visits and stores only their total.
- The files that deploy Lynkeus in containers and publish the team log whenever its file changes.
- The automatic checks of style, types and tests.
- The page of the application, with the ribbon of tools, the map and a choice between two background maps.
- The tabs View, Share and Help of the ribbon, and the buttons of the first functions of every tab.
- The description of each button of the ribbon, shown when the pointer or the keyboard focus rests on it.
- The dialog, the frame of a pane and the messages that every part of the interface uses.
- The formats of a layer description, a layer request and a tool run, in the interface and in the server.
- The tests of the interface, which the automatic checks run.
- The research notes of the parts and the folder of the method sheets.
- The web service of the server, in its own container.
- The search of NISAR products in NASA's catalogue by type, area and period. The products found are listed
  in the Catalog pane and outlined on the map.
- The tool pane: the form of a tool opens in a pane on the right of the map, with its run button, the
  progress of a run and its outcome.
- The stack of panes on each side of the map, with a tab for each pane.
- One size for the form elements inside the panes and the dialogs.
- The sessions of the visitors of the web service, with the sign-in to Earthdata by a user token that the
  server keeps in its memory only.
- The processes and the jobs of the web service, in the form of OGC API - Processes, Part 1 (classes Core,
  JSON, OGC Process Description, Job list and Dismiss). Each job runs in an operating-system process of its own.
- The layers of a session, which can be renamed and removed, and whose files the web server serves under
  `/files/`, in parts on a range request.
- The keyboard use of the ribbon: the arrow keys, Home and End move between the tabs and between the buttons,
  the down and up arrow keys pass between a tab and its buttons, and the Tab key stops once on the buttons.
- The collapsed ribbon: a double click on a tab, Ctrl+F1 or the button at the end of the row of tabs hides
  the groups of buttons and leaves the row of tabs. A click on a tab then shows its groups for a while.

### Changed

- Each tab of the ribbon is declared in its own folder, and the ribbon joins them.
- The header of the application page shows only the name of the application.
- The keyboard focus is shown by a line of 2 pixels in the primary colour. The line shows when the
  keyboard moves the focus, and stays hidden on the element that receives the focus after a click.
- A dialog gives its first focus to its heading.
- The description of a ribbon button shows under the panel of the ribbon and leaves the names of the
  groups in view.
- The messages show over the foot of the map.
- The dialog and the close button of a pane take the sizes of the frame, and the pressed and the
  unfinished buttons of the ribbon have a stronger contrast.

### Removed

- The footer of the application page.
