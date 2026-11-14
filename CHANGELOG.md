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
- The search of NISAR products in NASA's catalogue by type, level of validation, area, period, season,
  track, frame, direction of the orbit, cycle, absolute orbit, channels, frequency bands, bandwidth, coverage
  of the frame and joint observation, or by product names. The area is typed, taken from the view of the
  map, drawn on the map, taken from the outline of a product, or read from a GeoJSON, KML, KMZ or zipped
  shapefile.
- The products found, in the Catalog pane: a list that can be sorted, grouped, loaded further and saved as
  CSV or GeoJSON, the outlines of the products on the map, and the details of a product with its browse
  image, its record and its files.
- The layers that Lynkeus receives, stated with every product of a search.
- The tool pane: the form of a tool opens in a pane on the right of the map, with its run button, the
  progress of a run and its outcome.
- The stack of panes on each side of the map, with a tab for each pane.
- One size for the form elements inside the panes and the dialogs.
- The explanation of a title: a small circled "i" beside the title of a field, a group, a section or a
  tool, which shows the explanation in a bubble.
- The sessions of the visitors of the web service, with the sign-in to Earthdata by a user token that the
  server keeps in its memory only.
- The sign-in to Earthdata in the interface. The pane of the button Sign in takes a user token of Earthdata
  Login, the button Sign out signs out, and the right end of the title bar shows who is signed in. The page
  keeps no copy of the token.
- The processes and the jobs of the web service, in the form of OGC API - Processes, Part 1 (classes Core,
  JSON, OGC Process Description, Job list and Dismiss). Each job runs in an operating-system process of its own.
- The process `get-layer` of the web service, which receives one layer of a NISAR product through NASA
  Harmony, clipped to an area, and writes it as a Cloud Optimized GeoTIFF with a STAC record.
- One process of the web service for every finished analysis tool, which runs the tool on layers of the
  session and writes its result as a layer.
- The layers of a session, which can be renamed and removed, and whose files the web server serves under
  `/files/`, in parts on a range request.
- The dialog About of the Help tab: the purpose, the version, the team, the licence and the citation of
  Lynkeus, the statement that it is independent of NASA, what is stored about a visitor, and the links to
  the team log and the repository.
- The dialog Sources of the Help tab, which joins the lists of sources of the three parts, and the list of
  the Data part.
- The keyboard use of the ribbon: the arrow keys, Home and End move between the tabs and between the buttons,
  the down and up arrow keys pass between a tab and its buttons, and the Tab key stops once on the buttons.
- The collapsed ribbon: a double click on a tab, Ctrl+F1 or the button at the end of the row of tabs hides
  the groups of buttons and leaves the row of tabs. A click on a tab then shows its groups for a while.
- The button Get layer: its form, in the tool pane, requests layers of the selected product from NASA, each
  clipped to the area of the search, as one job for each layer.
- The sections Jobs and Layers of the Catalog pane, with the jobs and the layers of the session: a job is
  cancelled, run again and removed, and a layer is added to the map, shown in full, downloaded, renamed and
  removed.
- The address `GET /api/limits` of the web service, which reports the version of Lynkeus, the processors
  and the memory that the service may use, and the limits of the service.
- The version of Lynkeus beside the name in the title bar. A press on it opens a notice, written from the
  answer of the server: the version, the statement that the application is under development, what Lynkeus
  may use of its server, and each limit with its reason.
- The interface guide, and the shared building blocks of a pane that carry its rules: section, empty state,
  notice, property list, toolbar of icon buttons, menu button and the line of a tool pane that states what is
  missing.

### Changed

- Each tab of the ribbon is declared in its own folder, and the ribbon joins them.
- The header of the application page shows only the name of the application.
- The keyboard focus is shown by a line of 2 pixels in the primary colour. The line shows when the
  keyboard moves the focus, and stays hidden on the element that receives the focus after a click.
- A dialog gives its first focus to its heading.
- The form of the search stands in the tool pane, and no longer in a dialog.
- The description of a ribbon button shows under the panel of the ribbon and leaves the names of the
  groups in view.
- The messages show over the foot of the map.
- A job may run for 40 minutes, and the container of the web service may use 2 gigabytes of memory.
- The lines of latitude and longitude have a white edge of half a pixel, and their values one of 1 pixel.
- The credits of the layers stand at the right end of the status bar. The credit of OpenStreetMap stays
  in the corner of the map, where its tile service asks for it.
- The dialog and the close button of a pane take the sizes of the frame, and the pressed and the
  unfinished buttons of the ribbon have a stronger contrast.
- The explanations of the fields of the Map tab stand behind the "i" beside each title and no longer under
  it, and are written in complete sentences.
- The description of a ribbon button appears with a short fade.

### Removed

- The scale bar of the map and its button in the View tab. The status bar shows the scale.
- The footer of the application page.
