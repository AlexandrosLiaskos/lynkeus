# Coherence, Series

| | |
|---|---|
| Tool | `coherence-series` (Analysis tab, group Coherence, button Series) |
| NISAR product | GUNW, Level-2 Geocoded Unwrapped Interferogram |
| Result | Magnitude of the interferometric coherence of many pairs of dates against time, at a point or as the mean of the area of the layers, without unit. The result is a series, not a layer |
| State | The comparison (D-17) was made on 15 Nov 2026 on three layers `coherenceMagnitude` of the pilot area (the pairs 15 and 27 Sep, 27 Sep and 9 Oct, 9 and 21 Oct 2026; channel HH, 20 m), for the mean of the area and at five points. On the same day the tool ran as jobs of a private copy of the web service. The interface offers the tool and shows a series as a chart with a table; this was run in the tests of the interface and was not seen in a browser |

## In brief

| | |
|---|---|
| What it shows | The interferometric coherence of many pairs of dates against time, at a point or as the mean of the area: a value from 0 to 1 that states how alike the radar echoes of two dates are. |
| Input | The same coherence layer (`coherenceMagnitude`) of 2 to 50 GUNW products of one track, direction and frame, one for each pair. A point is given by its latitude and longitude. |
| Formula | The mean of the layer of the product over the cells of each pair. At a point it is the one cell that holds the point. |
| Result | A series without unit, from 0 to 1: one value for each pair, with the number of cells behind it. It is shown as a chart and a table, and it has no file. |
| How to read | Each value is one pair, drawn from its first to its second date. Near 1, the radar echoes of the two dates are alike, and near 0 they differ. Pairs of different spans can stand in one series. |
| Limits | The values may come from products of two processing releases, provisional and validated, and it is not confirmed that they compare without a correction. The mean coherence of an area is biased toward higher values (Touzi et al., 1999, abstract), and the tool applies no correction. One area and three pairs were compared. |
| Checked | For the mean of the area, the values differ by less than 0.0000001 from the mean that the code of a notebook of the ASF NISAR Cookbook gives on the same layers, and at five points they are equal (lower Merrimack River, 15 Sep to 21 Oct 2026). |
| References | [Touzi et al. (1999)](https://doi.org/10.1109/36.739146), of which the abstract was read. [NISAR L2 GUNW Product Specification, JPL D-102272 Rev E](https://nisar-docs.asf.alaska.edu/product-specification/). [ASF NISAR Cookbook](https://github.com/ASFOpenSARlab/NISAR_Cookbook). |

## Reference

1. NASA SDS Product Specification, Level-2 Geocoded Unwrapped Interferogram (L2 GUNW), JPL D-102272,
   Rev E, version 1.2.1, 8 November 2024. Sections 2.2 and 3.2.4; Table 3-11; the entries of
   `coherenceMagnitude` on pages 35 to 37. `docs/research/analysis.md`, part 2.2, gives the revision
   that the products of the pilot area follow.
2. Touzi, R., Lopes, A., Bruniquel, J. and Vachon, P. W. (1999). Coherence estimation for SAR
   imagery. IEEE Transactions on Geoscience and Remote Sensing, 37(1), 135-149.
   <https://doi.org/10.1109/36.739146>. Only the abstract was read.
3. ASF NISAR Cookbook, commit `17b69c8` of 3 Nov 2026: notebook
   [`NISAR_GCOV_Time_Series_Example.ipynb`](https://github.com/ASFOpenSARlab/NISAR_Cookbook/blob/17b69c87a7320610740be7f2c7e605601cb7fe43/notebooks/NISAR_GCOV_Time_Series_Example.ipynb),
   cell 47 (the mean of each date of a cube), and notebook
   [`NISAR_Pixel_Conversion.ipynb`](https://github.com/ASFOpenSARlab/NISAR_Cookbook/blob/17b69c87a7320610740be7f2c7e605601cb7fe43/notebooks/NISAR_Pixel_Conversion.ipynb),
   cell 20 (the pixel of a point).
4. Science Data Systems (SDS) L-SAR Product File Naming Conventions, JPL D-102255, Rev C,
   19 October 2025. Section 3.8 (the fields of the name of a GUNW product file); section 4.1, pages
   20 and 21 (the composite release identifier, CRID).
5. NISAR Data User Guide of the ASF DAAC, pages Available NISAR Data and Known Issues
   (<https://nisar-docs.asf.alaska.edu/availability-overview/>; source at commit `47d55b1` of
   13 Nov 2026, read 15 Nov 2026).

## Input layer

The tool has two or more inputs, up to 50: the same layer `coherenceMagnitude` of GUNW products of
the same track and frame, one layer for each pair of dates, in any order.

| Spacing | Path in the product | Type | Unit | No data |
|---|---|---|---|---|
| 80 m | `/science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram/[HH or VV]/coherenceMagnitude` | Float32 | `1` | `nan` |
| 20 m | `/science/LSAR/GUNW/grids/frequencyA/wrappedInterferogram/[HH or VV]/coherenceMagnitude` | Float32 | `1` | `nan` |

All layers of one series are of the same spacing and channel. The request may give a point, in
degrees of longitude and latitude (WGS 84). The server turns the point into the cell of the grid of
the layers that holds it, and the series is that of this one cell. Without a point the series is
that of the whole area of the layers. The tool does not read the layers `mask` and `validDataMask`
of the product (`docs/research/analysis.md`, part 2.2).

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
| 5 | a layer was not received from one product file of the type GUNW: its `kind` is not `layer`, its `inputs` do not hold exactly one name, or that name does not begin as the name of a NISAR product file of the type GUNW | `The layer "<title>" is not a layer received from one NISAR GUNW product.` |
| 6 | a layer description does not hold the name of the layer inside the product (field `layer`) | `The layer "<title>" does not record which layer of its product it is; receive it again with Get layer.` |
| 7 | the name of a layer inside the product is not one of the four names `unwrappedInterferogram/HH/coherenceMagnitude`, `unwrappedInterferogram/VV/coherenceMagnitude`, `wrappedInterferogram/HH/coherenceMagnitude` and `wrappedInterferogram/VV/coherenceMagnitude` | `The layer "<title>" is the layer <name> of its product, and the tool reads the layer coherenceMagnitude.` |
| 8 | the unit of a layer is not `1` | `The layer "<title>" has the unit <unit>, and the tool reads the unit 1.` |
| 9 | a layer does not have two dates | `The number of dates of the layer "<title>" must be 2, and it is <number>.` |
| 10 | the layers are not the same of the four layers | `The layers are not the same layer of their products: "<title>" is <name> and "<title>" is <name>.` |
| 11 | the products are not of the same instrument, track, direction and frame | `The layers are not of the same instrument, track, direction and frame.` |
| 12 | the name of a product file does not end with the release of the processing software and the four fields after it | `The name of the product file of the layer "<title>" does not hold the release of the processing software.` |
| 13 | the products are not of the same environment and major release of the processing software (the first three characters of the CRID) | `The layers are not of the same major release of the processing software: "<title>" is of the release <CRID> and "<title>" of <CRID>.` |
| 14 | two layers have the same two dates | `The layers "<title>" and "<title>" have the same dates.` |
| 15 | the arrays of two layers differ in size | `The input layers do not have the same grid.` |
| 16 | a cell of a layer holds a value below 0 or above 1, or an infinite value | `The layer "<title>" holds values outside 0 to 1, so it is not a coherence magnitude.` |
| 17 | no layer holds a value, in the cell of the point or in any cell | `No layer of the series holds a value at the point.` or `No layer of the series holds a value in any cell.` |

A request with one layer, with one layer given twice or with a point outside −180 to 180 degrees of
longitude or −90 to 90 degrees of latitude is refused by the web service before a job is made, with
the status 400. Two pairs that share one date, such as two consecutive pairs, are accepted. One cell
outside 0 to 1 refuses its whole layer, also for a series at a point, as in the tool Coherence, One
pair.

Products of the provisional collection (release `P05023`) and of the validated collection (release
`P05036`) pass check 13: the two releases have the same environment and major release, `P05`
(`docs/research/analysis-series.md`, part 2.2).

## Formula

For the layer of each pair, with `C` the values of the cells that hold a value:

```text
value = mean(C)        cells = number of cells that hold a value
```

For a series of the area these are all cells of the layer of that pair that hold a value; at a
point it is the one cell of the point. An entry without such a cell has no value (`null`) and 0
cells. The mean is taken in 64-bit numbers. Lynkeus does not compute the coherence: each value `C`
is the layer of the product, which the mission computes with ISCE3
(`docs/methods/coherence-state.md`, section Formula). The cell of a point is found as the sheet
`docs/methods/backscatter-series.md` describes.

## Unit

None (the product gives the unit `1`). The values lie between 0 and 1 and are 64-bit numbers.

## Reduced copies of the result

A series has no file and no reduced copies. The tool reads every layer at full resolution. The
field `reduction` of the series description is `mean`: the value of a pair is the mean of the
coherence values of its cells.

## Legend

A series is drawn as a chart and has no colour scale. The fields below take the place of the legend.

| Field of the series description | Value |
|---|---|
| `quantity` | Interferometric coherence (magnitude) |
| `unit` | `1` |
| `range` | 0 to 1 |
| `reduction` | `mean` |

The range is that of the legend of the tool Coherence, One pair, which is that of the
quality-assurance program of the mission (`docs/methods/coherence-state.md`, section Legend). It is
fixed, so that two series can be compared.

## How to read the result

Each entry is one pair, with its two dates. Near 1, the radar echoes of the two dates are alike;
near 0, they are not (`docs/methods/coherence-state.md`, section How to read the result). A series
of the area is the mean of the coherence magnitudes of its cells. It is not the coherence of the
area estimated from the complex images, and the space-averaged coherence magnitude is biased toward
higher values (Touzi et al., 1999, abstract); the tool applies no correction. The tool does not
compare the time between the two dates of each pair: pairs of different spans can stand in one
series, and the two dates of each entry show the span. The three pairs of the pilot area span
12 days each. A series may hold provisional and validated products; the guide of the ASF DAAC states
that a fault of a small part of the provisional products, which was resolved with the release
`P05036`, could cause decorrelation in InSAR products (reference 5). The sheet states no threshold.

## Comparison with the source program (D-17)

| | |
|---|---|
| Source program | For the mean of the area and the cell of a point: ASF NISAR Cookbook, commit `17b69c87a7320610740be7f2c7e605601cb7fe43` of 3 Nov 2026, the mean statement of cell 47 of `NISAR_GCOV_Time_Series_Example.ipynb` applied to the cube of the coherence layers, and the whole cell 20 of `NISAR_Pixel_Conversion.ipynb`. The Cookbook has no series of coherence. ISCE3 produced the layers |
| Licence | Apache-2.0 |
| Comparison | The series that `run_series` gives on the files of the layers against the mean of each layer and the value at five points that the statements of the source program give on the same files, in 32-bit numbers, and against `numpy.nanmean` of each layer in 64-bit numbers |
| File compared | The layer `wrappedInterferogram/HH/coherenceMagnitude` of three products, as the web service received them from NASA Harmony for the box of the pilot area, 1886 by 1985 cells of 20 m each: `NISAR_L2_PR_GUNW_030_141_D_067_031_4000_SH_20260915T234330_20260915T234405_20260927T234330_20260927T234405_P05023_N_F_J_001` (layer file SHA-256 `605dd1a6e8bb17341e6c8815d569039e454c93ef8c7d29b79eb546f4ea3589b8`); `NISAR_L2_PR_GUNW_031_141_D_067_032_4000_SH_20260927T234330_20260927T234405_20261009T234330_20261009T234405_P05023_N_F_J_001` (layer file SHA-256 `adf53bf40f856f216a372c98974aefb2697e0b505017dac1f15433c871079f3e`); `NISAR_L2_PR_GUNW_032_141_D_067_033_4000_SH_20261009T234330_20261009T234405_20261021T234330_20261021T234405_P05036_N_F_J_001` (layer file SHA-256 `458a0065fbef17f23c755e27545ca00049348bce18ef03bdd974ce2557162e10`). The first two are of the provisional collection and the last one of the validated collection. The files were read at full resolution |
| Platform | `Linux-6.8.0-146-generic-x86_64-with-glibc2.41`, Python 3.13.18. Lynkeus: numpy 2.5.4, rasterio 1.5.2 (GDAL 3.12.2). Source program: numpy 2.5.3, xarray 2026.7.0, rioxarray 0.22.0, rasterio 1.4.4 (GDAL 3.10.3), pyproj 3.8.0 (PROJ 9.8.1). The comparison was made on 15 Nov 2026; its records are kept in `docs/research/records/analysis/series/` (`comparison.json`, `source_side.json`, `lynkeus_side.json`) |
| Largest difference | Mean of the area: at most `1.1983468384269003e-08` from the mean statement of the notebook, which works in 32-bit numbers, and `0.0` for each of the three pairs from the mean in 64-bit numbers. The numbers of cells are equal for every pair (3,579,092 each). At the five points the tool and the source program give the same cell and equal values (difference `0.0`). The results of the jobs of the web service equal the series of the comparison |
| Not reached | A pair without a value and a point whose cell holds no data (the tests cover them on made-up grids); a point on the line between two cells; the channel VV and the layer at 80 m; the HDF5 product files; other areas, and more than three pairs. `docs/research/analysis-series.md`, part 4.4, lists what the comparison does not show |

The exact numbers of the comparison are in `docs/research/analysis-series.md`, part 4.

## Not yet confirmed

1. Whether a provisional and a validated product may be compared without a correction
   (`docs/research/analysis-series.md`, part 2.2). The tool accepts the two in one series because
   they are of the same major release.
2. The correction of the bias of the space-averaged coherence magnitude that Touzi et al. (1999)
   propose. Only the abstract of the article was read, and the tool applies no correction.
3. The layers `coherenceMagnitude` of the channel VV and of the unwrapped interferogram (80 m): the
   tool accepts them by their names, and only layers of the channel HH of the wrapped interferogram
   (20 m) were received and computed.
4. How the chart of a series looks on a screen. The interface draws each pair as a horizontal line
   from its first to its second date, with a table under the chart, and this was run in the tests of
   the interface only; it was not seen in a browser (`docs/research/analysis-series.md`, part 8).
