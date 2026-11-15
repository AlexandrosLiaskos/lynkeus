# Soil moisture, One date

| | |
|---|---|
| Tool | `soil-moisture-state` (Analysis tab, group Soil moisture, button One date) |
| NISAR product | SME2, Level-3 Soil Moisture on the 200 m EASE-Grid 2.0 |
| Result | Volumetric soil moisture of one date, in cubic metres of water in a cubic metre of soil (m3 m-3) |
| State | The comparison (D-17) was made on 15 Nov 2026 on the layers of the pilot area that NASA Harmony delivered on that day, against `gdal raster calc` of GDAL 3.12.2 with the rule of the retrieval quality flag: every cell is equal, on nine provisional dates, two beta dates and three whole frames. The products are provisional (collection `NISAR_L3_SME2_PROVISIONAL_V1`) and beta (collection `NISAR_L3_SME2_BETA_V1`); a search of the NASA catalogue for the short name `NISAR_L3_SME2_V1` gave no product for the pilot area on that day. The provisional products mark 97.9 % to 98.7 % of the cells of the pilot area that hold a value as not recommended, the two beta products none, and the tool leaves the marked cells out (section Input layers). |

## In brief

| | |
|---|---|
| What it shows | The soil moisture of one date, as the mission retrieved it from the radar backscatter, in the cells whose retrieval NISAR recommends: the volume of water in a volume of soil. |
| Input | The layer `soilMoisture` of an SME2 product, on a grid of 200 m, with the layer `retrievalQualityFlag` of the same product, which the form takes by itself. |
| Formula | The layer of the product in the cells whose flag has the lowest bit 0; every other cell is left out. The mission computes the soil moisture as the mean of the retrievals of up to three algorithms. |
| Result | Cubic metres of water in a cubic metre of soil (m3 m-3). The legend runs from 0.02 to 0.60 m3 m-3 for every date, from light yellow to dark blue. The result states how many cells were left out. |
| How to read | A higher value is a wetter soil. The mission states for the product the soil layer from 0 to 5 cm and an accuracy goal of 0.06 m3 m-3 where the vegetation is not dense. |
| Limits | The provisional products themselves mark most cells as not recommended: 97.9 % to 98.7 % of the cells with a value in the test area (lowest bit of the layer `retrievalQualityFlag`), so the tool leaves most of that area empty; the two beta products mark none. The flag does not say why a retrieval is not recommended. Only provisional and beta products existed for the test area on 15 Nov 2026. |
| Checked | The result equals that of the program `gdal raster calc` of GDAL 3.12.2 with the rule of the flag in every cell, on nine dates of the test area (lower Merrimack River, 23 Jun to 9 Oct 2026), two beta dates and three whole frames. The received layers equal the product files on the three dates whose product files were read (15 Sep, 27 Sep and 9 Oct 2026). |
| References | [NISAR L3 SME2 Product Specification, JPL D-107677 Rev C](https://nisar-docs.asf.alaska.edu/product-specification/). [NISAR L3 Soil Moisture ATBD, JPL D-107679 Release 3.3](https://nisar-docs.asf.alaska.edu/atbd/). |

## Reference

1. NASA SDS Product Specification, Level-3 Soil Moisture (L3_SME2), JPL D-107677, Rev C, version
   1.0.0, 8 November 2024. Sections 2.2, 2.3, 3.3, 3.6 and 3.7; Table 3.2.5; Table 4.2.1, the
   entries of `retrievalQualityFlag`, `soilMoisture` and `soilMoistureUncertainty` on pages 37 and
   38. Rev C is the revision whose file the ASF DAAC links
   (<https://nisar-docs.asf.alaska.edu/product-specification/>, read 15 Nov 2026); the list of
   references of that page names the document "Revision D", and no file of a later revision was
   found. The products of the pilot area state the version `1.0.2` of the specification in their
   field `productSpecificationVersion`.
2. NISAR L3 Soil Moisture Data Product, Algorithm Theoretical Basis Document (ATBD), JPL D-107679,
   Release 3.3, 28 April 2023. Sections 4.1 to 4.3 (the three retrieval algorithms), 5.3 (the
   aggregation of the backscatter to the grid) and 5.5 (the quality flags; Tables 5.5.1 and 5.5.2,
   pages 52 to 54). The ASF DAAC links the file (<https://nisar-docs.asf.alaska.edu/atbd/>, read 15
   Nov 2026).
3. The first reference that each product file of the pilot area names for each of its three
   algorithms, in the fields `PMIAlgorithmReference`, `TSRAlgorithmReference` and
   `DSGAlgorithmReference` under `/science/LSAR/SME2/metadata/processingInformation/algorithms/`
   (read from the product files on 15 Nov 2026): Kim and Liao (2021),
   <https://doi.org/10.1016/j.rse.2021.112712>; Mattia et al. (2009),
   <https://doi.org/10.5194/hess-13-343-2009>; Lal et al. (2023),
   <https://doi.org/10.1016/j.rse.2023.113667>. These articles were not read.
4. The file name convention of SME2 products: the specification above, section 2.3, pages 11 to 13.
   The tool reads the product type of its input from the name of the product file.
   `docs/research/analysis.md`, part 2.3, records the general document of the file names (JPL
   D-102255, Rev C).

## Input layers

The tool has two inputs, in this order: the layer `soilMoisture` of one SME2 product and the layer
`retrievalQualityFlag` of the same product file. The form of the tool shows the layers of the soil
moisture and takes the flag of the product by itself; when the session holds none, the form says so
in one sentence and offers the Get layer form, which receives the flag as the layer Retrieval
Quality Flag.

| No. | Spacing | Path in the product | Type | Unit | No data |
|---|---|---|---|---|---|
| 1 | 200 m | `/science/LSAR/SME2/grids/soilMoisture` | Float32 | `meter^3/meter^3` in the product; `m3 m-3` in the layer description | `-9999` in the product; `nan` in the layer |
| 2 | 200 m | `/science/LSAR/SME2/grids/retrievalQualityFlag` | Int16 in the product; 32-bit numbers in the layer, whole numbers | `1` | `-9999` in the product; `nan` in the layer |

An SME2 product holds one date of one track and frame. Its grid is the global EASE-Grid 2.0
(EPSG:6933) at 200 m (specification, sections 3.3 and 3.7); the product files of the pilot area
state the spacing 200.17900467012078 m in their fields `xCoordinateSpacing` and
`yCoordinateSpacing`. The unit and the no-data value are those of the specification (page 37) and of
the product files. The Data part of Lynkeus writes the unit of the soil moisture as `m3 m-3`
(`_layers` in `api/src/lynkeus/harmony.py`) and writes `nan` into every cell without data, and the
tool reads the unit of the layer description. The Data part makes the reduced copies of the flag
from the most frequent value, because its values are classes.

The layer of the soil moisture is not the result of one algorithm. The product files describe it in
the attribute `description` of the layer: "Averaged soil moisture. If recommended retrievals are
available, the average is computed using only the recommended retrievals. If no recommended
retrievals are available, the average is computed using all retrievals". The product also holds the
result of each algorithm, under
`/science/LSAR/SME2/grids/algorithmCandidates/[DSG, TSR or PMI]/soilMoisture`. The specification Rev
C describes the layer only as "Soil moisture" (page 37). Section Formula gives what was measured.

The flag marks the retrievals that the mission does not recommend. The specification gives its bit 0
as the "Retrieval recommended flag" (page 37), and the product files describe the bit as "0 =
recommended, 1 = not recommended". The ATBD sets the bit where the surface flag of the cell is above
0, or where another bit of the flag is raised (Table 5.5.2, page 54); the surface flag marks, among
others, open water above 10 %, urban areas, rain, snow, frozen ground, steep terrain and vegetation
whose water content is above 5 kg/m2 (Table 5.5.1, pages 52 and 53). The tool keeps a cell where the
flag holds a value whose bit 0 is 0, and leaves every other cell out: a cell whose bit 0 is 1, and a
cell whose flag holds no value. The other bits of the flag are not read; the specification Rev C and
the product files give them different meanings (`docs/research/analysis-soil-moisture.md`, part
8.1). The result carries one sentence for the visitor that says how many of the cells with a soil
moisture were left out, for example "28,638 of the 29,238 cells with a soil moisture are left out
because NISAR marks their retrieval as not recommended."; the foot of the tool pane, the Catalog
pane and the Contents pane show it, and the record of the result repeats it in its lineage.

Measured on 15 Nov 2026 on the layers received for the box of the pilot area: the products mark 97.9
% to 98.7 % of the cells that hold a soil moisture as not recommended, on each of the nine
provisional dates of track 141, frame 67 (`docs/research/analysis-soil-moisture.md`, part 8.4). In
the whole frame of 9 Oct 2026, 693,642 of the 704,710 cells with a soil moisture (98.4 %) are marked
so. On the three dates whose product files were read (15 Sep, 27 Sep and 9 Oct 2026), every cell of
the box that the products recommend has the surface flag 0, and about 97.7 % of the cells that they
do not recommend have bit 8 of the surface flag set; the two documents that were read, the ATBD (JPL
D-107679, Release 3.3) and the specification Rev C (JPL D-107677), do not explain that bit (part 8.1
of the note). The two beta products hold a soil moisture in 682 and 326 cells of the box and mark
none of them as not recommended. In every layer received the flag holds a value exactly where the
soil moisture does.

### What the tool refuses

The tool receives the two arrays and their layer descriptions. It makes the checks below in this
order and reports the first fault that it finds. A refusal is raised as `LayerError` of
`lynkeus.writing`, as `main` asks of a tool (`api/README.md`, section Analysis tools as processes),
and its message is one sentence for the visitor.

| No. | The tool refuses the input when | Sentence for the visitor |
|---|---|---|
| 1 | the number of input layers is not two | `The number of input layers must be 2, and it is <number>.` |
| 2 | the first layer was not received from one product file of the type SME2: its `kind` is not `layer`, its `inputs` do not hold exactly one name, or that name does not begin as the name of a NISAR product file of the type SME2 | `The layer "<title>" is not a layer received from one NISAR SME2 product.` |
| 3 | the description of the first layer does not hold the name of the layer inside the product (field `layer`) | `The layer "<title>" does not record which layer of its product it is; receive it again with Get layer.` |
| 4 | the name of the first layer inside the product is not `soilMoisture` | `The layer "<title>" is the layer <name> of its product, and the tool reads the layer soilMoisture.` |
| 5 | the unit of the first layer is not `m3 m-3` | `The layer "<title>" has the unit <unit>, and the tool reads the unit m3 m-3.` |
| 6 | the first layer does not have one date | `The number of dates of the layer "<title>" must be 1, and it is <number>.` |
| 7 | the second layer fails the checks 2, 3 and 6, its name inside the product is not `retrievalQualityFlag`, or its unit is not `1` | the sentences of the checks 2 to 6, with the layer `retrievalQualityFlag` and the unit `1` |
| 8 | the two arrays do not have the same number of rows and of columns | `The input layers do not have the same grid.` |
| 9 | the two layers are not of the same product file | `The layers "<title>" and "<title>" are not of the same product file.` |
| 10 | no cell of the soil moisture holds a value | `The layer "<title>" holds no value in any cell.` |
| 11 | a cell of the soil moisture holds a value below 0 or above 1, or an infinite value | `The layer "<title>" holds values outside 0 to 1, so it is not a volumetric soil moisture.` |
| 12 | no cell of the flag holds a value | `The layer "<title>" holds no value in any cell.` |
| 13 | a cell of the flag holds a value that is not a whole number from 0 to 32767 | `The layer "<title>" holds values that are not whole numbers from 0 to 32767, so it is not a retrieval quality flag.` |
| 14 | the flag marks every cell that holds a soil moisture as not recommended | `NISAR marks the retrieval of every cell of the layer "<title>" as not recommended, so the result would hold no value.` |

The product type is read from the beginning of the file name (specification, section 2.3). An array
that is not two-dimensional Float32 is a fault of the calling program and raises `ValueError`, which
is not a refusal for the visitor. `lynkeus.tools.run_tool` refuses two layers whose grids differ in
projection, transform, width or height before it calls the tool.

Check 4 refuses every other layer of an SME2 product as the first input, among them
`soilMoistureUncertainty`, which the Data part offers with the same unit, and the results of the
single algorithms. Check 11 follows from the unit: a volume of water in the same volume of soil lies
between 0 and 1. This is a conclusion of this sheet; the specification states no valid range for the
layer. Check 13 follows from the type of the flag, a 16-bit integer, whose no-data value `-9999` the
Data part writes as `nan`.

## Formula

Lynkeus keeps the cells that the flag of the product recommends:

```text
result = soil_moisture   where the flag holds a value whose bit 0 is 0 (the flag is even)
result = no data         in every other cell
```

The values that the tool keeps are those of the layer, unchanged. The note of the result counts the
cells that hold a soil moisture and lose it.

The mission computes the layer. The words of the product files, quoted in section Input layers, give
the rule:

```text
soil_moisture = mean of the retrievals of the algorithms that are recommended in the cell;
                where none is recommended, mean of the retrievals of all algorithms
                that hold a value
```

The three algorithms are the physical model inversion (PMI; ATBD, section 4.1), the time series
ratio (TSR; section 4.2) and the multiscale or disaggregation algorithm (DSG; section 4.3). Measured
on 15 Nov 2026 on the whole frame of the product files: the layer equals this rule in every cell
that holds a value, with a largest difference of 4.0e-08 m3 m-3 on 9 Oct 2026 (704,710 cells) and
4.5e-08 m3 m-3 on 27 Sep 2026 (704,158 cells), when an algorithm counts as recommended in a cell
where the first bit of its own `retrievalQualityFlag` is 0. On 9 Oct 2026, 676,986 of these cells
hold the retrievals of three algorithms, 4,915 of two and 22,809 of one.

The time series algorithms of one date read earlier dates: the product file of 9 Oct 2026 names, in
its field `l2GcovGranules`, the GCOV product of that date and the SME2 products of 27 Sep 2026 and
of 15 Sep 2026 of the same track and frame.

## Unit

Cubic metres of water in a cubic metre of soil (m3 m-3). The product writes the unit as
`meter^3/meter^3`. The result is Float32 and its no-data value is `nan`.

## Reduced copies of the result

The file of a result holds the values of the layer at full resolution. The function of the tool
declares that reduced copies (overviews) of its result are means of the values, as for the layer
that Lynkeus receives, and the record of the result says: "Reduced copies made by averaging the
values."

Measured on 15 Nov 2026 on the results of the pilot area: the file of a result holds 35,424 cells
(216 by 164) and no reduced copy, as the files of the input layers hold none. No reduced copy of a
soil moisture result was therefore measured (`docs/research/analysis-soil-moisture.md`, part 4.6).

For the reader: when the map is zoomed out on a file that holds reduced copies, a cell shows the
mean soil moisture of the cells that it covers. The values at full zoom, and the values of the file
at full resolution, are those of the product.

## Legend

| Field of the layer description | Value |
|---|---|
| `quantity` | Soil moisture |
| `unit` | `m3 m-3` |
| `range` | 0.02 to 0.60 |
| `colours` | `YlGnBu` |

The range is fixed. It is the same for every date, so that two dates can be compared. Its two ends
are the thresholds that the specification Rev C gives for the soil moisture in the retrieval quality
flags (pages 23, 25, 30 and 37, flag bit 3: "Soil moisture thresholds between (0.02 and 0.60)";
ATBD, Table 5.5.2, page 54). The legend of the NASA Global Imagery Browse Services for the soil
moisture of the SMAP mission runs from 0.00 to 0.60 and above
([`SMAP_Soil_Moisture.xml`](https://gibs.earthdata.nasa.gov/colormaps/v1.3/SMAP_Soil_Moisture.xml),
read 15 Nov 2026). Measured on the product files: in the box of the pilot area no cell lies outside
0.02 to 0.60 on 15 Sep, 27 Sep or 9 Oct 2026. In the whole frames, 4 of 704,158 cells lie below 0.02
on 27 Sep 2026 (lowest 0.0186) and 1 of 702,700 cells lies above 0.60 on 15 Sep 2026 (highest
0.6030).

The colour scale is the one that the Data part of Lynkeus gives to the layer `soilMoisture`
(`_layers` in `api/src/lynkeus/harmony.py`). In the table of the interface the lowest value of
`YlGnBu` is light yellow (`#ffffd9`) and the highest dark blue (`#081d58`)
(`web/src/contents/colours.test.ts`): a dry soil is light and a wet soil dark blue. The colours of
the legend of the Global Imagery Browse Services, from orange through light blue to dark grey, are
not among the scales of the interface.

## How to read the result

The value of a cell is the volume of water in a volume of soil, as the mission retrieved it from the
radar backscatter of that date. A higher value is a wetter soil. The value is the mean of the
retrievals of up to three algorithms. The tool shows only the cells whose retrieval the product
recommends: in the pilot area these are 1.3 % to 2.1 % of the cells with a soil moisture on each
date (section Input layers), so a map of that area is mostly empty, and an empty cell there is a
cell that the product does not recommend or that holds no data. The mission states for the product
the soil layer from 0 to 5 cm and an accuracy goal of 0.06 m3 m-3 over areas whose vegetation holds
less than 5 kg of water per square metre, outside built-up areas, permanent snow and ice and
permanent inland water (ATBD, sections 2.4 and 8, pages 10 and 65; specification, section 2.1). The
specification states that no retrieval accuracy is imposed on the product and that retrieval is
attempted on a best-effort basis (page 8). The products of the pilot area are provisional or beta.
The sheet states no threshold. On 9 Oct 2026 the tool keeps 600 cells of the pilot box; their soil
moisture runs from 0.129 to 0.377 m3 m-3, with a median of 0.213 m3 m-3.

## Comparison with the source program (D-17)

The source program is `gdal raster calc` of GDAL 3.12.2 "Chicoutimi", released 2026/02/03, in the
image `ghcr.io/osgeo/gdal:alpine-small-3.12.2`, with the rule of the flag written as its expression:

```
gdal raster calc -i SM=<soil moisture> -i FLAG=<flag> --calc "fmod(FLAG, 2) == 0 ? SM : NaN" --ot Float32 --nodata nan --propagate-nodata -o <result>
```

Both programs read the same GeoTIFF files: the layers that NASA Harmony delivered for the box of the
pilot area, and three whole frames that were written from the HDF5 product files. The received
layers of 15 Sep, 27 Sep and 9 Oct 2026 equal the product files in every cell, the soil moisture and
the flag alike.

| Layers | Cells of each result | Cells with a value in both results | Cells that differ |
|---|---|---|---|
| Box, nine provisional dates from 23 Jun to 9 Oct 2026 | 35,424 | 385 to 600 | 0 |
| Box, two beta dates (13 and 25 Dec 2025) | 35,424 | 682 and 326 | 0 |
| Whole frame, 15 Sep, 27 Sep and 9 Oct 2026 | 3,572,100 | 8,568 to 11,068 | 0 |

The results of the two programs are bit-identical. On the three dates of the product files, the note
of Lynkeus gives the counts read from the product files (9 Oct 2026: 28,638 of 29,238 cells left
out).

The exact numbers of the comparison are in `docs/research/analysis-soil-moisture.md`, parts 4 and 8.

## Not yet confirmed

1. What bit 8 of the surface flag marks. On the three dates whose product files were read, the
   products set it in about 97.7 % of the cells of the pilot box that they do not recommend, and the
   two documents that were read, the ATBD (JPL D-107679, Release 3.3) and the specification Rev C
   (JPL D-107677), do not explain it (`docs/research/analysis-soil-moisture.md`, part 8.1). If it
   marks a condition under which the mission still retrieves a soil moisture, such as dense
   vegetation, those cells could be shown with a mark instead of being left out. The decision of 15
   Nov 2026 leaves out every cell whose bit 0 is 1 (Alexandros).
2. The specification of the version 1.0.2, which the products state. The file read is Rev C, version
   1.0.0. The product files differ from it: the layer `surfaceQualityFlag` stands under
   `/science/LSAR/SME2/grids/` and not under `ancillaryData/`, the description of the bits 1 to 3 of
   `retrievalQualityFlag` is another one, and `surfaceQualityFlag` holds bits above bit 7 whose
   meaning Rev C does not give. The tool reads bit 0 only, whose meaning is the same in both.
3. The range of the legend for other areas. In the five frames measured, 5 of 3,960,563 cells with a
   value lie outside 0.02 to 0.60.
4. The name `YlGnBu` of the colour scale in the Contents pane and which end of it is dark, as a
   browser draws them. The table of the interface was read and nothing was seen in a browser.
5. How the interface shows the sentence of a refusal and the note of a result. The refusals were
   tried through `lynkeus.tools.run_tool` and in the tests of the interface, not through the web
   service or a browser (`docs/research/analysis-soil-moisture.md`, part 8.5).
6. The reduced copies of a result and of the flag, which no file of the pilot area holds.
7. The three articles of reference 3, which were not read, and the licence of the software of the
   mission.
8. Visitors' own servers: a server that runs an older Lynkeus Server does not know the layer
   Retrieval Quality Flag or the two inputs of the tool, and refuses them with its own sentence.
