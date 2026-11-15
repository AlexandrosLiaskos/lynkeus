# Research note: Analysis tools of the kind Series

This note records the research behind the two tools `backscatter-series` and `coherence-series` and
behind the extension of the server that carries their result. A tool of the kind Series gives the
values of many dates against time, at a point or for the area of its layers. Part 1 describes the
new format in plain words, so that the interface can be built from it. The work was done on
15 Nov 2026 on the server side only; the interface does not show a series yet.

The note follows the manner of `docs/research/analysis.md`, which holds the research on the three
tools of the first level and on the layers that the two new tools read. The method sheets are
`docs/methods/backscatter-series.md` and `docs/methods/coherence-series.md`.

## 1. The extension that carries a series

### 1.1 Why the contract of a tool does not carry a series

A tool of `lynkeus.analysis.TOOLS` returns one array on the grid of its inputs, `run_tool` writes it
as a GeoTIFF with a STAC record, and the result of the job is a layer description
(`api/src/lynkeus/tools.py`, `api/src/lynkeus/jobs.py`). A series is one number for each date. It
has no grid, no colour scale and no file, so it is not a layer, and a layer description cannot hold
it: the fields `url`, `range`, `colours` and `record` of a layer description are required
(`LayerDescription` in `api/src/lynkeus/layers.py`).

### 1.2 What OGC API - Processes says

The server follows OGC API - Processes, Part 1: Core (OGC 18-062r2, version 1.0, approved
23 Aug 2021, published 20 Dec 2021; <https://docs.ogc.org/is/18-062r2/18-062r2.html>, read
15 Nov 2026; `docs/research/data.md` holds the earlier research). The standard does not bind a
process to one kind of result.

| Place in the standard | What it states | What the server does |
|---|---|---|
| Clause 6.1 (Encodings) | "The inputs and outputs of a process can be any format." | A series is given as a JSON value, as a layer description is |
| Requirements 52 and 53 (`/req/ogc-process-description/outputs-def`, `output-def`) | Each output of a process is listed in the section `outputs` of the process description under its identifier, with a schema | A process of a series tool lists one output, `series`, with the schema of the series description. The other processes list `layer`, as before |
| Requirement 54 (`output-mixed-type`) | An output that can be of mixed type is defined with `oneOf` | Not used: no process returns sometimes a layer and sometimes a series |
| Requirement 27 (`/req/core/process-execute-default-outputs`) | A request without the field `outputs` asks for all outputs of the process | A request may leave `outputs` out, or name the one output of its process |
| Requirements 28 and 39 (`process-execute-sync-raw-value-one`, `job-results-async-raw-value-one`) | With `response` = `raw`, one requested output and transmission by value, the answer is that output, in its media type | `GET /api/jobs/{id}/results` returns the series description itself, as `application/json` |
| Requirement 32 (`process-execute-sync-document`) and `results.yaml` | With `response` = `document`, the answer is a map from the identifier of each output to its value | The answer is `{"series": {"value": <series description>}}` |

The alternative inside the standard would be one output `layer` of mixed type (requirement 54) for
every process. It was not taken, because a program that reads the result of a job would then have to
look inside the value to know what it received, and the interface reads the result of every job as a
layer description (`jobResult` in `web/src/data/jobs.ts`).

### 1.3 The series description, in plain words

A series description is the whole result of a series tool. It is the answer of
`GET /api/jobs/{id}/results` for a job of such a tool, and the entry of `GET /api/series`. The format
is `SeriesDescription` in `api/src/lynkeus/layers.py`. It accepts no unknown field.

| Field | Content | For the interface |
|---|---|---|
| `id` | Unique name of the series (32 characters, as for a layer) | Address of the series: `/api/series/{id}` |
| `title` | Name that the visitor gave | Name in the panes and title of the chart |
| `kind` | Always `series` | Tells a series from a layer description, whose `kind` is `layer` or `result` |
| `quantity`, `unit` | What the values are, and their unit: `Radar backscatter gamma0` in `dB`, or `Interferometric coherence (magnitude)` with the unit `1` | Label of the value axis |
| `reduction` | How the value of a date is made from the cells of its layer: `mean` (mean of the values) or `mean-power` (decibels of the mean of the linear power) | A sentence under the chart of a series of an area |
| `range` | Lowest and highest value of the value axis when the quantity has fixed limits (`[0, 1]` for the coherence), otherwise `null` | Fixed limits of the value axis, or limits from the values |
| `point` | The point of the request, `{"longitude", "latitude"}` in degrees (WGS 84), or `null` for a series of the whole area | Marker on the map |
| `cell` | For a series at a point: the cell that holds the point, `{"row", "column", "longitude", "latitude"}`. Row and column count from 0 at the first row and column of the file; longitude and latitude are the centre of the cell. `null` when `point` is `null` | The place whose values the chart shows |
| `area` | The rectangle in longitude and latitude around the grid of the input layers, `{"west", "south", "east", "north"}` | Outline of the area of a series of an area |
| `entries` | One entry for each input layer, the earliest first: `{"dates", "value", "cells"}`. `dates` holds one date for an acquisition and two for a pair, as `YYYY-MM-DD`. `value` is a number, or `null` when no cell holds a value on that date. `cells` is the number of cells from which the value was made: 1 or 0 at a point | The points of the chart. An entry without a value is a gap. For a pair the chart needs one time: the note does not fix which of the two dates |
| `inputs` | The names of the product files, in the order of `entries` | Properties of the series; the name holds the release of the processing software |
| `layer` | Name of the layer inside each product, for example `HHHH`; all layers of a series have the same | Properties of the series |
| `program`, `method` | Program and version that made the series, and the reference of the method | Properties of the series, as for a result layer |

A series has no `url`, `colours`, `dates`, `ends` or `record`. The dates of a series are those of its
entries.

### 1.4 What the server offers

| Address | Answer |
|---|---|
| `GET /api/processes/{tool}` | The description of the process. Its `inputs` are `inputs` (2 to 50 layer names, each once, in any order), `title` and the optional `point`. Its one output is `series` |
| `POST /api/processes/{tool}/execution` | Starts the job. Body: `{"inputs": {"inputs": ["<id>", "<id>", ...], "title": "<name>", "point": {"longitude": <degrees>, "latitude": <degrees>}}}`. Without `point` the series is that of the whole area of the layers |
| `GET /api/jobs/{id}` | The state of the job. A successful job of a series tool has the field `series` with the name of its series, in the place of the field `layer` |
| `GET /api/jobs/{id}/results` | The series description (or `{"series": {"value": ...}}` for `response` = `document`) |
| `GET /api/series` | `{"series": [{"series": <series description>, "created": <time>}, ...]}`, the newest first |
| `PATCH /api/series/{id}` with `{"title": "..."}` | Renames the series and returns its entry |
| `DELETE /api/series/{id}` | Removes the series and the record of its job; status 204 |

The parts of the server that changed:

1. `lynkeus.layers`: the formats `Point`, `Cell`, `SeriesEntry`, `SeriesDescription`, `SeriesRun` and
   `SeriesResult`. No existing format changed.
2. `lynkeus.analysis`: the list `SERIES_TOOLS` beside `TOOLS`, and the module
   `lynkeus.analysis.series`. The function of a series tool receives the arrays one after another,
   the descriptions, and the cell of the point or no cell; it returns a `SeriesResult`. It reads no
   file and contacts no service.
3. `lynkeus.tools.run_series`: checks that the layers share one grid, turns the point into a cell
   (`cell_of`), gives the function one array at a time, and makes the series description.
4. `lynkeus.processes.Process`: the new field `output`, `layer` (the default) or `series`.
5. `lynkeus.offered`: one process for every tool of `SERIES_TOOLS`, with the inputs `SeriesInputs`.
   The process names its input layers (`series_layers`), as the process of every other tool does.
6. `lynkeus.jobs` and `lynkeus.store`: a job whose function returns a series description records it
   in the new table `series` of the record file. A series has no folder of files.
7. `lynkeus.routes`: the three addresses of the series, the field `series` of the state of a job, and
   the name of the output in the checks of an execute request.

A series job and an own server of the visitor (`docs/Own_Servers.md`):

1. A series job runs on the project server only. An own server reports the end of a job with the
   description of a layer and no other result (`JobState` in `api/src/lynkeus/linking.py`, and
   `_record_job` in `api/src/lynkeus/servers.py`, which records a success only with a layer), so a
   series cannot return from an own server. No format of the link between the two servers was changed.
2. The request of a series job is placed as a request with `?server=project` is
   (`execution` in `api/src/lynkeus/routes.py`). A request that names an own server is answered with
   status 422 and the sentence "A series is computed on the project server only, so the parameter
   server must be absent or the word project."
3. Input layers that an own server keeps are refused by the rule of the own servers that was there
   before: status 422 and "The input layers are not all kept on the server of the job (some are on
   <names>), and a job takes input layers of its own server only." (`place` in
   `api/src/lynkeus/servers.py`).
4. A visitor with a connected own server receives a layer on that server when the request names no
   server. A series of such layers is refused (point 3). The layers of a series must be received with
   `?server=project`.
5. The test `test_series_job_runs_on_the_project_server_and_reads_no_layer_of_an_own_server` of
   `api/tests/test_series.py` runs points 1 to 3 with the stand-in own server of the tests. No real
   own server was connected.

### 1.5 What stays as it was

1. `LayerDescription`, `LayerRequest`, `ToolRun` and `AnalysisResult` are unchanged, and
   `web/src/shared/layer.ts` was not edited. The three tools of `TOOLS` are called as before.
2. `GET /api/layers` lists layers only. A series is not a row of the table `layers`, so the list
   never holds an entry that the interface cannot read (`layerEntry` in `web/src/data/layers.ts`
   refuses the whole list when one entry is not a layer description).
3. No existing table of the record file changed. The table `series` is made when the file is
   opened, so a file that was made before gains it empty and keeps every row. The version of the
   tables is 3 (`VERSION` in `api/src/lynkeus/store.py`): version 2 added the tables of the own
   servers in the same way and took a new number, and a file of a later version is not opened, which
   keeps a program that does not know the series away from a file that holds them (part 1.6, point 4).
   The test file `api/tests/data/records/version-2.sqlite3` was made by the store of commit `14ea838`
   from the file of version 1, with one own server, one pairing, two jobs of the server and one layer
   of the server. `api/tests/test_store.py` opens it and the file of version 1, and finds every row
   unchanged at version 3.
4. A series counts toward a limit of its own, 50 series for a session (`MAX_SESSION_SERIES`, the
   number of `MAX_SESSION_LAYERS`), and not toward the limits of the layers. It takes no space in the
   folder of the files. The checks of the space of the layers are made for every new job, so a
   session whose layers fill its space cannot start a series either.

### 1.6 Limits of the extension

1. The interface does not know the series. It offers no button for the two tools, and it does not
   list or draw a series. If a job of a series tool were started in a session, the present interface
   would report at its end that the layer of the job could not be read (`announce` in
   `web/src/data/follow.ts`), because the state of the job has no field `layer` and its result is
   not a layer description. Nothing was tried in a browser.
2. A series has no STAC record and no file to download. The description is the record: it holds the
   product files, the program and the method, as a result layer does.
3. The area of a series is the whole grid of its layers. A series of a part of the area, of a line or
   of a polygon is not offered.
4. A server of version 2 of the tables does not open a record file of version 3: it ends with the
   sentence that the file holds tables of version 3 and version 2 is needed. A site that returns to
   an older program after it has run this one therefore needs its record file of before, or a new one.
5. The description of a process is derived from the format of its inputs, so the input `point` is
   described as an object with `longitude` and `latitude`. The standard has a schema for a bounding
   box (`bbox.yaml`) and none for a point.

## 2. Layers that the two tools use

The layers are those of `docs/research/analysis.md`, part 2: the diagonal covariance terms of a GCOV
product (part 2.1; NASA SDS Product Specification, L2 GCOV, JPL D-102274 Rev F, section 2.2 and
Table 5-3: Float32, unit `1`, no data `nan`, `valid_min` 0) and the layer `coherenceMagnitude` of a
GUNW product (part 2.2; JPL D-102272 Rev E, Table 3-11 and pages 35 to 37: Float32, unit `1`, no
data `nan`, no `valid_min` and no `valid_max`). A series reads two or more layers of the same name.
This part adds what a series needs beyond one layer.

### 2.1 The release of the processing software in the name of a product file

Document: Science Data Systems (SDS) L-SAR Product File Naming Conventions, JPL D-102255, Rev C,
19 October 2025 (text of the copy of the team folder, read 15 Nov 2026).

| Field | What the document states | Place |
|---|---|---|
| `CRID` in the name | "6 chars for Composite Release Identifier", after the date-times and before the accuracy, the coverage, the location and the product counter | Section 3.7, pages 16 and 17 (GCOV); section 3.8, pages 18 and 19 (GUNW) |
| Definition | "A version identifier to document the Product Generation Executable (PGE) algorithms and data system used to create a product. Values monotonically increase." | Section 4.1, page 20 |
| Format | `EMMmmp`: environment (one character: `A`, `D`, `P` for Production, `T`, `S`, `R` for Reprocessing), major release (two digits), minor release (two digits), patch (one digit) | Section 4.1, pages 20 and 21 |
| Major release | "Indicates a major change in a product. [...] It signifies a major change to one or more algorithms or processing approach that impacts the data content." | Section 4.1, page 20 |
| Minor release | "a minor change to the data system other than those that qualify as a Major update including minor algorithm changes like bug fixes that do not have significant bearing on the science content of the products" | Section 4.1, page 20 |
| Patch | "an update after the software has gone through the System Deployment Review to provide a fix to a critical bug. [...] Can also increment for an algorithm parameter update." | Section 4.1, page 21 |

### 2.2 May a provisional and a validated product stand in one series

The products of the pilot area that the NASA catalogue held on 15 Nov 2026 (track 141, frame 67,
descending; record `catalogue.txt`):

| Collection | Products | Release in the names |
|---|---|---|
| `NISAR_L2_GCOV_V1` (validated) | 2: 21 Oct and 2 Nov 2026 | `P05036` |
| `NISAR_L2_GCOV_PROVISIONAL_V1` | 9: 23 Jun, 5 Jul, 17 Jul, 10 Aug, 22 Aug, 3 Sep, 15 Sep, 27 Sep and 9 Oct 2026 | `P05023` |
| `NISAR_L2_GUNW_V1` (validated) | 1: the pair of 9 and 21 Oct 2026 | `P05036` |
| `NISAR_L2_GUNW_PROVISIONAL_V1` | 8: the pairs of consecutive dates from 23 Jun to 9 Oct 2026 | `P05023` |

A series of validated products alone therefore has two dates of backscatter and one pair of
coherence. What the product documentation states (NISAR Data User Guide of the ASF DAAC, source at
<https://github.com/ua-asf/nisar-docs>, commit `47d55b1` of 13 Nov 2026, read 15 Nov 2026):

1. Provisional products "are fully calibrated and have undergone validation at a limited set of
   sites around the world"; validated products "are fully calibrated and validated"
   (`data-availability/availability-overview.md`).
2. The provisional products "are generated using the NISAR Composite Release ID (CRID) P05023", and
   the first validated products use `P05036`. The guide adds that products of the validated
   collections will be "generated using different CRID versions" as the software is updated (the
   same page).
3. The guide warns about one combination: "Users should take care if they choose to combine
   PROVISIONAL products with BETA products (generated at lower CRID numbers than 05023) in analysis
   workflows, as some differences will be due to changes in the processing software." It gives no
   such warning for provisional and validated products, and it does not state that the two may be
   combined (the same page; `data-availability/provisional-known-issues.md`, section Product
   Maturity).
4. A reprocessing of the data acquired before 21 Oct 2026 is announced for 2027: "These validated
   products will supersede any earlier versions of the data in the archive."
5. One known fault of the provisional products was resolved with `P05036`: in "around 1-2% of the
   products" missing raw data led to "defocused RSLC, misplaced products, and decorrelation in InSAR
   products" (`provisional-known-issues.md`, section Incomplete L0B Products;
   `nisar-known-issues.md`).

The two releases `P05023` and `P05036` have the same environment (`P`) and the same major release
(`05`); they differ in the minor release (`02`, `03`) and the patch. By the definition of part 2.1 a
change of the minor release has no "significant bearing on the science content of the products".

The rule of the two tools follows the definition and not the name of the collection, which a layer
description does not hold: the layers of a series must carry the same environment and major release
in the names of their product files. A provisional product of `P05023` and a validated product of
`P05036` are therefore accepted in one series, and the series description names the product file of
every entry, so that the release of each date can be read. A product of another major release, or of
the reprocessing (`R`), is refused. This is a decision of this note, drawn from the two documents;
no document read states it as a rule. The page of NASA that lists the changes of each release
(<https://www.earthdata.nasa.gov/data/platforms/space-based-platforms/nisar/nisar-composite-release-id-crid>)
refused the request of the server on 15 Nov 2026 (status 403), so the changes between `P05023` and
`P05036` were not read. Part 7 lists the point as a question for the project owner.

## 3. The two tools

The method sheets give the formula, the checks and the fields of each result. This part records the
sources behind them.

### 3.1 Backscatter, Series

1. **Existing function.** `numpy.sum`, `numpy.count_nonzero` and `math.log10` (NumPy 2.5.4, the
   version that `api/pyproject.toml` fixes, and the standard library of Python 3.13). The sum is
   taken in 64-bit numbers (`dtype=numpy.float64`) over the cells that hold a finite value above
   zero.
2. **Method.** The mean of an area is taken in linear power and then converted to decibels. The
   source program states it: "when computing the mean backscatter, we cannot simply average data in
   log scale", and "the correct scale in which operations need to be performed is the power scale"
   (ASF NISAR Cookbook, notebook `NISAR_GCOV_Time_Series_Example.ipynb`, cell 34, section 6c); its
   section 8, "Calculate the Time Series of Means", gives the two steps: "Compute subset means for
   each time-step using data in power scale" and "Convert the resulting mean values into dB scale
   for visualization" (cell 44). The ASF guides state the same in general words: "Power scale is
   appropriate for statistical analysis of the SAR dataset", and of the decibel scale that, "because it
   is in a log scale, it is not appropriate for all types of statistical analyses"
   ([Introduction to SAR](https://hyp3-docs.asf.alaska.edu/guides/introduction_to_sar/), sections
   Power Scale and dB Scale, read 15 Nov 2026). The conversion to decibels is that of the tool Backscatter, One date
   (`docs/research/analysis.md`, part 3.1).
3. **Source program.** ASF NISAR Cookbook, commit `17b69c8` of 3 Nov 2026, licence Apache-2.0, the
   repository of the source program of the first three tools. Notebook
   `NISAR_GCOV_Time_Series_Example.ipynb`: cell 31, `ts_db = db = 10 * np.log10(ts.where(ts > 0))`;
   cell 35, `ts_pwr = np.power(10.0, ts_db/10.0)`; cell 47, `means_pwr = np.mean(ts_pwr, axis=(1, 2))`;
   cell 49, `means_db = 10 * np.log10(means_pwr.where(means_pwr > 0))`.
   <https://github.com/ASFOpenSARlab/NISAR_Cookbook/blob/17b69c87a7320610740be7f2c7e605601cb7fe43/notebooks/NISAR_GCOV_Time_Series_Example.ipynb>.
   The notebook is adapted from an earlier notebook of F. J. Meyer and J. Kellndorfer (its cell 60).
4. **Rules of the code.** A cell enters the mean of a date when it holds a finite value above zero,
   as in the tool Backscatter, One date and as in cell 31 of the notebook, which drops the values
   that are not above zero. Each date uses its own cells and reports their number. The entries are
   given in the order of their dates, whatever the order of the layers.
5. **Limits.**
   1. The tool computes the mean of the power directly. The notebook converts the power to decibels
      and back before it takes the mean, in 32-bit numbers; part 4.2 gives the difference.
   2. The tool does not read the layer `mask` (`docs/research/analysis.md`, part 4.4).
   3. Each date uses the cells that hold a value on that date, so two dates may be means of slightly
      different sets of cells. The number of cells of each entry shows it.
   4. A mean over water, land and buildings together is the mean of the box. The tool does not
      separate land covers.

### 3.2 Coherence, Series

1. **Existing function.** `numpy.sum` and `numpy.count_nonzero` (NumPy 2.5.4), in 64-bit numbers.
2. **Method.** The value of a pair is the mean of the layer `coherenceMagnitude` over the cells that
   hold a value. Touzi et al. (1999), <https://doi.org/10.1109/36.739146>, treat this quantity: the
   abstract states that "the sample coherence magnitude is calculated over a moving window to
   generate a coherence magnitude map", that "the space-averaged coherence magnitude is biased
   toward higher values", and that a method is proposed to remove that bias. Only the abstract was
   read, as the Astrophysics Data System shows it
   (<https://ui.adsabs.harvard.edu/abs/1999ITGRS..37..135T/abstract>, read through a web search on
   15 Nov 2026; the page did not answer a request of the server). The tool applies no correction of
   the bias: the correction of the article was not read.
3. **Source program.** The Cookbook has no series of coherence. The comparison applies the mean
   statement of its time series notebook (cell 47, `np.mean(..., axis=(1, 2))` of xarray) to the
   cube of the coherence layers, which need no conversion. ISCE3 produced the layers
   (`docs/research/analysis.md`, part 3.3).
4. **Rules of the code.** A layer with a value below 0 or above 1 is refused, as in the tool
   Coherence, One pair. A pair is one entry with its two dates. Two layers with the same two dates
   are refused; two pairs that share one date are accepted, because consecutive pairs do.
5. **Limits.**
   1. The mean of coherence magnitudes over an area is not the coherence of the area estimated from
      the complex images, which Lynkeus does not hold. It is biased toward higher values (Touzi et
      al., 1999, abstract).
   2. The tool does not compare the time between the two dates of each pair. Pairs of different
      spans can stand in one series; the two dates of every entry show the span.
   3. The tool does not read the layers `mask` and `validDataMask`.

### 3.3 The point and its cell

The request gives the point in longitude and latitude (WGS 84). The server transforms it to the
coordinate reference system of the grid of the layers (`rasterio.warp.transform`, rasterio 1.5.2
with PROJ) and takes the cell whose rectangle holds the transformed point: with the six coefficients
of the grid, the column and the row are the whole parts of the inverse of the transform applied to
the point (`cell_of` in `api/src/lynkeus/tools.py`). A point outside the grid is refused. The source
program finds the pixel of a point in another way: it transforms the point with `pyproj` and takes
the pixel whose centre is nearest in each direction (ASF NISAR Cookbook, notebook
`NISAR_Pixel_Conversion.ipynb`, cell 20: `col = int(np.argmin(np.abs(x - x_site)))`,
`row = int(np.argmin(np.abs(y - y_site)))`). Inside the grid the two rules give the same cell, except
for a point exactly on the line between two cells; part 4 gives what was measured.

The series description returns the point of the request and the cell with the longitude and
latitude of its centre, so that the reader sees which cell was read. The value at a point is the
value of that one cell; no neighbouring cell is used and nothing is interpolated.

### 3.4 What the tools refuse

The method sheets list every refusal with its sentence. The checks of the descriptions are made
before any array is read, so a wrong set of layers is refused without reading a file.

| Check | Made by |
|---|---|
| Fewer than two layers | `_descriptions` in `api/src/lynkeus/analysis/series.py` (and the format of the inputs of the process, which answers a request with one layer with the status 400) |
| Product type, name of the layer inside the product, unit, number of dates | `check_inputs` in `api/src/lynkeus/analysis/inputs.py`, as for the other tools |
| The same layer name; the same instrument, track, direction and frame; the same environment and major release; different dates | `_descriptions` |
| The same size of grid; a value in at least one layer | `_series` |
| For the coherence, values inside 0 to 1 | `_mean_coherence` |
| The same projection, transform, width and height; a point inside the grid | `run_series` and `cell_of` in `api/src/lynkeus/tools.py`, before the function is called |

## 4. What was measured on real files

The measurements were made on 15 Nov 2026 on seven layers of the pilot area: the lower Merrimack
River, box −71.20, 42.60, −70.75, 42.95 (west, south, east, north), track 141, frame 67,
descending. A private copy of the web service received the layers with its process `get-layer`
through NASA Harmony and ran the two tools as jobs (part 4.5). The comparison with the source
program read the files of those layers (parts 4.2 to 4.4). Every number of this part is copied from
a record of `docs/research/records/analysis/series/`.

| Record | SHA-256 | What it holds |
|---|---|---|
| `comparison.json` | `564bfe8bdcfa641681a0135776e8099a626d983d6d25bf7ba5eaf7acfcb000fc` | The series of the two tools against the source program, at five points and for the area, and against the results of the jobs (parts 4.2, 4.3 and 4.5) |
| `source_side.json` | `21e62944a424f4f8e7d4292dd2e229b546cc62e8b33a79eea21f062561c9a562` | The statements of the two notebooks that the comparison executed, replaced and added, their results and their environment |
| `lynkeus_side.json` | `5dbfe7b5f7dba1b62167a946fe61f7786fa48b8da0222359dab8a888e0a2a22f` | The files of the seven layers and the series that `run_series` gives on them |
| `jobs_receive.json` | `ae32fb3ed0c9db4d69c0c707e79c71296bb4866678c0633bdf504d434ea6bf3a` | The jobs of `get-layer` that received the seven layers (part 4.1) |
| `jobs_series.json` | `370e853e4d111bf6b059377fdca68c5e4981fa7742d7ad6b85e613c4f85a7d44` | The jobs of the two tools, the refusals, and the answers of the addresses of the series (part 4.5) |
| `service.json` | `1df25de3ffa94a22b9f0bf5e1d3dc0caa2d613f2d560410d421059f13524de4b` | The private copy of the service: the commit below it, the hash of its code and the peak memory of its two containers |
| `catalogue.txt` | `237c1b8a03aa58fc0dc96e32a4e5525c67dab3c5a3f1c39a720e000cb3426566` | The products of the pilot frame in the NASA catalogue on 15 Nov 2026: name, concept identifier and time of the last revision (part 2.2) |
| `pages.json` | `2087986424209ea40235b1df06bd4e06bfdb52a14b75941ab66faf0d64c726d7` | The pages of documentation that were read, and the two addresses that did not answer |

### 4.1 The layers received

| Layer (field `layer`) | Product file | Release | Date or dates | Columns by rows, cell | Cells with a value | Lowest and highest value | Time of the job | Against the sample file of `docs/research/analysis.md`, part 4.1 |
|---|---|---|---|---|---|---|---|---|
| `HHHH` | `NISAR_L2_PR_GCOV_031_141_D_067_4005_DHDH_A_20260927T234330_20260927T234405_P05023_N_F_J_001` | `P05023` | 27 Sep 2026 | 3772 by 3972, 10 m | 14,316,415 of 14,982,384 | `0.0010199546813964844`, `4389.875` | 149 s | no sample |
| `HHHH` | `NISAR_L2_PR_GCOV_032_141_D_067_4005_DHDH_A_20261009T234330_20261009T234405_P05023_N_F_J_001` | `P05023` | 9 Oct 2026 | 3772 by 3972, 10 m | 14,316,411 of 14,982,384 | `0.0006636157631874084`, `4034.71875` | 171 s | no sample |
| `HHHH` | `NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001` | `P05036` | 21 Oct 2026 | 3772 by 3972, 10 m | 14,316,413 of 14,982,384 | `0.0006908252835273743`, `3504.90625` | 158 s | equal bit for bit to `gcov-hhhh-20261021.tif` |
| `HHHH` | `NISAR_L2_PR_GCOV_034_141_D_067_4005_DHDH_A_20261102T234330_20261102T234405_P05036_N_F_J_001` | `P05036` | 2 Nov 2026 | 3772 by 3972, 10 m | 14,316,416 of 14,982,384 | `0.0011148601770401`, `3488.90625` | 151 s | equal bit for bit to `gcov-hhhh-20261102.tif` |
| `wrappedInterferogram/HH/coherenceMagnitude` | `NISAR_L2_PR_GUNW_030_141_D_067_031_4000_SH_20260915T234330_20260915T234405_20260927T234330_20260927T234405_P05023_N_F_J_001` | `P05023` | 15 Sep 2026 and 27 Sep 2026 | 1886 by 1985, 20 m | 3,579,092 of 3,743,710 | `0.007796482183039188`, `0.9949631094932556` | 60 s | no sample |
| `wrappedInterferogram/HH/coherenceMagnitude` | `NISAR_L2_PR_GUNW_031_141_D_067_032_4000_SH_20260927T234330_20260927T234405_20261009T234330_20261009T234405_P05023_N_F_J_001` | `P05023` | 27 Sep 2026 and 9 Oct 2026 | 1886 by 1985, 20 m | 3,579,092 of 3,743,710 | `0.006507661193609238`, `0.9939925074577332` | 68 s | no sample |
| `wrappedInterferogram/HH/coherenceMagnitude` | `NISAR_L2_PR_GUNW_032_141_D_067_033_4000_SH_20261009T234330_20261009T234405_20261021T234330_20261021T234405_P05036_N_F_J_001` | `P05036` | 9 Oct 2026 and 21 Oct 2026 | 1886 by 1985, 20 m | 3,579,092 of 3,743,710 | `0.004557579755783081`, `0.9964798092842102` | 50 s | equal bit for bit to `gunw-coherence-20261009-20261021.tif` |

All seven grids have the projection `EPSG:32619`. The four backscatter layers share one grid, and
the three coherence layers share another. No layer holds a zero, a negative or an infinite cell. The
two products of 27 Sep and 9 Oct 2026 and the two pairs that end on 27 Sep and on 9 Oct 2026 are of
the provisional collections; the others are of the validated collections (part 2.2). The values of the three layers
that have a sample file equal the sample bit for bit.

### 4.2 Backscatter, Series

Series of the area, on the four layers `HHHH`. The value is in dB.

| Date | Release | Cells used | Tool | Source program, as written (32-bit) | Difference | Source program on 64-bit numbers | Difference |
|---|---|---|---|---|---|---|---|
| 27 Sep 2026 | `P05023` | 14,316,415 | `-4.315111978395169` | `-4.315112113952637` | `1.3555746747329067e-07` | `-4.315111978395169` | `0.0` |
| 9 Oct 2026 | `P05023` | 14,316,411 | `-4.832534317123461` | `-4.8325347900390625` | `4.7291560179019143e-07` | `-4.832534317123461` | `0.0` |
| 21 Oct 2026 | `P05036` | 14,316,413 | `-4.833044960998819` | `-4.83304500579834` | `4.4799520537708304e-08` | `-4.833044960998819` | `0.0` |
| 2 Nov 2026 | `P05036` | 14,316,416 | `-4.73623294188971` | `-4.736233711242676` | `7.6935296622338e-07` | `-4.73623294188971` | `0.0` |

The number of cells of each date equals the number of cells that enter the mean of the source
program. The largest difference from the statements as written is `7.6935296622338e-07` dB. The
notebook converts the power to decibels and back in 32-bit numbers and takes the mean in 32-bit
numbers; the tool takes the mean of the power in 64-bit numbers. When the same statements are given
the values as 64-bit numbers, their four results equal those of the tool (difference `0.0`). The
series does not depend on the order in which the layers are given: the layers in the reverse order
give the same entries.

Series at five points. The points were chosen by their coordinates. The pixel of the source program
is the row and the column that cell 20 of `NISAR_Pixel_Conversion.ipynb` gives.

| Point | Longitude, latitude | Cell of the tool (row, column) | Pixel of the source program | Values of the tool on 27 Sep, 9 Oct, 21 Oct and 2 Nov 2026 (dB) | Largest difference from the source program (dB) |
|---|---|---|---|---|---|
| p1 | -71.0, 42.8 | 1706, 1693 | 1706, 1693 | `-7.610060343936754`, `-5.936009545230867`, `-7.364715987858739`, `-10.232091597445104` | `3.478967425252222e-07` |
| p2 | -70.9, 42.7 | 2835, 2486 | 2835, 2486 | `-8.84405890619715`, `-12.453390801435738`, `-10.474212409586123`, `-14.201334454160271` | `1.4528221505827332e-06` |
| p3 | -71.1, 42.65 | 3352, 834 | 3352, 834 | `-7.1289854327232804`, `-6.029024124436332`, `-8.954701291266648`, `-3.750911866671517` | `1.3237837137580755e-07` |
| p4 | -70.8, 42.9 | 632, 3352 | 632, 3352 | `-16.068267077710118`, `-19.467349903766245`, `-16.988306566405114`, `-18.58491247229638` | `2.00968590391426e-06` |
| p5 | -70.8726, 42.8126 | 1590, 2738 | 1590, 2738 | `8.019781976145936`, `4.899708321337691`, `5.478684092300843`, `6.056763832331706` | `4.265260784563907e-07` |

The tool and the source program give the same cell at every point. The value of the source program
at a point is the cell of its cube in decibels (cell 31), a 32-bit number; the largest difference is
`2.00968590391426e-06` dB. Every entry has one cell.

The mean of the area is `-4.832534317123461` dB on 9 Oct 2026 (release `P05023`) and
`-4.833044960998819` dB on 21 Oct 2026 (release `P05036`). The series of the two validated dates alone,
run as a job, gives the same two values for 21 Oct and 2 Nov 2026 (`jobs_series.json`).

### 4.3 Coherence, Series

Series of the area, on the three layers `wrappedInterferogram/HH/coherenceMagnitude` (20 m). The
value has no unit.

| Pair | Release | Cells used | Tool | Source program, as written (32-bit) | Difference | Mean of the layer in 64-bit numbers (`numpy.nanmean`) | Difference |
|---|---|---|---|---|---|---|---|
| 15 Sep 2026 and 27 Sep 2026 | `P05023` | 3,579,092 | `0.31936795717771277` | `0.3193679451942444` | `1.1983468384269003e-08` | `0.31936795717771277` | `0.0` |
| 27 Sep 2026 and 9 Oct 2026 | `P05023` | 3,579,092 | `0.3067074436510622` | `0.3067074418067932` | `1.8442689597719664e-09` | `0.3067074436510622` | `0.0` |
| 9 Oct 2026 and 21 Oct 2026 | `P05036` | 3,579,092 | `0.5062995480591644` | `0.5062995553016663` | `7.242501820492464e-09` | `0.5062995480591644` | `0.0` |

The number of cells of each pair equals that of the source program. The largest difference from the
mean statement of the notebook, which works in 32-bit numbers, is `1.1983468384269003e-08`; from
the mean in 64-bit numbers it is `0.0`. The layers in the reverse order give the same entries.

| Point | Longitude, latitude | Cell of the tool (row, column) | Pixel of the source program | Values of the tool for the three pairs | Largest difference from the source program |
|---|---|---|---|---|---|
| p1 | -71.0, 42.8 | 852, 846 | 852, 846 | `0.36974722146987915`, `0.3215233087539673`, `0.6482067108154297` | `0.0` |
| p2 | -70.9, 42.7 | 1417, 1243 | 1417, 1243 | `0.332411527633667`, `0.22321242094039917`, `0.5040841698646545` | `0.0` |
| p3 | -71.1, 42.65 | 1675, 417 | 1675, 417 | `0.14651069045066833`, `0.34934714436531067`, `0.5242114663124084` | `0.0` |
| p4 | -70.8, 42.9 | 315, 1676 | 315, 1676 | `0.28476378321647644`, `0.281078577041626`, `0.3181857764720917` | `0.0` |
| p5 | -70.8726, 42.8126 | 794, 1369 | 794, 1369 | `0.7239977121353149`, `0.7051378488540649`, `0.8103115558624268` | `0.0` |

The tool and the source program give the same cell at every point, and the values are equal: the
value at a point is the 32-bit value of the cell of the product.

### 4.4 How the comparison was run

| | |
|---|---|
| Platform | `Linux-6.8.0-146-generic-x86_64-with-glibc2.41`, Python 3.13.18 on both sides, in a container with one processor and 2 GB of memory |
| Lynkeus | `run_series` of this branch with the two functions, numpy 2.5.4 and pydantic 2.14.3. The files were read with rasterio 1.5.2 (GDAL 3.12.2). The peak memory of the process that ran fourteen series (for each tool the area, the area with the layers in the reverse order, and the five points) and read the seven files for the record was 349,484 kB |
| Source program | ASF NISAR Cookbook at commit `17b69c87a7320610740be7f2c7e605601cb7fe43`. `NISAR_GCOV_Time_Series_Example.ipynb` (SHA-256 `b5250ef5c9e9b644a39e4b6c394c7a2ee7b13faabaf5b29b7910e52f3fd25101`, 61 cells): statements of the cells 14, 16, 19, 31, 35, 47 and 49. `NISAR_Pixel_Conversion.ipynb` (SHA-256 `95211d791f2bd6e2b314e1cb9c512704d915dec411cf21fc7312ffa0c7a47ae2`, 26 cells): the whole cell 20. Each statement was taken from the notebook file and executed as written |
| Statements replaced | Cell 12 of the time series notebook opens HDF5 product files; the GeoTIFF of each layer was opened with `rioxarray.open_rasterio` in its place. Cell 14 reads the time from the address of the product file; addresses made of the names of the product files were given. Cell 18 clips the cube to a box; the layers are already clipped by NASA Harmony. For the coherence, the mean statement of cell 47 was applied to the cube of the coherence layers (`np.mean(ts, axis=(1, 2))`), without the conversions of the cells 31, 35 and 49. In the pixel notebook, the projection and the coordinates of the centres of the cells were taken from the GeoTIFF (cell 15 reads them from the HDF5 file), and the five points took the place of the seven places of cell 18 |
| Statements added | The number of cells that enter each mean (`np.isfinite(...).sum()`); the value of the cube at the pixel of each point; the statements of the time series notebook on 64-bit numbers, one date at a time; and `numpy.nanmean` of each coherence layer as 64-bit numbers. The record lists them |
| Environment of the source program | numpy 2.5.3, xarray 2026.7.0, dask 2025.12.0, rioxarray 0.22.0, rasterio 1.4.4 (GDAL 3.10.3), pyproj 3.8.0 (PROJ 9.8.1); 23 packages in all |
| Input of both sides | The files of the seven layers as the private copy of the service wrote them (part 4.1). Both sides read them at full resolution |

What the comparison does not show:

1. A cell that is zero, negative or infinite, a date without any value, and a point whose cell holds
   no data: the seven layers hold no such cell at the five points and no such date. The tests of
   `api/tests/analysis/test_series.py` cover them on made-up grids.
2. A point exactly on the line between two cells, and a point outside the grid, where the two rules
   of part 3.3 differ: the source program takes the nearest pixel of the edge, and the tool refuses
   the point. One point outside the grid was refused in a job (part 4.5).
3. The source program on the HDF5 product files that the notebooks open: it was given the GeoTIFF
   layers. For the three layers that have a sample file, `docs/research/analysis.md`, part 4.6,
   records that the values of the sample equal those of the product file.
4. The other covariance terms, the channel VV and the coherence at 80 m (the unwrapped
   interferogram): only `HHHH` and the coherence of the channel HH at 20 m were received.
5. Other areas, and a series longer than four dates or three pairs.
6. The conda-forge builds of the lock file of the Cookbook, which were not used.

### 4.5 The jobs through the web service

On 15 Nov 2026, from 10:43 to 10:51 UTC, a private copy of the web service ran the processes. The copy was a
container of the image built from `api/` of this branch as the commit `0c5ca29` holds it, with the settings of `compose.yaml` (read-only file system, user 10001, init
process, 2 gigabytes of memory), one processor, a data folder of its own and a port bound to the
machine itself. A program signed in with a user token of the Earthdata account of the server,
started every job with `POST /api/processes/<name>/execution` and read its state and its result from
`/api/jobs/`. A first container received the layers; a second one, on the same data folder, ran the
series, so that its peak memory is that of the series jobs. The records are `jobs_receive.json`,
`jobs_series.json` and `service.json`. The image was built before the commit was made, from the
working files on the base commit `05930fb`; `service.json` holds the SHA-256 of the list of the
hashes of the files of `api/src`, of `pyproject.toml`, of `uv.lock` and of `Dockerfile` that were
served, and the same list of the commit `0c5ca29` gives the same value.

The seven jobs of `get-layer` ended as `successful`, in 50 to 171 seconds each (part 4.1). The service
then listed the processes `get-layer`, `backscatter-state`, `backscatter-change`, `coherence-state`, `backscatter-series`, `coherence-series`.

The fourteen jobs of the two tools ended as `successful`. The state of each has the field `series`
and no field `layer`.

| Tool | Layers | Place | Time of the job, from its start | Status of the results | Result against `run_series` on the same files (part 4.4) |
|---|---|---|---|---|---|
| `backscatter-series` | 4 | whole area | 10 s | 200 | equal |
| `coherence-series` | 3 | whole area | 7 s | 200 | equal |
| `backscatter-series` | 2 | whole area | 8 s | 200 | not compared |
| `coherence-series` | 3 | whole area | 6 s | 200 | not compared |
| `backscatter-series` | 4 | -71.0, 42.8 | 11 s | 200 | equal |
| `coherence-series` | 3 | -71.0, 42.8 | 9 s | 200 | equal |
| `backscatter-series` | 4 | -70.9, 42.7 | 9 s | 200 | equal |
| `coherence-series` | 3 | -70.9, 42.7 | 7 s | 200 | equal |
| `backscatter-series` | 4 | -71.1, 42.65 | 9 s | 200 | equal |
| `coherence-series` | 3 | -71.1, 42.65 | 7 s | 200 | equal |
| `backscatter-series` | 4 | -70.8, 42.9 | 9 s | 200 | equal |
| `coherence-series` | 3 | -70.8, 42.9 | 7 s | 200 | equal |
| `backscatter-series` | 4 | -70.8726, 42.8126 | 8 s | 200 | equal |
| `coherence-series` | 3 | -70.8726, 42.8126 | 7 s | 200 | equal |

For the twelve jobs that were compared, the entries, the product files, the layer name, the
quantity, the unit, the reduction, the range, the point, the cell, the area, the method and the
program of the result equal those of `run_series` in the comparison. The two jobs that were not
compared are the series of the two validated dates (part 4.2) and a series of coherence asked for
with `response` = `document`, whose answer is `{"series": {"value": ...}}` with the same entries
as the job of the area. The jobs of Backscatter, Series took 8 to 11 seconds and those of
Coherence, Series 6 to 9 seconds; two jobs ran at once.

The area of every series of backscatter is west `-71.21240946923143`, south `42.59232397512833`,
east `-70.74021462753375`, north `42.957757337981135`, the rectangle around the grid of
the layers, which is larger than the box of the request because the grid is a rectangle in the
projection.

Refusals that were tried:

| Trial | Answer | Sentence |
|---|---|---|
| Point outside the area | Job, failed | The point lies outside the area of the layers. |
| Coherence series of backscatter layers | Job, failed | The layer "Backscatter HH, 21 Oct 2026" is not a layer received from one NISAR GUNW product. |
| Backscatter series of layers on two grids | Job, failed | The layers of the analysis do not have the same grid. |
| Backscatter series of coherence layers | Job, failed | The layer "Coherence HH, 20 m, 9 Oct 2026 to 21 Oct 2026" is not a layer received from one NISAR GCOV product. |
| One layer | Status 400, no job | The input inputs is not valid: Tuple should have at least 2 items after validation, not 1. |
| One layer given twice | Status 400, no job | The input inputs is not valid: a layer is given more than once. |
| A point outside the Earth | Status 400, no job | The input point.longitude is not valid: Input should be less than or equal to 180. |
| Output named layer | Status 400, no job | The field outputs, when given, must name the one output of the process, which is series. |

The result of a failed job is answered with the status 500 and the sentence of the job, as for the
other processes.

The addresses of the series: `GET /api/series` listed the fourteen series, each with its description
and its time of creation; `PATCH /api/series/<id>` gave one series a new title; `DELETE
/api/series/<id>` removed one (status 204), after which its job was no longer known (status 404). At
the end the session held 13 series and its 7 layers; `GET /api/layers` listed the layers only. Of
the 24 jobs that the session then listed, 13 carried the field `series` and 7 the field `layer`; the
other four had failed.

Memory. The peak of the memory of the container (the file `memory.peak` of its control group, which
counts the file cache as well) was 698,413,056 bytes for the container that received the seven
layers and 671,752,192 bytes for the container that ran the series, in both with two jobs at
once. The limit of the container is 2 gigabytes. A series job holds one layer at a time, so its
memory does not grow with the number of dates; this was measured for four dates of 14,982,384 cells
only.

Not measured: a series of the largest number of layers (50), the display of a series in a browser,
and the series jobs beside jobs of `get-layer` in one container.

### 4.6 The jobs again, on the branch with the raster tools and the own servers

On 15 Nov 2026, from 13:01 to 13:03 UTC, the fourteen jobs and the eight refused requests of part
4.5 were run again. The private copy of the web service was a container of the image built from
`api/` of the commit `a8ef229`, which holds the series tools on the base of the six raster tools and
of the own servers, with the same settings and the same data folder as in part 4.5. The record file
of that folder was of version 1 and held the 13 series of the first run; the service opened it,
brought it to version 3 and kept every series. The records are in
`docs/research/records/analysis/series/refit/` (`jobs_series.json`, `compare.json`, `service.json`).

| What was compared with the records of part 4.5 | Outcome |
|---|---|
| The fourteen jobs | Each ended as `successful`, in 6 to 13 seconds from its start |
| The series description of each job, every field but its `id` | Equal in all fourteen: every value, every number of cells, every cell of a point |
| The state of each job | The field `series` names the series, no field `layer`, and `server` is `null` |
| The eight refused requests | The same status and the same sentence in all eight |
| The processes that the service lists | `get-layer`, the six raster tools, `backscatter-series`, `coherence-series` |
| Peak memory of the container | 645,763,072 bytes |

No own server was connected to this copy. What a series job does when the visitor has an own server
was run in the tests only (part 1.4).

## 5. How GIS programs offer a series

The table follows the row layout of `docs/research/data.md`. A statement is made only where the
page states it.

| | |
|---|---|
| ArcGIS Pro | The temporal profile chart "allow[s] you to visualize change over time using a multidimensional raster or a time-aware mosaic dataset". It is created with a right-click on such a layer in the Contents pane, Create Chart, Temporal Profile, which opens the Chart Properties pane; the Multidimensional tab has a Temporal Profile button in its Analysis group. The chart is not made from separate raster layers: the dates must first be combined in a multidimensional raster or a mosaic dataset with a time field. Places are drawn with the Draw tool of the pane: point features are added to a table in the pane, and each selected place is one line of the chart. "The Spatial Aggregation parameter automatically changes to Mean when the area of interest is drawn using a polygon or line sketch tool. Other options are Minimum, Maximum, Median, or Sum." When the dates are evenly spaced the chart shows "the original pixel values without value aggregation"; otherwise the values are binned in time, with the aggregations Count, Mean, Median or Sum. The pane also offers a trend line (linear or harmonic), statistics of each place, and limits of the value axis that default to the range of the values. The pages do not say how the pixel of a point is chosen, and they name no rule for a raster in decibels ([Temporal profile chart](https://doc.esri.com/en/arcgis-pro/latest/help/data/imagery/temporal-profile-chart.html), [Multidimensional tab](https://doc.esri.com/en/arcgis-pro/latest/help/data/imagery/multidimensional-tab.html); both pages state version 3.7 and the date 17 Aug 2026). "The temporal profile does not require an additional license" (Multidimensional tab). |
| QGIS | The pages of the User Guide 3.44 that were read describe no chart of the values of a raster against time. Time is offered for the display: the Temporal tab of the raster properties sets when a layer or a band is drawn (among others "Fixed Time Range Per Band", for rasters "where each band corresponds to a specific time period, such as NetCDF files"), and the Temporal controller panel steps or animates the map ([Raster Properties Dialog](https://docs.qgis.org/3.44/en/docs/user_manual/working_with_raster/raster_properties.html), section Temporal Properties; [2D Map View](https://docs.qgis.org/3.44/en/docs/user_manual/map_views/map_view.html), section The temporal controller panel). The values are reached one raster at a time with Processing algorithms: Sample raster values "extracts raster values at the point locations", with one new column for each band of a multiband raster; Zonal statistics "calculates statistics of a raster layer for each feature of an overlapping polygon vector layer", with the statistics Count, Sum and Mean by default ([Raster analysis algorithms](https://docs.qgis.org/3.44/en/docs/user_manual/processing_algs/qgis/rasteranalysis.html)). A series is then a table that the user assembles. A plugin outside the core, the Temporal/Spectral Profile Tool, plots "pixel time-series data from a list of rasters which have previously been stacked in, for example, a virtual raster (.VRT) file", and since its version 1.1 the time series of a zonal statistic of a selected polygon ([README of the plugin](https://github.com/DHI-GRAS/qgis-temporal-profile), branch `master`). The plugin was not installed or run. |
| Standard | The source program gives the series of the mean of an area as a line of the mean in decibels against the date, after it has taken the mean in power (ASF NISAR Cookbook, `NISAR_GCOV_Time_Series_Example.ipynb`, cells 47 to 51). |
| Function used | `run_series` in `api/src/lynkeus/tools.py` with `backscatter_series` or `coherence_series` in `api/src/lynkeus/analysis/series.py`: the layers of the session are the dates, a point or no point is the place, and the result is the series description of part 1.3. |
| Limits | ArcGIS Pro asks for a multidimensional raster or a mosaic dataset, and QGIS for a stacked raster or a table; Lynkeus takes the separate layers of the session, which must share one grid. ArcGIS Pro offers several places in one chart, lines and polygons, other aggregations than the mean, binning in time and a trend line; Lynkeus gives one place for each job, a point or the whole area, and the mean. ArcGIS Pro takes the mean of the pixel values as they are; Lynkeus takes the mean of the backscatter in power and gives it in decibels (part 3.1). No page read states that a chart reports the number of cells behind each value, which Lynkeus does. |
| Read on | 15 Nov 2026. The QGIS pages state "Last updated on 2026 Oct 30". |

## 6. Sources, programs, libraries and data of this part

| Item | Version | Licence | Use |
|---|---|---|---|
| NISAR L2 GCOV Product Specification, JPL D-102274 | Rev F, 1.5.0, 8 Jul 2026 | Document of NASA/JPL | Covariance terms, unit, no data |
| NISAR L2 GUNW Product Specification, JPL D-102272 | Rev E, 1.2.1, 8 Nov 2024 | Document of NASA/JPL | Coherence layers |
| SDS L-SAR Product File Naming Conventions, JPL D-102255 | Rev C, 19 Oct 2025 | Document of NASA/JPL | Fields of the names of the product files; definition of the CRID (section 4.1) |
| [NISAR Data User Guide](https://github.com/ua-asf/nisar-docs) of the ASF DAAC | Commit `47d55b1`, 13 Nov 2026 | Not read | Maturity of the collections and their releases (part 2.2) |
| [ASF NISAR Cookbook](https://github.com/ASFOpenSARlab/NISAR_Cookbook) | Commit `17b69c8`, 3 Nov 2026 (UTC) | Apache-2.0 | Source program: `NISAR_GCOV_Time_Series_Example.ipynb` (SHA-256 `b5250ef5c9e9b644a39e4b6c394c7a2ee7b13faabaf5b29b7910e52f3fd25101`) and `NISAR_Pixel_Conversion.ipynb` (SHA-256 `95211d791f2bd6e2b314e1cb9c512704d915dec411cf21fc7312ffa0c7a47ae2`) |
| OGC API - Processes, Part 1: Core, OGC 18-062r2 | 1.0, published 20 Dec 2021 | Document of the OGC | Outputs of a process (part 1.2) |
| ArcGIS Pro documentation | 3.7, pages of 17 Aug 2026 | Documentation of Esri | Temporal profile chart (part 5) |
| QGIS User Guide | 3.44, pages updated 30 Oct 2026 | Not read | Temporal properties, Sample raster values, Zonal statistics (part 5) |
| ASF HyP3 documentation, Introduction to SAR | Page as read on 15 Nov 2026 | Not read | Scales of SAR values (part 3.1) |
| Touzi, Lopes, Bruniquel and Vachon (1999), <https://doi.org/10.1109/36.739146> | | Article | Space-averaged coherence magnitude (part 3.2); abstract only |
| NumPy | 2.5.4 | As in `docs/research/analysis.md`, part 6 | The only library that the two functions use |
| rasterio | 1.5.2 (GDAL 3.12.2) | Not read | Reading of the layers and transformation of the point in `run_series` |
| numpy, xarray, dask, rioxarray, rasterio, pyproj | 2.5.3, 2026.7.0, 2025.12.0, 0.22.0, 1.4.4, 3.8.0 | Not read | Environment of the source program in the comparison (part 4.4). Lynkeus does not use xarray, dask, rioxarray or pyproj |
| NISAR GCOV and GUNW products of the collections `NISAR_L2_GCOV_V1`, `NISAR_L2_GCOV_PROVISIONAL_V1`, `NISAR_L2_GUNW_V1` and `NISAR_L2_GUNW_PROVISIONAL_V1` | The seven products of part 4.1 | NASA data | Measurements of part 4 |

The record `pages.json` gives, for every page of documentation that the server read on 15 Nov 2026,
its address, its size, its SHA-256 and the time of the reading.

## 7. Not confirmed, and questions for the project owner

1. **Provisional and validated products in one series.** The tools accept products whose releases
   have the same environment and major release, so `P05023` and `P05036` stand in one series (part
   2.2). The documentation neither allows nor forbids this pair, and the changes between the two
   releases were not read. The owner decides whether the rule stays, whether such a series should
   carry a warning, or whether a series should hold one release only. With one release only, the
   pilot frame has two dates of validated backscatter and one validated pair today.
2. **The bias of the mean coherence.** The space-averaged coherence magnitude is biased toward
   higher values (Touzi et al., 1999, abstract). The article proposes a correction, which was not
   read, and the tool applies none.
3. **The time of a pair in a chart.** An entry of a coherence series has two dates. Which of them, or
   their middle, is the place of the entry on the time axis is left to the interface.
4. **The interface.** The series formats have no TypeScript types yet, and `web/` was not changed.
   The interface needs the types of part 1.3, a list of the series (`GET /api/series`), a chart, a
   way to give the point, and a reading of the field `series` in the state of a job (part 1.6,
   point 1).
5. **The limit of the series of a session.** 50, the number of the limit of the layers
   (`MAX_SESSION_SERIES` in `api/src/lynkeus/jobs.py`). It is a choice of this work; no measurement
   stands behind it.
6. **A series of a part of the area.** The tools give a point or the whole grid of the layers. A
   box, a line or a polygon inside the area, which ArcGIS Pro offers (part 5), is not built.
7. **The record file.** The table `series` takes version 3 of the tables (part 1.5, point 3). An
   older program does not open such a file (part 1.6, point 4). The owner decides whether this is
   wanted for the deployed site.
8. **Memory of a long series.** The memory of a series job was measured for four dates of the
   pilot area. A series of 50 layers of the largest size was not run.
9. **The sentence for a request with one layer.** The web service answers it with the sentence of
   the library that checks the inputs: "The input inputs is not valid: Tuple should have at least 2
   items after validation, not 1." (part 4.5). The tool itself would say "A series needs at least 2
   layers, and it has 1."
10. **A point on the line between two cells.** The tool gives it to the cell with the larger number;
    the source program takes the nearest centre, and at equal distance the first (part 3.3). No such
    point was compared.
11. **Tools that were not built.** `soil-moisture-series` was not built: the function `_series` of
    `api/src/lynkeus/analysis/series.py` takes any measure of one layer, but the SME2 specification,
    a published rule for the mean of soil moisture over an area and layers of two dates were not
    researched or received in this work. `displacement-series` was not built, because it depends on
    work of another part. No thematic map was built.
