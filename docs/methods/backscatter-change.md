# Backscatter, Change

| | |
|---|---|
| Tool | `backscatter-change` (Analysis tab, group Backscatter, button Change) |
| NISAR product | GCOV, Level-2 Geocoded Polarimetric Covariance |
| Result | Change of the radar backscatter gamma0 between two dates, in decibels (dB) |
| State | The comparison with the source program (D-17) was made on 14 Nov 2026 on the sample files of the pilot area. It was repeated independently on 15 Nov 2026, with other scripts, and gave the same numbers. |

## Reference

1. Rignot, E. J. M. and van Zyl, J. J. (1993). Change detection techniques for ERS-1 SAR data. IEEE
   Transactions on Geoscience and Remote Sensing, 31(4), 896-906.
   <https://doi.org/10.1109/36.239913>. The article compares the difference and the ratio of the
   radar intensities of two dates and finds the ratio better adapted to the statistics of radar
   data. Only the abstract of the article was read.
2. NASA SDS Product Specification, Level-2 Geocoded Polarimetric Covariance (L2 GCOV), JPL D-102274,
   Rev F, version 1.5.0, 8 July 2026. Sections 2.2 and 4.3.3; Table 5-3 (from page 35). Rev F is the
   latest revision that the ASF DAAC publishes
   (<https://nisar-docs.asf.alaska.edu/product-specification/>, read 14 Nov 2026). The products of
   the pilot area follow version 1.6.0, which is public as the file
   [`nisar_L2_GCOV.xml`](https://github.com/isce-framework/nisarqa/blob/a8bc425f5e8873174471d6a12fe622df338623d1/src/nisarqa/product_specs/1.6.0/nisar_L2_GCOV.xml)
   (nisarqa commit `a8bc425` of 30 Sep 2026) and defines the layers of this sheet as version 1.5.0
   does.
3. Science Data Systems (SDS) L-SAR Product File Naming Conventions, JPL D-102255, Rev C,
   19 October 2025. Sections 3.7 and 3.8. The tool reads the product type, the track, the direction
   and the frame of each input from the name of its product file.

## Input layers

The inputs are given in this order.

| No. | Layer | Path in the product | Type | Unit | No data |
|---|---|---|---|---|---|
| 1 | One diagonal covariance term of the earlier date | `/science/LSAR/GCOV/grids/frequency[A or B]/<term>` | Float32 | `1` (linear power) | `nan` |
| 2 | The same term of the later date | as above, in the product of the later date | Float32 | `1` (linear power) | `nan` |

The layers are described in the sheet [Backscatter, One date](backscatter-state.md).

### What the tool refuses

The tool receives the two arrays and their layer descriptions. It makes the checks below in this
order and reports the first fault that it finds. A refusal is raised as `LayerError` of
`lynkeus.writing`, as `main` asks of a tool (`api/README.md`, section Analysis tools as processes),
and its message is one sentence for the visitor.

| No. | The tool refuses the inputs when | Sentence for the visitor |
|---|---|---|
| 1 | the number of input layers is not two | `The number of input layers must be 2, and it is <number>.` |
| 2 | the two arrays do not have the same number of rows and of columns | `The input layers do not have the same grid.` |
| 3 | a layer was not received from one product file of the type GCOV: its `kind` is not `layer`, its `inputs` do not hold exactly one name, or that name does not begin as the name of a NISAR product file of the type GCOV | `The layer "<title>" is not a layer received from one NISAR GCOV product.` |
| 4 | the description of a layer does not hold the name of the layer inside the product (field `layer`); this is the case of a layer that was received before Lynkeus recorded that name | `The layer "<title>" does not record which layer of its product it is; receive it again with Get layer.` |
| 5 | the name of a layer inside its product is not one of the six diagonal covariance terms `HHHH`, `HVHV`, `VHVH`, `VVVV`, `RHRH` and `RVRV` | `The layer "<title>" is the layer <name> of its product, and the tool reads a diagonal covariance term (HHHH, HVHV, VHVH, VVVV, RHRH or RVRV).` |
| 6 | the unit of a layer is not `1` | `The layer "<title>" has the unit <unit>, and the tool reads the unit 1.` |
| 7 | a layer does not have one date | `The number of dates of the layer "<title>" must be 1, and it is <number>.` |
| 8 | the two layers are not the same term | `The two layers are not the same covariance term: the first is <name> and the second is <name>.` |
| 9 | the two products are not of the same instrument, track, direction of the orbit and frame | `The two layers are not of the same instrument, track, direction and frame.` |
| 10 | the date of the first layer is not earlier than the date of the second | `The first layer must be of an earlier date than the second.` |
| 11 | no cell of the result would hold a value | `The result would hold no value in any cell.` |
| 12 | the 99th percentile of the absolute values of the result is zero, so the legend has no range | `The values of the result are too alike to give the legend a range.` |

Checks 2 to 7 are made for the first layer and then for the second. The product type, the
instrument (`L` or `S`), the track, the direction (`A` or `D`) and the frame are read from the
beginning of the name of each product file (naming conventions, sections 3.7 and 3.8).
An array that is not two-dimensional Float32 is a fault of the calling program and raises
`ValueError`, which is not a refusal for the visitor.

The name of the layer inside the product is the field `layer` of the layer description, which the
Data part fills for every layer that it receives (sheet Backscatter, One date, section What the tool
refuses). Check 5 refuses a layer that is not a diagonal covariance term, among them the layers
`rtcGammaToSigmaFactor`, `numberOfLooks` and `mask`. Check 8 refuses two different terms, for
example `HHHH` of the earlier date with `HVHV` of the later date. The Data part receives the layers
of the group `frequencyA` only (`_GROUPS` in `api/src/lynkeus/harmony.py`), so the two terms are of
the same frequency; the field `layer` does not name the frequency.

The tool does not resample. The function receives the two arrays and no coordinates, so it can check
only their numbers of rows and of columns. In `main` at commit `0ad795b` the server reads the layers
and compares their grids before it calls the tool: the projection, the six coefficients of the
transform, the width and the height (`api/src/lynkeus/tools.py`, lines 82 to 89;
`api/src/lynkeus/writing.py`, lines 71 to 92). It refuses layers whose grids differ with the
sentence "The layers of the analysis do not have the same grid." Through the server, check 2 of the
tool therefore cannot fail. The two sample files, which Harmony clipped to the same box, have the
same grid: projection EPSG:32619, 3772 by 3972 cells of 10 m, and the same origin. The specification
does not state that two products of one track and frame share one grid. The two pilot products have
the same grid in the product files: 35,640 rows by 36,072 columns of 10 m, and the rectangle of the
samples begins at row 12,903 and column 13,664 in both (read on 15 Nov 2026).

### The mask of the product

A GCOV product holds a layer `mask` beside the terms: `0` for a cell that is invalid or partially
focused, `1` to `5` for a valid cell, and `255` for a cell outside the acquisition (specification,
section 4.3.3; the sheet Backscatter, One date gives the layer in full).

The tool does not read the masks of the two products and applies none. Its only inputs are the two
terms. The statements of the source program apply no mask either: no cell of the notebook reads the
layer `mask` of a product (notebook at commit `17b69c8`, read on 15 Nov 2026).

The masks of the two sample products were received from NASA Harmony on 14 Nov 2026, clipped to the
box of the pilot area, on the grid of the terms.

| Mask on 21 Oct 2026, on 2 Nov 2026 | Cells | Of these, with a value of the change |
|---|---|---|
| `0`, `0` | 16 | 0 |
| `0`, `1` | 11 | 0 |
| `1`, `0` | 8 | 0 |
| `1`, `1` | 14,316,405 | 14,316,405 |
| `255`, `255` | 665,944 | 0 |

Every cell in which either mask is `0` or `255` already holds `nan` on that date in the `HHHH` layer
that Harmony delivers, so it is no data in the result: 0 cells hold a value of the change where
either mask is `0` or `255`. Applying the masks would turn 0 cells into no data and would not change
the legend of the pilot pair.

The 665,944 cells with the value `255` in the mask files are not cells outside the acquisition.
They are the cells of the file whose centre lies outside the requested box (−71.20, 42.60, −70.75,
42.95), which NASA Harmony fills with the no-data value. In the product files these cells hold the
mask `1` (665,942 cells) or `0` (2 cells), and no cell of the rectangle holds `255`. In the
product, the rectangle of 3772 by 3972 cells holds mask `0` in 29 cells on 21 Oct 2026 and in 26
cells on 2 Nov 2026, and mask `1` in all other cells. Inside the box the mask files of Harmony
equal the mask of the product in every cell (product files read on 15 Nov 2026;
`docs/research/analysis.md`, part 4.4).
In the product, over the whole rectangle, the pairs of mask values are `0`, `0` in 16 cells; `0`,
`1` in 13; `1`, `0` in 10; and `1`, `1` in 14,982,345, all of which hold a value of the change. The
masks of the product differ in 23 cells.

The limits of this evidence are the following.

1. It is one box of 3772 by 3972 cells on a coast, two dates of one track and frame (141, 67), and
   the term `HHHH` of frequency A only.
2. The only valid value in the box is `1`, so the box holds no boundary between sub-swaths. Inside
   the box, the mask files of Harmony differ between the two dates in 19 cells (table above); over
   the whole rectangle, the masks of the product differ in 23 cells. Both products are of acquisitions with dithered pulse repetition frequency
   (`isDithered` = `True`), for which the specification gives the value 1 throughout (section
   4.3.3).
3. The product itself holds `nan` in the cells with mask `0`. In the HDF5 product files, read on
   15 Nov 2026 for the rectangle of the samples, every cell with mask `0` holds `nan` in `HHHH` (29
   cells on 21 Oct 2026, 26 cells on 2 Nov 2026) and every cell with mask `1` holds a value. The
   fields `validSamplesSubSwathMaskingApplied` and `shadowMaskingApplied` read `False` in both
   products. Which step of the processing leaves these cells without data was not traced.
4. The samples are of the validated collection. The evidence says nothing about provisional
   products.
5. The reduced copies (overviews) inside the mask files were not examined.

The question stays open for other areas. The band tags of the two sample files carry a `min_value`
of `1.6706227e-16` on 21 Oct 2026 and of `7.2686074e-17` on 2 Nov 2026, that is −157.8 dB and
−161.4 dB. The lowest values inside the box are −31.61 dB and −29.53 dB. The tags therefore do not
describe the box. They are the attributes `min_value` and `max_value` of the layer `HHHH` of the
whole frame in the product file, which the files of Harmony carry as band tags:
`1.6706226695065618e-16` and `51839.09375` on 21 Oct 2026, `7.268607434326375e-17` and
`24645.7109375` on 2 Nov 2026 (read from the HDF5 product files on 15 Nov 2026). The frame
therefore holds values far below any value of the box. Whether the mask marks the
cells of those values was not examined.

NASA Harmony lists the mask of both frequencies among the variables of the validated collection
`NISAR_L2_GCOV_V1` (list saved on 14 Nov 2026). In `main` at commit `0ad795b` the Data part of
Lynkeus offers the mask as a layer of its own, with the unit `1` (`api/src/lynkeus/harmony.py`, line
291), and its layer reader writes `nan` into the cells that hold the no-data value of the file
(`api/src/lynkeus/writing.py`, lines 163 and 164). The Data part does not apply the mask to the
terms. The tool does not read the mask: it takes the term layers only.

## Formula

```text
change_dB = 10 * log10(gamma0_later / gamma0_earlier)
```

This is the ratio of the two dates on a logarithmic scale. It equals the difference of the two dates
in decibels.

The result of a cell is no data when one of the following holds:

1. either input value is `nan`;
2. either input value is zero or negative;
3. either input value is infinite;
4. the ratio of the two values is beyond the range of 32-bit numbers.

The tool computes in 32-bit floating-point numbers, as the source program does.

## Unit

Decibel (dB). The result is Float32 and its no-data value is `nan`.

## Reduced copies of the result

The file of a result holds the values of the formula at full resolution. It also holds reduced
copies (overviews), at the factors 2, 4 and 8 for the result of the pilot area, which the map draws
when it is zoomed out. Lynkeus makes each cell of a reduced copy as the mean of the decibel values
of the change of the cells that it covers. It is not the change of the mean backscatter of these
cells, which cannot be derived from the result alone.

Measured on 15 Nov 2026 on the result of the pilot pair, at the factor 2 (3,581,043 cells with a
value): the reduced copy equals the mean of the four decibel values (largest difference
9.5e-07 dB). Against the decibels of the ratio of the mean powers of the same four cells, the mean
difference is 0.002 dB, 758,093 cells differ by more than 0.5 dB, and the largest difference is
11.6 dB (`docs/research/analysis.md`, part 4.7).

For the reader: when the map is zoomed out, a cell shows the mean of the changes of the cells that
it covers, which can differ by more than a decibel from the change of their mean backscatter. The
values at full zoom, and the values of the file at full resolution, are those of the formula.

The reduced copies of a result of Backscatter, One date are made otherwise, as the decibels of the
mean power (`docs/methods/backscatter-state.md`). The function of each tool declares how its result
is reduced, and the record of a result of this tool says: "Reduced copies made by averaging the
values."

## Legend

| Field of the layer description | Value |
|---|---|
| `quantity` | Change of radar backscatter gamma0 |
| `unit` | dB |
| `range` | From −r to +r, where r is the 99th percentile of the absolute values of the cells of the result that hold a value |
| `colours` | `RdBu`, a diverging scale centred on zero. The lowest value is red and the highest blue: a decrease is red and an increase blue |
| `ends` | `decrease`, `increase`: the words of the lowest and of the highest end of the legend. The Contents pane writes each word in brackets beside the value of its end, while the range of the display is the range of the result |

The range and the colour scale are those of the source program
([cell 59](https://github.com/ASFOpenSARlab/NISAR_Cookbook/blob/17b69c87a7320610740be7f2c7e605601cb7fe43/notebooks/NISAR_GCOV_SARChangeDetectionMethods.ipynb):
`quantile(0.99)` of the absolute ratio, `cmap='RdBu'`, `vmin=-dynamic_range`, `vmax=dynamic_range`).
In `RdBu` of Matplotlib 3.11.2 the lowest value is dark red, the centre near white and the highest
value dark blue (tried on 14 Nov 2026). On the pilot pair r is 7.17 dB. This sheet numbers the cells
of the notebook from 0, in the order of the notebook file: cell 56 is its 57th cell, which Jupyter
shows as `In [30]`, and cell 59 is shown as `In [32]`.

The colours of an increase are not a convention. The figure of the Sentinel-1 RTC Product Guide of
ASF uses the opposite colours: red for an increase, blue for a decrease and yellow for little change
(<https://hyp3-docs.asf.alaska.edu/guides/rtc_product_guide/>, read 14 Nov 2026). The legend must
therefore name its two ends in words: decrease and increase. The function of the tool gives the
two words in the field `ends` of its result, the layer description carries them in the field
`ends`, and the legend of the Contents pane writes "(decrease)" beside its lowest value and
"(increase)" beside its highest. An inverted scale turns the colours and leaves each word beside
its value. The words show while the range of the display is the range that the tool gave. After a
change of the range in the Symbology pane the legend shows the values only, because the two words
describe the ends of the range of the tool, which lie on the two sides of zero.

For colour-blind readers, the research found the following. ColorBrewer, from whose designs the
colours of `RdBu` come, rates the scheme RdBu as colour-blind friendly for every number of classes
from 3 to 11. The documentation of Matplotlib 3.11.2 advises against colour maps that hold both red
and green, and calls `RdBu` one of the good options among the diverging maps. The limit of this
finding is that the rating was given to the scheme in 3 to 11 classes: Matplotlib interpolates the
colours into a continuous scale, for which no rating was found, and no test with a simulator of
colour-vision deficiency was run. The sources are in `docs/research/analysis.md`, part 5.7. The
decision stays with Stelios.

## How to read the result

A positive value means that the surface returned more signal on the later date, and a negative value
less; 3 dB is about a factor of two in power. The map shows where the return changed and by how
much, and it does not state the cause of the change. The ratio works best where many looks were
averaged (Rignot and van Zyl, 1993); the layer `numberOfLooks` of the product gives their number for
each cell. The sheet sets no threshold. On the pilot pair, twelve days apart, the 5th and the 95th
percentile of the change are −4.30 dB and 4.27 dB.

## Comparison with the source program (D-17)

| | |
|---|---|
| Source program | ASF NISAR Cookbook, notebook `NISAR_GCOV_SARChangeDetectionMethods.ipynb`, [cell 56](https://github.com/ASFOpenSARlab/NISAR_Cookbook/blob/17b69c87a7320610740be7f2c7e605601cb7fe43/notebooks/NISAR_GCOV_SARChangeDetectionMethods.ipynb): `ratio_dB = 10 * np.log10(date_1 / date_0)`, where `date_0` is the earlier date; for the legend, `dynamic_range` of cell 59 |
| Version | Commit `17b69c8` of 3 Nov 2026, branch `main` (the repository has no release and no tag) |
| Licence | Apache-2.0 |
| Files compared | `gcov-hhhh-20261021.tif` (SHA-256 `e808a7bfed69c0bd1eabc38faae539bae7aaadd81c86b1bf963900c996dffb84`), the layer `HHHH` of the product `NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001`; `gcov-hhhh-20261102.tif` (SHA-256 `f9d950ad3b30c07d6d77a3f63d1dd4c106fa1b775982c0834c35e715ac91ac43`), the layer `HHHH` of the product `NISAR_L2_PR_GCOV_034_141_D_067_4005_DHDH_A_20261102T234330_20261102T234405_P05036_N_F_J_001`. Both files are GeoTIFF as NASA Harmony delivered them, read at full resolution |
| Platform | `Linux-6.8.0-146-generic-x86_64-with-glibc2.41`, Python 3.13.18. Lynkeus: the code of this tool, numpy 2.5.4. Source program: numpy 2.5.3, xarray 2026.7.0, dask 2025.12.0, rioxarray 0.22.0 and rasterio 1.4.4 (GDAL 3.10.3), the versions of the lock file of the Cookbook (`pixi.lock`, environment `isce3`, platform `linux-64`) |
| Differences from the lock file | Python is 3.13.18 and the lock file has 3.13.0. GDAL inside rasterio is 3.10.3 and the lock file has libgdal-core 3.11.5. 29 packages were installed, not the whole environment of the lock file |
| Run | The comparison was made twice, on 14 Nov 2026 and on 15 Nov 2026, with two sets of scripts that were written separately, and both gave the result below. The rows above describe the run of 15 Nov 2026, whose records are kept in `docs/research/records/analysis/` (`comparison.json`, `source_side.json`, `lynkeus_side.json`) |
| Input of the source program | The notebook opens HDF5 product files (cell 11). For the comparison its data cube was built from the two GeoTIFF files, with the term `HHHH` and without the window of 3000 by 3000 cells of cell 16; the dates of cell 54 were set to 2026-10-21 and 2026-11-02 |
| Largest difference | 0.0 dB. The arrays are bit-identical: of 14,982,384 cells, 14,316,405 hold a value in both results, the others hold `nan` in both, and 0 cells hold a value in one result only |
| Largest difference of the legend | The legend of the tool is ±7.168050689697264 dB and `dynamic_range` of cell 59 is 7.168050689697264 dB. The difference is 0.0 dB |
| Not reached | The samples hold no zero, negative or infinite cell, and no pair of cells whose ratio 32-bit numbers cannot hold. The comparison therefore does not show the cells in which the tool gives no data and the statements of the notebook follow the rules of numpy. The source program was given the GeoTIFF files of Harmony, not the HDF5 product files. On 15 Nov 2026 the layer `HHHH` was read from the two HDF5 product files for the whole rectangle of the samples: every cell that holds a value in a sample (14,316,413 cells on 21 Oct 2026 and 14,316,416 on 2 Nov 2026) equals the product bit for bit. One area and one pair of dates were compared |

The exact numbers of the comparison are in `docs/research/analysis.md`, part 4.

## Not yet confirmed

1. Whether the masks are needed in other areas (section The mask of the product). Andreas measures
   it on the next area. The tool applies no mask, as the source program applies none.
2. The terms `RHRH` and `RVRV`, and two products of different instruments, tracks, directions or
   frames: the checks were tried in the tests of the code with made-up layers, and no such layers
   were received.
3. How the interface shows the sentence of a refusal. On 15 Nov 2026 the tool ran as a job of a
   private copy of the web service, and each refusal that was tried ended its job as failed, with
   the sentence of the tool as the message of the job (`docs/research/analysis.md`, parts 3.4 and
   4.7). Nothing was seen in a browser.
4. The parts of the comparison that were not reached (table above, row Not reached) (Andreas).
5. The name `RdBu` of the colour scale in the Contents pane, and the readability of the scale for
   colour-blind readers (Stelios). A later commit of `main`, `5095ee0`, holds a scale `RdBu`
   (`web/src/contents/colours.ts`, line 27); the file was read and nothing was tried.
6. The words at the two ends of the legend (section Legend) are written by the Contents pane and
   tested in the simulated browser of the tests (`web/src/contents/Legend.test.tsx`). They were not
   seen in a browser, and the choice of the two words is for Stelios to confirm.
