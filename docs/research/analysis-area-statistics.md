# Research note: Statistics in an area

This note records the research behind the option Statistics in an area of the analysis tools (team
log L-18) and the comparison of its numbers with the program `gdal raster zonal-stats` of GDAL. The
method sheet is `docs/methods/area-statistics.md`; the sheets of the two Series tools state how they
take the same area. The work was done on 15 Nov 2026.

## 1. What the option does, in plain words

1. The form of every analysis tool that maps has a last field, Statistics in an area, closed by
   default. Its field Area offers None, and under Draw on the map, A rectangle and A polygon. The
   visitor draws the shape on the map as for the area of a search. It then appears in the Contents
   pane as the layer Area of the analysis and in the field as "The rectangle drawn on the map" or
   "The polygon of N corners drawn on the map". The same area serves every form of the Analysis tab,
   and the choice None removes it.
2. After the run, the Properties of the result give, in the group Statistics in the area, the area,
   the number of cells with data inside it, and their mean, standard deviation, lowest value, median
   and highest value, in the unit of the result. The sentence at the foot of the tool pane says
   where they are: "Its statistics in the area are in its Properties in the Contents pane."
3. The server computes the numbers in the job, from the result at full resolution. It stores them
   in the description of the result and in its STAC record, so they stay with the result.
4. The Series tools offer the place For the area. The series is then made for the cells inside the
   drawn area; without a drawn area, the choice None, the whole layer, keeps the series of the whole
   layer, as before.

## 2. How the area reaches the grid of the result

### 2.1 The coordinates in which the area travels

The map draws in `EPSG:3857` (WGS 84 / Pseudo-Mercator), so a side that the visitor draws straight is
straight in those coordinates. The form sends the corners in `EPSG:3857`, rounded to the centimetre,
with the first corner repeated at the end, as the input `area` of the process of the tool. The server
places them on the grid of the result. The inputs of a job name `area` only when an area is given.
An own server of a visitor with an older program refuses inputs that it does not know, with the
sentence "This server does not accept the inputs of the job. Install the newest version.", so a job
without an area is still accepted there.

### 2.2 A side of the map is a curve on the grid

A straight side in `EPSG:3857` is, in general, a curve in the coordinates of the result (UTM for the
layers of the pilot area). For the pilot box as a rectangle of the map, about 37 km by 39 km, the
straight line between the two north corners on the grid passes more than 10 m from the middle of the
north side; the test `test_the_sides_of_an_area_of_the_map_follow_the_lines_that_the_map_draws`
(`api/tests/test_areas.py`) asserts this. The server therefore divides each side into equal pieces of
at most one cell, by points on the straight line of the map, and transforms every point with PROJ.
The outline has at most 100,000 pieces; a larger area gets longer pieces.

### 2.3 What the server refuses

1. The shape itself: fewer than three different corners, more than 250 corners, a rectangle that
   does not have four corners on two values of x and two of y, and sides that cross or overlap. The
   form makes the same checks when the shape is drawn, and refuses a shape across the meridian of
   180 degrees.
2. An area too far from the result. A projection of one zone gives finite numbers without meaning
   for a point on the other side of the Earth: for a polygon between about 90° E and 171° E, the
   projection of the zone 19 N gives finite numbers that even return to the points (test
   `test_an_area_that_cannot_be_placed_on_the_grid_is_refused`). The server therefore refuses a
   corner more than 80 degrees of longitude from the centre of the grid, and then any point that
   does not return to itself within 1 cm. The visitor reads "A part of the area lies too far from
   the layers to be placed on their grid."

## 3. Which cells count, and what is computed

### 3.1 The rule of the centre

A cell counts when its centre lies inside the area and it holds a value. This is the rule of the
rasterizer of GDAL without the option ALL_TOUCHED, which burns the pixels "whose center point is
within the polygon" (`gdal_rasterize.rst`, tag v3.12.2), and the rule that `gdal raster zonal-stats`
uses by default: "the geometries are rasterized using default parameters, and pixels included in the
rasterization are used in the calculation with equal weighting" (`gdal_raster_zonal_stats.rst`, tag
v3.12.2). The server uses it through `rasterio.features.geometry_mask(..., all_touched=False,
invert=True)` of rasterio 1.5.2, whose documentation string says that "only pixels whose center is
within the polygon or that are selected by Bresenham's line algorithm will be burned in". The
behaviour is unspecified when a side passes exactly through the centre of a cell; no such cell was
compared (part 4.4).

The rule gives each cell the weight 1 and needs no fraction of a cell, so the numbers are those of
whole cells of the result. The rules `fractional` and `all-touched` of the program are not used.

### 3.2 The statistics

The values of the cells that count are converted to 64-bit numbers. The mean is `sum(x) / n`, the
standard deviation is that of the population, `sqrt(sum((x - mean)^2) / n)`, as the `stdev` of the
program, and the median of an even number of cells is the mean of the two in the middle. The server
computes them with numpy 2.5.4 (`numpy.mean`, `numpy.std`, `numpy.median`).

The statistics are those of the values that the result stores. For a result in decibels the mean is
the mean of the decibel values, as in the program of GDAL, and not the decibels of the mean power,
which Backscatter, Series gives. On the polygon of 7 corners of part 4 on 21 Oct 2026, the mean of
the decibel values of Backscatter, One date is -8.98 dB, and Backscatter, Series gives -5.41 dB for
the same 844,889 cells (records `lynkeus_side.json` and `comparison.json`). Part 6 asks the project
owner whether a result in decibels should also give the decibels of the mean power.

### 3.3 Where the numbers stand

1. The description of the result, field `statistics`: the area as it was drawn, `cells`, `mean`,
   `deviation`, `minimum`, `median` and `maximum` (`AreaStatistics` in `api/src/lynkeus/layers.py`).
2. The STAC record of the result, property `lynkeus:area_statistics`: the area, the rule in words,
   and the numbers under the names `count`, `mean`, `stddev`, `minimum` and `maximum` of the
   Statistics Object of the common metadata of STAC 1.1.0, with `median` added. A run without a cell
   that counts has `count` 0 and no other number.
3. The GeoTIFF of the result does not hold them: its band statistics are those of the whole layer.

## 4. What was measured on real files

The two results were made on 15 Nov 2026 by `lynkeus.tools.run_tool` from layers of the pilot area
(box 71.20° W to 70.75° W, 42.60° N to 42.95° N; track 141, frame 67, descending) that the web service
had received from NASA Harmony: Backscatter, One date of the layer `HHHH` of 21 Oct 2026 (3772 by
3972 cells of 10 m) and Coherence, One pair of the layer `coherenceMagnitude` of 9 and 21 Oct 2026
(1886 by 1985 cells of 20 m), both in `EPSG:32619`. The product names and the SHA-256 of the layer
files are in the method sheet, section Comparison with the source program, and in the record
`lynkeus_side.json`. Each result was made with three areas drawn in `EPSG:3857`: a rectangle from
71.05° W to 70.90° W and from 42.70° N to 42.82° N, a polygon of 7 corners near the mouth of the
Merrimack River, and a polygon of 5 corners that crosses the north and east edges of the layers.

### 4.1 The statistics that the server gave

| Result | Area | Cells of the grid inside | Of them without a value | Cells counted | Mean | Standard deviation | Lowest value | Median | Highest value |
|---|---|---|---|---|---|---|---|---|---|
| Backscatter, One date | rectangle | 1,636,546 | 10 | 1,636,536 | -6.56159 dB | 4.14656 dB | -27.5838 dB | -5.99681 dB | 28.9298 dB |
| Backscatter, One date | polygon of 7 corners | 844,903 | 14 | 844,889 | -8.98086 dB | 5.3693 dB | -27.8937 dB | -8.21536 dB | 30.7156 dB |
| Backscatter, One date | polygon of 5 corners across the edges | 786,774 | 66,227 | 720,547 | -13.7889 dB | 5.16926 dB | -29.0643 dB | -14.9794 dB | 28.2587 dB |
| Coherence, One pair | rectangle | 409,132 | 0 | 409,132 | 0.537754 | 0.144739 | 0.00891131 | 0.549189 | 0.993986 |
| Coherence, One pair | polygon of 7 corners | 211,222 | 0 | 211,222 | 0.502163 | 0.194853 | 0.0170133 | 0.531251 | 0.990125 |
| Coherence, One pair | polygon of 5 corners across the edges | 196,514 | 16,375 | 180,139 | 0.31145 | 0.201146 | 0.00777779 | 0.236571 | 0.993588 |

The cells without a value inside the area are cells of the grid that hold no data: a few inside the
backscatter layer, and more where the polygon across the edges covers the north-east corner of the
grid. Neither side counts them. The part of that polygon beyond the edges of the grid has no cells.

### 4.2 The comparison with `gdal raster zonal-stats`

| Result | Area | Same cells | Same values | Number, lowest value, median, highest value | Mean: GDAL minus Lynkeus | Standard deviation: GDAL minus Lynkeus | Lynkeus from the exact values (mean, deviation) | GDAL from the exact values (mean, deviation) |
|---|---|---|---|---|---|---|---|---|
| Backscatter, One date | rectangle | yes | yes | equal | `-7.105427357601002e-15` (8 ulp) | `3.552713678800501e-14` (40 ulp) | 1 ulp, 0 ulp | 7 ulp, 40 ulp |
| Backscatter, One date | polygon of 7 corners | yes | yes | equal | `-1.7763568394002505e-15` (1 ulp) | `1.3855583347321954e-13` (156 ulp) | 0 ulp, 0 ulp | 1 ulp, 156 ulp |
| Backscatter, One date | polygon of 5 corners across the edges | yes | yes | equal | `3.552713678800501e-15` (2 ulp) | `5.773159728050814e-14` (65 ulp) | 0 ulp, 0 ulp | 2 ulp, 65 ulp |
| Coherence, One pair | rectangle | yes | yes | equal | 0 | `2.1649348980190553e-15` (78 ulp) | 0 ulp, 0 ulp | 0 ulp, 78 ulp |
| Coherence, One pair | polygon of 7 corners | yes | yes | equal | 0 | `-6.38378239159465e-16` (23 ulp) | 0 ulp, 0 ulp | 0 ulp, 23 ulp |
| Coherence, One pair | polygon of 5 corners across the edges | yes | yes | equal | 0 | `-3.608224830031759e-16` (13 ulp) | 0 ulp, 1 ulp | 0 ulp, 14 ulp |

"Same cells" compares the rows and columns of the cells that each side counts, by a SHA-256 of the
sorted pairs; "same values" compares their values as sorted 32-bit numbers. The differences are in
the units of the result; "ulp" is a unit in the last place of a 64-bit number. The exact values are
the mean and the standard deviation of the same 32-bit numbers computed with integers and rounded
once. The program adds the values one after another and updates the deviation with the formula WV2 of
West, D.H.D. (1979), "Updating Mean and Variance Estimates: An Improved Method", Communications of the
ACM 22(9) (`alg/raster_stats.h` of GDAL 3.12.2). numpy adds the values in pairs and computes the
deviation in two passes, so its numbers lie closer to the exact ones.

### 4.3 The Series tools for the same polygon

| Tool | Date or pair | Cells, Lynkeus | Cells, GDAL | Value, Lynkeus | Value from the mean of GDAL | Difference |
|---|---|---|---|---|---|---|
| Backscatter, Series | 2026-09-27 | 844,889 | 844,889 | `-5.000344991140121` dB | `-5.000344991140121` dB | 0.0 |
| Backscatter, Series | 2026-10-09 | 844,888 | 844,888 | `-5.437217610885132` dB | `-5.437217610885132` dB | 0.0 |
| Backscatter, Series | 2026-10-21 | 844,889 | 844,889 | `-5.405973677611534` dB | `-5.405973677611534` dB | 0.0 |
| Backscatter, Series | 2026-11-02 | 844,892 | 844,892 | `-5.425515800865233` dB | `-5.425515800865233` dB | 0.0 |
| Coherence, Series | 2026-09-15 and 2026-09-27 | 211,222 | 211,222 | `0.3395684230586152` | `0.3395684230586152` | 0.0 |
| Coherence, Series | 2026-09-27 and 2026-10-09 | 211,222 | 211,222 | `0.32869125230700297` | `0.32869125230700297` | 0.0 |
| Coherence, Series | 2026-10-09 and 2026-10-21 | 211,222 | 211,222 | `0.502163065967921` | `0.502163065967921` | 0.0 |

The value of Backscatter, Series from GDAL is `10 * log10` of the mean of the power that the program
gives on the layer of each date; the value of Coherence, Series is that mean itself.

### 4.4 How the comparison was run

1. The side of Lynkeus ran in the container `python:3.13-slim` (Python 3.13.18, numpy 2.5.4,
   rasterio 1.5.2 with GDAL 3.12.2) on the code of the branch, with the layers mounted read-only.
   For each run it called `run_tool` with the area, read the statistics of the description and of
   the STAC record, and wrote the outline that the server makes in the coordinates of the result as
   GeoJSON, because the program does not reproject. It also wrote the SHA-256 of the rows and
   columns and of the values of the cells that `lynkeus.areas.cells_inside` marks.
2. The side of GDAL ran `gdal raster zonal-stats` in the container
   `ghcr.io/osgeo/gdal:alpine-small-3.12.2` on the GeoTIFF of each result with its outline, with
   `--pixels default` (record `gdal_commands.txt`). The program of this version lists `median` among
   its statistics but refuses it with "Invalid stat: median": the program lists the name
   (`apps/gdalalg_raster_zonal_stats.cpp`), while the zonal code has no such statistic
   (`alg/zonal.cpp`). The side of GDAL therefore asked for `values`, the values of the cells that it
   counts, and `center_x` and `center_y`, their centres. The program writes the values with fewer
   digits than a 32-bit number needs; each was read back as the 32-bit number that it stands for,
   and the lowest and highest of them equal the `min` and `max` of the program in every run.
3. The comparison ran in Python 3.12.3 with its standard library only. It took the median of the
   listed values with `statistics.median`, turned the centres into rows and columns of the grid, and
   computed the exact mean and standard deviation with integers (every 32-bit number times 2^149 is
   an integer).
4. The comparison does not show: an area without a cell that counts (a test covers it on a made-up
   grid); a side exactly through the centre of a cell; the tools of change, of surface displacement
   and of soil moisture; areas near the poles or larger than the zone of the projection; the jobs of
   the web service and of the own servers of visitors, since the tools were called directly.

## 5. Sources, programs, libraries and data of this part

| Source | Version read | Used for |
|---|---|---|
| GDAL, `doc/source/programs/gdal_raster_zonal_stats.rst` | tag v3.12.2 | The default rule of the cells, the population standard deviation, no reprojection |
| GDAL, `doc/source/programs/gdal_rasterize.rst` | tag v3.12.2 | The rule of the centre without ALL_TOUCHED |
| GDAL, `apps/gdalalg_raster_zonal_stats.cpp`, `alg/zonal.cpp`, `alg/raster_stats.h` | tag v3.12.2 | Why `median` is refused; how the mean and the deviation are accumulated |
| GDAL, `LICENSE.TXT` | tag v3.12.2 | The licence of the program: MIT style |
| rasterio, `rasterio.features` | 1.5.2 | The rule of `geometry_mask` with `all_touched=False` |
| STAC, common metadata, Statistics Object | 1.1.0 | The names of the numbers in the STAC record |
| Container image `ghcr.io/osgeo/gdal:alpine-small-3.12.2` | `sha256:3775c7530eb68f95b8c67853da1e1e99a607e32a87f3d433440b8b562079f645` | The side of GDAL |
| Layers of the pilot area received by the web service | products of 15 Sep to 2 Nov 2026 (record `lynkeus_side.json`) | The results and the series compared |

The records of the comparison are in `docs/research/records/analysis/area-statistics/`:
`lynkeus_side.json` (the side of Lynkeus, with the areas, the grids, the SHA-256 of the input layers
and of the results), `gdal_side.json` (the numbers of the program, without the lists of values and
centres), `comparison.json` (both sides and their differences) and `gdal_commands.txt`.

## 6. Not confirmed, and questions for the project owner

1. The share of each class for a layer of classes was not made. No result of the list of tools is
   a layer of classes, and main has no format for a table of classes yet
   (`docs/research/analysis-thematic-maps.md`, summary, item 7).
2. For a result in decibels, should the Properties also give the decibels of the mean power, which
   Backscatter, Series gives for the same cells (part 3.2)?
3. An own server of a visitor with an older program refuses a job with an area (part 2.1).
4. The area is not kept in the browser, and it is not part of a shared link.
5. The interface was run in its tests only; the field, the layer Area of the analysis and the group
   of the Properties were not seen in a browser.
