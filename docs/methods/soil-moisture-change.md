# Soil moisture, Change

| | |
|---|---|
| Tool | `soil-moisture-change` (Analysis tab, group Soil moisture, button Change) |
| NISAR product | SME2, Level-3 Soil Moisture on the 200 m EASE-Grid 2.0 |
| Result | Change of the volumetric soil moisture between two dates, later minus earlier, in cubic metres of water in a cubic metre of soil (m3 m-3) |
| State | The comparison with the source program (D-17) was made on 15 Nov 2026, with the rule of the retrieval quality flag, on layers of the pilot area that NASA Harmony delivered on that day (ten pairs of dates) and on three pairs of whole frames of the product files: the results are bit-identical. The products are provisional (collection `NISAR_L3_SME2_PROVISIONAL_V1`) and beta (collection `NISAR_L3_SME2_BETA_V1`). The tool leaves out the cells that the product of either date marks as not recommended (section Input layers). |

## In brief

| | |
|---|---|
| What it shows | The change of the soil moisture between two dates, in cubic metres of water in a cubic metre of soil, in the cells whose retrieval NISAR recommends on both dates. |
| Input | The layer `soilMoisture` of two SME2 products of one track, direction and frame, each with the layer `retrievalQualityFlag` of its product, which the form takes by itself. |
| Formula | `soil_moisture_later - soil_moisture_earlier`, in the cells whose flag has the lowest bit 0 on both dates |
| Result | Cubic metres of water in a cubic metre of soil (m3 m-3). The legend runs from −r to +r, where r is the 99th percentile of the absolute change. Red is a decrease and blue an increase; the result states how many cells were left out. |
| How to read | A positive value means that the product gives a higher soil moisture on the later date, and a negative value a lower one. The map does not state the cause of a change. The errors of the soil moisture of both dates enter the result, and no document that was read states the accuracy of the difference. |
| Limits | The products themselves mark most cells as not recommended: 97.9 % to 98.7 % of the cells with a value in the test area (lowest bit of the layer `retrievalQualityFlag`), so the tool leaves most of that area empty. The product of a date names earlier products of the same track among its inputs, so two dates are not independent measurements. |
| Checked | The result equals that of the program `gdal raster calc` of GDAL 3.12.2 with the rule of the flag in every cell, for ten pairs of dates of the test area (lower Merrimack River, 23 Jun to 9 Oct 2026, and the two beta dates) and three pairs of whole frames. Both programs read the same GeoTIFF files, not the product files themselves. The range of the legend was compared with no other program. |
| References | [Singh (1989)](https://doi.org/10.1080/01431168908903939), of which section 4.1 was read. [NISAR L3 SME2 Product Specification, JPL D-107677 Rev C](https://nisar-docs.asf.alaska.edu/product-specification/). |

## Reference

1. Singh, A. (1989). Digital change detection techniques using remotely-sensed data. International
   Journal of Remote Sensing, 10(6), 989-1003. <https://doi.org/10.1080/01431168908903939>. Section
   4.1, Univariate image differencing, pages 990 to 992: registered images of two times are
   subtracted, cell by cell, to produce an image of the change between the two times. The article
   treats images of radiance and does not treat soil moisture. Section 4.1 was read.
2. NASA SDS Product Specification, Level-3 Soil Moisture (L3_SME2), JPL D-107677, Rev C, version
   1.0.0, 8 November 2024. Sections 2.2, 2.3, 3.3, 3.6 and 3.7; Table 4.2.1, the entry of
   `soilMoisture` on page 37. Rev C is the revision whose file the ASF DAAC links
   (<https://nisar-docs.asf.alaska.edu/product-specification/>, read 15 Nov 2026). The products of
   the pilot area state the version `1.0.2` of the specification.
3. NISAR L3 Soil Moisture Data Product, Algorithm Theoretical Basis Document (ATBD), JPL D-107679,
   Release 3.3, 28 April 2023. Table of the system characteristics, page 9; sections 4.1.4 (page
   26), 4.2.1 (page 33) and 4.3 (page 37), on the ascending and the descending observations.
4. The file name convention of SME2 products: the specification above, section 2.3, pages 11 to 13.
   The tool reads the product type, the instrument, the track, the direction and the frame of each
   input from the name of its product file.

## Input layers

The inputs are given in this order.

| No. | Layer | Path in the product | Type | Unit | No data |
|---|---|---|---|---|---|
| 1 | The soil moisture of the earlier date | `/science/LSAR/SME2/grids/soilMoisture` | Float32 | `meter^3/meter^3` in the product; `m3 m-3` in the layer description | `-9999` in the product; `nan` in the layer |
| 2 | The retrieval quality flag of the same product | `/science/LSAR/SME2/grids/retrievalQualityFlag` | Int16 in the product; 32-bit numbers in the layer | `1` | `-9999` in the product; `nan` in the layer |
| 3 | The soil moisture of the later date | as No. 1, in the product of the later date | Float32 | as No. 1 | as No. 1 |
| 4 | The retrieval quality flag of the same product | as No. 2, in the product of the later date | as No. 2 | `1` | as No. 2 |

The two layers are described in the sheet [Soil moisture, One date](soil-moisture-state.md). The
form of the tool shows the layers of the soil moisture and takes the flag of the product of each by
itself; when the session holds none for a chosen date, the form says so in one sentence and offers
the Get layer form.

The two products must be of the same instrument, track, direction of the orbit and frame. This is a
choice of this sheet, the same that Backscatter, Change makes, and the documents of the mission do
not state which soil moisture products may be compared. Its reasons are these. The ATBD gives the
nodal crossing times 6 AM and 6 PM (page 9), so an ascending and a descending product are of
different times of day: the product of track 104, ascending, of 7 Oct 2026 starts at 09:42 UTC and
the product of track 141, descending, of 9 Oct 2026 at 23:43 UTC. It states that the ascending and
the descending observations of a place have different incidence angles (page 26), and that the time
series algorithms work on the observations of one direction, 12 days apart, which have the same
incidence angle (pages 33 and 37). All SME2 products stand on one global grid (specification,
section 3.7), so two products of different tracks can share their cells: the layers of the tracks 69
and 104 that were received for the pilot box have its 216 by 164 cells. The tool refuses them by the
names of their product files.

The tool keeps a cell where the flag of each date holds a value whose bit 0 is 0, and leaves every
other cell out, as the sheet Soil moisture, One date describes. The result carries one sentence for
the visitor that says how many of the cells with a soil moisture on both dates were left out, for
example "28,759 of the 29,238 cells with a soil moisture on both dates are left out because NISAR
marks their retrieval as not recommended on one date or both." Measured on 15 Nov 2026 in the box
of the pilot area, for the pair of 27 Sep and 9 Oct 2026: 29,238 cells hold a soil moisture on both
dates and the tool keeps 479 of them; every cell that the product of 27 Sep recommends is
recommended by that of 9 Oct as well (`docs/research/analysis-soil-moisture.md`, part 8.4).

The two dates of a pair are not independent retrievals. The product file of 9 Oct 2026 names, in its
field `l2GcovGranules`, the SME2 products of 27 Sep 2026 and of 15 Sep 2026 of the same track and
frame among its inputs.

### What the tool refuses

The tool receives the four arrays and their layer descriptions. It makes the checks below in this
order and reports the first fault that it finds. A refusal is raised as `LayerError` of
`lynkeus.writing`, as `main` asks of a tool (`api/README.md`, section Analysis tools as processes),
and its message is one sentence for the visitor.

| No. | The tool refuses the inputs when | Sentence for the visitor |
|---|---|---|
| 1 | the number of input layers is not four | `The number of input layers must be 4, and it is <number>.` |
| 2 | the two arrays of the soil moisture do not have the same number of rows and of columns | `The input layers do not have the same grid.` |
| 3 | a layer of the soil moisture (No. 1 or 3) was not received from one product file of the type SME2: its `kind` is not `layer`, its `inputs` do not hold exactly one name, or that name does not begin as the name of a NISAR product file of the type SME2 | `The layer "<title>" is not a layer received from one NISAR SME2 product.` |
| 4 | the description of such a layer does not hold the name of the layer inside the product (field `layer`) | `The layer "<title>" does not record which layer of its product it is; receive it again with Get layer.` |
| 5 | its name inside the product is not `soilMoisture` | `The layer "<title>" is the layer <name> of its product, and the tool reads the layer soilMoisture.` |
| 6 | its unit is not `m3 m-3` | `The layer "<title>" has the unit <unit>, and the tool reads the unit m3 m-3.` |
| 7 | it does not have one date | `The number of dates of the layer "<title>" must be 1, and it is <number>.` |
| 8 | a layer of the flag (No. 2 or 4) fails the checks 2 to 7, with the layer `retrievalQualityFlag` and the unit `1` | the sentences of the checks 2 to 7 |
| 9 | the flag of a date does not have the grid of its soil moisture | `The input layers do not have the same grid.` |
| 10 | the flag of a date is not of the product file of its soil moisture | `The layers "<title>" and "<title>" are not of the same product file.` |
| 11 | the two products are not of the same instrument, track, direction of the orbit and frame | `The two layers are not of the same instrument, track, direction and frame.` |
| 12 | the date of the first layer is not earlier than the date of the third | `The first layer must be of an earlier date than the second.` |
| 13 | no cell of a soil moisture holds a value | `The layer "<title>" holds no value in any cell.` |
| 14 | a cell of a soil moisture holds a value below 0 or above 1, or an infinite value | `The layer "<title>" holds values outside 0 to 1, so it is not a volumetric soil moisture.` |
| 15 | no cell of a flag holds a value, or a cell holds a value that is not a whole number from 0 to 32767 | `The layer "<title>" holds no value in any cell.` or `The layer "<title>" holds values that are not whole numbers from 0 to 32767, so it is not a retrieval quality flag.` |
| 16 | no cell holds a value on both dates | `The result would hold no value in any cell.` |
| 17 | the flags leave no cell that holds a value on both dates | `NISAR marks the retrieval of every cell with a soil moisture on both dates as not recommended on one of them, so the result would hold no value.` |
| 18 | the 99th percentile of the absolute values of the result is zero, so the legend has no range | `The values of the result are too alike to give the legend a range.` |

The checks 3 to 7 are made for the first layer of the soil moisture and then for the second, and so
are the checks 13 to 15 for the two dates. The product type, the instrument, the track, the
direction and the frame are read from the beginning of each file name (specification, section 2.3).
An array that is not two-dimensional Float32 is a fault of the calling program and raises
`ValueError`, which is not a refusal for the visitor.

The tool does not resample. The function receives no coordinates. `lynkeus.tools.run_tool` reads the
layers and refuses layers whose grids differ in projection, transform, width or height, before it
calls the tool. Tried on 15 Nov 2026 with the layer of track 141 of 27 Sep 2026 and the layer of
track 104 of 7 Oct 2026: `run_tool` refused them with the sentence "The layers of the analysis do
not have the same grid.", because the origins of their two files differ by 4.7e-08 m in x and
1.0e-08 m in y, and the function of the tool, called with the two arrays, refused them with the
sentence of check 8.

## Formula

```text
change = soil_moisture_later - soil_moisture_earlier
         in the cells where the flag of each date holds a value whose bit 0 is 0
```

A positive value is an increase of the soil moisture and a negative value a decrease. The result of
a cell is no data when either soil moisture is `nan`, or when the flag of either date has its bit 0
set or holds no value.

The tool computes in 32-bit floating-point numbers.

## Unit

Cubic metres of water in a cubic metre of soil (m3 m-3). The result is Float32 and its no-data value
is `nan`.

## Reduced copies of the result

The file of a result holds the values of the formula at full resolution. The function of the tool
declares that reduced copies (overviews) of its result are means of the values of the change, and
the record of the result says: "Reduced copies made by averaging the values."

Measured on 15 Nov 2026 on the result of the pilot pair: the file of the result holds 35,424 cells
(216 by 164) and no reduced copy, as the files of the input layers hold none. No reduced copy of a
result of this tool was therefore measured (`docs/research/analysis-soil-moisture.md`, part 4.6).

For the reader: when the map is zoomed out on a file that holds reduced copies, a cell shows the
mean of the changes of the cells that it covers that hold a value. The values at full zoom, and the
values of the file at full resolution, are those of the formula.

## Legend

| Field of the layer description | Value |
|---|---|
| `quantity` | Change of soil moisture |
| `unit` | `m3 m-3` |
| `range` | From −r to +r, where r is the 99th percentile of the absolute values of the cells of the result that hold a value |
| `colours` | `RdBu`, a diverging scale centred on zero. The lowest value is red and the highest blue: a decrease is red and an increase blue |
| `ends` | `decrease`, `increase`: the words of the lowest and of the highest end of the legend |

The rule of the range and the colour scale are those of Backscatter, Change
(`docs/methods/backscatter-change.md`, section Legend), which takes them from its source program.
They are applied here by a choice of this sheet: no source was found that gives a legend for the
change of the soil moisture between two dates. The source program of this tool draws no legend. On
the pilot pair of 27 Sep and 9 Oct 2026, r is 0.1056 m3 m-3 over the cells that the tool keeps.
The range is computed for each result, so two results have different ranges.

With these colours a soil that became drier is red and a soil that became wetter is blue. The two
words of the legend name the direction of the change of the value and not a state of the soil. Among
the diverging scales of the interface, `BrBG` has dark brown (`#543005`) at its lowest value and
dark blue-green (`#003c30`) at its highest (`web/src/contents/colours.test.ts`); the choice between
the two scales was not researched.

## How to read the result

A positive value means that the product gives a higher soil moisture on the later date, and a
negative value a lower one. The map shows where the retrieved soil moisture changed and by how much,
and it does not state the cause of the change. The errors of the soil moisture of both dates enter
the result. The tool shows only the cells whose retrieval the products recommend on both dates, so a
map of the pilot area is mostly empty (section Input layers), and an empty cell there is a cell that
a product does not recommend or that holds no data on a date. The mission states an accuracy goal of
0.06 m3 m-3 for the soil moisture of one date, over the areas that the sheet Soil moisture, One date
names; no document read for this sheet states an accuracy of the difference of two dates. The sheet
sets no threshold. On the pilot pair of 27 Sep and 9 Oct 2026, 12 days apart, the 5th and the 95th
percentile of the change are −0.087 and 0.004 m3 m-3 and its median is −0.043 m3 m-3: 451 of the 479
cells that the tool keeps hold a decrease and 28 an increase.

## Comparison with the source program (D-17)

The source program is `gdal raster calc` of GDAL 3.12.2 "Chicoutimi", released 2026/02/03, in the
image `ghcr.io/osgeo/gdal:alpine-small-3.12.2`, with the rule of the flag on both dates written as
its expression:

```
gdal raster calc -i EARLIER=<earlier soil moisture> -i EFLAG=<earlier flag> -i LATER=<later soil moisture> -i LFLAG=<later flag> --calc "fmod(EFLAG, 2) == 0 && fmod(LFLAG, 2) == 0 ? LATER - EARLIER : NaN" --ot Float32 --nodata nan --propagate-nodata -o <result>
```

Both programs read the same GeoTIFF files: the layers that NASA Harmony delivered for the box of the
pilot area, and three whole frames that were written from the HDF5 product files.

| Pairs of dates | Cells of each result | Cells with a value in both results | Cells that differ |
|---|---|---|---|
| Box, the eight pairs of consecutive provisional dates from 23 Jun to 9 Oct 2026 | 35,424 | 378 to 479 | 0 |
| Box, 15 Sep and 9 Oct 2026 | 35,424 | 422 | 0 |
| Box, the two beta dates (13 and 25 Dec 2025) | 35,424 | 326 | 0 |
| Whole frame, 15 Sep and 27 Sep, 27 Sep and 9 Oct, 15 Sep and 9 Oct 2026 | 3,572,100 | 8,263 to 8,916 | 0 |

The results of the two programs are bit-identical.

The exact numbers of the comparison are in `docs/research/analysis-soil-moisture.md`, parts 4 and 8.

## Not yet confirmed

1. What bit 8 of the surface flag marks, which the products set in most of the cells that they do
   not recommend, and whether those cells could be shown with a mark instead of being left out
   (sheet Soil moisture, One date, section Not yet confirmed, point 1). The decision of 15 Nov 2026
   leaves out every cell whose bit 0 is 1 on one date or both (Alexandros).
2. Which two soil moisture products may be compared. The tool accepts two products of the same
   instrument, track, direction and frame only; no document of the mission that was read states a
   rule (section Input layers) (Alexandros).
3. The legend. Its rule and its colours are those of Backscatter, Change and rest on no source for
   soil moisture; the words of its two ends follow that sheet (Alexandros, Stelios).
4. The accuracy of the difference of two dates, which no document read states, and the effect of the
   earlier dates that the time series algorithms of a product read.
5. Two products of different instruments, and two products of the same track and frame whose grids
   differ: the checks were tried in the tests of the code with made-up layers.
6. How the interface shows the sentence of a refusal and the note of a result. The refusals were
   tried through `lynkeus.tools.run_tool` and in the tests of the interface, not through the web
   service or a browser (`docs/research/analysis-soil-moisture.md`, part 8.5).
7. The reduced copies of a result, which no file of the pilot area holds.
