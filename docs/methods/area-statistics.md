# Statistics in an area

| | |
|---|---|
| Option | `area` of every tool that maps: the last field of its form, Statistics in an area (Analysis tab). The tools of the kind Series take the same area in their group Area drawn on the map |
| Input | The result of the tool at full resolution, and a rectangle or a polygon that the visitor drew on the map |
| Result | The number of the cells of the result that hold a value inside the area, and the mean, standard deviation, lowest value, median and highest value of those cells, in the unit of the result |
| State | The comparison with the source program (D-17) was made on 15 Nov 2026 on two results of the pilot area, Backscatter, One date of 21 Oct 2026 and Coherence, One pair of 9 and 21 Oct 2026, each with three areas, and on the two Series tools with one polygon. The results were made through `lynkeus.tools.run_tool` and `run_series`, not as jobs of the web service. The interface offers the field and shows the statistics in the Properties; this was run in the tests of the interface and was not seen in a browser. |

## In brief

| | |
|---|---|
| What it shows | The number of cells with data of a result inside a rectangle or polygon drawn on the map, with their mean, standard deviation, lowest value, median and highest value. |
| Input | The result of a tool that maps, at full resolution, and an area drawn on the map: a rectangle or a polygon of at most 250 corners whose sides do not cross. |
| Formula | A cell counts when its centre lies inside the area and it holds a value; then `mean = sum(x) / n` and `deviation = sqrt(sum((x - mean)^2) / n)`. |
| Result | Numbers in the unit of the result, shown in its Properties and stored in its description and its STAC record. The median of an even number of cells is the mean of the two in the middle. |
| How to read | The numbers describe only the cells inside the area. For a result in decibels the mean is that of the decibel values, and not the decibels of the mean power, which Backscatter, Series gives. |
| Limits | A cell that a side cuts counts only when its centre lies inside. Each side, a straight line on the map, is followed on the grid of the result in pieces of at most one cell. The statistics belong to the area of the run, so an area drawn later needs a new run. |
| Checked | With three areas on a backscatter result and a coherence result of the pilot area, `gdal raster zonal-stats` of GDAL 3.12.2 counts the same cells, with the same values, and gives the same lowest and highest value. The median of the values that it lists is the same, and the mean and the standard deviation agree to 12 decimal places (lower Merrimack River, Oct 2026). |
| References | [GDAL, gdal raster zonal-stats](https://gdal.org/en/stable/programs/gdal_raster_zonal_stats.html). [GDAL, gdal_rasterize](https://gdal.org/en/stable/programs/gdal_rasterize.html), for the rule of the cell centre. |

## Reference

1. GDAL 3.12.2, program `gdal raster zonal-stats`
   ([`gdal_raster_zonal_stats.rst`, tag v3.12.2](https://github.com/OSGeo/gdal/blob/v3.12.2/doc/source/programs/gdal_raster_zonal_stats.rst)):
   by default "the geometries are rasterized using default parameters, and pixels included in the
   rasterization are used in the calculation with equal weighting"; `stdev` is the "population
   standard deviation"; the program performs no reprojection, so the zones are given in the
   coordinates of the raster. The table of statistics of that page does not describe `median`. The
   program of this version lists `median` among its statistics but refuses it ("Invalid stat:
   median"), because its zonal code (`alg/zonal.cpp`) has no such statistic.
2. GDAL 3.12.2, program `gdal_rasterize`, option `-at`
   ([`gdal_rasterize.rst`, tag v3.12.2](https://github.com/OSGeo/gdal/blob/v3.12.2/doc/source/programs/gdal_rasterize.rst)):
   without the option ALL_TOUCHED a polygon burns the pixels "whose center point is within the
   polygon", and the behaviour is unspecified when the polygon just touches the centre of a pixel.
3. rasterio 1.5.2, `rasterio.features.geometry_mask` and `rasterize`: with `all_touched=False`
   "only pixels whose center is within the polygon or that are selected by Bresenham's line
   algorithm will be burned in" (documentation string of the function).
4. STAC 1.1.0, common metadata, Statistics Object: the names `count`, `mean`, `stddev`, `minimum`
   and `maximum`, which the record of a result uses for its statistics in the area.

## Input

1. A result of a tool of `TOOLS` (`api/src/lynkeus/analysis/__init__.py`), at full resolution: the
   array that the function of the tool returns, before the reduced copies of its file are made. The
   statistics are therefore those of every cell of the result, also where the map shows a reduced
   copy.
2. An area drawn on the map, the input `area` of the process of the tool (`Shape` in
   `api/src/lynkeus/layers.py`):

   | Field | Value |
   |---|---|
   | `crs` | The coordinate reference system of the map, `EPSG:3857` (WGS 84 / Pseudo-Mercator) |
   | `kind` | `rectangle`, with four corners on two values of x and two of y, or `polygon` |
   | `points` | The corners in their order, x and y in metres of the map, rounded to the centimetre, with the first repeated at the end |

3. The server refuses, with a sentence for the visitor, an area of fewer than three different
   corners or of more than 250, a rectangle that does not have four corners on two values of x and
   two of y, and an area whose sides cross or overlap. The form makes the same checks on the same
   numbers when the shape is drawn. A shape drawn across the meridian of 180 degrees is refused by
   the form.

## Method

1. The area is placed on the grid of the result (`lynkeus.areas.outline_on`). A side of the area is a
   straight line in the coordinates of the map and, in general, a curve in the coordinates of the
   grid: on the pilot area the middle of the north side of a rectangle 37 km wide lies more than
   10 m from the straight line between its two corners on the grid. Each side is therefore divided
   into equal pieces, by points on the straight line of the map, and every point is transformed with
   PROJ (`rasterio.warp.transform`). A piece is at most as long as the side of a cell of the grid, or
   longer when the outline would otherwise have more than 100,000 pieces. An area with a corner more
   than 80 degrees of longitude from the centre of the grid is refused first: the projection of one
   zone, such as UTM, gives finite numbers without meaning for a point on the other side of the
   Earth, and those numbers even return to the point. Every point is then transformed back, and an
   area of which a point does not return within 1 cm is refused.
2. The cells whose centre lies inside the outline are marked by the rasterizer of GDAL, through
   `rasterio.features.geometry_mask(..., all_touched=False, invert=True)` (references 2 and 3). A
   cell that a side cuts counts only when its centre lies inside. A centre that lies exactly on a
   side is decided by the rasterizer.
3. Of those cells, the cells that hold a finite value count. A cell without data holds `nan`, so the
   cells outside the area of the layer, and the cells of a polygon outside the grid, do not count.
4. The values of the cells that count are converted to 64-bit numbers, and the server computes with
   numpy 2.5.4:

   ```text
   cells = n, the number of the cells that count
   mean = sum(x) / n                                   (numpy.mean, pairwise summation)
   deviation = sqrt(sum((x - mean)^2) / n)             (numpy.std, the standard deviation of the population)
   minimum, maximum = the lowest and the highest value
   median = the middle value, or the mean of the two middle values for an even n   (numpy.median)
   ```

5. Without a cell that counts, `cells` is 0 and the five values are none. The job does not fail.
6. A tool of the kind Series that is given the same area takes the cells of step 2 in the place of the
   whole grid, and makes the value of each date as its sheet states: the decibels of the mean power
   for Backscatter, Series and the mean for Coherence, Series. An area outside the grid gives the
   refusal "No layer of the series holds a value in the area."

## Unit

The unit of the result: dB for the tools of the group Backscatter, none (`1`) for coherence,
m3 m-3 for soil moisture and m for surface displacement. The number of cells has no unit.

## Where the statistics stand

1. The description of the result, field `statistics` (`AreaStatistics` in
   `api/src/lynkeus/layers.py`): the area as it was drawn, `cells`, `mean`, `deviation`, `minimum`,
   `median` and `maximum`. The interface shows them in the Properties of the result, group
   Statistics in the area, with three significant digits, and the foot of the tool pane says where
   they are.
2. The STAC record of the result, property `lynkeus:area_statistics`: the area, the rule in words,
   and `count`, `mean`, `stddev`, `minimum`, `median` and `maximum`, as 64-bit numbers. The record
   of a run without a cell that counts has `count` 0 and no other number.
3. The GeoTIFF of the result does not hold them: its band statistics are those of the whole layer.

## How to read the result

The numbers describe only the cells inside the area, on the date or dates of the result. For a
result in decibels the mean is the mean of the decibel values. It is lower than the decibels of the
mean power of the same cells, which Backscatter, Series gives for the same area, by an amount that
grows with the spread of the values. The standard deviation of decibel values describes their spread
in decibels. The median and the extremes are the same in both ways of reading.

## Comparison with the source program (D-17)

| | |
|---|---|
| Source program | GDAL 3.12.2 "Chicoutimi" (released 3 Feb 2026), program `gdal raster zonal-stats` with `--pixels default` and the statistics `count`, `mean`, `stdev`, `min`, `max`, `values`, `center_x` and `center_y`, in the container image `ghcr.io/osgeo/gdal:alpine-small-3.12.2` (`sha256:3775c7530eb68f95b8c67853da1e1e99a607e32a87f3d433440b8b562079f645`). The program refuses `median` (reference 1), so the median of the side of GDAL is the median of the values that the program lists, by `statistics.median` of Python. The program writes those values with fewer digits than a 32-bit number needs, and each was read back as the 32-bit number that it stands for |
| Licence | MIT style (GDAL/OGR General, file `LICENSE.TXT` at tag v3.12.2) |
| Comparison | The statistics that `run_tool` stored in the description and in the STAC record of a result, against those of the program on the GeoTIFF of the same result. The program does not reproject (reference 1), so it was given, as GeoJSON, the outline that the server makes in the coordinates of the result (section Method, step 1). The cells that each side counts were compared by their rows and columns, and their values as 32-bit numbers. The mean and the standard deviation of the same values were also computed exactly, with integers, and rounded once. For the Series tools, the number of cells and the value of each date of `run_series` against the mean of the program on each input layer, taken in decibels for Backscatter, Series |
| Areas | Drawn in `EPSG:3857` and rounded to the centimetre: a rectangle from 71.05° W to 70.90° W and from 42.70° N to 42.82° N; a polygon of 7 corners near the mouth of the Merrimack River; and a polygon of 5 corners that crosses the north and east edges of the layers. The Series tools used the polygon of 7 corners |
| Files compared | Two results that `run_tool` made from layers that the web service received from NASA Harmony for the box of the pilot area: Backscatter, One date, from the layer `HHHH` of `NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001` (layer file SHA-256 `19d013fbe63fb2501893681e9d865b3f5aa93afeaf3cbce6949d0ed7ea0ff262`), 3772 by 3972 cells of 10 m in dB; Coherence, One pair, from the layer `wrappedInterferogram/HH/coherenceMagnitude` of `NISAR_L2_PR_GUNW_032_141_D_067_033_4000_SH_20261009T234330_20261009T234405_20261021T234330_20261021T234405_P05036_N_F_J_001` (layer file SHA-256 `458a0065fbef17f23c755e27545ca00049348bce18ef03bdd974ce2557162e10`), 1886 by 1985 cells of 20 m. For the Series tools, the four layers `HHHH` and the three coherence layers of `docs/methods/backscatter-series.md` and `docs/methods/coherence-series.md`. The files were read at full resolution |
| Platform | `Linux-6.8.0-146-generic-x86_64-with-glibc2.41`. Lynkeus: Python 3.13.18, numpy 2.5.4, rasterio 1.5.2 (GDAL 3.12.2). The comparison of the two sides: Python 3.12.3 with its standard library only. The comparison was made on 15 Nov 2026; its records are kept in `docs/research/records/analysis/area-statistics/` (`comparison.json`, `gdal_side.json`, `lynkeus_side.json`, `gdal_commands.txt`) |
| Largest difference | In the six runs both sides count the same cells, with the same values: 1,636,536, 844,889 and 720,547 cells of the backscatter result, and 409,132, 211,222 and 180,139 of the coherence result. The lowest value, the median and the highest value are equal. The mean differs by at most `7.105427357601002e-15` dB (8 units in the last place) and the standard deviation by at most `1.3855583347321954e-13` dB (156 units in the last place). From the exact values, the numbers of Lynkeus differ by at most 1 unit in the last place, and those of the program by at most 7 for the mean and 156 for the standard deviation: the program adds the values one after another and updates the deviation with the formula of West (1979) (`alg/raster_stats.h`), while numpy adds them in pairs and computes the deviation in two passes. The series of the polygon are equal to those of the program on every date, with the same numbers of cells |
| Not reached | An area without a cell that counts (a test covers it on a made-up grid); the centre of a cell exactly on a side; the tools of change, of surface displacement and of soil moisture; areas near the poles or larger than the zone of the projection of the result; jobs of the web service and of the own servers of visitors; the rules `fractional` and `all-touched` of the program, which Lynkeus does not use. `docs/research/analysis-area-statistics.md`, part 4, gives the numbers of each run |

## Not yet confirmed

1. A layer of classes. A tool that maps classes is to give the share of each class inside the area
   in the place of these statistics; no such tool is in the list of tools of this release.
2. A server of a visitor whose program is older than this option refuses a job with an area, with
   the sentence "This server does not accept the inputs of the job. Install the newest version." A
   job without an area is sent without the field and is accepted, as before.
3. The area is not kept in the browser, and it is not part of a shared link.
4. Areas near the poles and areas larger than the zone of the projection of the result were not
   tried on real layers. The server refuses a corner more than 80 degrees of longitude from the
   centre of the result and a point that does not return to itself within 1 cm; between those
   limits, PROJ places the area without a further check.
