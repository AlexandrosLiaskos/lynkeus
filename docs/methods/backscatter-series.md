# Backscatter, Series

| | |
|---|---|
| Tool | `backscatter-series` (Analysis tab, group Backscatter, button Series) |
| NISAR product | GCOV, Level-2 Geocoded Polarimetric Covariance |
| Result | Radar backscatter gamma0 of many dates against time, at a point or as the mean of the area of the layers, in decibels (dB). The result is a series, not a layer |
| State | The comparison (D-17) was made on 15 Nov 2026 on four layers `HHHH` of the pilot area (27 Sep, 9 Oct, 21 Oct and 2 Nov 2026), for the mean of the area and at five points, against statements of the ASF NISAR Cookbook. On the same day the tool ran as jobs of a private copy of the web service. The interface offers the tool and shows a series as a chart with a table; this was run in the tests of the interface and was not seen in a browser |

## In brief

| | |
|---|---|
| What it shows | The radar backscatter (gamma0) of many dates against time, at a point or as the mean of the area, in decibels. |
| Input | The same backscatter layer of 2 to 50 GCOV products of one track, direction and frame, one for each date. A point is given by its latitude and longitude, and an area is drawn on the map or is the whole layer. |
| Formula | `10 * log10(mean(gamma0))` over the cells of each date inside the area. At a point it is the one cell that holds the point. |
| Result | A series in decibels (dB): one value for each date, with the number of cells behind it. It is shown as a chart and a table, and it has no file. |
| How to read | Each value is one date. A higher value means that the surface returned more of the radar signal on that date. The cause of a change is for the user to establish. |
| Limits | The values may come from products of two processing releases, provisional and validated, and it is not confirmed that they compare without a correction. Over an area the value is the mean of the power, given in decibels. One area and four dates were compared. |
| Checked | For the mean of the area and at five points, the values differ from those of the notebooks of the ASF NISAR Cookbook by less than 0.00001 dB (lower Merrimack River, 27 Sep to 2 Nov 2026). |
| References | [ASF NISAR Cookbook](https://github.com/ASFOpenSARlab/NISAR_Cookbook). [NISAR L2 GCOV Product Specification, JPL D-102274 Rev F](https://nisar-docs.asf.alaska.edu/product-specification/). [SDS Product File Naming Conventions, JPL D-102255 Rev C](https://nisar-docs.asf.alaska.edu/naming-conventions/). |

## Reference

1. NASA SDS Product Specification, Level-2 Geocoded Polarimetric Covariance (L2 GCOV), JPL D-102274,
   Rev F, version 1.5.0, 8 July 2026. Section 2.2 and Table 5-3 (the covariance terms); Table 5-7
   (the field `outputBackscatterDecibelConversionFormula`). `docs/research/analysis.md`, part 2.1,
   gives the revision that the products of the pilot area follow.
2. ASF NISAR Cookbook, notebook
   [`NISAR_GCOV_Time_Series_Example.ipynb`](https://github.com/ASFOpenSARlab/NISAR_Cookbook/blob/17b69c87a7320610740be7f2c7e605601cb7fe43/notebooks/NISAR_GCOV_Time_Series_Example.ipynb),
   commit `17b69c8` of 3 Nov 2026. Section 6c (cell 34): the mean backscatter is computed in power
   scale and not in decibels. Section 8 (cells 44 to 49): the time series of means.
3. ASF NISAR Cookbook, notebook
   [`NISAR_Pixel_Conversion.ipynb`](https://github.com/ASFOpenSARlab/NISAR_Cookbook/blob/17b69c87a7320610740be7f2c7e605601cb7fe43/notebooks/NISAR_Pixel_Conversion.ipynb),
   the same commit. Cell 20: the pixel of a point given in longitude and latitude.
4. ASF, Introduction to SAR, sections Power Scale and dB Scale
   (<https://hyp3-docs.asf.alaska.edu/guides/introduction_to_sar/>, read 15 Nov 2026).
5. Science Data Systems (SDS) L-SAR Product File Naming Conventions, JPL D-102255, Rev C,
   19 October 2025. Section 3.7 (the fields of the name of a GCOV product file); section 4.1, pages
   20 and 21 (the composite release identifier, CRID).
6. NISAR Data User Guide of the ASF DAAC, page Available NISAR Data
   (<https://nisar-docs.asf.alaska.edu/availability-overview/>; source at commit `47d55b1` of
   13 Nov 2026, read 15 Nov 2026): the provisional and the validated products and their releases.

## Input layer

The tool has two or more inputs, up to 50: the same diagonal covariance term of GCOV products of the
same track and frame, one layer for each date, in any order.

| Layer | Path in the product | Type | Unit | No data |
|---|---|---|---|---|
| `HHHH`, `HVHV`, `VHVH`, `VVVV`, `RHRH` or `RVRV` | `/science/LSAR/GCOV/grids/frequencyA/<term>` | Float32 | `1` (gamma0 in linear power) | `nan` |

The request may give a point, in degrees of longitude and latitude (WGS 84). The server turns the
point into the cell of the grid of the layers that holds it, and the series is that of this one
cell. Without a point the series is that of the whole area of the layers. The tool does not read the
layer `mask` of the product (`docs/research/analysis.md`, part 4.4).

### What the tool refuses

The server and the tool make the checks below in this order and report the first fault that they
find. A refusal is raised as `LayerError` of `lynkeus.writing`, and its message is one sentence for
the visitor. The checks 1 to 14 are made on the layer descriptions and on the grids, before any
value is read.

| No. | The tool refuses the input when | Sentence for the visitor |
|---|---|---|
| 1 | a layer of the request is not a layer of the session | `A layer of the analysis no longer exists.` |
| 2 | the layers differ in projection, transform, width or height | `The layers of the analysis do not have the same grid.` |
| 3 | the point lies outside the grid of the layers | `The point lies outside the area of the layers.` |
| 4 | the layers are fewer than two | `A series needs at least 2 layers, and it has <number>.` |
| 5 | a layer was not received from one product file of the type GCOV: its `kind` is not `layer`, its `inputs` do not hold exactly one name, or that name does not begin as the name of a NISAR product file of the type GCOV | `The layer "<title>" is not a layer received from one NISAR GCOV product.` |
| 6 | a layer description does not hold the name of the layer inside the product (field `layer`) | `The layer "<title>" does not record which layer of its product it is; receive it again with Get layer.` |
| 7 | the name of a layer inside the product is not one of the six diagonal terms | `The layer "<title>" is the layer <name> of its product, and the tool reads a diagonal covariance term (HHHH, HVHV, VHVH, VVVV, RHRH or RVRV).` |
| 8 | the unit of a layer is not `1` | `The layer "<title>" has the unit <unit>, and the tool reads the unit 1.` |
| 9 | a layer does not have one date | `The number of dates of the layer "<title>" must be 1, and it is <number>.` |
| 10 | the layers are not the same term | `The layers are not the same layer of their products: "<title>" is <name> and "<title>" is <name>.` |
| 11 | the products are not of the same instrument, track, direction and frame | `The layers are not of the same instrument, track, direction and frame.` |
| 12 | the name of a product file does not end with the release of the processing software and the four fields after it | `The name of the product file of the layer "<title>" does not hold the release of the processing software.` |
| 13 | the products are not of the same environment and major release of the processing software (the first three characters of the CRID) | `The layers are not of the same major release of the processing software: "<title>" is of the release <CRID> and "<title>" of <CRID>.` |
| 14 | two layers have the same date | `The layers "<title>" and "<title>" have the same dates.` |
| 15 | the arrays of two layers differ in size | `The input layers do not have the same grid.` |
| 16 | no layer holds a finite value above zero, in the cell of the point or in any cell | `No layer of the series holds a value at the point.` or `No layer of the series holds a value in any cell.` |

A request with one layer, with one layer given twice or with a point outside −180 to 180 degrees of
longitude or −90 to 90 degrees of latitude is refused by the web service before a job is made, with
the status 400. The instrument, the track, the direction, the frame and the release are read from
the name of the product file (naming conventions, sections 3.7 and 4.1).

Products of the provisional collection (release `P05023`) and of the validated collection (release
`P05036`) pass check 13: the two releases have the same environment and major release, `P05`, and by
the definition of the naming conventions only a major release "impacts the data content"
(`docs/research/analysis-series.md`, part 2.2).

## Formula

For the layer of each date, with `P` the values of the cells that enter:

```text
value = 10 * log10(mean(P))        cells = number of cells that enter
```

A cell enters when it holds a finite value above zero. For a series of an area these are such cells
of the layer of that date whose centre lies inside the area drawn on the map, found as
`docs/methods/area-statistics.md` describes (section Method, steps 1 and 2), or all such cells of the
layer when no area is drawn; at a point it is the one cell of the point. An entry without such
a cell has no value (`null`) and 0 cells. The mean is taken in 64-bit numbers. The mean of the power
is not the mean of the decibel values: the reference states that the mean backscatter cannot be
taken in the logarithmic scale (reference 2, cell 34).

The cell of a point is found from the six coefficients of the grid (`a`, `b`, `c`, `d`, `e`, `f`,
with `x = a * column + b * row + c` and `y = d * column + e * row + f`) after the point has been
transformed to the projection of the grid: the column and the row are the whole parts of the
solution of these two equations for `x` and `y` of the point.

## Unit

Decibels (dB) of gamma0. The values are 64-bit numbers.

## Reduced copies of the result

A series has no file and no reduced copies. The tool reads every layer at full resolution, so a
value of a series of the area is the mean of the cells of the product and not of a reduced copy.
The field `reduction` of the series description is `mean-power`: the value of a date is the
decibels of the mean of the linear power of its cells.

## Legend

A series is drawn as a chart and has no colour scale. The fields below take the place of the legend.

| Field of the series description | Value |
|---|---|
| `quantity` | Radar backscatter gamma0 |
| `unit` | dB |
| `range` | none (`null`): the limits of the value axis follow the values |
| `reduction` | `mean-power` |

No source read gives fixed limits in decibels for NISAR L-band gamma0
(`docs/research/analysis.md`, part 5.4), so the series has none.

## How to read the result

Each entry is one date. A series of the area shows how the mean backscatter of the whole box changes
between the dates; a series at a point shows one cell of its layer (10 m in the layers of the pilot
area). On the four dates of the pilot area the mean of the area lay between -4.83 and -4.32 dB,
while the value at each of the five points of the comparison changed by 3.1 to 5.4 dB between its lowest
and its highest date (`docs/research/analysis-series.md`, part 4.2). What part of the change at one
cell comes from the surface was not researched, and the sheet states no threshold. The number of
cells of each entry shows whether the dates are means of the same cells. The names of the product
files in the field `inputs` show the release of each date: a series may hold provisional and
validated products. Reference 6 warns, for provisional and beta products, that some differences
between products of different releases are due to changes in the processing software; it gives no
statement for provisional and validated products.

## Comparison with the source program (D-17)

| | |
|---|---|
| Source program | ASF NISAR Cookbook, commit `17b69c87a7320610740be7f2c7e605601cb7fe43` of 3 Nov 2026: the statements of the cells 31, 35, 47 and 49 of `NISAR_GCOV_Time_Series_Example.ipynb` for the mean of the area, and the whole cell 20 of `NISAR_Pixel_Conversion.ipynb` for the cell of a point |
| Licence | Apache-2.0 |
| Comparison | The series that `run_series` gives on the files of the layers against the results of the statements of the source program on the same files: the mean of the area in decibels with the number of cells of each date, and the cell and the value at five points. The statements of the mean were executed as written, on 32-bit numbers, and again on 64-bit numbers |
| File compared | The layer `HHHH` of four products, as the web service received them from NASA Harmony for the box of the pilot area, 3772 by 3972 cells of 10 m each: `NISAR_L2_PR_GCOV_031_141_D_067_4005_DHDH_A_20260927T234330_20260927T234405_P05023_N_F_J_001` (layer file SHA-256 `f3184485fdeac534b436d670bf3d4a5a8a324360e230399ae710ba1274e8dadf`); `NISAR_L2_PR_GCOV_032_141_D_067_4005_DHDH_A_20261009T234330_20261009T234405_P05023_N_F_J_001` (layer file SHA-256 `bfba2bfa3488451f0972df3dbc34242162ae00a5a7adc9ee85826f5ce7d539f0`); `NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001` (layer file SHA-256 `19d013fbe63fb2501893681e9d865b3f5aa93afeaf3cbce6949d0ed7ea0ff262`); `NISAR_L2_PR_GCOV_034_141_D_067_4005_DHDH_A_20261102T234330_20261102T234405_P05036_N_F_J_001` (layer file SHA-256 `9ea6c973f9e79c39bf5881a75ccede4b50f5875b394c0330981b311884884b34`). The first two are of the provisional collection and the last two of the validated collection. The files were read at full resolution |
| Platform | `Linux-6.8.0-146-generic-x86_64-with-glibc2.41`, Python 3.13.18. Lynkeus: numpy 2.5.4, rasterio 1.5.2 (GDAL 3.12.2). Source program: numpy 2.5.3, xarray 2026.7.0, rioxarray 0.22.0, rasterio 1.4.4 (GDAL 3.10.3), pyproj 3.8.0 (PROJ 9.8.1). The comparison was made on 15 Nov 2026; its records are kept in `docs/research/records/analysis/series/` (`comparison.json`, `source_side.json`, `lynkeus_side.json`) |
| Largest difference | Mean of the area: at most `7.6935296622338e-07` dB from the statements as written, and `0.0` dB on each of the four dates from the same statements on 64-bit numbers. The numbers of cells are equal on every date (14,316,415, 14,316,411, 14,316,413, 14,316,416). At the five points the tool and the source program give the same cell, and the values differ by at most `2.00968590391426e-06` dB; the value of the source program is a 32-bit number. The results of the jobs of the web service equal the series of the comparison |
| Not reached | Cells that are zero, negative or infinite, a date without a value and a point whose cell holds no data (the tests cover them on made-up grids); a point on the line between two cells; the terms other than `HHHH`; the HDF5 product files that the notebooks open; other areas, and more than four dates. `docs/research/analysis-series.md`, part 4.4, lists what the comparison does not show |

The exact numbers of the comparison are in `docs/research/analysis-series.md`, part 4.

## Not yet confirmed

1. Whether a provisional and a validated product may be compared without a correction. The product
   documentation gives no statement for this pair of maturities, and the page of NASA that lists the
   changes between the releases `P05023` and `P05036` could not be read
   (`docs/research/analysis-series.md`, part 2.2). The tool accepts the two in one series because
   they are of the same major release.
2. The terms `HVHV`, `VHVH`, `VVVV`, `RHRH` and `RVRV`: the tool accepts them by their names, and
   only layers `HHHH` were received and computed.
3. How the chart of a series looks on a screen. The interface draws the values against time, with a
   table under the chart, and this was run in the tests of the interface only; it was not seen in a
   browser (`docs/research/analysis-series.md`, part 8).
4. A point exactly on the line between two cells, for which the rule of the tool and the rule of the
   source program can give different cells. No such point was compared.
