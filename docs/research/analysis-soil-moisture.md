# Research note: Analysis tab, group Soil moisture

| | |
|---|---|
| Part | Analysis tab, group Soil moisture |
| Covers | The three tools Soil moisture One date, Change and Series, and the rule by which they leave out the cells that the products do not recommend |
| Written | 15 Nov 2026. Every source below was read on that day. |
| Code state | The research and the comparison of parts 2 to 5 were made on the branch `analysis-level-2` at commit `05930fb`, with the two functions of this note added; parts 8 and 9 on the branch `an3-soil`, from commit `d0aa71e` |
| Pilot area | Lower Merrimack River: box −71.20, 42.60, −70.75, 42.95 (west, south, east, north); track 141, frame 67, descending |
| Names of the tools | `soil-moisture-state`, `soil-moisture-change`, the names of the buttons |

This note records, for the two tools, what `docs/research/analysis.md` records for the three tools
of level 1: the product specification of the input layer (part 2), the published method and the
source program of the comparison (part 3), what was measured on real files (part 4), how GIS
programs offer the same functions (part 5), the sources with the date on which each was read (part
6) and what is not confirmed (part 7). Part 8 records the rule by which the tools leave out the
cells that the products do not recommend, and part 9 the tool Soil moisture Series. The button Soil
moisture Thematic map was removed from the Analysis tab on 15 Nov 2026, as no published algorithm of
the NISAR science team that derives classes from soil moisture was found
(`docs/research/analysis-thematic-maps.md`).

## 1. Points that this note answers

| Point | Answer | Source |
|---|---|---|
| Name, unit and no-data value of the layer | `/science/LSAR/SME2/grids/soilMoisture`, Float32, unit `meter^3/meter^3`, no-data value `-9999`. The Data part of Lynkeus writes the unit as `m3 m-3` and the no-data value as `nan` | Specification Rev C, page 37; the product files and the band tags of the sample file (parts 2.1 and 2.2) |
| Valid range | The specification gives none. Its retrieval quality flags name the thresholds 0.02 and 0.60. In the five frames measured, 5 of 3,960,563 cells with a value lie outside them | Specification Rev C, pages 17 and 37; part 4.3 |
| Grid and cell size | EASE-Grid 2.0 Global, EPSG:6933, 200 m; the product files state 200.17900467012078 m | Specification Rev C, sections 3.3 and 3.7; part 2.2 |
| Which algorithm the layer `soilMoisture` holds | None alone. It is the mean of the retrievals of the three algorithms (PMI, TSR, DSG) that are recommended in the cell, or of all that hold a value where none is recommended | Attribute `description` of the layer in the product files; measured in part 4.3 |
| Uncertainty layer | `/science/LSAR/SME2/grids/soilMoistureUncertainty`, Float32, unit `meter^3/meter^3`, no-data value `-9999`; the mean of the uncertainties by the same rule. The tools do not read it | Specification Rev C, pages 37 and 38; attribute `description` in the product files |
| Quality flags and masks | `retrievalQualityFlag` and `surfaceQualityFlag`, Int16, no-data value `-9999`. The tools read bit 0 of `retrievalQualityFlag` and leave out every cell where it is 1. The provisional products mark 97.9 % to 98.7 % of the cells of the pilot box that hold a value as not recommended, on each of their nine dates; the two beta products mark none | Parts 2.3, 4.4, 8.1 and 8.4 |
| File names | The pattern `_PRODUCT_FILE` of `api/src/lynkeus/analysis/inputs.py` reads the names of SME2 products without a change | Specification Rev C, section 2.3; part 2.4 |
| Which two dates may be compared | No document read states a rule. The tool accepts two products of the same instrument, track, direction and frame, by a choice of this note | Part 3.2 |

## 2. The layer that the two tools use

### 2.1 SME2 in the specification

Specification: NASA SDS Product Specification, Level-3 Soil Moisture (L3_SME2), JPL D-107677, Rev C,
version 1.0.0, 8 November 2024, 43 pages (SHA-256 of the file
`88e68ce6552e6915289d5b4968f3c5e46f316d3021d6bd96a75c221ba38e1667`). Rev C is the revision whose
file the ASF DAAC links; the list of references of the same page names the document "Huang, X., &
Chan, S. K. (2025). Level-3 Soil Moisture (NASA SDS Product Specification JPL D-107677 (Revision
D))" and links the file of Rev C. No file of Rev D was found. The quality-assurance program nisarqa
holds no specification of SME2 (commit `a8bc425`, folder `src/nisarqa/product_specs/`).

| Layer (under `/science/LSAR/SME2/grids/`) | Type | Unit | No data | Meaning | Place in the specification |
|---|---|---|---|---|---|
| `soilMoisture` | Float32 | `meter^3/meter^3` | `-9999` | "Soil moisture" | Table 4.2.1, page 37 |
| `soilMoistureUncertainty` | Float32 | `meter^3/meter^3` | `-9999` | "Soil moisture uncertainty" | Table 4.2.1, pages 37 and 38 |
| `retrievalQualityFlag` | Int16 | unitless | `-9999` | "Soil moisture retrieval quality flag while 0 means clear and non-zero means anomaly"; eight flag bits (part 2.3) | Table 4.2.1, page 37 |
| `algorithmCandidates/[DSG, TSR or PMI]/soilMoisture` | Float32 | `meter^3/meter^3` | `-9999` | The soil moisture of one algorithm | Table 4.2.1, pages 23, 26 and 30 |
| `algorithmCandidates/[DSG, TSR or PMI]/retrievalQualityFlag` | Int16 | unitless | `-9999` | The retrieval quality flag of one algorithm, with the same eight bits | Table 4.2.1, pages 23, 25 and 29 to 30 |
| `ancillaryData/surfaceQualityFlag` | Int16 | unitless | `-9999` | "Surface quality flag"; eight flag bits (part 2.3) | Table 4.2.1, page 32 |
| `ancillaryData/landCover` | Int8 | unitless | `-127` | Land cover in eleven classes; 01 is tree cover | Table 4.2.1, page 31 |

The table of the common attributes of a layer names `valid_min` and `valid_max` (Table 3.2.3, page
17), and the entry of `soilMoisture` gives neither. The specification therefore states no valid
range of the layer.

The product is "on the 200-meter global Equal-Area Scalable Earth (EASE) Grid 2.0 projection"
(section 1.1, page 7; section 3.3). The global grid has 73,080 rows and 173,520 columns, and the
cell (0,0) is the northernmost and westernmost cell (section 3.7, page 18). The projection is
EPSG:6933 (entry `projection`, pages 36 and 37). A granule is "on pre-defined track/frame" and its
extent is bounded by that of its GCOV product (Table 2.1.1, page 11). The product of the 5 + 5 MHz
mode is aggregated to 400 m and stays on the 200 m grid (section 2.2, page 11).

The mission states an accuracy goal of 0.06 m3/m3 over non-urban areas with a vegetation water
content below 5 kg/m2, without permanent snow and ice and without permanent inland water (section
2.1, page 9). No retrieval is performed over built-up areas, permanent snow and ice and permanent
inland water, nor over areas with excessive precipitation, frozen ground or snow on the ground; over
dense vegetation the retrieval is performed and flagged (section 2.2, page 11). No retrieval
accuracy is imposed on the product, and "retrieval performance will be attempted on a best-effort
basis" (page 8).

### 2.2 What the product files of the pilot area state

Five product files of the collection `NISAR_L3_SME2_PROVISIONAL_V1` (DOI `10.5067/NIL3SME2-P1`, read
from the product files) were downloaded from the ASF DAAC on 15 Nov 2026 and read with h5py (record
`products.json`). They state `productSpecificationVersion` = `1.0.2`, `productVersion` = `1.0.11`
and `softwareVersion` = `0.4.2`; the NASA catalogue records the program `SM_L_PGE`, version
`R05.02.0`, for each of them (record `catalogue.json`). The products therefore follow a later
version of the specification than the file that was read. They differ from Rev C in these points:

1. The layer `soilMoisture` carries the attribute `description` = "Averaged soil moisture. If
   recommended retrievals are available, the average is computed using only the recommended
   retrievals. If no recommended retrievals are available, the average is computed using all
   retrievals". Its attributes `units` = `meter^3/meter^3` and `_FillValue` = `-9999.0` are those of
   Rev C. It has no attribute `valid_min` or `valid_max`.
2. The layer `soilMoistureUncertainty` carries a description of the same kind for the uncertainty.
3. The layer `retrievalQualityFlag` carries the attribute `description` = "Soil moisture retrieval
   quality flag. The least significant bit indicates whether the retrieval is recommended (0 =
   recommended, 1 = not recommended). The second bit indicates the use of the PMI algorithm (0 = not
   applied, 1 = applied). The third bit indicates the use of the TSR algorithm (0 = not applied, 1 =
   applied). The most significant bit indicates the use of the DSG algorithm (0 = not applied, 1 =
   applied)". The values that the files hold lie between 3 and 15, so the bit of the DSG algorithm
   is bit 3.
4. The layer `surfaceQualityFlag` stands under `/science/LSAR/SME2/grids/` and not under
   `ancillaryData/`. Its attribute `description` reads "Surface quality flag" and names no bits.
5. The retrieval quality flags of the three algorithms carry the description "[DSG, PMI or TSR]
   retrieval quality flag while 0 means clear and non-zero means anomaly" and name no bits.

The frame of track 141 has 2205 by 1620 cells with the spacing 200.17900467012078 m
(`xCoordinateSpacing`; `yCoordinateSpacing` is the same with a minus sign), and the three dates of
this track and frame have the same coordinates. The band tags of the sample file
`sme2-soilmoisture-20261009.tif`, which NASA Harmony delivered on 14 Nov 2026, carry the same
attributes as the product file: `units` = `meter^3/meter^3`, `_FillValue` = `-9999` and the
description above.

The product file of 9 Oct 2026 names three files in its field
`/science/LSAR/SME2/metadata/processingInformation/inputs/l2GcovGranules`: the GCOV product of 9 Oct
2026 and the SME2 products of 27 Sep 2026 and of 15 Sep 2026 of the same track and frame. The
specification says that the time series algorithms require up to three GCOV granules (Table 2.1.1,
page 11). The soil moisture of a date is therefore not independent of the two dates before it.

The fields `aggregation` = `Mean` and `spatialFilter` = `Spatial filter combining median and one
sigma outlier removal` give how the backscatter was brought to the grid (ATBD, section 5.3, pages 50
and 51).

### 2.3 The quality flags

| Bit | `retrievalQualityFlag` in Rev C (page 37) and in the ATBD (Table 5.5.2, pages 53 and 54) | `retrievalQualityFlag` in the product files (version 1.0.2) | `surfaceQualityFlag` in Rev C (page 32) and in the ATBD (Table 5.5.1, pages 52 and 53) |
|---|---|---|---|
| 0 | Retrieval recommended flag: set if the surface flag is above 0 or another bit of the retrieval flag is raised | 0 = recommended, 1 = not recommended | Static water body: static water fraction above 10 % |
| 1 | Retrieval attempted flag: set if no retrieval was attempted | PMI algorithm applied | Urban area |
| 2 | Retrieval success flag: set if the retrieval was not successful | TSR algorithm applied | Precipitation |
| 3 | Soil moisture thresholds: set if the retrieval is below 0.02 or above 0.60 m3/m3 | DSG algorithm applied | Snow or ice |
| 4 | Anomaly of the HH backscatter | not named | Permanent snow or ice |
| 5 | Anomaly of the HV backscatter | not named | Frozen ground, from the soil temperature |
| 6 | Anomaly of the VV backscatter | not named | Terrain |
| 7 | Anomaly of the VH backscatter | not named | Dense vegetation: vegetation water content above 5 kg/m2 |

In both readings, bit 0 of `retrievalQualityFlag` is 1 where the product does not recommend the
retrieval. The files of `surfaceQualityFlag` hold the bits 8 and 9 in cells that hold a soil
moisture, and the bits 2, 4, 6, 11 and 12 as well in cells of the box without one (record
`products.json`). Rev C names bits 0 to 7 only, so the meaning of these bits was not read.

NASA Harmony lists 13 variables for the collection (list saved on 2026-11-14; record
`documents.json`), among them `/science/LSAR/SME2/grids/retrievalQualityFlag` and
`/science/LSAR/SME2/grids/surfaceQualityFlag`. It does not list the layers of the single algorithms.
The Data part of Lynkeus offers two layers of an SME2 product, `soilMoisture` and
`soilMoistureUncertainty` (`_layers` in `api/src/lynkeus/harmony.py`).

### 2.4 Names of the product files

The specification gives the file name of an SME2 product in section 2.3 (pages 11 to 13):
`NISAR_IL_PT_PROD_CYL_REL_P_FRM_MODE_POLE_S_StartDateTime_EndDateTime_CRID_A_C_LOC_CTR.EXT`, where
`I` is the instrument (`L` or `S`), `L` the level (1, 2 or 3), `PT` the processing type (`PR` or
`UR`), `PROD` the product (`RSLC`, `GSLC`, `GCOV`, `SME2`), `CYL` the cycle, `REL` the track (001 to
173), `P` the direction (`A` or `D`) and `FRM` the frame (001 to 176). This is the form of section
3.7 of the general document (JPL D-102255, Rev C; `docs/research/analysis.md`, part 2.3). The
pattern `_PRODUCT_FILE` of `api/src/lynkeus/analysis/inputs.py` accepts any digit as the level, so
it reads the names of SME2 products, and it was not changed. A test gives it the name of the product
of 9 Oct 2026 and reads the instrument `L`, the track 141, the direction `D` and the frame 67
(`api/tests/analysis/test_soil_moisture.py`).

## 3. The two tools

The method sheets `docs/methods/soil-moisture-state.md` and `docs/methods/soil-moisture-change.md`
give the formula, the checks and the legend of each tool. This part records the sources behind them.

### 3.1 Soil moisture, One date

1. **Existing function.** None is needed: the result is the input array itself. NumPy 2.5.4 is the
   only library that the function uses.
2. **Specification and method.** Part 2. The three algorithms of the product are the physical model
   inversion (ATBD, section 4.1, from page 15), the time series algorithm (section 4.2, from page
   27) and the multiscale fusion algorithm (section 4.3, from page 36); the product files call them
   PMI, TSR and DSG and name their references (method sheet, reference 3). The rule by which the
   product forms the layer from them is in the attribute `description` of the layer and was measured
   (part 4.3). The ATBD of Release 3.3 does not state this rule.
3. **Source program.** The soil moisture software of the mission produced the layer (version `0.4.2`
   in the product files). No public repository of it was found, so it was not run and its licence
   was not read. The comparison of D-17 is the identity of the result with the layer of the original
   HDF5 product file (part 4.2).
4. **Legend.** Fixed, from 0.02 to 0.60 m3 m-3, on the scale `YlGnBu`. The two ends are the
   thresholds of the retrieval quality flags in Rev C and in the ATBD (part 2.3, bit 3). The NASA
   Global Imagery Browse Services draw the soil moisture of the SMAP mission from 0.00 to 0.60 and
   above, in the unit cm³/cm³, in 255 steps from orange (255, 162, 0) through light blue (0, 255,
   255 at 0.300) to dark grey (80, 80, 80), with the no-data value −9999 transparent
   (`SMAP_Soil_Moisture.xml` of the colour maps v1.3). That colour table is not among the fourteen
   scales of the interface (`docs/research/contents.md`, section Colour scales). The scale `YlGnBu`
   is the one that the Data part gives to the layer. The Data part itself gives the layer a legend
   from the 2nd to the 98th percentile of its values, which differs between dates (part 4.1); the
   tool gives a fixed range so that two dates can be compared.
5. **Rules of the code.** The tool refuses an input that is not the layer `soilMoisture` of one SME2
   product file with the unit `m3 m-3` and one date, a layer whose description does not hold the
   name of its layer inside the product, a layer without any value, and a layer with a value below 0
   or above 1. The last rule follows from the unit: the volume of water in a volume of soil lies
   between 0 and 1. It is a conclusion of this note. One such cell refuses the whole layer.
6. **Limits.** The tool does not read the quality flags (parts 2.3 and 4.4). The products are
   provisional. The tool was run on products of the instrument L only.

### 3.2 Soil moisture, Change

1. **Existing function.** The subtraction of two arrays and `numpy.quantile` of NumPy 2.5.4. With
   its percentile in a list, `numpy.quantile` interpolates 32-bit values in 64-bit numbers
   (`docs/research/analysis.md`, part 4.3).
2. **Method.** Singh (1989), <https://doi.org/10.1080/01431168908903939>, section 4.1, Univariate
   image differencing, pages 990 to 992: registered images of two times are subtracted cell by cell,
   which gives an image of the change between the two times; the article calls image differencing
   "the most widely used technique for change detection" (page 992). The article treats images of
   radiance. No article on the difference of two soil moisture products of NISAR was found; the ATBD
   describes no change product.
3. **Source program.** `gdal raster calc` of GDAL 3.12.2 "Chicoutimi" (released 2026/02/03), with
   the expression `LATER - EARLIER`. The command "performs pixel-wise calculations on one or more
   input GDAL datasets", evaluates the expression with the library muparser, and converts its inputs
   "to 64-bit floating point numbers before performing calculations"
   (<https://gdal.org/en/stable/programs/gdal_raster_calc.html>). It was added in GDAL 3.11. It is
   independent of NumPy. Licence: MIT style (file `LICENSE.TXT` of the image, section GDAL/OGR
   General). The ASF NISAR Cookbook, the source program of the level-1 tools, holds no notebook on
   SME2 (commit `17b69c8`, 17 notebooks listed).
4. **Order of the two dates.** Later minus earlier, so that a positive value is an increase. ArcGIS
   Pro defines its difference in the same order: "Output = (To Raster) − (From Raster)", where the
   From Raster is "the initial or earlier raster" (part 5.2).
5. **Which two products may be compared.** No document read states a rule. The tool accepts two
   products of the same instrument, track, direction and frame, as Backscatter, Change does. The
   reasons: the nodal crossing times are 6 AM and 6 PM (ATBD, page 9), so the two directions are of
   different times of day; the ascending and the descending observations have different incidence
   angles (ATBD, section 4.1.4, page 26); the time series algorithms are described for one
   direction, with a step of 12 days (section 4.2.1, page 33; section 4.3, page 37). All products
   stand on one global grid, so products of different tracks share cells: the layers of track 69 (4
   Oct 2026) and of track 104 (7 Oct 2026, ascending) were received for the pilot box and have its
   216 by 164 cells (part 4.1). A wider rule, for example two tracks of the same direction, was not
   researched.
6. **Legend.** From −r to +r, where r is the 99th percentile of the absolute values of the result,
   on the scale `RdBu`, with the words "decrease" and "increase" at its two ends. This is the legend
   of Backscatter, Change (`docs/research/analysis.md`, part 3.2), applied to soil moisture by a
   choice of this note. No source was found for the legend of a change of soil moisture. `gdal
   raster calc` draws no legend.
7. **Rules of the code.** A cell is no data where either input is `nan`. The tool refuses inputs
   that are not two layers `soilMoisture` of SME2 product files with the unit `m3 m-3` and one date
   each, two arrays of different size, two products that are not of the same instrument, track,
   direction and frame, a first layer that is not of the earlier date, a layer without any value or
   with a value outside 0 to 1, a result without any value and a legend without a range.
8. **Limits.** The tool does not resample; `run_tool` refuses layers whose grids differ before it
   calls the tool. The tool does not read the quality flags of either date. The two dates are not
   independent retrievals (part 2.2). No document read states the accuracy of the difference of two
   dates. The range of the legend is computed for each result.

### 3.3 Layers that the tools refuse

Tried on 15 Nov 2026 with the layers of the pilot area that `lynkeus.harmony.get_layer` had
received, by calling the functions of the tools (record `lynkeus_side.json`):

| Tool | Input layers | Sentence of the refusal |
|---|---|---|
| `soil-moisture-state` | `Uncertainty of soil moisture, 9 Oct 2026` | The layer "Uncertainty of soil moisture, 9 Oct 2026" is the layer soilMoistureUncertainty of its product, and the tool reads the layer soilMoisture. |
| `soil-moisture-state` | `Soil moisture, 27 Sep 2026`, `Soil moisture, 9 Oct 2026` | The number of input layers must be 1, and it is 2. |
| `soil-moisture-change` | `Soil moisture, 9 Oct 2026`, `Soil moisture, 27 Sep 2026` | The first layer must be of an earlier date than the second. |
| `soil-moisture-change` | `Soil moisture, 9 Oct 2026` | The number of input layers must be 2, and it is 1. |
| `soil-moisture-change` | `Soil moisture, 27 Sep 2026`, `Uncertainty of soil moisture, 9 Oct 2026` | The layer "Uncertainty of soil moisture, 9 Oct 2026" is the layer soilMoistureUncertainty of its product, and the tool reads the layer soilMoisture. |
| `soil-moisture-change` | `Soil moisture, 27 Sep 2026`, `Soil moisture, 7 Oct 2026` | The two layers are not of the same instrument, track, direction and frame. |
| `soil-moisture-change` | `Soil moisture, 27 Sep 2026`, `Soil moisture, 4 Oct 2026` | The two layers are not of the same instrument, track, direction and frame. |
| `backscatter-state` | `Soil moisture, 9 Oct 2026` | The layer "Soil moisture, 9 Oct 2026" is not a layer received from one NISAR GCOV product. |
| `coherence-state` | `Soil moisture, 9 Oct 2026` | The layer "Soil moisture, 9 Oct 2026" is not a layer received from one NISAR GUNW product. |

The last two rows show that the tools of level 1 refuse a soil moisture layer by the check of the
product file. Part 4.6 gives the refusals that were tried through `lynkeus.tools.run_tool`.

## 4. What was measured on real files

Every number of this part is copied from a record that the repository keeps in
`docs/research/records/analysis/soil-moisture/`.

| Record | SHA-256 | What it holds |
|---|---|---|
| `layers.json` | `49ac71f9a762b387502afb22721b3d3760feed4fc067715b729a6fbf2041d811` | The six layers that `lynkeus.harmony.get_layer` received on 15 Nov 2026: product file, layer description, job of NASA Harmony, grid, and the SHA-256 of each file |
| `products.json` | `dc884236846df68f763c055e44012e15cb30b4ced2955dc690a6add37ad3533a` | The five product files (HDF5), read on 15 Nov 2026: their fields, the statistics of the whole frames, the rule of the mean, the quality flags, and the layers compared with the product files |
| `lynkeus_side.json` | `14c7056e5251897f23c52c61d799321d0320fd247438f2ac3f1c444dbbb382b4` | The results of the two tools on the layers and on the whole frames, the refusals, and the runs through `lynkeus.tools.run_tool` |
| `comparison.json` | `a9e1b40ed6c23130b5d6d70c71c1b752623fd4d71c2002fef847e07344987323` | The results of Soil moisture, Change against the files of the source program, with the commands of the source program and the SHA-256 of its inputs and outputs |
| `catalogue.json` | `39e2c17e936a3aecb1d34a6a2e51c527c6f751348c009b021d0ccf359b26c77e` | The products of SME2 that the NASA catalogue held for the box, and the records of five of them |
| `documents.json` | `a8fbc9c3f715048cbf3e2a2c297b97131e5e71120fc0f07f1cc84e869a1de187` | The documents read, with their addresses and the SHA-256 of each file as it was read; the image of the source program; the variables that NASA Harmony lists for the collection |

### 4.1 The layers received

The NASA catalogue held 33 products of the collection `NISAR_L3_SME2_PROVISIONAL_V1` for the box on
15 Nov 2026, of four tracks; nine are of track 141, frame 67, descending, from 23 Jun 2026 to 9 Oct
2026, and the latest two are of 27 Sep 2026 and 9 Oct 2026. It held 11 products of
`NISAR_L3_SME2_BETA_V1` and none under the short name `NISAR_L3_SME2_V1`. Six layers were received
through `lynkeus.harmony.get_layer`, with the Earthdata account of the server, for the box of the
pilot area.

| File | SHA-256 | Layer and product file | Job of NASA Harmony | Time |
|---|---|---|---|---|
| `sme2-soilmoisture-20260915.tif` | `bfd119fb52d7b283be86099909625cc689e443fa706c63786fcd4dd730a4a11d` | `soilMoisture` of `NISAR_L3_PR_SME2_030_141_D_067_4005_DHDH_A_20260915T234330_20260915T234405_P05023_N_F_J_001.h5` | `02a9a081-640f-4d69-a9ef-726296d0829f` | 16.7 s |
| `sme2-soilmoisture-20260927.tif` | `1485f51a4a971fcad41815c903259aaf0d99e7da9b8b2cb23b239e936e3ee9f0` | `soilMoisture` of `NISAR_L3_PR_SME2_031_141_D_067_4005_DHDH_A_20260927T234330_20260927T234405_P05023_N_F_J_001.h5` | `6521c6cb-b20a-448c-96e0-1d716acb7b59` | 15.9 s |
| `sme2-soilmoisture-20261009.tif` | `aefe8f4759a11d7cd5a13dad9deffba67471704ae0484206dfafdde784df93f9` | `soilMoisture` of `NISAR_L3_PR_SME2_032_141_D_067_4005_DHDH_A_20261009T234330_20261009T234405_P05023_N_F_J_001.h5` | `20386b7b-782a-4d75-bd01-8ec85b009651` | 18.1 s |
| `sme2-soilmoistureuncertainty-20261009.tif` | `21a745467998d4143589ac996abc4883c4676e6f6448b8e9f42564fc2d8dcd5b` | `soilMoistureUncertainty` of `NISAR_L3_PR_SME2_032_141_D_067_4005_DHDH_A_20261009T234330_20261009T234405_P05023_N_F_J_001.h5` | `3e1ebb77-df54-4779-ad2e-add50e088973` | 18.8 s |
| `sme2-soilmoisture-20261004.tif` | `171c3397ba9f062cdaa1bd6081177b5048166d61c329f5f8f46c4da0efb6c8a5` | `soilMoisture` of `NISAR_L3_PR_SME2_032_069_D_067_4005_DHDH_A_20261004T235149_20261004T235224_P05023_N_F_J_001.h5` | `69f8bb5d-bdcd-49fc-9e7a-de904786d504` | 17.4 s |
| `sme2-soilmoisture-20261007.tif` | `c386aeba2ea7b059a834f8220addcf850ebc6bf19c5e1e2770dcfd79e542907a` | `soilMoisture` of `NISAR_L3_PR_SME2_032_104_A_023_4005_DHDH_A_20261007T094232_20261007T094307_P05023_N_F_J_001.h5` | `330ee37b-b565-4d64-8334-fb8617edffb8` | 16.0 s |

| Measure | 15 Sep 2026, track 141 | 27 Sep 2026, track 141 | 9 Oct 2026, track 141 | 4 Oct 2026, track 69 | 7 Oct 2026, track 104 |
|---|---|---|---|---|---|
| Columns by rows | 216 by 164 | 216 by 164 | 216 by 164 | 216 by 164 | 216 by 164 |
| Projection | EPSG:6933 | EPSG:6933 | EPSG:6933 | EPSG:6933 | EPSG:6933 |
| Cells | 35,424 | 35,424 | 35,424 | 35,424 | 35,424 |
| Cells with `nan` | 6,186 | 6,186 | 6,186 | 26,206 | 6,186 |
| Cells with a value | 29,238 | 29,238 | 29,238 | 9,218 | 29,238 |
| Cells that are zero, negative, infinite | 0, 0, 0 | 0, 0, 0 | 0, 0, 0 | 0, 0, 0 | 0, 0, 0 |
| Lowest value | `0.08500000089406967` | `0.08900000154972076` | `0.07999999821186066` | `0.05967140197753906` | `0.07999999821186066` |
| Highest value | `0.6000000238418579` | `0.6000000238418579` | `0.6000000238418579` | `0.4764682650566101` | `0.5951008796691895` |
| Median | `0.28378552198410034` | `0.2718707323074341` | `0.2329612672328949` | `0.25332123041152954` | `0.23668721318244934` |
| 5th and 95th percentile | `0.25104556381702425`, `0.4008160576224322` | `0.23895682990550995`, `0.32998632937669753` | `0.19499999284744263`, `0.2722892880439758` | `0.2234410263597965`, `0.28610632270574565` | `0.2048376679420471`, `0.27745128273963926` |
| Cells below 0.02; above 0.60 | 0; 0 | 0; 0 | 0; 0 | 0; 0 | 0; 0 |
| Legend that the Data part gave the layer (2nd to 98th percentile) | `0.23740190804004668`, `0.4309999942779541` | `0.2289392176270485`, `0.37700000405311584` | `0.17800000309944153`, `0.2919092983007429` | `0.2016413164138794`, `0.31117190122604366` | `0.1899999976158142`, `0.2997061693668364` |

Each description carries the unit `m3 m-3`, the colour scale `YlGnBu` and the name `soilMoisture` in
its field `layer`. The files hold no reduced copy. The three layers of track 141 and the uncertainty
layer have the same grid. The layers of the tracks 69 and 104 have the same projection, cell size
and number of cells, and their origins differ from that of track 141 by 2.0e-07 m and 4.7e-08 m in x
and by 1.0e-08 m in y. The layer of track 69 holds a value in 9,218 cells: the box lies at the edge
of that frame.

The uncertainty layer of 9 Oct 2026 holds a value in 29,237 cells, one fewer than the soil moisture
layer: in one cell of the box the product holds a soil moisture and the no-data value of the
uncertainty.

### 4.2 The layers against the product files

The layer `soilMoisture` was read from each product file for the rectangle of the layer, which was
found by the coordinates of the cell centres, and compared with the values of the file that Lynkeus
wrote (record `products.json`).

| Measure | 15 Sep 2026, track 141 | 27 Sep 2026, track 141 | 9 Oct 2026, track 141 | 4 Oct 2026, track 69 | 7 Oct 2026, track 104 |
|---|---|---|---|---|---|
| First column and row of the layer in the grid of the product | 872, 584 | 872, 584 | 872, 584 | 1817, 539 | 647, 539 |
| Largest difference of the coordinates of the cell centres (m), x; y | `2.3e-07`; `1.6e-07` | `2.3e-07`; `1.6e-07` | `2.3e-07`; `1.6e-07` | `4.3e-07`; `1.5e-07` | `1.8e-07`; `1.5e-07` |
| Cells with a value in both | 29,238 | 29,238 | 29,238 | 9,218 | 29,238 |
| Cells without data in both | 6,186 | 6,186 | 6,186 | 26,206 | 6,186 |
| Cells with a value in one only | 0 and 0 | 0 and 0 | 0 and 0 | 0 and 0 | 0 and 0 |
| Cells that differ where both hold a value | 0 | 0 | 0 | 0 | 0 |
| Largest difference (m3 m-3) | `0.0` | `0.0` | `0.0` | `0.0` | `0.0` |
| Cells of the layer whose centre lies inside the box | 35,424 | 35,424 | 35,424 | 35,424 | 35,424 |

Every cell that holds a value in a layer holds the same value in the product file, bit for bit, and
every other cell holds the no-data value in the product. The centre of every cell of the rectangle
lies inside the box of the request, so NASA Harmony emptied no cell of these layers. The sample file
`sme2-soilmoisture-20261009.tif` (SHA-256
`31d6f3c1e5c17cccd90f14665c0527e732bc17cee4225a3f9598a7c3da9d532b`), which NASA Harmony delivered on
14 Nov 2026 with the no-data value −9999, equals the product in the same way: 29,238 cells with a
value in both, 0 cells that differ.

### 4.3 The product files: whole frames and the rule of the mean

| Measure | 15 Sep 2026, track 141 | 27 Sep 2026, track 141 | 9 Oct 2026, track 141 | 4 Oct 2026, track 69 | 7 Oct 2026, track 104 |
|---|---|---|---|---|---|
| Product file, SHA-256 | `c4b9589f86c175aa67b609d6038e57ac41316d5adc1406ebed06bec598b7d9e7` | `4ce70185c501879ec81bacf14ab2fd2e69bfd750f1325fa41da36be996837797` | `579f26ae636c3adc36e0af5d88d69df82ea3a09a1cc1d758085a414f43a951f8` | `772668c7073529bcc724d128fbe245f4be5034e1a56cd82c41bef0572c5a71a1` | `cccfe0c3caf161191fb44f7318da72ee239fa8f0e9d706080b85e2d8e57be2da` |
| Size (bytes); MD5 equal to that of the NASA catalogue | 96,468,992; yes | 96,468,992; yes | 96,468,992; yes | 127,926,272; yes | 83,886,080; yes |
| `productSpecificationVersion`; `productVersion`; `softwareVersion` | `1.0.2`; `1.0.11`; `0.4.2` | `1.0.2`; `1.0.11`; `0.4.2` | `1.0.2`; `1.0.11`; `0.4.2` | `1.0.2`; `1.0.11`; `0.4.2` | `1.0.2`; `1.0.11`; `0.4.2` |
| `orbitPassDirection`; `zeroDopplerStartTime` | Descending; `2026-09-15T23:43:30` | Descending; `2026-09-27T23:43:30` | Descending; `2026-10-09T23:43:30` | Descending; `2026-10-04T23:51:49` | Ascending; `2026-10-07T09:42:32` |
| Columns by rows of the frame | 2205 by 1620 | 2205 by 1620 | 2205 by 1620 | 2205 by 1530 | 2205 by 1530 |
| Cells with a value; with the no-data value | 702,700; 2,869,400 | 704,158; 2,867,942 | 704,710; 2,867,390 | 1,430,783; 1,942,867 | 418,212; 2,955,438 |
| Lowest and highest value | `0.03500000014901161`, `0.6029999852180481` | `0.01856086775660515`, `0.6000000238418579` | `0.019999999552965164`, `0.6000000238418579` | `0.022989965975284576`, `0.6000000238418579` | `0.019999999552965164`, `0.6000000238418579` |
| Cells below 0.02; above 0.60; below 0; above 1 | 0; 1; 0; 0 | 4; 0; 0; 0 | 0; 0; 0; 0 | 0; 0; 0; 0 | 0; 0; 0; 0 |
| Cells with a value that are marked not recommended (bit 0 of `retrievalQualityFlag` is 1) | 694,132 (98.8 %) | 695,030 (98.7 %) | 693,642 (98.4 %) | 1,397,544 (97.7 %) | 410,248 (98.1 %) |
| Cells compared with the rule of the mean; largest difference (m3 m-3); cells that differ by more than 1e-6 | 702,700; `3.9736429868764134e-08`; 0 | 704,158; `4.470348358154297e-08`; 0 | 704,710; `3.9736429868764134e-08`; 0 | 1,430,783; `4.470348358154297e-08`; 0 | 418,212; `3.9736429868764134e-08`; 0 |
| Cells with a value in the layer only; in the rule only | 0; 0 | 0; 0 | 0; 0 | 0; 0 | 0; 0 |
| Cells with the retrievals of 1, 2 and 3 algorithms | 19,069, 15,583, 668,048 | 21,525, 3,543, 679,090 | 22,809, 4,915, 676,986 | 31,984, 8,212, 1,390,587 | 13,170, 3,224, 401,818 |
| Against the mean of all algorithms without the rule: cells that differ by more than 1e-6 | 2,295 | 3,867 | 2,117 | 2,089 | 2,686 |

The rule of the mean, as it was computed: in each cell, the mean of the soil moisture of the
algorithms whose own `retrievalQualityFlag` has bit 0 equal to 0; where no algorithm has it, the
mean of the soil moisture of all algorithms that hold a value. The layer `soilMoisture` equals this
rule in every cell that holds a value, within the rounding of 32-bit numbers. Without the rule, the
mean of all algorithms differs from the layer in the cells of the last row of the table. The words
of the attribute `description` are therefore confirmed on these five files.

No cell of the five frames lies below 0 or above 1. 4 cells lie below 0.02 (27 Sep 2026) and 1 above
0.60 (15 Sep 2026), of 3,960,563 cells with a value.

### 4.4 The quality flags in the pilot box

The flags were read from the product files for the cells of each layer that hold a soil moisture
(record `products.json`).

| Measure | 15 Sep 2026, track 141 | 27 Sep 2026, track 141 | 9 Oct 2026, track 141 | 4 Oct 2026, track 69 | 7 Oct 2026, track 104 |
|---|---|---|---|---|---|
| Cells with a value | 29,238 | 29,238 | 29,238 | 9,218 | 29,238 |
| Bit 0 is 1 (not recommended) | 28,816 (98.6 %) | 28,759 (98.4 %) | 28,638 (97.9 %) | 9,027 (97.9 %) | 28,669 (98.1 %) |
| Bit 0 is 0 (recommended) | 422 | 479 | 600 | 191 | 569 |
| Bit 1 is 1 (PMI applied); bit 2 (TSR applied); bit 3 (DSG applied) | 26,948; 28,635; 27,411 | 27,010; 28,838; 27,410 | 26,983; 28,956; 27,410 | 8,946; 9,138; 9,088 | 26,951; 28,858; 27,404 |
| `surfaceQualityFlag` is 0 | 458 | 488 | 600 | 191 | 577 |
| `surfaceQualityFlag`: cells with bit 0; bit 8; bit 9 | 2,186; 28,158; 1,574 | 2,186; 28,113; 1,574 | 2,186; 27,973; 1,574 | 654; 8,965; 40 | 2,186; 28,003; 1,574 |
| `landCover`: class 1 (tree cover); class 3 (grassland); class 9 (herbaceous wetland); other classes | 25,461; 1,687; 1,574; 516 | 25,461; 1,687; 1,574; 516 | 25,461; 1,687; 1,574; 516 | 8,660; 370; 40; 148 | 25,461; 1,687; 1,574; 516 |

On each date the cells whose `surfaceQualityFlag` is 0 are about as many as the recommended cells (9
Oct 2026: 600 and 600). Bit 8 of `surfaceQualityFlag` is set in most cells, and Rev C does not name
it (part 2.3). The land cover of the product gives the class tree cover to 87.1 % of the cells of
track 141. The specification says that retrievals over dense vegetation are performed and flagged
(part 2.1). Which condition bit 8 marks was not read.

What the evidence does not show: the share of recommended cells in other areas, for example over
crops or grassland; the meaning of the bits 8, 9, 11 and 12; and whether a validated product will
mark the cells in the same way.

### 4.5 Soil moisture, Change

In the box of the pilot area, on the layers of track 141 (records `lynkeus_side.json`,
`comparison.json`, `products.json`):

| Measure | 15 Sep to 27 Sep 2026 | 27 Sep to 9 Oct 2026 | 15 Sep to 9 Oct 2026 |
|---|---|---|---|
| Cells with a value in the result of the tool and of the source program | 29,238 | 29,238 | 29,238 |
| Cells with `nan` in both | 6,186 | 6,186 | 6,186 |
| Cells with a value in one result only | 0 and 0 | 0 and 0 | 0 and 0 |
| Largest difference, tool minus source program (m3 m-3) | `0.0` | `0.0` | `0.0` |
| Cells with a difference; arrays bit-identical | 0; yes | 0; yes | 0; yes |
| Lowest and highest value of the result (m3 m-3) | `-0.2799999713897705`, `0.11254438757896423` | `-0.30000001192092896`, `0.14100000262260437` | `-0.3569999933242798`, `0.11066555976867676` |
| 5th percentile, median and 95th percentile of the result (m3 m-3) | `-0.06400001049041748`, `-0.012370750308036804`, `0.0314894452691078` | `-0.10036501437425613`, `-0.0381951704621315`, `0.0029699578881263516` | `-0.17000000402331353`, `-0.04981823265552521`, `-0.009088704735040686` |
| Cells with a decrease; with an increase; with no change | 20,013; 9,218; 7 | 27,382; 1,854; 2 | 28,511; 726; 1 |
| Legend of the tool: 99th percentile of the absolute values (m3 m-3) | ±`0.13345971763134046` | ±`0.20562999561429127` | ±`0.24900001287460327` |
| The same percentile of the array of the source program, with numpy (m3 m-3) | `0.13345971763134046` | `0.20562999561429127` | `0.24900001287460327` |
| The two sorted absolute values of the result around the 99th percentile (m3 m-3) | `0.13319209218025208`, `0.13361689448356628` | `0.20500001311302185`, `0.20599998533725739` | `0.24900001287460327`, `0.24900001287460327` |
| Largest difference of the result from the difference in 64-bit numbers (m3 m-3) | `1.4901161193847656e-08` | `1.4901161193847656e-08` | `1.4901161193847656e-08` |
| Cells recommended by the products on both dates; on one date only; on neither | 418; 65; 28,755 | 479; 121; 28,638 | 422; 178; 28,638 |

On the whole frames of the product files, 2205 by 1620 cells:

| Measure | 15 Sep to 27 Sep 2026 | 27 Sep to 9 Oct 2026 | 15 Sep to 9 Oct 2026 |
|---|---|---|---|
| Cells of the frame | 3,572,100 | 3,572,100 | 3,572,100 |
| Cells with a value in the result of the tool and of the source program | 702,675 | 700,913 | 700,556 |
| Cells with `nan` in both | 2,869,425 | 2,871,187 | 2,871,544 |
| Cells with a value in one result only | 0 and 0 | 0 and 0 | 0 and 0 |
| Largest difference, tool minus source program (m3 m-3) | `0.0` | `0.0` | `0.0` |
| Cells with a difference; arrays bit-identical | 0; yes | 0; yes | 0; yes |
| Cells with a value on the earlier date only; on the later date only | 25; 1,483 | 3,245; 3,797 | 2,144; 4,154 |
| Lowest and highest value of the result (m3 m-3) | `-0.4127577245235443`, `0.33399999141693115` | `-0.30000001192092896`, `0.37481826543807983` | `-0.3569999933242798`, `0.27300000190734863` |
| Legend of the tool (m3 m-3) | ±`0.09359421789646152` | ±`0.11297335147857668` | ±`0.11872296631336203` |

The arrays of the tool and of the source program are bit-identical for the three pairs, in the box
and in the whole frame. The source program computes the difference in 64-bit numbers and writes it
as Float32; the tool subtracts in 32-bit numbers. The difference of two 32-bit values is exact in
64-bit numbers, and both programs round it once to 32 bits, which gives the same value.

The percentile row of the source program was computed with numpy on the array of the source program,
which draws no legend of its own; it shows only that the two arrays give the same percentile.

### 4.6 How the comparison was run

| | |
|---|---|
| Platform | `Linux-6.8.0-146-generic-x86_64-with-glibc2.41`, Python 3.13.18 |
| Lynkeus | The two functions of this note, with numpy 2.5.4 and pydantic 2.14.3. The files were read with rasterio 1.5.2 (GDAL 3.12.2) and the product files with h5py 3.16.0 (HDF5 2.0.0), through earthaccess 0.19.0 |
| Source program | The image `ghcr.io/osgeo/gdal:alpine-small-3.12.2` (digest `sha256:3775c7530eb68f95b8c67853da1e1e99a607e32a87f3d433440b8b562079f645`), GDAL 3.12.2 |
| Command | `gdal raster calc -i EARLIER=<earlier file> -i LATER=<later file> --calc "LATER - EARLIER" --ot Float32 --nodata nan --propagate-nodata --overwrite -o <output file>`, once for each pair; the record holds the six commands |
| Input of both sides | In the box: the files of the layers as Lynkeus wrote them. In the whole frame: the layer `soilMoisture` of each product file, read with h5py, with `nan` in the cells of the no-data value, written with rasterio as a GeoTIFF file and read back bit for bit; the image of the source program does not read HDF5 |
| Run | 15 Nov 2026, 10:37 UTC. The run was made twice on that day with the same scripts and gave the same arrays; the records are those of the second run |

**Through `lynkeus.tools.run_tool`.** On the same day the two tools ran through `run_tool`, the
function that the web service calls for a job of a tool, on the layers of 27 Sep 2026 and 9 Oct 2026
(record `lynkeus_side.json`). They did not run through the web service.

| | Soil moisture, One date, 27 Sep 2026 | Soil moisture, One date, 9 Oct 2026 | Soil moisture, Change, 27 Sep to 9 Oct 2026 |
|---|---|---|---|
| Size of the file (bytes) | 99,932 | 100,980 | 113,371 |
| Values read back equal to the array of the function, bit for bit | yes | yes | yes |
| Grid equal to that of the input layers | yes | yes | yes |
| `unit` | `m3 m-3` | `m3 m-3` | `m3 m-3` |
| `range` | `0.02`, `0.6` | `0.02`, `0.6` | `-0.20562999561429127`, `0.20562999561429127` |
| `colours`; `ends` | `YlGnBu`; none | `YlGnBu`; none | `RdBu`; `decrease`, `increase` |
| `dates` | 2026-09-27 | 2026-10-09 | 2026-09-27, 2026-10-09 |
| Reduced copies | none | none | none |
| Valid for `cog_validate` in strict mode; faults against the schemas of STAC | yes; none | yes; none | yes; none |

For each result, `inputs` holds the product files of the input layers, `method` is the reference
that the function returns, the field `layer` is null, the band of the record has the unit `m3 m-3`
and the no-data value `nan`, and the links `derived_from` of the record lead to the records of the
input layers, in their order. The record of each result ends with "Reduced copies made by averaging
the values."

Refusals through `run_tool`; no file was written for any of them:

| Tool | Input layers | Sentence of the refusal |
|---|---|---|
| `soil-moisture-state` | Uncertainty of soil moisture, 9 Oct 2026 | The layer "Uncertainty of soil moisture, 9 Oct 2026" is the layer soilMoistureUncertainty of its product, and the tool reads the layer soilMoisture. |
| `soil-moisture-change` | Soil moisture, 9 Oct 2026, Soil moisture, 27 Sep 2026 | The first layer must be of an earlier date than the second. |
| `soil-moisture-change` | Soil moisture, 27 Sep 2026, Soil moisture, 7 Oct 2026 | The layers of the analysis do not have the same grid. |
| `soil-moisture-change` | Soil moisture, 9 Oct 2026 | The number of input layers must be 2, and it is 1. |

The third row is a refusal of `run_tool` and not of the tool: the grids of the two files differ in
their origins (part 4.1). The function of the tool, called with the same two arrays, refuses them
with "The two layers are not of the same instrument, track, direction and frame." (part 3.3).

What the comparison does not show:

1. The tools as jobs of the web service, and the display of a result or of a refusal in a browser.
2. Reduced copies of a result: no file of the pilot area holds one.
3. The source program on the HDF5 product files: it was given GeoTIFF files with the values of the
   product files.
4. Other areas, other tracks as a pair, products of the instrument S, and validated products.
5. The memory of a run.

## 5. How GIS programs offer these functions

The pages read are those of the ArcGIS Pro documentation 3.7 (each page states the version 3.7 and
the date 17 Aug 2026) and of the QGIS User Guide 3.44 (pages last updated on 30 Oct 2026). A
statement is made only where the page states it.

### 5.1 Soil moisture, One date (display of one layer with a fixed range)

| | |
|---|---|
| ArcGIS Pro | The Symbology pane has a Stretch symbology. Its stretch type "defines the range of values to display"; among the types are Minimum Maximum, Percent Clip and Standard Deviation, and "Edit min/max values" lets the user set the two ends for the Minimum Maximum type ([Change the symbology of imagery](https://doc.esri.com/en/arcgis-pro/latest/help/data/imagery/symbology-pane.html)). The page names no symbology for soil moisture |
| QGIS | The renderer Singleband pseudocolor draws one band with a colour ramp between a minimum and a maximum value. The settings of the minimum and the maximum offer User defined, Cumulative count cut ("The standard range of values is 2% to 98%"), Min / max and Mean +/- standard deviation ([Raster Properties Dialog](https://docs.qgis.org/3.44/en/docs/user_manual/working_with_raster/raster_properties.html)) |
| Standard | The NASA Global Imagery Browse Services publish a colour map for the soil moisture of the SMAP mission, from 0.00 to 0.60 and above, in cm³/cm³ ([`SMAP_Soil_Moisture.xml`](https://gibs.earthdata.nasa.gov/colormaps/v1.3/SMAP_Soil_Moisture.xml)) |
| Function used | `soil_moisture_state` in `api/src/lynkeus/analysis/soil_moisture.py`: the layer of the product unchanged, with the fixed legend 0.02 to 0.60 m3 m-3. Method sheet `docs/methods/soil-moisture-state.md` |
| Limits | Both programs leave the range to the user. The Lynkeus tool gives one fixed range, so that two dates are drawn alike; the Data part gives the received layer the 2nd to the 98th percentile, which is the default cut of QGIS |
| Read on | 15 Nov 2026 |

### 5.2 Soil moisture, Change (difference of two dates)

| | |
|---|---|
| ArcGIS Pro | The tool Compute Change Raster (Image Analyst toolbox) takes the From Raster, "the initial or earlier raster", and the To Raster, "the final or later raster". Its default method Difference is "the mathematical difference, or subtraction, between the pixel values": Output = (To Raster) − (From Raster). If the cell sizes or extents of the inputs differ, the environment settings Cell Size and Output Extent decide. Every licence level needs the Image Analyst extension ([Compute Change Raster](https://doc.esri.com/en/arcgis-pro/latest/tool-reference/image-analyst/compute-change-raster.html)). The tool Minus (Spatial Analyst toolbox) "subtracts the value of the second input raster from the value of the first input raster on a cell-by-cell basis", and "the order of inputs is relevant" ([Minus](https://doc.esri.com/en/arcgis-pro/latest/tool-reference/spatial-analyst/minus.html)) |
| QGIS | The Raster Calculator of the Raster menu computes an expression on the bands of the loaded layers, written as `layer_name@band_number`, with the arithmetical operators `+`, `-`, `*` and others. If an input has another resolution, its values are resampled with the nearest neighbour ([Raster Analysis](https://docs.qgis.org/3.44/en/docs/user_manual/working_with_raster/raster_analysis.html)). `docs/research/analysis.md`, part 5.2, records that no change-detection algorithm for two rasters was found among the raster analysis algorithms |
| Reference program | GDAL 3.12.2, command `gdal raster calc`: an expression on named inputs, for example `LATER - EARLIER`. The inputs "should have the same spatial reference system and should cover the same spatial extent but are not required to have the same spatial resolution"; the option `--propagate-nodata` sets a cell to the no-data value of the output if any input cell is no data ([gdal raster calc](https://gdal.org/en/stable/programs/gdal_raster_calc.html)) |
| Function used | `soil_moisture_change` in `api/src/lynkeus/analysis/soil_moisture.py`: later minus earlier, in m3 m-3. Method sheet `docs/methods/soil-moisture-change.md` |
| Limits | ArcGIS Pro names its two inputs by their time and subtracts the earlier from the later, as the Lynkeus tool does; Minus, the QGIS calculator and GDAL leave the order to the user. ArcGIS Pro and QGIS resample inputs that do not share a grid, and GDAL accepts inputs of different resolution; the Lynkeus tool does not resample. No program read here checks that its two inputs are the same quantity of the same track; the Lynkeus tool does |
| Read on | 15 Nov 2026 |

## 6. Sources

Each source was read on 15 Nov 2026. The record `documents.json` holds the SHA-256 of each file as
it was read.

| Source | Address | What was read |
|---|---|---|
| NASA SDS Product Specification, Level-3 Soil Moisture (L3_SME2), JPL D-107677, Rev C, version 1.0.0, 8 November 2024 | <https://nisar.asf.earthdatacloud.nasa.gov/NISAR-SAMPLE-DATA/DOCS/NISAR_D-107677_RevC_NASA_SDS_Product_Specification_L3_SME2_Nov8_2024_w-sigs.pdf> | Pages 4 to 13, 16 to 23, 25, 26, 29 to 32 and 36 to 38 |
| NISAR L3 Soil Moisture Data Product, ATBD, JPL D-107679, Release 3.3, 28 April 2023 | <https://nisar.asf.earthdatacloud.nasa.gov/NISAR-SAMPLE-DATA/DOCS/NISAR_D-107679_L3SM_ATBD_R3.3_20230428_w-sigs.pdf> | The table of contents; pages 9, 10, 15 and 50 to 54; the passages on the ascending and the descending observations on pages 20, 22, 26, 33 and 37; the opening of sections 4.2 and 4.3; the sentence on the soil layer on page 65. The document was searched for words and was not read in full |
| NISAR Data User Guide, pages Product Specifications and Data Processing Algorithms | <https://nisar-docs.asf.alaska.edu/product-specification/>, <https://nisar-docs.asf.alaska.edu/atbd/> | The entries of the soil moisture documents |
| Product files of `NISAR_L3_SME2_PROVISIONAL_V1` (DOI 10.5067/NIL3SME2-P1) | ASF DAAC; the record `products.json` names the five files | The fields and layers of part 2.2 and part 4; the attributes of three layers and the flags of three files (part 8.1) |
| Layers of nine products of `NISAR_L3_SME2_PROVISIONAL_V1` and two of `NISAR_L3_SME2_BETA_V1` (DOI 10.5067/NIL3SME2-B1) | NASA Harmony; the record `quality_layers.json` names the files | The layers `soilMoisture` and `retrievalQualityFlag` of the box (parts 8 and 9) |
| NASA Common Metadata Repository | <https://cmr.earthdata.nasa.gov/search/granules.umm_json> | The products of the box and the records of five products; the products of track 141, frame 67 in three collections of SME2 (part 9.2); the variable records of two layers of SME2 (part 8.2) |
| GIBS Colormap XML Documents (v1.3), `SMAP_Soil_Moisture.xml` | <https://gibs.earthdata.nasa.gov/colormaps/v1.3/SMAP_Soil_Moisture.xml> | The whole file |
| Singh, A. (1989). Digital change detection techniques using remotely-sensed data. International Journal of Remote Sensing, 10(6), 989-1003 | <https://doi.org/10.1080/01431168908903939> | Section 4.1, pages 990 to 992, as text taken from the PDF file; the formula of the section was not legible in that text |
| GDAL documentation, gdal raster calc | <https://gdal.org/en/stable/programs/gdal_raster_calc.html> | The synopsis, the description and the options |
| GDAL 3.12.2 | The image `ghcr.io/osgeo/gdal:alpine-small-3.12.2`, pulled on 15 Nov 2026 | `gdal --version`; file `LICENSE.TXT`, section GDAL/OGR General |
| ArcGIS Pro documentation 3.7 | The three pages of part 5 | The passages quoted in part 5 |
| QGIS User Guide 3.44 | The two pages of part 5 | The passages quoted in part 5 |
| ASF NISAR Cookbook, commit `17b69c8`; nisarqa, commit `a8bc425` | <https://github.com/ASFOpenSARlab/NISAR_Cookbook>, <https://github.com/isce-framework/nisarqa> | The lists of their files, for a notebook or a specification of SME2; none was found. The cells 12 to 19 and 47 of `NISAR_GCOV_Time_Series_Example.ipynb` and 15 to 20 of `NISAR_Pixel_Conversion.ipynb` (part 9.1) |

## 7. Not confirmed

1. **The specification of version 1.0.2.** The products state it; the file read is Rev C, version
   1.0.0. The meaning of the bits 8, 9, 11 and 12 of `surfaceQualityFlag`, and the bits of the
   retrieval quality flags of the single algorithms in the products, were not read. Bit 8 is set in
   97.7 % of the cells of the pilot box that the products do not recommend, on the three dates whose
   product files were read (15 Sep, 27 Sep and 9 Oct 2026) (part 8.1).
2. **The quality flags in the tools.** Decided on 15 Nov 2026: the tools leave out every cell whose
   bit 0 of `retrievalQualityFlag` is 1, and the Data part offers that layer (part 8). Not confirmed
   is whether some of these cells could be shown with a mark instead, for example if bit 8 of
   `surfaceQualityFlag` marks a condition under which the mission still retrieves a soil moisture;
   the meaning of that bit was not read.
3. **Which two products may be compared.** The rule of the tool (same instrument, track, direction
   and frame) is a choice. No document read states a rule.
4. **The legend of the change.** Its rule, its colours and its two words are those of Backscatter,
   Change. No source was found for soil moisture.
5. **The range 0.02 to 0.60 of the legend of One date.** It rests on the thresholds of Rev C and of
   the ATBD. The description of `retrievalQualityFlag` in the products no longer names the
   thresholds, and 5 cells of the five frames lie outside them.
6. **The software of the mission.** No public repository was found; its licence and its code were
   not read. The rule of the mean was confirmed on five files by measurement only.
7. **The articles that the product files name for the three algorithms**, and the ATBD outside the
   passages listed in part 6, were not read.
8. **Singh (1989).** Section 4.1 was read as text taken from the PDF file, in which the formula is
   not legible. The order of the two dates of the tool is that of ArcGIS Pro and not a statement
   about the article.
9. **The web service and the browser.** The tools ran through `run_tool` and not as jobs of the web
   service; the forms, the notes and the chart of a series were tried in the tests of the interface
   only, and nothing was seen in a browser.
10. **Reduced copies.** No result of the pilot area holds one.
11. **Other areas.** One box was measured: nine provisional and two beta dates of one track and
    frame, and one date of each of two other tracks. All products are provisional or beta, of the
    instrument L.
12. **Own servers of visitors.** A server that runs an older Lynkeus Server does not know the layer
    `retrievalQualityFlag`, the inputs of the flag in the two tools, or the tool Soil moisture
    Series.

## 8. Leaving out the cells that the products do not recommend

Written on 15 Nov 2026 on the branch `an3-soil`, from commit `d0aa71e`. Parts 2 to 7 describe the
two tools as they were before this part: they mapped every cell. Every number of parts 8 and 9 is
copied from a record of `docs/research/records/analysis/soil-moisture/`. The records were made at
commit `d0aa71e`, before the branch took in the names that NASA's catalogue gives the layers: their
sentences name the layers Soil moisture and Retrieval quality flag, which Lynkeus now names Soil
Moisture and Retrieval Quality Flag.

| Record | SHA-256 | What it holds |
|---|---|---|
| `quality_catalogue.json` | `b0b7669647f8b028bab681f37d64b8be77dd5a4030db710c1d7cd5b961994465` | The products of track 141, frame 67 that the NASA catalogue held in three collections of SME2 on 15 Nov 2026 |
| `quality_layers.json` | `0efb6bdeec7106cdc16afc85912df3b12c6c6779e6481492cc6b9c657322538e` | The 22 layers that `lynkeus.harmony.get_layer` received on 15 Nov 2026 (soil moisture and flag of eleven products): product file, layer description, grid, statistics and the SHA-256 of each file |
| `quality_products.json` | `1e60f1415c0bed81436c2222ab09cf18d075e55273d31d6781c6059f6fa748c7` | The three product files held locally: the flags of the box and of the whole frame, the bits of `surfaceQualityFlag`, and the received layers compared with the product files |
| `quality_attributes.json` | `bd872ec6dfca12bbd8c1b7a173f9282a7bcd4fb994d96d4f2778aa076a30a632` | The attributes of the layers `soilMoisture`, `retrievalQualityFlag` and `surfaceQualityFlag` in the three product files |
| `quality_variables.json` | `cb38d3c15dd0dcb84458be53db852553645d51cb1f733dc45bef92b51980cc61` | The variable records of `retrievalQualityFlag` and `soilMoisture` in NASA's catalogue (provider ASF), with the field `LongName`, read on 15 Nov 2026 |
| `quality_lynkeus_side.json` | `14991d273c3ab799aa7672d1dea4a29e3763d3020b5bce868908bf73062f7fb6` | The cells left out on each date, the results and notes of the tools through `lynkeus.tools.run_tool`, the whole frames, and the refusals |
| `quality_result_stats.json` | `d4722a30f5dd6623f69761f25509a986ec82a52417925c56f641298608834044` | The percentiles of each result of the box |
| `quality_comparison.json` | `d71cd7e87f666c95fd1a2e519366f67891622aca3198b8c7defb63acf73787d0` | The results of Lynkeus against those of `gdal raster calc`, cell by cell |
| `quality_source_side.log` | `bdda671fff402e73595abc24e388413ec284179794982b82624281260b38a993` | The commands of `gdal raster calc`, its version, and the SHA-256 of its inputs and outputs |
| `series_manifest.json` | `149d20005b65e7567147cde80a0aa12f99d73d1f0befc9382707582f001f499d` | The layers, dates and points of the comparison of Soil moisture, Series |
| `series_lynkeus_side.json` | `62bdddbb554f0569e6d602c38e90a5b147f30f6d324785bbe0e035a55bf7c4bb` | The series that Lynkeus computed, and its refusals |
| `series_source_side.json` | `d6ccaee69e9093bda39343e546d34dd39220550548791163c4c3a5b7386aadde` | The statements of the Cookbook that were run, those replaced and those added, and their results |
| `series_comparison.json` | `1bbc412bcf4185f7ff8a0b24a573731a53e45cdb5fa3f2c252c1a1937b5fa963` | The two series compared, date by date and point by point |

### 8.1 The documents and the decision

On 15 Nov 2026 the owner of the project decided that the tools of the group leave out every cell
whose retrieval the product does not recommend. The documents state the meaning of bit 0 of
`retrievalQualityFlag` in the same way (part 2.3): the specification Rev C names it the "Retrieval
recommended flag" (page 37), the product files describe it as "0 = recommended, 1 = not recommended"
(attribute `description`, record `quality_attributes.json`), and the ATBD sets it "if the surface
flag value is greater than 0 or any other bits in the retrieval flag is raised" (Table 5.5.2, page
54).

The ATBD lists eight conditions of the surface flag, bits 0 to 7: static water above 10 %, urban
area, precipitation, snow or ice, permanent snow or ice, frozen ground, terrain, and dense
vegetation with a vegetation water content above 5 kg/m2 (Table 5.5.1, pages 52 and 53); its text
says that nine bits are used. The product files describe `surfaceQualityFlag` only as "Surface
quality flag". The three product files held locally show (record `quality_products.json`):

| Measure | 15 Sep 2026 | 27 Sep 2026 | 9 Oct 2026 |
|---|---|---|---|
| Box: cells not recommended (bit 0 is 1) | 28,816 | 28,759 | 28,638 |
| Box: of these, `surfaceQualityFlag` with bit 8 | 28,158 | 28,113 | 27,973 |
| Box: of these, with bit 0; with bit 9 | 2,186; 1,574 | 2,186; 1,574 | 2,186; 1,574 |
| Box: of these, `surfaceQualityFlag` is 0 | 36 | 9 | 0 |
| Box: cells recommended, all with `surfaceQualityFlag` 0 | 422 | 479 | 600 |
| Whole frame: cells not recommended, of the cells with a soil moisture | 694,132 of 702,700 | 695,030 of 704,158 | 693,642 of 704,710 |
| Whole frame: of these, with bit 8 | 689,206 | 688,892 | 686,598 |
| Whole frame: of these, with bit 7 (dense vegetation in the ATBD); with bit 7 alone | 1,854; 0 | 1,785; 0 | 2,110; 0 |
| Whole frame: cells recommended, all with `surfaceQualityFlag` 0 | 8,568 | 9,128 | 11,068 |

Every cell that the products recommend has the surface flag 0, as Table 5.5.2 of the ATBD requires;
36, 9 and 0 cells of the box are not recommended although their surface flag is 0, for a reason that
the flags do not state. Bit 8 is set in 97.7 % of the cells of the box that are not recommended, on
each of the three dates; the two documents that were read, the ATBD (JPL D-107679, Release 3.3) and
the specification Rev C (JPL D-107677), do not explain it. No cell is marked for bit 7 alone.
Neither of these two documents therefore states the cause of most marks. The tree cover of 87.1 % of
the cells of the box that hold a soil moisture (part 4.4), and the statement of the specification
that retrievals over dense vegetation are performed and flagged (part 2.1), suggest but do not show
that bit 8 marks dense vegetation.

The tools read bit 0 only and leave out every cell where it is 1, whatever the surface condition.
There is a reason to treat some of these cells otherwise later: where the vegetation is dense the
mission still retrieves a soil moisture, but its accuracy goal of 0.06 m3/m3 does not apply (part
2.1). If a later document states that bit 8 marks dense vegetation, such cells could be shown with a
mark instead of being left out (part 7, point 2).

### 8.2 The layer in the form Get layer

The Data part offers the layer `retrievalQualityFlag` of an SME2 product as Retrieval Quality Flag,
the field `LongName` of its variable record in NASA's catalogue (`V4279684368-ASF`, record
`quality_variables.json`), with the unit `1` (`_layers` in `api/src/lynkeus/harmony.py`). NASA
Harmony delivers it clipped to the box, on the grid of the soil moisture. Its reduced copies take
the most frequent value, because its values are classes. In each of the eleven pairs of layers
received (nine provisional dates and two beta dates) the flag holds a value exactly where the soil
moisture holds one, on the same grid (record `quality_lynkeus_side.json`). The received layers of 15
Sep, 27 Sep and 9 Oct 2026 equal the product files in every cell, the flag and the soil moisture
alike (record `quality_products.json`).

### 8.3 The rule in the tools

Each tool takes, for each date, the layer `soilMoisture` and then the layer `retrievalQualityFlag`
of the same product file. The form finds the flag by itself; when the session holds none, it says so
in one sentence and offers the form Get layer. A cell keeps its value where the flag holds a value
whose bit 0 is 0; every other cell is left out, also a cell whose flag holds no value. Soil
moisture, Change keeps a cell only where both dates keep it, and Soil moisture, Series applies the
rule on each date (part 9). A result in which every cell is left out is refused. The result states
in one sentence how many cells were left out (record `quality_lynkeus_side.json`):

| Tool and layers of the box | Sentence of the result |
|---|---|
| Soil moisture, One date, 9 Oct 2026 | 28,638 of the 29,238 cells with a soil moisture are left out because NISAR marks their retrieval as not recommended. |
| Soil moisture, Change, 27 Sep to 9 Oct 2026 | 28,759 of the 29,238 cells with a soil moisture on both dates are left out because NISAR marks their retrieval as not recommended on one date or both. |
| Soil moisture, One date, 13 Dec 2025 (beta) | NISAR marks the retrieval of every cell with a soil moisture as recommended, so none is left out. |
| Soil moisture, Series, mean of the area, nine dates | On each date the cells whose retrieval NISAR marks as not recommended are left out: from 97.9 % to 98.7 % of the cells with a soil moisture. |

The sentence is the field `note` of the layer description and of the series description. The foot of
the tool pane, the Catalog pane and the Contents pane show it, and the record of a result repeats it
in its lineage.

### 8.4 The cells left out on each date

In the box of the pilot area, on the layers received (record `quality_lynkeus_side.json`). The
provisional products mark 97.9 % to 98.7 % of the cells of the pilot box that hold a value as not
recommended, on each of their nine dates. The two beta products hold a soil moisture in few cells,
all with the flag value 4 (bit 0 is 0), and mark none of them as not recommended.

| Date | Release | Cells with a soil moisture | Not recommended (bit 0 is 1) | Share | Kept |
|---|---|---|---|---|---|
| 23 Jun 2026 | `P05023` | 27,411 | 27,009 | 98.5 % | 402 |
| 5 Jul 2026 | `P05023` | 27,411 | 27,026 | 98.6 % | 385 |
| 17 Jul 2026 | `P05023` | 29,238 | 28,849 | 98.7 % | 389 |
| 10 Aug 2026 | `P05023` | 29,238 | 28,844 | 98.7 % | 394 |
| 22 Aug 2026 | `P05023` | 29,238 | 28,838 | 98.6 % | 400 |
| 3 Sep 2026 | `P05023` | 29,238 | 28,836 | 98.6 % | 402 |
| 15 Sep 2026 | `P05023` | 29,238 | 28,816 | 98.6 % | 422 |
| 27 Sep 2026 | `P05023` | 29,238 | 28,759 | 98.4 % | 479 |
| 9 Oct 2026 | `P05023` | 29,238 | 28,638 | 97.9 % | 600 |
| 13 Dec 2025 | `X05010` | 682 | 0 | 0.0 % | 682 |
| 25 Dec 2025 | `X05010` | 326 | 0 | 0.0 % | 326 |

In the whole frames of 15 Sep, 27 Sep and 9 Oct 2026 the products mark 98.8 %, 98.7 % and 98.4 % of
the cells with a soil moisture as not recommended (record `quality_products.json`). On 23 Jun and 5
Jul 2026 the flag holds the values 8 and 9 only, and 27,411 cells of the box hold a soil moisture
instead of 29,238.

### 8.5 The comparison with `gdal raster calc`, and the refusals

The source program is `gdal raster calc` of GDAL 3.12.2 "Chicoutimi", released 2026/02/03 (image
`ghcr.io/osgeo/gdal:alpine-small-3.12.2`). It applies the rule as its expression, `fmod(FLAG, 2) ==
0 ? SM : NaN` for one date and `fmod(EFLAG, 2) == 0 && fmod(LFLAG, 2) == 0 ? LATER - EARLIER : NaN`
for two, with the options `--ot Float32 --nodata nan --propagate-nodata` (record
`quality_source_side.log`). Both programs read the same GeoTIFF files: the layers of the box as
Lynkeus received them, and three whole frames written from the product files and read back
bit-identical. Lynkeus ran each tool through `lynkeus.tools.run_tool`; each of its 21 results of the
box is a valid Cloud Optimized GeoTIFF (`cog_validate` of rio-cogeo, with `strict=True`), meets the
STAC schemas, and carries the note of the function (record `quality_lynkeus_side.json`).

| Layers | Result | Cells | Cells with a value in both | Cells that differ | Bit-identical |
|---|---|---|---|---|---|
| Box | Soil moisture, One date, 23 Jun 2026 | 35,424 | 402 | 0 | yes |
| Box | Soil moisture, One date, 5 Jul 2026 | 35,424 | 385 | 0 | yes |
| Box | Soil moisture, One date, 17 Jul 2026 | 35,424 | 389 | 0 | yes |
| Box | Soil moisture, One date, 10 Aug 2026 | 35,424 | 394 | 0 | yes |
| Box | Soil moisture, One date, 22 Aug 2026 | 35,424 | 400 | 0 | yes |
| Box | Soil moisture, One date, 3 Sep 2026 | 35,424 | 402 | 0 | yes |
| Box | Soil moisture, One date, 15 Sep 2026 | 35,424 | 422 | 0 | yes |
| Box | Soil moisture, One date, 27 Sep 2026 | 35,424 | 479 | 0 | yes |
| Box | Soil moisture, One date, 9 Oct 2026 | 35,424 | 600 | 0 | yes |
| Box | Soil moisture, Change, 23 Jun 2026 to 5 Jul 2026 | 35,424 | 385 | 0 | yes |
| Box | Soil moisture, Change, 5 Jul 2026 to 17 Jul 2026 | 35,424 | 378 | 0 | yes |
| Box | Soil moisture, Change, 17 Jul 2026 to 10 Aug 2026 | 35,424 | 380 | 0 | yes |
| Box | Soil moisture, Change, 10 Aug 2026 to 22 Aug 2026 | 35,424 | 386 | 0 | yes |
| Box | Soil moisture, Change, 22 Aug 2026 to 3 Sep 2026 | 35,424 | 385 | 0 | yes |
| Box | Soil moisture, Change, 3 Sep 2026 to 15 Sep 2026 | 35,424 | 397 | 0 | yes |
| Box | Soil moisture, Change, 15 Sep 2026 to 27 Sep 2026 | 35,424 | 418 | 0 | yes |
| Box | Soil moisture, Change, 27 Sep 2026 to 9 Oct 2026 | 35,424 | 479 | 0 | yes |
| Box | Soil moisture, Change, 15 Sep 2026 to 9 Oct 2026 | 35,424 | 422 | 0 | yes |
| Box | Soil moisture, One date, 13 Dec 2025 (beta) | 35,424 | 682 | 0 | yes |
| Box | Soil moisture, One date, 25 Dec 2025 (beta) | 35,424 | 326 | 0 | yes |
| Box | Soil moisture, Change, 13 Dec 2025 to 25 Dec 2025 (beta) | 35,424 | 326 | 0 | yes |
| Whole frame | Soil moisture, One date, 15 Sep 2026 | 3,572,100 | 8,568 | 0 | yes |
| Whole frame | Soil moisture, One date, 27 Sep 2026 | 3,572,100 | 9,128 | 0 | yes |
| Whole frame | Soil moisture, One date, 9 Oct 2026 | 3,572,100 | 11,068 | 0 | yes |
| Whole frame | Soil moisture, Change, 15 Sep 2026 to 27 Sep 2026 | 3,572,100 | 8,263 | 0 | yes |
| Whole frame | Soil moisture, Change, 27 Sep 2026 to 9 Oct 2026 | 3,572,100 | 8,916 | 0 | yes |
| Whole frame | Soil moisture, Change, 15 Sep 2026 to 9 Oct 2026 | 3,572,100 | 8,336 | 0 | yes |

No cell holds a value in one result only. The tools refuse the layers below with one sentence and
write no file:

| Case | Inputs | Sentence of the refusal |
|---|---|---|
| state without the flag | `sm-20261009` | The number of input layers must be 2, and it is 1. |
| state with the flag of another date | `sm-20261009, flag-20260927` | The layers "Soil moisture, 9 Oct 2026" and "Retrieval quality flag, 27 Sep 2026" are not of the same product file. |
| state with the flag first | `flag-20261009, sm-20261009` | The layer "Retrieval quality flag, 9 Oct 2026" is the layer retrievalQualityFlag of its product, and the tool reads the layer soilMoisture. |
| change without the flags | `sm-20260927, sm-20261009` | The number of input layers must be 4, and it is 2. |
| change with the later date first | `sm-20261009, flag-20261009, sm-20260927, flag-20260927` | The first layer must be of an earlier date than the second. |
| change with the flags of the other dates | `sm-20260927, flag-20261009, sm-20261009, flag-20260927` | The layers "Soil moisture, 27 Sep 2026" and "Retrieval quality flag, 9 Oct 2026" are not of the same product file. |

## 9. Soil moisture, Series

### 9.1 The source program

The ASF NISAR Cookbook holds no notebook of SME2 products (commit `17b69c8`; part 6). The tool
therefore follows the notebook of the series of the backscatter,
`NISAR_GCOV_Time_Series_Example.ipynb`, as Coherence, Series does for the coherence: the date of
each product, a cube of the layers in the order of the dates, and the mean of each date over the
cells with a value. The cell of a point follows `NISAR_Pixel_Conversion.ipynb`. The soil moisture
needs no conversion to linear power, so the mean is taken of the values themselves.

For the comparison, the statements of these notebooks were taken from the notebook files themselves
and run on the cube of the soil moisture (record `series_source_side.json`; cells are numbered from
0): cell 14 (the time of each product from the name of its file), cell 16 (the time as a
coordinate), cell 19 (the cube), cell 47 applied to the cube of the soil moisture instead of the
backscatter (`means = np.mean(ts, axis=(1, 2))`), and cell 20 of the pixel notebook (the cell of a
point). Cell 12, which opens HDF5 product files, was replaced by the reading of the GeoTIFF layers;
cell 18, which clips the layers to a box, was left out, because NASA Harmony had clipped them; the
points replace the places of cell 18 of the pixel notebook. One statement was added for the rule of
the flag: `ts = ts.where(flags_ts % 2 == 0)`. `np.mean` calls the method `mean` of the xarray array,
which skips the cells without a value. The programs were numpy 2.5.3, xarray 2026.7.0, dask
2025.12.0, rioxarray 0.22.0 and rasterio 1.4.4, in Python 3.13.

### 9.2 The products of the series

The NASA catalogue was searched on 15 Nov 2026 at 18:43 UTC for the products of track 141, frame 67,
descending (record `quality_catalogue.json`). The short name `NISAR_L3_SME2_V1` gave no product.
`NISAR_L3_SME2_PROVISIONAL_V1` (DOI 10.5067/NIL3SME2-P1) gave nine products of the release `P05023`:
23 Jun 2026, 5 Jul 2026, 17 Jul 2026, 10 Aug 2026, 22 Aug 2026, 3 Sep 2026, 15 Sep 2026, 27 Sep
2026, 9 Oct 2026. `NISAR_L3_SME2_BETA_V1` (DOI 10.5067/NIL3SME2-B1) gave two products of the release
`X05010`: 13 and 25 Dec 2025. A series of one release was made of each group; the tool refuses to
mix the two releases.

### 9.3 What was measured

Mean of the area of the box (records `series_lynkeus_side.json`, `series_source_side.json`,
`series_comparison.json`). The Cookbook code keeps the cube in 32-bit numbers; the last column gives
its mean computed in 64-bit numbers from the same cube.

| Date | Cells with a soil moisture | Cells kept | Mean of Lynkeus (m3 m-3) | Mean of the Cookbook code, 32-bit (m3 m-3) | The same, 64-bit (m3 m-3) |
|---|---|---|---|---|---|
| 23 Jun 2026 | 27,411 | 402 | `0.30964088599331935` | `0.30964091420173645` | `0.30964088599331935` |
| 5 Jul 2026 | 27,411 | 385 | `0.29591542056628634` | `0.295915424823761` | `0.29591542056628634` |
| 17 Jul 2026 | 29,238 | 389 | `0.30459804894225456` | `0.30459803342819214` | `0.30459804894225456` |
| 10 Aug 2026 | 29,238 | 394 | `0.2133473136514274` | `0.21334730088710785` | `0.2133473136514274` |
| 22 Aug 2026 | 29,238 | 400 | `0.21438413817435503` | `0.21438412368297577` | `0.21438413817435503` |
| 3 Sep 2026 | 29,238 | 402 | `0.22533851949062514` | `0.22533851861953735` | `0.22533851949062514` |
| 15 Sep 2026 | 29,238 | 422 | `0.22151612525726383` | `0.22151613235473633` | `0.22151612525726383` |
| 27 Sep 2026 | 29,238 | 479 | `0.25333518813323375` | `0.253335177898407` | `0.25333518813323375` |
| 9 Oct 2026 | 29,238 | 600 | `0.21451748485366504` | `0.2145174890756607` | `0.21451748485366504` |
| 13 Dec 2025 (beta) | 682 | 682 | `0.2762652840738422` | `0.27626529335975647` | `0.2762652840738422` |
| 25 Dec 2025 (beta) | 326 | 326 | `0.2654901544100668` | `0.26549017429351807` | `0.2654901544100668` |

The numbers of cells kept are equal on every date. The means of the Cookbook code as it writes them
differ from those of Lynkeus by at most 0.000000028 m3 m-3 (provisional) and 0.000000020 m3 m-3
(beta); in 64-bit numbers they are equal on every date. Lynkeus gives the same series when the dates
are given in the reverse order.

At eight points of the box (the five points of the earlier comparisons, and three cells with a
recommended retrieval on every date, at least ten cells apart):

| Point | Longitude, latitude | Lynkeus | Cookbook code |
|---|---|---|---|
| p1 | -71.0, 42.8 | Refused: No layer of the series holds a value at the point. | No value on any date (pixel 70, 96) |
| p2 | -70.9, 42.7 | Refused: NISAR marks the retrieval at the point as not recommended on every date that holds a soil moisture, so the series has no value. | No value on any date (pixel 117, 144) |
| p3 | -71.1, 42.65 | Refused: NISAR marks the retrieval at the point as not recommended on every date that holds a soil moisture, so the series has no value. | No value on any date (pixel 141, 47) |
| p4 | -70.8, 42.9 | Refused: No layer of the series holds a value at the point. | No value on any date (pixel 23, 192) |
| p5 | -70.8726, 42.8126 | Refused: No layer of the series holds a value at the point. | No value on any date (pixel 64, 157) |
| r1 | -71.0052, 42.9359 | Nine values from the cell 6, 93; note: NISAR marks the retrieval at the point as recommended on every date that holds a soil moisture. | The same cell and the same nine values (largest difference 0.0) |
| r2 | -70.8807, 42.9359 | Nine values from the cell 6, 153; note: NISAR marks the retrieval at the point as recommended on every date that holds a soil moisture. | The same cell and the same nine values (largest difference 0.0) |
| r3 | -70.8351, 42.9359 | Nine values from the cell 6, 175; note: NISAR marks the retrieval at the point as recommended on every date that holds a soil moisture. | The same cell and the same nine values (largest difference 0.0) |

On the two beta dates no point holds a value, in either program. The series tool refuses the layers
below with one sentence:

| Case | Sentence of the refusal |
|---|---|
| provisional and beta together | The layers are not of the same major release of the processing software: "Soil moisture, 23 Jun 2026" is of the release P05023 and "Soil moisture, 13 Dec 2025" of X05010. |
| a date without its flag | The number of input layers must be even, two for each date, and it is 3. |
| the flag of another date | The layers "Soil moisture, 23 Jun 2026" and "Retrieval quality flag, 5 Jul 2026" are not of the same product file. |
| one date | A series needs at least 2 layers, and it has 1. |

### 9.4 Limits

1. A series of the area rests on 385 to 600 cells of the box, of 27,411 to 29,238 with a soil
   moisture; the cells kept may lie in other places on other dates, so the means of two dates are
   means of different places.
2. At most points of the box the series has no value, because the products mark the retrieval as not
   recommended on every date.
3. The source program is the code of the notebook of the backscatter applied to the soil moisture,
   with one added statement for the rule of the flag; no program of the mission for a series of the
   soil moisture was found.
4. All products of the pilot frame are provisional or beta. The beta products hold a soil moisture
   in few cells and mark none as not recommended.
