# Soil moisture, Change

| | |
|---|---|
| Tool | `soil-moisture-change` (Analysis tab, group Soil moisture, button Change) |
| NISAR product | SME2, Level-3 Soil Moisture on the 200 m EASE-Grid 2.0 |
| Result | Change of the volumetric soil moisture between two dates, later minus earlier, in cubic metres of water in a cubic metre of soil (m3 m-3) |
| State | The comparison with the source program (D-17) was made on 15 Nov 2026 on layers of the pilot area that NASA Harmony delivered on that day, and on the whole frames of the product files: the results are bit-identical. The products are provisional (collection `NISAR_L3_SME2_PROVISIONAL_V1`). The products mark 479 of the 29,238 cells of the pilot pair as recommended on both dates (section Input layers). |

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
| 2 | The soil moisture of the later date | as above, in the product of the later date | Float32 | as above | as above |

The layer is described in the sheet [Soil moisture, One date](soil-moisture-state.md).

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

The tool does not read the layers `retrievalQualityFlag` and `surfaceQualityFlag` of the two
products; the Data part of Lynkeus does not offer them as layers. Measured on 15 Nov 2026 on the
product files of 27 Sep 2026 and of 9 Oct 2026, in the box of the pilot area: of the 29,238 cells
that hold a soil moisture on both dates, the products mark 479 as recommended on both dates, 121 on
the later date only, 0 on the earlier date only and 28,638 (97.9 %) on neither date. The tool maps
the change of every cell that holds a value on both dates, whichever its flags.

The two dates of a pair are not independent retrievals. The product file of 9 Oct 2026 names, in its
field `l2GcovGranules`, the SME2 products of 27 Sep 2026 and of 15 Sep 2026 of the same track and
frame among its inputs.

### What the tool refuses

The tool receives the two arrays and their layer descriptions. It makes the checks below in this
order and reports the first fault that it finds. A refusal is raised as `LayerError` of
`lynkeus.writing`, as `main` asks of a tool (`api/README.md`, section Analysis tools as processes),
and its message is one sentence for the visitor.

| No. | The tool refuses the inputs when | Sentence for the visitor |
|---|---|---|
| 1 | the number of input layers is not two | `The number of input layers must be 2, and it is <number>.` |
| 2 | the two arrays do not have the same number of rows and of columns | `The input layers do not have the same grid.` |
| 3 | a layer was not received from one product file of the type SME2: its `kind` is not `layer`, its `inputs` do not hold exactly one name, or that name does not begin as the name of a NISAR product file of the type SME2 | `The layer "<title>" is not a layer received from one NISAR SME2 product.` |
| 4 | the description of a layer does not hold the name of the layer inside the product (field `layer`) | `The layer "<title>" does not record which layer of its product it is; receive it again with Get layer.` |
| 5 | the name of a layer inside its product is not `soilMoisture` | `The layer "<title>" is the layer <name> of its product, and the tool reads the layer soilMoisture.` |
| 6 | the unit of a layer is not `m3 m-3` | `The layer "<title>" has the unit <unit>, and the tool reads the unit m3 m-3.` |
| 7 | a layer does not have one date | `The number of dates of the layer "<title>" must be 1, and it is <number>.` |
| 8 | the two products are not of the same instrument, track, direction of the orbit and frame | `The two layers are not of the same instrument, track, direction and frame.` |
| 9 | the date of the first layer is not earlier than the date of the second | `The first layer must be of an earlier date than the second.` |
| 10 | no cell of a layer holds a value | `The layer "<title>" holds no value in any cell.` |
| 11 | a cell of a layer holds a value below 0 or above 1, or an infinite value | `The layer "<title>" holds values outside 0 to 1, so it is not a volumetric soil moisture.` |
| 12 | no cell holds a value on both dates | `The result would hold no value in any cell.` |
| 13 | the 99th percentile of the absolute values of the result is zero, so the legend has no range | `The values of the result are too alike to give the legend a range.` |

The checks 2 to 7 are made for the first layer and then for the second, and so are the checks 10 and
11. The product type, the instrument, the track, the direction and the frame are read from the
beginning of each file name (specification, section 2.3). An array that is not two-dimensional
Float32 is a fault of the calling program and raises `ValueError`, which is not a refusal for the
visitor.

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
```

A positive value is an increase of the soil moisture and a negative value a decrease. The result of
a cell is no data when either input value is `nan`.

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
the pilot pair r is 0.2056 m3 m-3. The range is computed for each result, so two results have
different ranges.

With these colours a soil that became drier is red and a soil that became wetter is blue. The two
words of the legend name the direction of the change of the value and not a state of the soil. Among
the diverging scales of the interface, `BrBG` has dark brown (`#543005`) at its lowest value and
dark blue-green (`#003c30`) at its highest (`web/src/contents/colours.test.ts`); the choice between
the two scales was not researched.

## How to read the result

A positive value means that the product gives a higher soil moisture on the later date, and a
negative value a lower one. The map shows where the retrieved soil moisture changed and by how much,
and it does not state the cause of the change. The errors of the soil moisture of both dates enter
the result, and the tool does not read the marks with which the products recommend a cell or not. In
the pilot pair the products mark 97.9 % of the cells as recommended on neither date (section Input
layers). The mission states an accuracy goal of 0.06 m3 m-3 for the soil moisture of one date, over
the areas that the sheet Soil moisture, One date names; no document read for this sheet states an
accuracy of the difference of two dates. The sheet sets no threshold. On the pilot pair, 12 days
apart, the 5th and the 95th percentile of the change are −0.100 and 0.003 m3 m-3 and its median is
−0.038 m3 m-3: 27,382 cells hold a decrease, 1,854 an increase and 2 no change.

## Comparison with the source program (D-17)

| | |
|---|---|
| Source program | `gdal raster calc` of GDAL, with the expression `LATER - EARLIER` ([documentation](https://gdal.org/en/stable/programs/gdal_raster_calc.html), read 15 Nov 2026). The command evaluates the expression with the library muparser and converts its inputs to 64-bit floating-point numbers before it calculates |
| Version | GDAL 3.12.2 "Chicoutimi", released 2026/02/03, in the image `ghcr.io/osgeo/gdal:alpine-small-3.12.2` (digest `sha256:3775c7530eb68f95b8c67853da1e1e99a607e32a87f3d433440b8b562079f645`) |
| Licence | MIT style licence (file `LICENSE.TXT` of the image, section GDAL/OGR General) |
| Files compared | In the box of the pilot area: `sme2-soilmoisture-20260927.tif` (SHA-256 `1485f51a4a971fcad41815c903259aaf0d99e7da9b8b2cb23b239e936e3ee9f0`), the layer `soilMoisture` of the product `NISAR_L3_PR_SME2_031_141_D_067_4005_DHDH_A_20260927T234330_20260927T234405_P05023_N_F_J_001`, and `sme2-soilmoisture-20261009.tif` (SHA-256 `aefe8f4759a11d7cd5a13dad9deffba67471704ae0484206dfafdde784df93f9`), the layer `soilMoisture` of the product `NISAR_L3_PR_SME2_032_141_D_067_4005_DHDH_A_20261009T234330_20261009T234405_P05023_N_F_J_001`. Both files were received through `lynkeus.harmony.get_layer` from NASA Harmony on 15 Nov 2026 and equal the product files bit for bit in every cell. For the whole frames: the layer `soilMoisture` of the two product files (SHA-256 `4ce70185c501879ec81bacf14ab2fd2e69bfd750f1325fa41da36be996837797` and `579f26ae636c3adc36e0af5d88d69df82ea3a09a1cc1d758085a414f43a951f8`), read with h5py and written as GeoTIFF files of 2205 by 1620 cells, with `nan` in the cells without data, for both programs |
| Platform | `Linux-6.8.0-146-generic-x86_64-with-glibc2.41`. Lynkeus: the code of this tool, Python 3.13.18, numpy 2.5.4; the files were read with rasterio 1.5.2 (GDAL 3.12.2). Source program: the image above, run with the options `--ot Float32 --nodata nan --propagate-nodata`. The records are kept in `docs/research/records/analysis/soil-moisture/` (`comparison.json`, `lynkeus_side.json`) |
| Largest difference | 0.0 m3 m-3. The arrays are bit-identical. In the box: of 35,424 cells, 29,238 hold a value in both results, the others hold `nan` in both, and 0 cells hold a value in one result only. In the whole frame: of 3,572,100 cells, 700,913 hold a value in both results, the others hold `nan` in both, and 0 cells hold a value in one result only. The pairs of 15 Sep to 27 Sep 2026 and of 15 Sep to 9 Oct 2026 gave the same result, in the box and in the whole frame |
| Not reached | The source program draws no legend, so the range of the legend was compared with no other program. The source program was given GeoTIFF files, not the HDF5 product files: its image does not read HDF5. One area, three dates of one track and frame and three pairs were compared. All products are provisional. No pair with reduced copies was computed |

The exact numbers of the comparison are in `docs/research/analysis-soil-moisture.md`, part 4.

## Not yet confirmed

1. Whether the tool should show the change of the cells that a product marks as not recommended on
   either date (sheet Soil moisture, One date, section Not yet confirmed, point 1) (Alexandros).
2. Which two soil moisture products may be compared. The tool accepts two products of the same
   instrument, track, direction and frame only; no document of the mission that was read states a
   rule (section Input layers) (Alexandros).
3. The legend. Its rule and its colours are those of Backscatter, Change and rest on no source for
   soil moisture; the words of its two ends follow that sheet (Alexandros, Stelios).
4. The accuracy of the difference of two dates, which no document read states, and the effect of the
   earlier dates that the time series algorithms of a product read.
5. Two products of different instruments, and two products of the same track and frame whose grids
   differ: the checks were tried in the tests of the code with made-up layers.
6. How the interface shows the sentence of a refusal. The refusals were tried through
   `lynkeus.tools.run_tool` and not through the web service or a browser
   (`docs/research/analysis-soil-moisture.md`, part 4.6).
7. The reduced copies of a result, which no file of the pilot area holds.
