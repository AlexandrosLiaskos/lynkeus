# Soil moisture, One date

| | |
|---|---|
| Tool | `soil-moisture-state` (Analysis tab, group Soil moisture, button One date) |
| NISAR product | SME2, Level-3 Soil Moisture on the 200 m EASE-Grid 2.0 |
| Result | Volumetric soil moisture of one date, in cubic metres of water in a cubic metre of soil (m3 m-3) |
| State | The comparison (D-17) was made on 15 Nov 2026 on layers of the pilot area that NASA Harmony delivered on that day, against the layer of the original HDF5 product files: every cell is equal. The products are provisional (collection `NISAR_L3_SME2_PROVISIONAL_V1`); a search of the NASA catalogue for the short name `NISAR_L3_SME2_V1` gave no product for the pilot area on that day. The products mark 97.9 % of the cells of the pilot area that hold a value on 9 Oct 2026 as not recommended (section Input layer). |

## In brief

| | |
|---|---|
| What it shows | The soil moisture of one date, as the mission retrieved it from the radar backscatter: the volume of water in a volume of soil. |
| Input | The layer `soilMoisture` of an SME2 product, on a grid of 200 m. |
| Formula | The layer of the product, unchanged. The mission computes it as the mean of the retrievals of up to three algorithms. |
| Result | Cubic metres of water in a cubic metre of soil (m3 m-3). The legend runs from 0.02 to 0.60 m3 m-3 for every date, from light yellow to dark blue. |
| How to read | A higher value is a wetter soil. The mission states for the product the soil layer from 0 to 5 cm and an accuracy goal of 0.06 m3 m-3 where the vegetation is not dense. |
| Limits | The products themselves mark most cells as not recommended: 97.9 % to 98.6 % of the cells with a value in the test area (lowest bit of the layer `retrievalQualityFlag`). The tool maps every cell and does not read that flag. Only provisional products existed for the test area on 15 Nov 2026. |
| Checked | The result equals the layer `soilMoisture` of the product file in every cell of the test area (lower Merrimack River, 27 Sep and 9 Oct 2026). |
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

## Input layer

The tool has one input: the layer `soilMoisture` of one SME2 product.

| Spacing | Path in the product | Type | Unit | No data |
|---|---|---|---|---|
| 200 m | `/science/LSAR/SME2/grids/soilMoisture` | Float32 | `meter^3/meter^3` in the product; `m3 m-3` in the layer description | `-9999` in the product; `nan` in the layer |

An SME2 product holds one date of one track and frame. Its grid is the global EASE-Grid 2.0
(EPSG:6933) at 200 m (specification, sections 3.3 and 3.7); the product files of the pilot area
state the spacing 200.17900467012078 m in their fields `xCoordinateSpacing` and
`yCoordinateSpacing`. The unit and the no-data value are those of the specification (page 37) and of
the product files. The Data part of Lynkeus writes the unit as `m3 m-3` (`_layers` in
`api/src/lynkeus/harmony.py`) and writes `nan` into every cell without data, and the tool reads the
unit of the layer description.

The layer is not the result of one algorithm. The product files describe it in the attribute
`description` of the layer: "Averaged soil moisture. If recommended retrievals are available, the
average is computed using only the recommended retrievals. If no recommended retrievals are
available, the average is computed using all retrievals". The product also holds the result of each
algorithm, under `/science/LSAR/SME2/grids/algorithmCandidates/[DSG, TSR or PMI]/soilMoisture`. The
specification Rev C describes the layer only as "Soil moisture" (page 37). Section Formula gives
what was measured.

The tool does not read the layers `retrievalQualityFlag` and `surfaceQualityFlag` of the product;
the Data part of Lynkeus does not offer them as layers. The product files describe the first bit of
`retrievalQualityFlag` as "0 = recommended, 1 = not recommended". Measured on 15 Nov 2026 on the
product files, in the box of the pilot area: of the 29,238 cells that hold a soil moisture on 9 Oct
2026, 28,638 (97.9 %) are marked as not recommended and 600 as recommended; on 27 Sep 2026, 28,759
(98.4 %) and 479. In the whole frame of 9 Oct 2026, 693,642 of 704,710 cells with a value (98.4 %)
are marked as not recommended. The land cover layer of the product gives the class 1, tree cover, to
25,461 of the 29,238 cells of the box. The tool maps every cell that holds a value, whichever its
flag. `docs/research/analysis-soil-moisture.md`, parts 2.3 and 4.4, gives the flags and the numbers.

### What the tool refuses

The tool receives the array of the layer and its layer description. It makes the checks below in
this order and reports the first fault that it finds. A refusal is raised as `LayerError` of
`lynkeus.writing`, as `main` asks of a tool (`api/README.md`, section Analysis tools as processes),
and its message is one sentence for the visitor.

| No. | The tool refuses the input when | Sentence for the visitor |
|---|---|---|
| 1 | the number of input layers is not one | `The number of input layers must be 1, and it is <number>.` |
| 2 | the layer was not received from one product file of the type SME2: its `kind` is not `layer`, its `inputs` do not hold exactly one name, or that name does not begin as the name of a NISAR product file of the type SME2 | `The layer "<title>" is not a layer received from one NISAR SME2 product.` |
| 3 | the layer description does not hold the name of the layer inside the product (field `layer`) | `The layer "<title>" does not record which layer of its product it is; receive it again with Get layer.` |
| 4 | the name of the layer inside the product is not `soilMoisture` | `The layer "<title>" is the layer <name> of its product, and the tool reads the layer soilMoisture.` |
| 5 | the unit of the layer is not `m3 m-3` | `The layer "<title>" has the unit <unit>, and the tool reads the unit m3 m-3.` |
| 6 | the layer does not have one date | `The number of dates of the layer "<title>" must be 1, and it is <number>.` |
| 7 | no cell of the layer holds a value | `The layer "<title>" holds no value in any cell.` |
| 8 | a cell holds a value below 0 or above 1, or an infinite value | `The layer "<title>" holds values outside 0 to 1, so it is not a volumetric soil moisture.` |

The product type is read from the beginning of the file name (specification, section 2.3). An array
that is not two-dimensional Float32 is a fault of the calling program and raises `ValueError`, which
is not a refusal for the visitor.

Check 4 refuses every other layer of an SME2 product, among them `soilMoistureUncertainty`, which
the Data part offers with the same unit, and the results of the single algorithms. Check 8 follows
from the unit: a volume of water in the same volume of soil lies between 0 and 1. This is a
conclusion of this sheet; the specification states no valid range for the layer. The check also
refuses a layer that holds the no-data value `-9999` of the product as a value. One cell outside 0
to 1 refuses the whole layer. The layers of the pilot area lie inside the range: on 9 Oct 2026 the
lowest value is 0.0800 and the highest 0.6000.

## Formula

Lynkeus computes nothing for this tool. The result is the input array itself, not a copy, with the
legend below.

The mission computes the layer. The words of the product files, quoted in section Input layer, give
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
retrievals of up to three algorithms, and the product marks each cell as recommended or not
recommended in a layer that the tool does not read. In the pilot area the product marks 97.9 % of
the cells of 9 Oct 2026 as not recommended (section Input layer). The mission states for the product
the soil layer from 0 to 5 cm and an accuracy goal of 0.06 m3 m-3 over areas whose vegetation holds
less than 5 kg of water per square metre, outside built-up areas, permanent snow and ice and
permanent inland water (ATBD, sections 2.4 and 8, pages 10 and 65; specification, section 2.1). The
specification states that no retrieval accuracy is imposed on the product and that retrieval is
attempted on a best-effort basis (page 8). The products of the pilot area are provisional. The sheet
states no threshold. On the pilot area, on 9 Oct 2026, the 5th and the 95th percentile of the soil
moisture are 0.195 and 0.272 m3 m-3; on 27 Sep 2026 they are 0.239 and 0.330 m3 m-3.

## Comparison with the source program (D-17)

| | |
|---|---|
| Source program | The soil moisture software of the mission, which produced the layer. Each product records its version in `/science/LSAR/SME2/metadata/processingInformation/algorithms/softwareVersion`; the product files of the pilot area read `0.4.2`, and the NASA catalogue records the program `SM_L_PGE`, version `R05.02.0` (read on 15 Nov 2026) |
| Licence | Not read. No public repository of the software was found on 15 Nov 2026 |
| Comparison | The values of the result against the layer `soilMoisture` of the original HDF5 product file, read with h5py for the rectangle of the layer. No program is run for the comparison, because the tool computes nothing |
| Files compared | `sme2-soilmoisture-20261009.tif` (SHA-256 `aefe8f4759a11d7cd5a13dad9deffba67471704ae0484206dfafdde784df93f9`) against `NISAR_L3_PR_SME2_032_141_D_067_4005_DHDH_A_20261009T234330_20261009T234405_P05023_N_F_J_001.h5` (SHA-256 `579f26ae636c3adc36e0af5d88d69df82ea3a09a1cc1d758085a414f43a951f8`); `sme2-soilmoisture-20260927.tif` (SHA-256 `1485f51a4a971fcad41815c903259aaf0d99e7da9b8b2cb23b239e936e3ee9f0`) against `NISAR_L3_PR_SME2_031_141_D_067_4005_DHDH_A_20260927T234330_20260927T234405_P05023_N_F_J_001.h5` (SHA-256 `4ce70185c501879ec81bacf14ab2fd2e69bfd750f1325fa41da36be996837797`). The layers were received through `lynkeus.harmony.get_layer` from NASA Harmony on 15 Nov 2026, for the box −71.20, 42.60, −70.75, 42.95. The MD5 of each product file equals the one that the NASA catalogue records |
| Platform | `Linux-6.8.0-146-generic-x86_64-with-glibc2.41`, Python 3.13.18, numpy 2.5.4, h5py 3.16.0 (HDF5 2.0.0), rasterio 1.5.2 (GDAL 3.12.2). The records are kept in `docs/research/records/analysis/soil-moisture/` (`products.json`, `lynkeus_side.json`) |
| Largest difference | 0 of 35,424 cells differ, on each of the two dates. The result is the input array itself; 29,238 cells hold a value and equal the product bit for bit, and 6,186 cells hold `nan` where the product holds its no-data value. The sample file of 9 Oct 2026, as NASA Harmony delivered it on 14 Nov 2026, equals the product in the same way |
| Not reached | One area and three dates of one track and frame were compared (15 Sep, 27 Sep and 9 Oct 2026), and one layer of each of two other tracks. All products are provisional. The software of the mission was not run. No layer with reduced copies was received |

The exact numbers of the comparison are in `docs/research/analysis-soil-moisture.md`, part 4.

## Not yet confirmed

1. Whether the tool should show the cells that the product marks as not recommended. The Data part
   does not offer the layer `retrievalQualityFlag`; NASA Harmony lists it among the variables of the
   collection. Until this is decided, the tool maps every cell that holds a value (Alexandros).
2. The specification of the version 1.0.2, which the products state. The file read is Rev C, version
   1.0.0. The product files differ from it: the layer `surfaceQualityFlag` stands under
   `/science/LSAR/SME2/grids/` and not under `ancillaryData/`, the description of the bits of
   `retrievalQualityFlag` is another one, and `surfaceQualityFlag` holds bits above bit 7 whose
   meaning Rev C does not give.
3. The range of the legend for other areas. In the five frames measured, 5 of 3,960,563 cells with a
   value lie outside 0.02 to 0.60.
4. The name `YlGnBu` of the colour scale in the Contents pane and which end of it is dark, as a
   browser draws them. The table of the interface was read and nothing was seen in a browser.
5. How the interface shows the sentence of a refusal. The refusals were tried through
   `lynkeus.tools.run_tool` and not through the web service or a browser
   (`docs/research/analysis-soil-moisture.md`, part 4.6).
6. The reduced copies of a result, which no file of the pilot area holds.
7. The three articles of reference 3, which were not read, and the licence of the software of the
   mission.
