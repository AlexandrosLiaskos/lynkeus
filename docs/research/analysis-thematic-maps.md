# Research note: Analysis tab, Thematic map tools

Research for the four Thematic map tools of the Analysis tab of Lynkeus (`backscatter-map`, `coherence-map`, `displacement-map`, `soil-moisture-map`). The project defines a thematic map as "a map of classes produced by a published algorithm of the NISAR science team". This note states, for each of the four groups, which such algorithms exist, what they need, whether their inputs exist for the pilot area, with what they could be compared, and what the present result format lacks for a legend of classes.

Everything below was read on 15 November 2026 (UTC) at the sources named in part 1. No code was written and no tool was built. Limits of this research are listed in part 9.

## Summary

1. **Backscatter (GCOV).** The NISAR science team publishes three algorithms that give classes from backscatter: wetland inundation, forest disturbance and active crop area. Each is a Jupyter notebook in a public repository under the Apache License 2.0. None is a library that can be called; each would have to be written again as a Lynkeus function and compared with the statements of its notebook.
2. **Coherence (GUNW).** No published science-team algorithm that gives classes from coherence was found.
3. **Displacement (GUNW, GOFF).** No published science-team algorithm that gives classes from displacement was found. The solid-earth, ice-sheet and sea-ice algorithms give continuous quantities (velocity, displacement, motion) and tables that say whether a requirement is met.
4. **Soil moisture (SME2).** No published science-team algorithm that gives classes from soil moisture was found. The SME2 product itself carries class layers (land cover, crop type) and flag layers, which are inputs and quality information of the retrieval, not classes derived from soil moisture.
5. **Pilot area.** GCOV products with the channels HH and HV exist for track 141, frame 67 on 13 dates in three collections. That is enough for the inundation classification (one date) and for the two-date demonstration of forest disturbance. It is not enough for the forest disturbance algorithm of the theoretical basis document (at least 18 months of data), and it covers one three-month period of the crop area algorithm with 7 dates of one collection. No GOFF product exists over the pilot area.
6. **Thresholds.** Every threshold in the three notebooks was calibrated for a calibration site of the mission (Yucatan Lake, Lenoir Landing, Tifton). No source gives thresholds for the pilot area, and no reference output exists for it. A Lynkeus tool can therefore be shown to compute what the notebook computes; it cannot be shown that its classes are correct on the lower Merrimack River.
7. **Result format.** The present format gives a result one continuous legend range and the name of a colour scale. A map of classes needs a table of classes (value, name, colour), reduced copies made by the most frequent value, and a decision about the one-hectare grid of the published products.

## 1. Sources read

All were read on 15 November 2026.

| Source | Address | Version read | Licence |
|---|---|---|---|
| NISAR_Inundation (science-team repository) | <https://github.com/NISAR-Science-Algorithms/NISAR_Inundation> | branch `main`, commit `85140c4` of 10 Jul 2026 | Apache License 2.0 (file `LICENSE`) |
| NISAR_Disturbance (science-team repository) | <https://github.com/NISAR-Science-Algorithms/NISAR_Disturbance> | branch `main`, commit `24d124a` of 12 Jan 2026 | Apache License 2.0 (file `LICENSE`) |
| NISAR_CropArea (science-team repository) | <https://github.com/NISAR-Science-Algorithms/NISAR_CropArea> | branch `main`, commit `d729b6d` of 30 Apr 2026 | Apache License 2.0 (file `LICENSE`) |
| NISAR_Biomass (science-team repository) | <https://github.com/NISAR-Science-Algorithms/NISAR_Biomass> | branch `main`, commit `9aff4e2` of 18 May 2026 | Apache License 2.0 (file `LICENSE`) |
| NISAR_SolidEarth (science-team repository; the same commit is the head of <https://github.com/nisar-solid/ATBD>) | <https://github.com/NISAR-Science-Algorithms/NISAR_SolidEarth> | branch `main`, commit `8c33f56` of 12 Nov 2026 | No licence file. The README states "Copyright (c) 2021, California Institute of Technology ("Caltech"). All rights reserved." |
| NISAR_SeaIce (science-team repository) | <https://github.com/NISAR-Science-Algorithms/NISAR_SeaIce> | branch `main`, commit `d0caa85` of 18 Mar 2026 | No licence file |
| NISAR Level-3 ATBD Cookbook (ASF) | <https://github.com/ASFOpenSARlab/NISAR_ATBD_Cookbook> | branch `main`, commit `b6e365f` of 9 Nov 2026 | BSD 3-Clause License (file `LICENSE`) |
| NISAR Cookbook (ASF) | <https://github.com/ASFOpenSARlab/NISAR_Cookbook> | commit `17b69c8` of 3 Nov 2026 | Apache License 2.0 (file `LICENSE`) |
| NASA-ISRO SAR (NISAR) Mission Science Users' Handbook, second edition | <https://doi.org/10.48577/jpl.UD4HV3>, file `CL25_4231.pdf` (MD5 `8d2070c20b5aecb981c20fd5b59154b0`) | Version 2.0, released 22 Oct 2025, 256 pages | CC0 1.0 (record of the JPL Open Repository) |
| Algorithm Theoretical Basis Document: NISAR Ecosystem L2 Products (Siqueira, Chapman, Kellndorfer, Saatchi, Simard) | <https://gitlab.com/nisar-science-algorithms/ecosystems/documentation/-/blob/main/NISAR_Ecosystems_Combined_ATBD.pdf> | 1 May 2018, 66 pages | "© All rights reserved" (title page) |
| Algorithms to Validate NISAR L2 Coseismic, Transient and Secular Displacement Requirements | file `docs/SES_ATBD.pdf` of NISAR_SolidEarth | Revision A, 25 May 2022 | "© All rights reserved" (title page) |
| NISAR L3 Ice Sheet and Glacier Products | <https://gitlab.com/nisar-science-algorithms/cryosphere/land-ice/atbd/documentation/-/blob/main/ATBD_IceSheetVelocity-Version2.1.pdf> | Revision 2.1, 27 May 2022 | not stated on the title page |
| NISAR L3 Soil Moisture Data Product, Algorithm Theoretical Basis Document, JPL D-107679 | <https://nisar.asf.earthdatacloud.nasa.gov/NISAR-SAMPLE-DATA/DOCS/NISAR_D-107679_L3SM_ATBD_R3.3_20230428_w-sigs.pdf> | Release 3.3, 28 Apr 2023 | not stated |
| NASA SDS Product Specification, Level-3 Soil Moisture (L3_SME2), JPL D-107677 | <https://nisar.asf.earthdatacloud.nasa.gov/NISAR-SAMPLE-DATA/DOCS/NISAR_D-107677_RevC_NASA_SDS_Product_Specification_L3_SME2_Nov8_2024_w-sigs.pdf> | Rev C (version 1.0.0), 8 Nov 2024 | not stated |
| NISAR Data User Guide (ASF), pages Data Processing Algorithms, NISAR Data Products, Soil Moisture (SME2), Geocoded Pixel Offsets (GOFF) | <https://nisar-docs.asf.alaska.edu/atbd/>, `/products-overview/`, `/sme2/`, `/goff/` | pages as served on 15 Nov 2026 | not read |
| NASA Common Metadata Repository (catalogue) | <https://cmr.earthdata.nasa.gov/search/> | queries of 15 Nov 2026, 09:39, 09:54 and 09:55 UTC | — |
| OPERA DSWX-SAR (JPL OPERA project, not the NISAR science team) | <https://github.com/opera-adt/DSWX-SAR> | tag `DSWx-NI-v1.0`, released 7 Oct 2026 | GitHub reports Apache-2.0 for the licence file; the README carries a three-clause text of Caltech. Not resolved here. |

## 2. Where the science team publishes its algorithms

The NISAR Data User Guide of ASF states that Level 0 to Level 2 products and the Level 3 soil moisture product are produced by the mission, and that additional Level 3 and Level 4 products "will be produced by the NISAR science team, but only for specific areas used for calibration and validation activities"; it adds that the algorithms for these products "are available as Python notebooks, allowing users to generate these scientific products themselves for other locations" (page NISAR Data Products, part NISAR Product Levels).

The notebooks are in the GitHub organisation `NISAR-Science-Algorithms` (six public repositories; GitHub does not mark the organisation as verified; its page gives the address <https://nisar.jpl.nasa.gov/>). The same projects exist on GitLab under `nisar-science-algorithms`, where two of them state that they are copies of the GitHub repositories. The NISAR Level-3 ATBD Cookbook of ASF copies the notebooks every night from the GitHub repositories (file `cookbook_sources.yml`) and names six subjects: wetland inundation, crop area detection, aboveground biomass estimation, sea ice motion tracking, solid earth displacements, forest disturbance detection (README).

The Handbook describes the same algorithms in chapter 6, "Science requirements validation: theory and methods": 6.1 solid earth, 6.2 biomass, 6.3 disturbance, 6.4 inundation, 6.5 crop monitoring, 6.6 ice sheets, 6.7 sea ice, 6.8 soil moisture. The Data User Guide lists, beside the two documents of the mission (Level 1 and 2; soil moisture), four documents of the science team: solid earth (2022), ice sheets and glaciers (2022), sea ice motion (2022) and ecosystems (2018).

No collection of Level 3 class products of the science team exists in NASA's catalogue: a search of the collections for the word NISAR returned 52 collections, and the only Level 3 ones of the NISAR mission are soil moisture (SME2) and the elevation model, the vegetation water content and the water mask that the mission uses as auxiliary data.

## 3. Backscatter (GCOV): `backscatter-map`

Three published science-team algorithms give classes from backscatter. A fourth, biomass, gives a continuous quantity (aboveground biomass in Mg/ha) and is not a map of classes.

### 3.1 Wetland inundation

**(1) The algorithm.**

- Name: "Combined Algorithm Theoretical Basis Document and Jupyter Notebook for Classification of Wetland Inundation Extent" (authors Bruce Chapman, Paul Siqueira; dated 15 Feb 2022; last updated May 2026).
- File: `notebooks/NISAR_L3_Inundation_ProductGeneration.ipynb` of NISAR_Inundation at commit `85140c4`, with the thresholds in `ancillary_data/wetland_calibration_parameters.yaml`. The ASF Cookbook copies this notebook and this file.
- Text: Handbook, section 6.4 (printed pages 84 to 89); ecosystems document of 2018, section 3.3 (pages 40 to 50).
- Licence: Apache License 2.0.
- Form: a notebook. Its helper files (`notebooks/util/`) only choose an area and read dates from file names. The classification is written in the cells of the notebook, so it cannot be called as a library and would have to be written again. The notebook can be run as a whole with `papermill` on a chosen area (its cell "Step 2").

**(2) Inputs, classes, thresholds, accuracy.**

- Inputs as the notebook reads them: the layers `HHHH` and `HVHV` of group `/science/LSAR/GCOV/grids/frequencyA` of GCOV products, on one grid, in linear power. Each date is classified by itself, so one date is enough. The notebook asks for products named `*_D_*_DHDH_*` (descending, channels HH and HV).
- What it computes for each date: the ratio `HHHH / HVHV` and the sum `HHHH + HVHV` (or, by choice, the product). A cell with a sum above zero is class 1. A cell whose sum is above `sum_min` and not above `sum_max` is class 2. A cell that is not class 2, whose `HHHH` lies between `HH_min` and `HH_max` and whose ratio lies between `ratio_min` and `ratio_max`, is class 3.
- Classes of the notebook: 0 no data, 1 not inundated, 2 open water, 3 inundated vegetation. Its colours are white, grey (236, 236, 238), dark blue (21, 27, 115) and light blue (66, 233, 245).
- Thresholds: the file gives three sets, named `Yucatan_Lake`, `NewOrleans` and `Default`. The set `Default` holds the same numbers as `Yucatan_Lake`: open water `sum_min` 0.0 and `sum_max` 0.06800000369548798; inundated vegetation `HH_min` 0.42448979591836733, `HH_max` 10, `ratio_min` 1.2000000000000002, `ratio_max` 500. In decibels (computed here as 10·log10) these are −11.67 dB for the largest sum, −3.72 dB for the smallest HH and 0.79 dB for the smallest ratio. The set `NewOrleans` holds numbers of the order of 1e-8 to 1e-10 for HH and the sum; the repository does not explain them. The notebook calls the values "calibrated threshold values" and names the sets calibration and validation sites; it gives no document that derives them.
- The final product of the notebook is a second file on a grid of 100 m (one hectare), made from the classified file with GDAL by the most frequent value (`gdal.Warp`, `xRes=100`, `resampleAlg=gdal.GRA_Mode`).
- Stated accuracy: the Level 2 requirement is to "measure inundation extent within inland and coastal wetlands areas at a resolution of 1 hectare every 12 days with a classification accuracy of 80%" (Handbook, section 6.4). The Handbook states that the aim of the baseline algorithm "is not necessarily to produce the best possible wetland inundation product, but rather to quantify the sensitivity" of the HH and HV data to the inundation classes. The notebook holds no measured accuracy; its earlier version lists "Evalation against reference data set" and "Calibration of thresholds with reference data set" as still to be done (`notebooks/NISAR_ATBD_wetlands.ipynb`).
- Differences between the text and the notebook, which matter for what "the published algorithm" is:
  1. The Handbook (equations 6.4-1 to 6.4-7) classifies a multi-temporal average, allows each image to be corrected against that average, and then refines the classes by change detection into four transition classes. The product-generation notebook does none of this; it classifies each date by itself.
  2. The Handbook finds open water by the ratio HH/HV and a largest HH value (6.4-2). The notebook finds it by the sum HH + HV.
  3. The Handbook numbers the product values 1 inundated vegetation, 2 open water, 3 not inundated, 4 indeterminate (section 6.4.2). The notebook numbers them 0 to 3 as above and has no indeterminate class.
  4. The Handbook says that the thresholds "may be a function of the incidence angle" and asks for an a priori wetlands mask (for example from the National Land Cover Database) and the incidence angle as inputs. The notebook uses neither.
  5. The Handbook gives no numbers for the thresholds. The document of 2018 gives a table of nominal values (Table 3.3-1) with the note "estimated from Sentinel C-band data. Values will differ for L-band NISAR."
- Tidal wetlands: the document of 2018 treats them as a separate, experimental case (section 3.3.3) and states under its Figure 3.3-2 that radar backscatter "is not sufficient to detect flooding in herbaceous marshes and mangrove forests" and that interferometric measurements and time-series analysis are required. The pilot area is an estuary; an earlier record of this project (ESA WorldCover 2021, not computed again here) gives 13.0 % permanent water and 6.3 % herbaceous wetland in the pilot box.

**(3) Inputs for the pilot area.** They exist. GCOV products of track 141, frame 67 with the channels HH and HV: 2 validated (21 Oct and 2 Nov 2026), 9 provisional (23 Jun to 9 Oct 2026), 2 beta (13 and 25 Dec 2025); see part 7. The cells of the pilot products are 10 m.

**(4) Source program or reference output.** The notebook itself is the source program: its statements of Step 4b, Step 5 and Step 6 can be run on the pilot arrays and compared cell by cell with a Lynkeus function, as was done for the two backscatter tools with the ASF notebook. Reference outputs exist only for other places and data: five class files of 2019 in `notebooks/mississippi/outputs/` (from airborne UAVSAR data, made by the earlier notebook) and the demonstration scenes that the notebook reads from a public storage address (`nisar-public-ebd/ATBD/ecosystems/inundation/`, 25 scenes according to a comment in the notebook; not opened here). No reference output exists for the pilot area.

### 3.2 Forest disturbance

**(1) The algorithm.** Two forms are published.

- The algorithm of the theoretical basis document: "Algorithm Theoretical Basis Document for Forest Disturbance" (Josef Kellndorfer, 3 Feb 2022), file `notebook/NISAR_Disturbance_ATBD.ipynb` with the module `notebook/atbd_disturbance.py`, at commit `24d124a`. Text: Handbook, section 6.3 (printed pages 78 to 84). It detects a change point in a time series by cumulative sums.
- The two-date demonstration: "NISAR - bi-temporal Forest Disturbance Algorithm", files `notebook/NISAR_bitemporal_disturbance.ipynb` (any area) and `notebook/NISAR_bitemporal_disturbance_demo_validation.ipynb` (the site Lenoir Landing, Alabama, with a comparison). The ASF Cookbook copies the second. Both state: "Because the ATBD algorithm requires a minimum of 18 months of NISAR time series of 12-day repeat datatakes, this notebook demonstrates core steps of the ATBD workflow with a bi-temporal change algorithm example", and that the two-date step "will be updated with the ATBD algorithm when time series data are available".
- Licence: Apache License 2.0.
- Form: notebooks. The module `atbd_disturbance.py` holds two plotting functions only; the method is in the cells and would have to be written again.

**(2) Inputs, classes, thresholds, accuracy.**

- Two-date demonstration. Inputs: `HVHV` of two dates on one grid, in linear power. Steps: a median filter of 5 by 5 cells on each date; the normalised radar change index NRCI = (HV₂ − HV₁) / (HV₂ + HV₁); a cell is disturbed where NRCI is below −0.3; the disturbed cells are counted in blocks of 5 by 5 cells; a block is disturbed when the count is 5 or more. Classes: 0 not disturbed, 1 disturbed. The threshold −0.3 is set in the cell that follows an interactive plot offered "to determine an appropriate disturbance threshold"; the notebooks give no other source for it. The count of 5 is the default of the Handbook ("five or more 20-m pixels", section 6.3.2). The blocks of 5 by 5 cells assume cells of 20 m; the pilot products have cells of 10 m, where a hectare is 10 by 10 cells. A forest mask (HV above −20 dB) is computed and, in the words of the notebook, "Currently not applied to data".
- Algorithm of the document. Inputs: a time series of `HVHV` of a baseline year and the following year; a forest mask from the smallest HV value of the baseline year (above −20 dB in the notebook; the document of 2018 names −13 dB from ALOS data); a check of the season (split the series when the monthly means over forest differ by more than 1 dB). Steps: residuals against (max + min) / 2, cumulative sum S, S_DIFF = max(S) − min(S), candidates above a percentile of S_DIFF (85th in the example), a confidence level from 100 random reorderings, cells kept at a confidence of 0.98 or more, date of the change from the largest S, count per hectare, disturbed at 5 or more. The numbers 85, 100 and 0.98 are those of the example over Rondônia, Brazil, made from ALOS-2 data; the notebook says that the thresholds are to be set by ecosystem during calibration.
- Stated accuracy: the requirement is to "measure global areas of vegetation disturbance at 1 hectare resolution annually for areas losing at least 50% canopy cover with a classification accuracy of 80%" (notebook, section 1; Handbook, section 6.3). The validation notebook computes an overall accuracy against a reference made from Planet images at Lenoir Landing, on 500 random cells of each class; the published notebook has no stored outputs, so no number can be quoted from it.
- One inconsistency in the sources: the Handbook describes the 100 m product "with numbers from 0 to 16 for the count" although 25 cells of 20 m make a hectare; the notebook gives the range 0 to 25.

**(3) Inputs for the pilot area.** For the two-date demonstration they exist (`HVHV` of 21 Oct and 2 Nov 2026 in the validated collection, 12 days apart; the demonstration at Lenoir Landing compares two dates about one year apart). For the algorithm of the document they do not exist: it needs at least 18 months, and the catalogue holds 13 dates of the frame between 13 Dec 2025 and 2 Nov 2026 in three collections of different processing versions, of which 9 follow each other in one collection (23 Jun to 9 Oct 2026, with 29 Jul missing).

**(4) Source program or reference output.** The statements of the notebooks can be run on the pilot arrays. A reference output exists for Lenoir Landing only (two files under `nisar-public-ebd/ATBD/ecosystems/disturbance/sites/leno/validation_reference/`, and 20 simulated scenes listed in `resources/wasabi_leno.txt`; not opened here). None exists for the pilot area.

### 3.3 Active crop area

**(1) The algorithm.**

- Name: "Combined Algorithm Theoretical Basis Document and Jupyter Notebook for Active Crop Area" (Jessica Martinez, Alexandra Christensen, Paul Siqueira, University of Massachusetts Amherst; dated 11 Feb 2025, last updated August 2025).
- File: `notebooks/NISAR_L3_CropArea_ProductGeneration.ipynb` of NISAR_CropArea at commit `d729b6d`. The ASF Cookbook copies it. Text: Handbook, section 6.5 (printed pages 89 to 94); document of 2018, section 3.4.
- Licence: Apache License 2.0. Form: a notebook; no module. It would have to be written again.

**(2) Inputs, classes, thresholds, accuracy.**

- Inputs as the notebook reads them: one channel (`HHHH` or `HVHV`) of every GCOV product of a time series on one grid, in linear power. The periods are three months (1 Jan to 31 Mar, 1 Apr to 30 Jun, 1 Jul to 30 Sep, 1 Oct to 31 Dec) or the whole year. The demonstration takes 10 scenes.
- What it computes: the coefficient of variation CV = standard deviation / mean over time for each cell (`numpy.std` and `numpy.mean`); a cell with CV at or above the threshold is crop; a cell whose backscatter is at or below −16.5 dB on more than 75 % of the dates is water.
- Classes of the product: 0 no data, 1 non-crop, 2 active crop, 3 water, with the colours of its colour table: (255, 255, 255), (237, 178, 24), (73, 111, 162).
- Thresholds: CV 0.4 for Tifton, Georgia, with channel HH, found with the Youden index against the Cropland Data Layer of the United States Department of Agriculture (notebook, section 3.1; file `ancillary_data/TFGA_HH_CDL_20250127_combo1_CalConfig.csv`, which lists files of 50 dates from 25 Jan 2022 to 19 Mar 2024). The notebook says of the water threshold that it "will vary depending both on the SAR imagery used and the temporal period". For any other area the notebook asks the user to type a threshold.
- The final product is on a grid of 100 m, made with GDAL by the nearest cell (`resampleAlg='near'`).
- Stated accuracy: requirement L2-SCI-679, "After the first year of operation, the NISAR Project shall measure crop area at 1-hectare resolution every 3 months with a classification accuracy of 80%." The repository holds one measured result for Tifton with simulated data of 2022 (`tifton/NISAR_L3_HH_40_A_CROP_0122_1222_TFGA_001_20250512_accuracy_statistics.csv`): threshold 0.4, overall correct 86.77 %, producer's accuracy 90.42 % for crop and 81.65 % for non-crop, user's accuracy 87.37 % and 85.86 %, J statistic 0.53. The same file gives a kappa coefficient of 1.01, which is not a possible value; it is quoted as written.
- Differences between the text and the notebook: the Handbook divides the standard deviation by N − 1 (equation 6.5-5) and `numpy.std` divides by N; the Handbook has four classes that compare the present period with the one before (not a crop, fallow, newly active, active) and class 0 for not evaluated, and the notebook has crop, non-crop and water; the Handbook computes the coefficient for HH and HV and for ascending and descending passes, drops the one with the largest spread and votes, and the notebook uses one channel; the Handbook's periods start on 1 December, 1 March, 1 June and 1 September; the Handbook asks for a land cover mask of the regions where agriculture is to be monitored.

**(3) Inputs for the pilot area.** They exist for one period of the notebook: 7 provisional products between 1 Jul and 30 Sep 2026 (5 Jul, 17 Jul, 10 Aug, 22 Aug, 3 Sep, 15 Sep, 27 Sep), all of product version 1.0.11. The requirement and the Handbook speak of the time after the first year of operation, with thresholds set from the first year. The earlier record of this project gives 0.8 % cropland in the pilot box, so the pilot area shows little of what the algorithm maps.

**(4) Source program or reference output.** The statements of the notebook can be run on the pilot arrays. A reference output exists for Tifton only (the accuracy file above and the Cropland Data Layer clip `tifton/crops/tifton_CDL_2023.tif`). None exists for the pilot area.

### 3.4 Other things found that give classes from backscatter, outside the definition

- OPERA DSWx-NI (Dynamic Surface Water Extent from NISAR) is software of the OPERA project of JPL, not of the NISAR science team. Its repository has the release `DSWx-NI-v1.0` of 7 Oct 2026 with a workflow `src/dswx_sar/dswx_ni.py`. NASA's catalogue holds OPERA water products from Sentinel-1 and from HLS (`OPERA_L3_DSWX-S1_V1`, `OPERA_L3_DSWX-HLS_V1`); no collection of DSWx-NI products was found, so there is no ready product to compare with. Its inputs and classes were not read here.
- The ASF NISAR Cookbook notebook `NISAR_GCOV_SARChangeDetectionMethods.ipynb` (the source program of the two working backscatter tools) also makes a change mask by a threshold on the difference of the 95th and 5th percentiles of a time series and on the coefficient of variation. It is a tutorial of ASF, not an algorithm of the science team.

## 4. Coherence (GUNW): `coherence-map`

**No published science-team algorithm that gives classes from coherence was found.**

What was searched: the six repositories of `NISAR-Science-Algorithms` (file lists; every notebook of the solid-earth, sea-ice, inundation, disturbance and crop repositories searched for the words classification, classes, category, thematic); the list of 15 projects of the GitLab group `nisar-science-algorithms`; the ASF ATBD Cookbook and its list of sources; the Handbook (every page with the word coherence, read for classification, classes, threshold, damage); the four science-team documents named by the Data User Guide (the sea-ice document was downloaded and not read); NASA's catalogue for collections named NISAR.

What the sources say about coherence and classes:

1. Inside the inundation algorithm, coherence is named as a possible help, not as an algorithm: "Another method to distinguish open water from bare ground is through examination of the interferometric coherence. The observed repeat-pass coherence over bare ground is typically higher than that of open water" (Handbook, section 6.4, printed page 85). No threshold and no notebook follow.
2. The document of 2018 describes an experimental mapping of tidal wetlands in which shrub and tall mangroves "are best classified through observed interferometric coherence alone" (section 3.3.3). It gives no rule, no threshold and no code, and the Handbook of 2025 does not repeat the section.
3. The Handbook describes damage proxy maps from a sudden decrease of coherence in its appendix of applications (E.4.28, Rapid damage assessment, printed page 211, citing Yun et al., 2015, and Fielding and Jung, 2024). This is an application example; no document or notebook of the science team gives an algorithm, classes or thresholds for it.

Inputs for the pilot area exist (GUNW of track 141, frame 67: 1 validated, 8 provisional, 1 beta pair; part 7), but there is no algorithm to apply to them.

## 5. Displacement (GUNW, GOFF): `displacement-map`

**No published science-team algorithm that gives classes from displacement was found.**

What exists, and why it is not a map of classes:

1. Solid earth (repository NISAR_SolidEarth, commit `8c33f56`; document Revision A of 25 May 2022; Handbook, section 6.1). Four notebooks, `Secular_`, `Coseismic_`, `Transient_` and `Permafrost_Requirement_Validation.ipynb`, build a displacement time series from a set of interferograms (the README names the MintPy and ARIA-tools notebooks as their origin), compare it with GNSS or field data and report whether the requirement is met. The Handbook lists their products: maps of the places of comparison, plots of line-of-sight displacement against time, and tables of velocities and offsets (section 6.1.3). The quantities are continuous. The repository has no licence file. Their interferograms are prepared by the notebooks `prep/ARIA_prep.ipynb` or `prep/NISAR_prep.ipynb` for the calibration sites of the mission.
2. Ice sheets and glaciers (document Revision 2.1 of 27 May 2022; Handbook, section 6.6): velocity from offsets and phase, and the position of the grounding line from tidal displacement. The products are velocity maps and tidal displacement maps (section 6.6.3), for Greenland, Antarctica and mountain glaciers.
3. Sea ice (repository NISAR_SeaIce, notebook `generate_sea_ice_motion.ipynb`; Handbook, section 6.7): displacement, motion vectors and deformation of sea ice. Continuous quantities, for the polar oceans; no licence file.

What was searched: the same sources as in part 4.

Inputs for the pilot area: GUNW exists (part 7). **No GOFF product exists over the pilot area**: 0 products of track 141, frame 67 and 0 products that touch the pilot box in the validated, provisional and beta collections. Elsewhere GOFF exists mainly over ice: the provisional collection holds 15,681 products south of 60° S, 3,386 in a box around Greenland, 1,475 in a box around Alaska, 392 in a box around the conterminous United States and 0 in a box around New England; the validated collection holds 32 products in all, on tracks 139 to 141.

## 6. Soil moisture (SME2): `soil-moisture-map`

**No published science-team algorithm that gives classes from soil moisture was found.**

What was read: the theoretical basis document of the soil moisture product (JPL D-107679, Release 3.3; searched for classification, thematic, drought and wetness classes), the product specification (JPL D-107677 Rev C, every layer of group `/science/LSAR/SME2/grids`), the Handbook, sections 5.4 and 6.8, and the SME2 page of the Data User Guide. The product is three soil moisture estimates by three algorithms, their combination and its uncertainty, in m³/m³. The Handbook names no class product of soil moisture (section 6.8.3).

The SME2 product does hold layers of classes and flags (specification, pages 23 to 37). They are inputs and quality information of the retrieval, not classes derived from soil moisture:

- `ancillaryData/landCover` (Int8): 01 tree cover, 02 shrublands, 03 grassland, 04 cropland, 05 built-up, 06 bare/sparse vegetation, 07 snow and ice, 08 permanent water bodies, 09 herbaceous wetland, 10 mangroves, 11 moss and lichen. The soil moisture document names the ESA WorldCover product as the land cover input (section 6.2).
- `algorithmCandidates/PMI/cropType` (Int8): 0 wheat, 1 rice, 2 corn, 3 soybean, 255 no data.
- `retrievalQualityFlag` (Int16, bits): retrieval recommended, attempted, successful; soil moisture between 0.02 and 0.60; anomaly of each channel.
- `ancillaryData/surfaceQualityFlag` (Int16, bits): static water body, urban area, precipitation, snow or ice, permanent snow or ice, frozen ground, terrain, dense vegetation.

Lynkeus receives two layers of SME2 today, `soilMoisture` and `soilMoistureUncertainty`; it does not receive these four. Appendix B of the soil moisture document, "NISAR Water body detection", repeats the text of the inundation algorithm of part 3.1.

Inputs for the pilot area exist (9 provisional and 2 beta SME2 products; no validated collection exists yet), but there is no algorithm to apply to them. The Data User Guide states that the provisional SME2 products "should not be considered fully calibrated".

## 7. Products of the pilot area in NASA's catalogue

Query of 15 November 2026, 09:39 UTC: each collection with the conditions track 141 and frame 67 (`attribute[]=int,TRACK_NUMBER,141`, `attribute[]=int,FRAME_NUMBER,67`), and each collection with the pilot box (west −71.2, south 42.6, east −70.75, north 42.95).

| Product | Collection | Level of validation | Products in the whole collection | Products of track 141, frame 67 | Dates | Channels | Product version |
|---|---|---|---|---|---|---|---|
| GCOV | `NISAR_L2_GCOV_V1` | Validated | 18,538 | 2 | 21 Oct 2026, 2 Nov 2026 | HH+HV | 1.0.20 (P05036) |
| GCOV | `NISAR_L2_GCOV_PROVISIONAL_V1` | Provisional | 163,672 | 9 | 23 Jun 2026, 5 Jul 2026, 17 Jul 2026, 10 Aug 2026, 22 Aug 2026, 3 Sep 2026, 15 Sep 2026, 27 Sep 2026, 9 Oct 2026 | HH+HV | 1.0.11 (P05023) |
| GCOV | `NISAR_L2_GCOV_BETA_V1` | Beta | 23,527 | 2 | 13 Dec 2025, 25 Dec 2025 | HH+HV | 1.0.2 (X05009) |
| GUNW | `NISAR_L2_GUNW_V1` | Validated | 140 | 1 | 9 Oct 2026 to 21 Oct 2026 | HH | 1.0.20 (P05036) |
| GUNW | `NISAR_L2_GUNW_PROVISIONAL_V1` | Provisional | 94,150 | 8 | 23 Jun 2026 to 5 Jul 2026, 5 Jul 2026 to 17 Jul 2026, 17 Jul 2026 to 10 Aug 2026, 10 Aug 2026 to 22 Aug 2026, 22 Aug 2026 to 3 Sep 2026, 3 Sep 2026 to 15 Sep 2026, 15 Sep 2026 to 27 Sep 2026, 27 Sep 2026 to 9 Oct 2026 | HH | 1.0.11 (P05023) |
| GUNW | `NISAR_L2_GUNW_BETA_V1` | Beta | 10,217 | 1 | 13 Dec 2025 to 25 Dec 2025 | HH | 1.0.2 (X05010) |
| GOFF | `NISAR_L2_GOFF_V1` | Validated | 32 | 0 | none | none | none |
| GOFF | `NISAR_L2_GOFF_PROVISIONAL_V1` | Provisional | 27,717 | 0 | none | none | none |
| GOFF | `NISAR_L2_GOFF_BETA_V1` | Beta | 3,666 | 0 | none | none | none |
| SME2 | `NISAR_L3_SME2_PROVISIONAL_V1` | Provisional | 103,943 | 9 | 23 Jun 2026, 5 Jul 2026, 17 Jul 2026, 10 Aug 2026, 22 Aug 2026, 3 Sep 2026, 15 Sep 2026, 27 Sep 2026, 9 Oct 2026 | HH+HV | 1.0.11 (P05023) |
| SME2 | `NISAR_L3_SME2_BETA_V1` | Beta | 13,881 | 2 | 13 Dec 2025, 25 Dec 2025 | HH+HV | 1.0.2 (X05010) |

Further facts of the same query:

- All GCOV and SME2 products of the frame are full frames with the channels HH and HV on the main band; all GUNW products have the channel HH.
- The pilot box is also touched by products of three other track and frame groups: track 69, frame 67 (descending), track 104, frame 23 (ascending) and track 32, frame 23 (ascending), each with 9 provisional GCOV products. Whether they cover the whole box was not checked.
- The three GCOV collections hold different processing versions (1.0.2, 1.0.11, 1.0.20). The Data User Guide warns: "use caution when including multiple data maturities in the same analysis workflow. Differences between products from the different maturities may be due to differences in the processing workflow rather than actual changes on the landscape."
- Auxiliary data of the mission exist for the box in the catalogue: 5 files of the collection `NISAR_WATERMASK` (water mask tiles of 30 m, version 0.5) and 7 files of `NISAR_DEM`. They were not opened.

## 8. What a legend of classes needs that the present format lacks

Read in `api/src/lynkeus/layers.py`, `tools.py`, `writing.py` and `web/src/contents` at commit `05930fb` of branch `analysis-level-2`.

1. **A table of classes.** `AnalysisResult` and `LayerDescription` carry one legend `range` (lowest and highest value), the name of a colour scale (`colours`) and at most two words for the two ends (`ends`). A map of classes needs, for every class, its value, its name and, where the algorithm gives one, its colour. Today the legend of a scale of classes lists "each whole number of the range beside its colour" (`Legend.tsx`), without names.
2. **The colours of the algorithm.** The only scale of classes is `tab10`; a cell takes the colour at the place `round(value)` modulo 10 (`style.ts`). The colours that a notebook gives to its classes cannot be set.
3. **Reduced copies by the most frequent value.** `AnalysisResult.reduction` allows `mean` and `mean-power`. `write_layer` can already make reduced copies by the most frequent value (`averaged=False`, used for the GCOV mask), but `run_tool` never asks for it. With `mean`, a reduced copy of a class map would hold values between classes.
4. **No data and not classified.** A result marks a cell without data with `nan`. The notebooks give no data the value 0, and the Handbook has a class "indeterminate". The format needs to say which of the two a cell is.
5. **The record of the result.** The STAC record should carry the same table. The STAC extension Classification, version 2.0.0 (<https://github.com/stac-extensions/classification>, maturity "Pilot"), has the field `classification:classes` with `value`, `name`, `description`, `color_hint` and `nodata` for each class.
6. **The grid of the result.** A tool returns its result on the grid of its inputs. The published products of all three algorithms are on a grid of one hectare (100 m), made from the classified cells by the most frequent value (inundation), by the nearest cell (crop area) or by a count (disturbance). A tool can return the classified cells of the input grid, which the notebooks also write, or the format has to allow a result on a coarser grid.
7. **Choices of the visitor.** `ToolRun` carries the tool, the layers and a title. The notebooks have choices: the set of thresholds of a site, sum or product, the channel, the thresholds themselves. A tool has to fix them or the format has to carry parameters.
8. **Roles of the layers.** `check_inputs` takes one pattern of layer names for all layers. A tool that reads `HHHH` and `HVHV` of one date has to check itself which layer is which and that both come from one product.

## 9. Limits of this research

1. The documents were not read from the first page to the last. Read in full: the three product notebooks of part 3 and the two-date validation notebook; the thresholds file; the READMEs. Read in part: the forest disturbance ATBD notebook (all text cells up to section 4.E and the references; the code cells in excerpts), the Handbook (sections 5.4, 6.1.3, 6.3.2 end, 6.3.3, 6.4, 6.5.2, 6.5.3, 6.6.3, 6.7.3, 6.8.3, E.4.28, the contents, and every page with the word coherence), the ecosystems document of 2018 (pages 39 to 50 and 53 to 55), the SME2 specification (the layer list) and the soil moisture document (searched; pages 55, 78, 79 read). Searched for words only: the solid-earth notebooks, the sea-ice and biomass notebooks, the solid-earth and ice-sheet documents. Not read: the sea-ice document (a Word file).
2. The public storage addresses of the demonstration data (`nisar-public-ebd`) were not opened.
3. No layer was received and nothing was computed on pilot files. The land cover shares of the pilot box are from an earlier record of this project.
4. The histories of the repositories were not read (the copies hold the last commit only), so it is not known when and by whom each threshold was set.
5. How ArcGIS Pro and QGIS offer classification of this kind was not researched, because no tool was built.

## 10. Closing table

| Group | Algorithm | Licence | Inputs | Available for the pilot area | Can be proven now | Recommendation |
|---|---|---|---|---|---|---|
| Backscatter | Wetland inundation, product-generation notebook (NISAR_Inundation `85140c4`) | Apache-2.0 | `HHHH` and `HVHV` of one GCOV date; set of thresholds of a site | Yes: 2 validated, 9 provisional, 2 beta dates with HH and HV | Equality with the notebook's statements: yes, after `HVHV` is received. Correct classes on the pilot area: no (thresholds of Yucatan Lake, no reference) | First candidate, if the owner accepts the thresholds of the set `Default` and the changes of part 8 |
| Backscatter | Forest disturbance, two-date demonstration (NISAR_Disturbance `24d124a`) | Apache-2.0 | `HVHV` of two dates | Yes: 21 Oct and 2 Nov 2026 (12 days apart) | Equality with the notebook's statements: yes, after `HVHV` is received; the 5 by 5 block assumes 20 m cells. Correct classes: no | Not first: the science team itself presents it as a stand-in until the time-series algorithm can run |
| Backscatter | Forest disturbance, algorithm of the document (cumulative sums) | Apache-2.0 | `HVHV` time series of at least 18 months | No: 13 dates in 10.6 months, three processing versions | No | Wait for the data |
| Backscatter | Active crop area (NISAR_CropArea `d729b6d`) | Apache-2.0 | `HHHH` or `HVHV` of every date of three months or a year; CV threshold; water threshold | Partly: 7 provisional dates for 1 Jul to 30 Sep 2026; 0.8 % cropland in the box | Equality with the notebook's statements: yes, after 7 layers are received. Correct classes: no (threshold of Tifton) | Not first: many layers, thresholds of another site, little cropland |
| Coherence | None found | — | — | GUNW: 1 validated, 8 provisional, 1 beta pair | No | Leave the tool unavailable, or the owner widens the definition |
| Displacement | None found (solid earth, ice sheets and sea ice give continuous quantities) | — | — | GUNW as above; GOFF: 0 products | No | Leave the tool unavailable, or the owner widens the definition |
| Soil moisture | None found (the product carries land cover, crop type and flag layers) | — | — | SME2: 9 provisional, 2 beta | No | Leave the tool unavailable, or the owner decides to show a class layer of the product |

## 11. Recommendation and decisions of the project owner

**What can soundly be built first.** `backscatter-map` as the wetland inundation classification of one GCOV date, exactly as the product-generation notebook computes it (ratio and sum of `HHHH` and `HVHV`, the six numbers of the set `Default`, classes 0 to 3), compared cell by cell with the statements of the notebook at commit `85140c4` on the pilot products of 21 Oct and 2 Nov 2026. It needs two layers of one product, has published numbers in a file, and has a small, fixed set of classes. Its method sheet would have to say plainly that the thresholds were calibrated by the science team for Yucatan Lake, that the Handbook describes tidal wetlands as a harder case, and that no accuracy is known for the area of the visitor. It also needs the changes 1 to 4 of part 8, which touch shared formats and the interface.

The other three tools have no published science-team algorithm to build on.

**Decisions that belong to the project owner.**

1. Whether a notebook counts as "a published algorithm of the NISAR science team" when it differs from the Handbook (part 3.1: no multi-temporal average, no change detection, open water by sum instead of ratio). The notebook is the only source with numbers.
2. Whether Lynkeus may apply thresholds calibrated for another site (Yucatan Lake, Lenoir Landing, Tifton) to any area a visitor chooses, with a stated warning, or only to the named sites, or not at all.
3. Whether the shared formats may change for classes (parts 8.1 to 8.5), who makes the change in the interface, and whether the algorithm's own colours are used.
4. Whether a thematic map is given on the grid of the inputs or on the one-hectare grid of the published products (part 8.6).
5. Whether a tool may take choices from the visitor (set of thresholds, channel, threshold values), which `ToolRun` cannot carry today (part 8.7).
6. What the three buttons without an algorithm do: stay unavailable with a stated reason; or the definition is widened. Candidates seen during this research, each outside the present definition and none researched to the level of rule 2: OPERA DSWx-NI for backscatter; damage proxy maps from a decrease of coherence (named by the Handbook as an application); the land cover and flag layers of SME2 shown as class layers.
7. Whether products of different levels of validation may be used together in one time series (crop area, disturbance), against the warning of the Data User Guide.
8. Whether the two-date forest disturbance demonstration is wanted at all, given that its own notebook calls it a stand-in and its blocks assume cells of 20 m.

**Decision of 15 Nov 2026.** On point 6, the owner removed the buttons `coherence-map`, `displacement-map` and `soil-moisture-map` from the Analysis tab, together with the button `displacement-change`, for the reason given in `docs/research/analysis-displacement.md`, part 3.3. The button `backscatter-map` stays.

## 12. Records

Kept in `docs/research/records/analysis/thematic-maps/`:

| File | SHA-256 | Contents |
|---|---|---|
| `cmr_t141_f67.json` | `1fe2dc0b543e8f112f323e2290f3fb7f1ddb331b218a1c7b97a4d4b804856c70` | For each collection of part 7: the number of its products, its products of track 141, frame 67 and its products in the pilot box, with the address of each query |
| `cmr_other.json` | `c0efa45a37f38d094d994a2b2cbbb6b6a29775e7532a81389569407946396b0a` | The collections that the catalogue finds for the words NISAR, DSWx-NI, DISP-NI and OPERA NISAR; the number of products of each collection derived from NISAR products, in all and in the pilot box; the validated GOFF products by track; the GOFF products in five boxes (part 5) |
| `cmr_opera.json` | `86caf04aa3ed417755a1a19ebed7b6eae902c8c4a84288e93f30338a79696178` | The OPERA collections of water, disturbance and displacement products, and the releases and the licence of the repository DSWX-SAR as GitHub reports them (part 3.4) |
