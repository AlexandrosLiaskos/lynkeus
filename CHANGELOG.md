# Changelog

All notable changes to Lynkeus are recorded in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Get layer receives the layers of beta products, and the description of a layer states the level of validation of its product.
- The site of the project, with the team log as a web page that is generated from its Markdown file.
- The service that counts page visits and stores only their total.
- The files that deploy Lynkeus in containers and publish the team log whenever its file changes.
- The automatic checks of style, types and tests.
- The page of the application, with the ribbon of tools, the map and a choice between two basemaps.
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
- The pin in the title bar of a pane, which makes the pane hide automatically, as Auto-Hide does in ArcGIS
  Pro: the pane becomes a tab at the edge of the window, and the tab shows it over the map until the user
  works in the map. The other panes of the side stay in the stack.
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
- The pane Getting started of the Help tab, with the steps of the work in order and the button that opens
  the tool of each step. A finished button of the ribbon that lacks something, such as a selected layer, is
  inactive, and its description says what it needs. Every item of the status bar has one form and carries
  its name, and the dialogs About and Sources use the shared sections and lists of names and values.
- The address `GET /api/limits` of the web service, which reports the version of Lynkeus, the processors
  and the memory that the service may use, and the limits of the service.
- The version of Lynkeus beside the name in the title bar. A press on it opens a notice, written from the
  answer of the server: the version, the statement that the application is under development, what Lynkeus
  may use of its server, and each limit with its reason.
- The interface guide, and the shared building blocks of a pane that carry its rules: section, empty state,
  notice, property list, toolbar of icon buttons, menu button and the line of a tool pane that states what is
  missing.
- The layers of shapes in the Contents pane: the area of the Map tab, the area of the search and the
  outlines of the products found, the last as one group that lists its products. Such a layer is shown and
  hidden, has a legend and an opacity, is selected, zoomed to, moved in the drawing order among the other
  layers and removed, and the Properties window states what it is.
- The analysis tools Backscatter, One date, Backscatter, Change and Coherence, One pair in the server, each
  with its method sheet in `docs/methods/`. A tool refuses a layer that it does not read, with a sentence
  that says why.
- The name of a layer inside its product, in the layer description and as the name of the band in the STAC
  record of the layer.
- The reduced copies of a result of Backscatter, One date, made as the decibels of the mean power of the
  cells that each of their cells covers.
- The forms of the three analysis tools, in the tool pane. A form offers the layers of the session that its
  tool reads, proposes the name of the result, shows the method in the words of the method sheet and starts
  the tool as a job.
- The dialog Methods of the Help tab, with the method sheet of each finished analysis tool.
- The words at the two ends of the legend of a result of Backscatter, Change, decrease and increase, which
  the Contents pane writes beside the lowest and the highest value.
- The work that is kept in the browser: the bookmarks, the view of the map, the panes, the area, the form of
  the search and the layers of the map return when the page opens again. The pane Browser storage, which
  the button Storage of the tab Options opens, switches each part on and off, states the size of its stored
  copy and clears it.
- The welcome screen of the application page, which covers the page when it opens: an illustration of the NISAR
  satellite with the mark and the name of the platform, the team, and the event with the logos of NASA, the NASA
  Space Apps Challenge and the universities of the team. The visitor slides it up to enter.
- The mark of Lynkeus, a drawing of the NISAR satellite, in black in the title bar and in white on the welcome
  screen.
- The analysis tools Coherence, Change and Soil moisture, One date and Change, with their method sheets and research notes.
- The forms of the analysis tools Coherence, Change and Soil moisture, One date and Change, in the tool pane,
  and the section In brief of their method sheets in the dialog Methods of the Help tab. The form of
  Coherence, Change says in one sentence why it does not compare two pairs of dates.
- The sources of these three tools in the dialog Sources of the Help tab.
- The analysis tool Surface displacement, One pair, on the server and in the tool pane, with its method sheet,
  its research note and the section In brief of the sheet in the dialog Methods of the Help tab.
- The centre frequency of the radar band in the description of a layer Unwrapped phase, which Get layer reads
  from the ISO XML file of the product.
- The sources of Surface displacement, One pair in the dialog Sources of the Help tab.
- The analysis tools Backscatter, Series and Coherence, Series: the values of many dates against time, at a point or for the area, shown as a chart with a table in the pane Series and listed under Series in the Catalog pane.
- The workflow that measures the loading of the running site with Lighthouse on a machine of GitHub.
- Statistics in an area: the last field of the form of every analysis tool that maps takes a rectangle or a
  polygon drawn on the map, and the Properties of the result give the number of its cells with data inside
  it, with their mean, standard deviation, lowest value, median and highest value. A Series tool takes the
  same area for a series of its cells.

### Changed

- Lynkeus is licensed under the GNU Affero General Public License, version 3, with additional terms under
  its section 7, in place of the Apache License 2.0. The terms keep the attribution to Alexandros Liaskos
  and Team Lynkeus in every copy and every work based on Lynkeus, websites included, require a modified
  version to say that it is modified, and grant no right to the names of the authors, the name Lynkeus or
  its logo. Copies of the code that were obtained before this change keep the Apache License 2.0 under
  which they were published.
- Each layer that Get layer offers bears the name that NASA's catalogue gives it, for example Frequency A HHHH,
  Frequency A RTC Gamma to Sigma Factor and Frequency A HH Unwrapped Interferogram Coherence Magnitude. Layers
  received earlier keep their names.
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
- The tool panes of the Data tab guide the user. Get layer shows an empty state before a search has found a
  product, a field Product with the products found, and at its foot the first thing that is missing. Search
  products shows the choices that most searches need first, and Sign in has three numbered steps.
- The rows of the Contents pane take the shared sizes, distances and colours. The Symbology pane stands in
  five sections, with every explanation behind an "i", and the Properties window lists the properties in
  four groups, with buttons that copy the addresses.
- The tool panes of the Map tab show their results as lists of names and values in sections, name the next
  step while they have nothing to show, and state a value that is refused under its field.
- The link Restore defaults of the search and the link Reset display of Symbology stand at the left end of
  the foot of their tool panes. The description of a button shows above the button at the lower edge of the
  window. A list of names and values keeps its rows in place while it grows, and the "More" button of an
  item of a list is named after its item.
- The credits of the layers stand at the right end of the status bar. The credit of OpenStreetMap stays
  in the corner of the map, where its tile service asks for it.
- The dialog and the close button of a pane take the sizes of the frame, and the pressed and the
  unfinished buttons of the ribbon have a stronger contrast.
- The explanations of the fields of the Map tab stand behind the "i" beside each title and no longer under
  it, and are written in complete sentences.
- The description of a ribbon button appears with a short fade.
- The Catalog pane is open from the start and, while it lists nothing, leads to the search. Its sections
  Products, Jobs and Layers carry their commands in toolbars and menus, a selected product offers Get layer,
  Details and Zoom to, and the details of a product are a view of their own, in groups with readable names.
- The tool panes of the Share tab keep their explanations behind the "i", state the conditions of a result
  as notices and say what a tool needs before it runs. A Share button of the ribbon that lacks something is
  inactive and says what it needs.
- The row of tabs under the stacked panes is darker than a pane, and the tab of the pane in front carries
  the tint of a chosen element.
- The messages of the Share tab say basemap, and the More button of a job and of a layer in the Catalog pane
  is named after its item.
- The outline of the selected product is drawn in cyan over a dark edge, the colour of a selection in
  ArcGIS Pro. The outlines and the area of the search stay on the map after the search pane closes, as
  layers of the Contents pane, where they are hidden or removed.
- The Contents pane and the map keep one drawing order for all layers, so that a layer of shapes can stand
  under a layer of data.
- The form of the search is filled when its pane, or the pane of Get layer, first opens. The area of the
  search is therefore not on the map, nor in the Contents pane, when the page loads.
- The forms of the Analysis tab show only the layer, the name of the result, the box that adds the result to
  the map and a link Method. The page Methods of the Help tab shows for each tool eight short rows, which
  stand in a new section In brief of its method sheet, and the address of the full sheet.
- The title bar stands on a dark strip of the image of the welcome screen, with the mark, the name and the
  version in white. The Earthdata account at its right end shows the picture of an account alone, and its
  name shows while the pointer or the keyboard focus rests on it.
- The interface writes the month of a date as the server does, from one fixed table (Sep for September),
  whatever the language of the browser.
- The bubble of a field in the form of a tool is one sentence.
- The citation of the provisional GUNW collection gives the DOI 10.5067/NIL2GUNW-P1, which doi.org resolves.
- A notice in a pane and the outcome at the foot of a tool pane, such as those of Get layer and Search products,
  have an X that closes them. A closed notice returns when its text changes or its pane opens again, and a closed
  outcome with the next run.
- The web server compresses the text files more strongly, and a browser keeps the files that the build names
  after their content for a year without asking for them again. The logos and the photos of the welcome screen
  are stored at four times the size at which the screen shows them.

### Removed

- The scale bar of the map and its button in the View tab. The status bar shows the scale.
- The footer of the application page.
- The buttons Change and Thematic map of Surface displacement and Thematic map of Coherence and Soil moisture
  in the Analysis tab, because no published method gives their results: the phase of each GUNW pair is
  measured from its own arbitrary reference, so two pairs cannot be subtracted, and no published algorithm of
  the NISAR science team that derives classes from coherence, displacement or soil moisture was found.

### Fixed

- Get layer warned that a part of the area lies outside the outline of the product when the area was taken from
  that outline. It compared the outline with the rectangle around an area of polygons; it now compares the
  polygons themselves, so a polygon inside the outline gives no warning and a polygon wholly outside it is refused.
- Lynkeus Server writes a layer on a computer where PostGIS, QGIS or another program names its own map data in the
  variables PROJ_DATA, PROJ_LIB or GDAL_DATA. It used that data, PROJ refused the database of another version, and
  every job of Get layer ended with an internal error. The program now uses the map data that came with it.

### Security

- The web service refuses an input value that a request gives as a link. A few requests with links to a
  host that answers very slowly could stop the sign-in, the search and the start of jobs for every visitor.
- A session whose jobs all failed or were dismissed makes place for a new session when the server holds the
  largest number of sessions. Requests that only start jobs that fail could fill the server with sessions,
  after which every new visitor was refused for up to seven days.
- A report of a server of a visitor names at most 100 jobs. Longer reports could keep the web service busy
  and make the other requests wait.
