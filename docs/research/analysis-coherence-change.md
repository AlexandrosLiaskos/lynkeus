# Research note: Coherence, Change

| | |
|---|---|
| Part | Analysis tab, group Coherence |
| Covers | The tool Coherence, Change (`coherence-change`): the coherence of the later pair of dates minus the coherence of the earlier pair |
| Written | 15 Nov 2026. Every source below was read on that day. |
| Code state | The tool was built on the branch `analysis-level-2` at commit `05930fb`. The measurements of part 4 were made with the code at commit `84724b3` |
| Pilot area | Lower Merrimack River: box west −71.2, south 42.6, east −70.75, north 42.95; track 141, frame 67, descending |
| Earlier note | `docs/research/analysis.md` holds the research of the tool Coherence, One pair, which this note uses and does not repeat |

This note records, for the tool: the NISAR product specification of its input layers (part 1); the
published method and the conditions that the sources set for the two pairs (part 2); the rules of
the code (part 3); what was measured on real files of the pilot area, with the comparison against
the source program (part 4); how GIS programs offer the same function (part 5); the sources and
programs (part 6); and what could not be confirmed (part 7).

## 1. Layers that the tool uses

Specification: NASA SDS Product Specification, Level-2 Geocoded Unwrapped Interferogram (L2 GUNW),
JPL D-102272, Rev E, version 1.2.1, 8 November 2024.

| Layer (under `/science/LSAR/GUNW/grids/frequencyA/`) | Type | Unit | No data | Spacing | Place in the specification |
|---|---|---|---|---|---|
| `unwrappedInterferogram/[HH or VV]/coherenceMagnitude` | Float32 | `1` | `nan` | 80 m | Section 2.2 (page 5); Table 3-11 (page 14); pages 35 and 36 |
| `wrappedInterferogram/[HH or VV]/coherenceMagnitude` | Float32 | `1` | `nan` | 20 m | Section 2.2 (page 5); Table 3-11 (page 14); pages 36 and 37 |

1. Section 2.2 names the layer "normalized interferometric coherence magnitude (20 m and 80 m
   posting)". It states that the wrapped interferogram is multilooked at 30 m in range-Doppler
   coordinates and geocoded at 20 m posting, and that layers of floating-point type are geocoded
   with a bilinear interpolation.
2. Section 3.2.4 (pages 12 and 13) states that only the group `frequencyA` is processed into GUNW
   products, that the polarisations of a product are those common to its two input images, and that
   the cross-polarised channels HV and VH are not processed.
3. The specification gives no `valid_min` and no `valid_max` for the layer. The range 0 to 1 follows
   from the formula of the coherence (`docs/methods/coherence-state.md`, section Formula).
4. The products of the pilot area follow the versions 1.5.0 (provisional collection) and 1.6.0
   (validated collection) of the specification (part 4.2). No PDF of these versions was found. Their
   tables are public as the files `nisar_L2_GUNW.xml` of nisarqa (commit `a8bc425`, folders
   `src/nisarqa/product_specs/1.5.0/` and `1.6.0/`). The four entries of `coherenceMagnitude` are
   the same text in the two files: 32-bit real, `_FillValue` `nan`, `units` `1`.
5. Each product records how many looks formed each interferogram, in the fields
   `numberOfRangeLooks` and `numberOfAzimuthLooks` under
   `/science/LSAR/GUNW/metadata/processingInformation/parameters/[wrappedInterferogram or unwrappedInterferogram]/frequencyA/`
   (`nisar_L2_GUNW.xml`, versions 1.5.0 and 1.6.0). Part 4.2 gives their values in the pilot
   products.
6. The masks of the product (`mask`, `validDataMask`) are described in `docs/research/analysis.md`,
   part 2.2. The tool does not read them.

Names of the product files: Science Data Systems (SDS) L-SAR Product File Naming Conventions, JPL
D-102255, Rev C, 19 October 2025, section 3.8 (pages 18 and 19). The name of a GUNW product holds,
after the frame, the second cycle number (3 characters), the "Bandwidth Mode Code of Primary and
Secondary" (4 characters: 40, 20, 77, 05, or 00 when the secondary band is missing), the
polarisation (2 characters, for example `SH` for HH single polarity), the start and end times of the
reference and of the secondary, and the Composite Release Identifier (CRID, 6 characters). The tool
reads the bandwidth mode code, in addition to the fields that `check_inputs` reads.

## 2. The published method

### 2.1 The difference of two coherences

1. Fielding et al. (2005), <https://doi.org/10.1029/2004JB003299>, abstract: the article takes
   "the difference between the interferometric correlation for an interval including the earthquake
   and an interval before the earthquake", to separate the changes due to the earthquake from other
   effects, and maps the damage to buildings by the change from high to low correlation. Only the
   abstract was read.
2. Stephenson et al. (2022), <https://doi.org/10.1109/TGRS.2021.3084209>, read as the accepted
   manuscript <https://arxiv.org/abs/2105.11544>. Section II-B (page 3) describes the method that it
   names Coherence Change Detection: the coherence of two images acquired as close as possible
   before an event is compared with the coherence of a pair that spans the event. The caption of
   Figure 1 (page 5) gives the order of the subtraction: the coherence image before the event is
   subtracted from the coherence image that spans the event. This is the order of the tool, the
   later pair minus the earlier pair. The same section states the assumption of the method: the
   coherence image before the event represents the normal coherence before the event.
3. Plank (2014), <https://doi.org/10.3390/rs6064870>, a review. Section 2 (pages 4875 to 4877):
   three images are needed, two before the event (times t1 and t2) and one after it (t3); the pair
   before the event is t1 and t2 and the pair that spans the event is t2 and t3 (Figures 3 and 4).
   Section 2.3 (pages 4879 and 4880) gives the normalised difference and the ratio of the two
   coherences (equations 10 to 13), both with the earlier pair first. The plain difference is not
   among the equations of the review; the review reports that Arciniegas et al. used coherence
   differences (section 3.3, page 4886).
4. Yun et al. (2015), <https://doi.org/10.1785/0220150152>. Only extracts that a web search showed
   were read: the coherence values were adjusted to remove the bias of the estimate, and the
   histograms of the two coherence maps were matched before the pixels with a loss of coherence
   were identified. The tool applies neither step (part 7).

The sign differs between the sources: Stephenson et al. subtract the earlier coherence from the
later one, and Plank writes the earlier pair first. The tool gives the later pair minus the earlier
pair, as the tool Backscatter, Change gives the later date relative to the earlier date.

### 2.2 Which two pairs may be compared

| Question | What the sources state | What the tool does |
|---|---|---|
| Instrument, track, direction, frame | All images "have to be acquired at the same imaging geometry (i.e., same pass direction (ascending/descending), incidence angle, relative orbit, imaging mode and SAR wavelength)" (Plank, 2014, section 4, condition II, page 4891; the same in section 2, page 4876) | It refuses two products of different instruments, tracks, directions or frames |
| Imaging mode | The same sentence of Plank. The L-band instrument acquires at the full range bandwidth of 77 MHz or at parts of the spectrum (GUNW specification, section 3.2.4, page 12), and the name of a product gives the bandwidth mode code (naming conventions, section 3.8) | It refuses two products whose bandwidth mode codes differ |
| Channel | Section 3.2.4 of the specification: a product holds the co-polarised channels common to its two images. No source that was read states in words that the two coherences must be of the same channel; the method compares one quantity at two times | It refuses layers of different channels (HH with VV) |
| The 20 m layer or the 80 m layer | The accuracy of the estimated coherence magnitude depends on the number of pixels averaged and on the number of independent samples per pixel, and the estimate is biased toward higher values (Touzi et al., 1999, abstract). The two layers of a product are formed with different numbers of looks (part 4.2), and on the pilot area they differ (part 4.6) | It refuses the 20 m layer with the 80 m layer |
| Pairs that share a date | This is the arrangement that Plank describes: the pairs t1, t2 and t2, t3 share the image t2 (section 2, Figures 3 and 4). Stephenson et al. compare the coherences of sequential acquisitions (section II-B) | It accepts them |
| Pairs that are apart in time | Fielding et al. compare an interval that includes the event with "an interval before" it (abstract). Plank asks that the number of repeat cycles between the pair before the event and the pair that spans it be "as low as possible", and states that no critical value exists (section 4, condition IV, page 4891) | It accepts them, with the earlier pair first |
| Pairs whose intervals overlap | No source that was read compares such pairs | It refuses them (part 7) |
| Equal time span | Stephenson et al.: the coherence before the event is the normal coherence "at a given temporal baseline" (section II-B); pairs with longer temporal baselines "will generally have lower coherence" than pairs of a similar period and region with shorter ones, and a variable temporal baseline "adds an extra noise term due to changing amounts of temporal decorrelation" (section VI-A, page 11). Plank: the temporal baseline between all acquisitions "should be as small as possible", and in the best case it is one repeat cycle between each acquisition (section 4, condition IV; Figure 3). No source that was read requires equal spans in so many words or gives a correction | It refuses pairs that span different numbers of days (parts 3 and 7) |
| Spatial baseline | A larger perpendicular baseline lowers the coherence; beyond the critical baseline the coherence is lost (Plank, 2014, section 2.1, page 4878). Stephenson et al. state that the satellites now in orbit are controlled tightly, so that this effect is a smaller problem than for earlier sensors (section II-B) | It does not read the baselines (part 7) |

## 3. The tool

1. **Function.** `coherence_change` in `api/src/lynkeus/analysis/coherence.py`: the array of the
   later pair minus the array of the earlier pair, in 32-bit numbers. A cell without data in either
   input is without data in the result.
2. **Inputs.** Two layers `coherenceMagnitude`, the earlier pair first, as the tool Backscatter,
   Change takes the earlier date first.
3. **Refusals.** The sixteen checks are listed in `docs/methods/coherence-change.md`, section What
   the tool refuses. Checks 1 to 7 are those of `check_inputs`. Checks 8 to 14 follow from part 2.2.
   Check 15 is the check of Coherence, One pair on each layer. Check 16 refuses a result without any
   value.
4. **Unequal spans.** The sources describe what an unequal span does (part 2.2) and do not forbid
   it. The function of a tool returns an array, a legend and the reference of its method
   (`AnalysisResult` in `api/src/lynkeus/layers.py`); it has no field for a notice to the visitor.
   A result of unequal spans would therefore carry the term of the span without any word about it.
   For this reason the tool refuses such pairs. Part 4.6 gives what was measured on one such pair.
5. **Releases of the processing.** The tool does not read the CRID of the two products. Part 4.2
   gives what the pilot products record, and part 7 what is not confirmed.
6. **Legend.** The range is −1 to 1, the lowest and the highest value that the formula can give. It
   is fixed, as the range 0 to 1 of Coherence, One pair is fixed (`docs/research/analysis.md`, parts
   3.3 and 5.6), so that two results can be compared. The colour scale is `RdBu` and the words of
   the two ends are "decrease" and "increase", as in Backscatter, Change (`docs/research/analysis.md`,
   part 5.5). No source that was read gives a range or a colour scale for a map of the difference of
   two coherences. In `RdBu` of Matplotlib 3.11.2 the colour of the lowest value is (0.404, 0.0,
   0.122), dark red, that of the centre (0.966, 0.967, 0.968) and that of the highest value (0.02,
   0.188, 0.38), dark blue (red, green and blue from 0 to 1; tried on 15 Nov 2026).
7. **Reduced copies.** The mean of the values (`reduction` = `mean`). The mean of the differences
   of a set of cells is the difference of their means, so a reduced copy of the result is the change
   of the reduced copies of the inputs where the same cells hold values (part 4.4).

## 4. What was measured on real files

### 4.1 The pairs of the pilot area and the layers received

The NASA catalogue (CMR) was searched on 15 Nov 2026 (2026-11-15T09:39:53Z) for GUNW products that meet
the box of the pilot area (`catalogue_search.json`).

1. The validated collection `NISAR_L2_GUNW_V1` (`C3622247503-ASF`) held 1 product: the pair of
   9 Oct 2026 and 21 Oct 2026 of track 141, frame 67 (`G4409879710-ASF`). No pair of 21 Oct and
   2 Nov 2026 was in the catalogue.
2. The provisional collection `NISAR_L2_GUNW_PROVISIONAL_V1` (`C2854335566-ASF`) held 33
   products, of which 8 are of track 141, frame 67:

| Reference | Secondary | Days | Product in the catalogue |
|---|---|---|---|
| 23 Jun 2026 | 5 Jul 2026 | 12 | `G4247628567-ASF` |
| 5 Jul 2026 | 17 Jul 2026 | 12 | `G4255469284-ASF` |
| 17 Jul 2026 | 10 Aug 2026 | 24 | `G4279902284-ASF` |
| 10 Aug 2026 | 22 Aug 2026 | 12 | `G4289042265-ASF` |
| 22 Aug 2026 | 3 Sep 2026 | 12 | `G4299649727-ASF` |
| 3 Sep 2026 | 15 Sep 2026 | 12 | `G4314912627-ASF` |
| 15 Sep 2026 | 27 Sep 2026 | 12 | `G4328856513-ASF` |
| 27 Sep 2026 | 9 Oct 2026 | 12 | `G4359740150-ASF` |

Seven layers of five products were received on 15 Nov 2026 with `lynkeus.harmony.get_layer`, the
function of the Data part, for the box of the pilot area: the layer
`wrappedInterferogram/HH/coherenceMagnitude` (20 m) of five products, and the layer
`unwrappedInterferogram/HH/coherenceMagnitude` (80 m) of two of them. Each file is the Cloud
Optimized GeoTIFF that Lynkeus wrote from the file of NASA Harmony (`received_layers.json`, which
also holds the layer description of each layer).

| Pair of dates | Spacing | File | Bytes | SHA-256 | Seconds |
|---|---|---|---|---|---|
| 17 Jul to 10 Aug 2026 | 20 m | `gunw-wrappedinterferogram-hh-coherencemagnitude-20260717-20260810.tif` | 15,030,314 | `792dcdfe4a311d5650ac5a245ac944885a9a454e85c97f15e4956da7aaf4c02b` | 55.9 |
| 10 to 22 Aug 2026 | 20 m | `gunw-wrappedinterferogram-hh-coherencemagnitude-20260810-20260822.tif` | 14,959,714 | `2d33f96db6c007145472e17e1d9438c5d6535742372d1741edcd7b3b592ba5a8` | 43.3 |
| 15 to 27 Sep 2026 | 20 m | `gunw-wrappedinterferogram-hh-coherencemagnitude-20260915-20260927.tif` | 15,018,173 | `ca3f576585ac53aa5088ec05b057d30d1da03720b3048b0e6d1ba045dbdf5dbe` | 56.5 |
| 27 Sep to 9 Oct 2026 | 20 m | `gunw-wrappedinterferogram-hh-coherencemagnitude-20260927-20261009.tif` | 15,013,045 | `218e249a090fbb6dbfee23ada1d298071cc587c3b5b00fc6a31fc7235d86858b` | 57.9 |
| 9 to 21 Oct 2026 | 20 m | `gunw-wrappedinterferogram-hh-coherencemagnitude-20261009-20261021.tif` | 15,194,106 | `93b623fe0563dbdc34ccce3e9db22aa6f57dca4763429ae93fac8d9bf5117b69` | 44.1 |
| 27 Sep to 9 Oct 2026 | 80 m | `gunw-unwrappedinterferogram-hh-coherencemagnitude-20260927-20261009.tif` | 736,415 | `963a02eb5aff5230902a19078dc74d1cb7556ceeafbe66cfc5ef2f2ebe563e52` | 58.0 |
| 9 to 21 Oct 2026 | 80 m | `gunw-unwrappedinterferogram-hh-coherencemagnitude-20261009-20261021.tif` | 734,902 | `5d1b5e8c5153acdbcdeff9b24885165db39ed73b158781ad4bf0c7a2f048f368` | 45.1 |

The names of the five product files are in the layer descriptions (`received_layers.json`) and in
`api/tests/analysis/test_coherence_change.py`. All layers are in the projection EPSG:32619. The
20 m layers have 1886 by 1985 cells and the 80 m layers 471 by 496 cells, with the same
origin (319520, 4757600).

| Pair of dates | Spacing | Cells | Cells with a value | Lowest | Highest | Mean | Median | Cells below 0; above 1 |
|---|---|---|---|---|---|---|---|---|
| 17 Jul to 10 Aug 2026 | 20 m | 3,743,710 | 3,579,092 | 0.0090 | 0.9962 | 0.5420 | 0.5855 | 0; 0 |
| 10 to 22 Aug 2026 | 20 m | 3,743,710 | 3,579,092 | 0.0068 | 0.9979 | 0.5614 | 0.6135 | 0; 0 |
| 15 to 27 Sep 2026 | 20 m | 3,743,710 | 3,579,092 | 0.0078 | 0.9950 | 0.3194 | 0.2910 | 0; 0 |
| 27 Sep to 9 Oct 2026 | 20 m | 3,743,710 | 3,579,092 | 0.0065 | 0.9940 | 0.3067 | 0.2773 | 0; 0 |
| 9 to 21 Oct 2026 | 20 m | 3,743,710 | 3,579,092 | 0.0046 | 0.9965 | 0.5063 | 0.5361 | 0; 0 |
| 27 Sep to 9 Oct 2026 | 80 m | 233,616 | 223,693 | 0.0081 | 0.9607 | 0.2458 | 0.2099 | 0; 0 |
| 9 to 21 Oct 2026 | 80 m | 233,616 | 223,693 | 0.0090 | 0.9858 | 0.4881 | 0.5370 | 0; 0 |

The cells without a value are the same cells in the five 20 m layers (164,618 cells) and in the two
80 m layers (9,923 cells): in each of the five runs of part 4.3 no cell holds a value in one layer
only, and the difference of the pairs of 17 Jul to 10 Aug and 10 to 22 Aug (part 4.6) holds a value
in the same number of cells as each of its layers. `docs/research/analysis.md`, part 4.5, explains these cells for the sample of 9 and 21 Oct
2026: their centres lie outside the box of the request.

### 4.2 What the product files record

The fields below were read from the five HDF5 product files over HTTPS on 15 Nov 2026, with
earthaccess 0.19.0 and h5py 3.16.0 (`product_metadata.json`).

| Pair of dates | Collection | CRID | Product version | Specification version | PGE version (catalogue) | ISCE3 (`softwareVersion`) | Looks of the 20 m layer (range by azimuth) | Looks of the 80 m layer | Range bandwidth | Mean perpendicular baseline |
|---|---|---|---|---|---|---|---|---|---|---|
| 17 Jul to 10 Aug 2026 | provisional | `P05023` | 1.0.11 | 1.5.0 | R05.02.3 | 0.25.16 | 5 by 6 | 13 by 16 | 40 MHz | -47.2 m |
| 10 to 22 Aug 2026 | provisional | `P05023` | 1.0.11 | 1.5.0 | R05.02.3 | 0.25.16 | 5 by 6 | 13 by 16 | 40 MHz | 92.3 m |
| 15 to 27 Sep 2026 | provisional | `P05023` | 1.0.11 | 1.5.0 | R05.02.3 | 0.25.16 | 5 by 6 | 13 by 16 | 40 MHz | -48.7 m |
| 27 Sep to 9 Oct 2026 | provisional | `P05023` | 1.0.11 | 1.5.0 | R05.02.3 | 0.25.16 | 5 by 6 | 13 by 16 | 40 MHz | -8.0 m |
| 9 to 21 Oct 2026 | validated | `P05036` | 1.0.20 | 1.6.0 | R05.03.2 | 0.25.21 | 5 by 6 | 13 by 16 | 40 MHz | 31.1 m |

1. In all five products the field `interferogramFormation/multilooking` reads "Spatial moving
   average with decimation", the field `wrappedInterferogramFiltering` reads `no_filter`, the fields
   `commonBandRangeFilterApplied` and `commonBandAzimuthFilterApplied` read `False`, and the fields
   `isMixedMode` of the product, of the reference and of the secondary read `False`.
2. The product of the validated collection and the four products of the provisional collection
   were made by two releases: ISCE3 0.25.21 and ISCE3 0.25.16. The file of ISCE3 that computes the
   coherence, `cxx/isce3/signal/Crossmul.cpp`, is identical at the tags `v0.25.16` and `v0.25.21`,
   and so is the workflow `python/packages/nisar/workflows/crossmul.py` (compared on 15 Nov 2026).
   The file of default settings `share/nisar/defaults/insar.yaml` differs between the two tags in
   four places: a correction of phase artefacts, the type of the mask of the ionosphere estimation,
   the settings of the phase unwrapping, and a correction named `tec_correction`. Whether the
   settings of the mission follow these defaults was not examined.
3. The perpendicular baseline is the mean of the cube
   `/science/LSAR/GUNW/metadata/radarGrid/perpendicularBaseline` of each product, over the whole
   frame.

### 4.3 The results of the tool and the comparison with the source program

The tool was run on five pairs of layers. Four are pairs of 12 days after pairs of 12 days at
20 m: two that share a date and two that are apart in time. The fifth is the pair of 80 m layers.
Three of the five join a provisional product with the validated product.

| Earlier pair, then later pair (2026) | Cells with a value | Lowest | Highest | Mean | 1st percentile | Median | 99th percentile | 99th percentile of the absolute values | Cells below −0.5; above 0.5 |
|---|---|---|---|---|---|---|---|---|---|
| 27 Sep to 9 Oct, then 9 to 21 Oct (20 m) | 3,579,092 | -0.8653 | 0.8222 | 0.1996 | -0.3512 | 0.2190 | 0.5595 | 0.5673 | 11,966; 117,853 |
| 15 to 27 Sep, then 27 Sep to 9 Oct (20 m) | 3,579,092 | -0.7173 | 0.8288 | -0.0127 | -0.2534 | -0.0130 | 0.2333 | 0.2775 | 291; 218 |
| 15 to 27 Sep, then 9 to 21 Oct (20 m) | 3,579,092 | -0.8681 | 0.9110 | 0.1869 | -0.3839 | 0.2043 | 0.5538 | 0.5652 | 15,298; 103,217 |
| 10 to 22 Aug, then 15 to 27 Sep (20 m) | 3,579,092 | -0.8524 | 0.8718 | -0.2420 | -0.6323 | -0.2686 | 0.3512 | 0.6350 | 359,994; 11,798 |
| 27 Sep to 9 Oct, then 9 to 21 Oct (80 m) | 223,693 | -0.7828 | 0.7390 | 0.2423 | -0.4178 | 0.2858 | 0.5427 | 0.5547 | 1,189; 6,963 |

Source program: `gdal raster calc` of GDAL (`GDAL 3.12.2 "Chicoutimi", released 2026/02/03`), in the image
`ghcr.io/osgeo/gdal:alpine-small-3.12.2` (`sha256:3775c7530eb68f95b8c67853da1e1e99a607e32a87f3d433440b8b562079f645`), with the command
`gdal raster calc -i A=<earlier> -i B=<later> --calc B-A --output-data-type Float32 -o <result>` on
the same layer files. The program evaluates the expression with the library muparser and converts
the inputs to 64-bit floating-point numbers before the calculation
([`gdal_raster_calc.rst`, tag v3.12.2](https://github.com/OSGeo/gdal/blob/v3.12.2/doc/source/programs/gdal_raster_calc.rst)).
The result of each side was compared cell by cell, as 32-bit patterns (`comparison.json`,
`lynkeus_side.json`).

| Earlier pair, then later pair (2026) | Cells | Value in both | `nan` in both | Value in Lynkeus only; in the source only | Cells that differ | Largest difference | SHA-256 of the bytes of the array of the tool |
|---|---|---|---|---|---|---|---|
| 27 Sep to 9 Oct, then 9 to 21 Oct (20 m) | 3,743,710 | 3,579,092 | 164,618 | 0; 0 | 0 | 0.0 | `355d60aa8bb2124258909f653d7771446d7f3acc4b3cd824064cbc7c09750b49` |
| 15 to 27 Sep, then 27 Sep to 9 Oct (20 m) | 3,743,710 | 3,579,092 | 164,618 | 0; 0 | 0 | 0.0 | `082ac184fbc6575e971d1ce3522529b258d38fcd7e30bfed364a2a816bc56dca` |
| 15 to 27 Sep, then 9 to 21 Oct (20 m) | 3,743,710 | 3,579,092 | 164,618 | 0; 0 | 0 | 0.0 | `cda1aff05a9fc06a6910cb6aecdc66f9ac648febb4a773d744c125b5af7b43ad` |
| 10 to 22 Aug, then 15 to 27 Sep (20 m) | 3,743,710 | 3,579,092 | 164,618 | 0; 0 | 0 | 0.0 | `165bca5d435d3168a6289e705324cd71c1c7684578f4c8b656843ba13b01d0f3` |
| 27 Sep to 9 Oct, then 9 to 21 Oct (80 m) | 233,616 | 223,693 | 9,923 | 0; 0 | 0 | 0.0 | `ed5b820206241b0e1e325475c5c1543dbb7ddfb8cea821bd931ff24b6042756e` |

The arrays are bit-identical in all five pairs, and each file of the source program has the grid
of its first input. The difference of two 32-bit numbers between 0 and 1 is exact in 64-bit numbers,
which explains why the conversion of the source program to 64-bit numbers changes no cell; this is
a conclusion of this note. Platform: `Linux-6.8.0-146-generic-x86_64-with-glibc2.41`, Python 3.13.18, numpy
2.5.4, rasterio 1.5.2 (GDAL 3.12.2). The function took between 0.000 and
0.036 seconds for a pair.

What the comparison does not show:

1. A program of radar interferometry. The source program computes a subtraction of two rasters. No
   published program that takes the difference of two NISAR coherence layers was found: the list
   of notebooks of the ASF NISAR Cookbook (commit `17b69c8`) names none for GUNW products (the
   notebooks were not opened), and the public code of Stephenson et al.
   ([dpm-rnn-public](https://github.com/olliestephenson/dpm-rnn-public), commit `bc4247f`, MIT)
   computes the score of its neural network and not the plain difference (`generate_dpm.py`, lines
   100 to 106).
2. Independence in the reading of the files: both sides read the GeoTIFF files with GDAL 3.12.2.
3. Cells in which the two sides could differ: the layers hold no value outside 0 to 1, no infinite
   value, and no cell that holds a value in one layer of a pair only.
4. The layers of the channel VV, and other areas.
5. The values of the layer files against the HDF5 product files. For the sample of 9 and 21 Oct
   2026 this was done earlier (`docs/research/analysis.md`, part 4.5); it was not repeated for the
   files of this note.

### 4.4 The tool through `lynkeus.tools.run_tool`

The same five runs were made through `lynkeus.tools.run_tool`, which reads the layer files, calls
the function and writes the result as a layer of the kind `result` (`lynkeus_side.json`). No copy
of the web service was started.

| Earlier pair, then later pair (2026) | File of the result | File read back equals the array of the function bit for bit | Grid equals the grid of the first input | Dates of the result | Reduced copies against the difference of the reduced copies of the inputs (cells compared, largest difference) |
|---|---|---|---|---|---|
| 27 Sep to 9 Oct, then 9 to 21 Oct (20 m) | `coherence-change.tif` | yes | yes | 27 Sep 2026, 9 Oct 2026, 21 Oct 2026 | factor 2: 897,089 cells, 7.5e-08; factor 4: 225,672 cells, 8.9e-08 |
| 15 to 27 Sep, then 27 Sep to 9 Oct (20 m) | `coherence-change.tif` | yes | yes | 15 Sep 2026, 27 Sep 2026, 9 Oct 2026 | factor 2: 897,089 cells, 6.0e-08; factor 4: 225,672 cells, 8.6e-08 |
| 15 to 27 Sep, then 9 to 21 Oct (20 m) | `coherence-change.tif` | yes | yes | 15 Sep 2026, 27 Sep 2026, 9 Oct 2026, 21 Oct 2026 | factor 2: 897,089 cells, 7.5e-08; factor 4: 225,672 cells, 8.9e-08 |
| 10 to 22 Aug, then 15 to 27 Sep (20 m) | `coherence-change.tif` | yes | yes | 10 Aug 2026, 22 Aug 2026, 15 Sep 2026, 27 Sep 2026 | factor 2: 897,089 cells, 8.9e-08; factor 4: 225,672 cells, 8.9e-08 |
| 27 Sep to 9 Oct, then 9 to 21 Oct (80 m) | `coherence-change.tif` | yes | yes | 27 Sep 2026, 9 Oct 2026, 21 Oct 2026 | none |

Each description of a result holds the quantity "Change of interferometric coherence (magnitude)", the unit
`1`, the range −1 to 1, the colour scale `RdBu`, the words `decrease` and `increase`, the method of
the function and the names of the two product files. In every reduced copy the same cells hold a
value in the result and in the difference of the reduced copies of the inputs.

### 4.5 The refusals on real layers

| Trial | Layers given, in this order | Sentence of the function | Sentence through `run_tool` |
|---|---|---|---|
| Later pair first | 9 to 21 Oct 2026 and 27 Sep to 9 Oct 2026 | The pair of the first layer must end on or before the first date of the pair of the second. | The pair of the first layer must end on or before the first date of the pair of the second. |
| Pairs of 24 and 12 days | 17 Jul to 10 Aug 2026 and 10 to 22 Aug 2026 | The two pairs do not span the same number of days: the first spans 24 days and the second 12 days. | The two pairs do not span the same number of days: the first spans 24 days and the second 12 days. |
| Pairs of 12 and 24 days, apart | 10 to 22 Aug 2026 and 17 Jul to 10 Aug 2026 | The pair of the first layer must end on or before the first date of the pair of the second. | The pair of the first layer must end on or before the first date of the pair of the second. |
| 20 m layer with 80 m layer | 27 Sep to 9 Oct 2026 and 9 to 21 Oct 2026 (80 m) | The input layers do not have the same grid. | The layers of the analysis do not have the same grid. |
| 80 m layer with 20 m layer | 27 Sep to 9 Oct 2026 (80 m) and 9 to 21 Oct 2026 | The input layers do not have the same grid. | The layers of the analysis do not have the same grid. |
| One layer given twice | 9 to 21 Oct 2026 and 9 to 21 Oct 2026 | The pair of the first layer must end on or before the first date of the pair of the second. | The pair of the first layer must end on or before the first date of the pair of the second. |
| One layer only | 9 to 21 Oct 2026 | The number of input layers must be 2, and it is 1. | The number of input layers must be 2, and it is 1. |

The layers of different spacings have different grids, so they are refused before the check of the
name of the layer is reached: by the function for the size of the arrays, and by `run_tool` for the
grid. `run_tool` wrote no file in any trial. The other refusals were tried in the tests of the code
with made-up layers (`api/tests/analysis/test_coherence_change.py`).

### 4.6 Two measurements that are not results of the tool

The numbers of this part were computed with numpy on the layer files (`measurements.json`). They
are not results of the tool, which refuses these inputs.

Later pair minus earlier pair at 20 m, 3,579,092 cells with a value:

| Earlier pair (2026) | Later pair (2026) | Spans | Mean | Median | 5th; 95th percentile | Cells below 0 |
|---|---|---|---|---|---|---|
| 27 Sep to 9 Oct 2026 | 9 to 21 Oct 2026 | 12 days after 12 days | 0.1996 | 0.2190 | -0.1188; 0.4748 | 14.6 % |
| 15 to 27 Sep 2026 | 27 Sep to 9 Oct 2026 | 12 days after 12 days | -0.0127 | -0.0130 | -0.1747; 0.1504 | 55.6 % |
| 15 to 27 Sep 2026 | 9 to 21 Oct 2026 | 12 days after 12 days | 0.1869 | 0.2043 | -0.1311; 0.4662 | 15.8 % |
| 10 to 22 Aug 2026 | 15 to 27 Sep 2026 | 12 days after 12 days | -0.2420 | -0.2686 | -0.5501; 0.1195 | 85.8 % |
| 17 Jul to 10 Aug 2026 | 10 to 22 Aug 2026 | 12 days after 24 days | 0.0194 | 0.0242 | -0.2067; 0.2286 | 41.9 % |
| 17 Jul to 10 Aug 2026 | 15 to 27 Sep 2026 | 12 days after 24 days | -0.2226 | -0.2437 | -0.5173; 0.1165 | 85.1 % |

1. The pair of 24 days has a mean coherence of 0.5420 and the pair of 12 days that follows it
   0.5614: the pair of 12 days is higher by 0.0194 on average. The direction is the one
   that Stephenson et al. state (part 2.2).
2. The differences between pairs of 12 days are larger: -0.2420 between August and September and
   0.1996 between the pairs of 27 Sep to 9 Oct and 9 to 21 Oct. In these measurements the coherence of a
   pair differs more between dates than between the span of 24 days and the span of 12 days that
   follows it. The cause of the differences between the pairs of 12 days was not examined.
3. One pair of 24 days was measured. The measurement does not show what a longer span does, and it
   does not separate the span from the dates.

The 80 m layer against the mean of the 16 cells of the 20 m layer of the same product that each of
its cells covers (the two grids share their origin, and 4 by 4 cells of 20 m make one cell of
80 m); only cells of 80 m whose 16 cells all hold a value were compared:

| Pair of dates | Cells compared | Mean of the 80 m layer | Mean of the means of the 20 m cells | Mean of the difference | Median of the difference | Cells in which the 80 m layer is lower |
|---|---|---|---|---|---|---|
| 27 Sep to 9 Oct 2026 | 222,963 | 0.2458 | 0.3067 | -0.0609 | -0.0700 | 84.8 % |
| 9 to 21 Oct 2026 | 222,963 | 0.4882 | 0.5064 | -0.0182 | -0.0143 | 62.6 % |

The 80 m layer is lower than the mean of the 20 m layer in most cells. This agrees in direction
with the statement of Touzi et al. (1999, abstract) that the estimate is biased toward higher values
and is more accurate at a coarser resolution; the note does not show that the bias is the only
cause. The two layers of a product are therefore not the same quantity, and the tool refuses to
subtract one from the other.

## 5. How GIS programs offer this function

The pages of ArcGIS Pro were read as extracts that a web search returned on 15 Nov 2026; they were
not opened in full. The pages of QGIS, SNAP and GDAL were read in the source files of their
documentation: QGIS User Guide 3.44 (repository `QGIS-Documentation`, branch `release_3.44`, commit
`f831240` of 14 Nov 2026), SNAP Microwave Toolbox 14.0.0 (repository `senbox-org/microwave-toolbox`,
tag `14.0.0`, commit `38998c9`) and GDAL 3.12.2 (tag `v3.12.2`). A statement is made only where the
page states it. No code of these programs was read.

| | |
|---|---|
| ArcGIS Pro | The tool Compute Coherence (Synthetic Aperture Radar toolset) computes the coherence of two co-registered complex radar datasets, between 0 and 1; its page states that the output "can be used for coherent change detection" ([Compute Coherence, version 3.4](https://pro.arcgis.com/en/pro-app/3.4/tool-reference/image-analyst/compute-coherence.htm)). The difference of two rasters is computed by the general tool Compute Change Raster (Image Analyst toolbox), whose method Difference subtracts the values of the From Raster and of the To Raster ([Compute Change Raster](https://pro.arcgis.com/en/pro-app/latest/tool-reference/image-analyst/compute-change-raster.htm)). The Change Detection Wizard gives the order as Output = (To Raster) − (From Raster), with the later raster as the To Raster ([Detect pixel value change, version 3.4](https://pro.arcgis.com/en/pro-app/3.4/help/analysis/image-analyst/pixel-value-change-detection.htm)). An Esri article of 2024 announces coherent change detection tools that co-register images and calculate the coherence ([What's New, Fall 2024](https://www.esri.com/arcgis-blog/products/arcgis/imagery/whats-new-in-imagery-data-management-and-analysis-in-arcgis-fall-2024)). No tool that takes the difference of two coherence rasters as such was seen in the extracts. |
| QGIS | The Raster Calculator of the Raster menu computes an expression on the cells of raster layers, with the operator `-` among its operators, and writes a new raster layer or a virtual layer. A layer is named by its name and band, for example `DEM@1`. If an input has another resolution, its values are resampled with the nearest neighbour ([Raster Analysis](https://github.com/qgis/QGIS-Documentation/blob/release_3.44/docs/user_manual/working_with_raster/raster_analysis.rst)). No page on coherence was read. |
| Reference program | ESA SNAP 14.0.0. The operator Coherence Estimation computes the coherence from a stack of co-registered complex images, with a window in azimuth and range ([CoherenceOp.html](https://github.com/senbox-org/microwave-toolbox/blob/14.0.0/jlinda/jlinda-nest-ui/src/main/resources/org/jlinda/nest/docs/operators/CoherenceOp.html)). The operator titled Log Ratio Change Detection takes a stack of two co-registered images and two bands, B0 and B1; without a selection it takes the first two intensity or amplitude bands. Its outputs, each chosen with a check box, are the difference (B0 − B1), the ratio, the log ratio and the normalised ratio ((B0 − B1) / (B0 + B1)); an upper and a lower threshold give a mask of 1, −1 and 0 ([ChangeDetection.html](https://github.com/senbox-org/microwave-toolbox/blob/14.0.0/sar-op-feature-extraction-ui/src/main/resources/eu/esa/sar/fex/docs/operators/ChangeDetection.html)). The page does not name coherence bands. |
| Standard | GDAL 3.12.2, `gdal raster calc`: a pixel-wise calculation on one or more rasters with an expression of the library muparser. The inputs must have the same spatial reference system and the same extent, and need not have the same resolution; the inputs are converted to 64-bit numbers before the calculation; the no-data value of the output is that of the first input that has one ([gdal_raster_calc.rst](https://github.com/OSGeo/gdal/blob/v3.12.2/doc/source/programs/gdal_raster_calc.rst)). This is the source program of the comparison (part 4.3). |
| Function used | `coherence_change` in `api/src/lynkeus/analysis/coherence.py`: the later pair minus the earlier pair. Method sheet `docs/methods/coherence-change.md`. |
| Limits | The programs do not agree on the order of the two inputs: ArcGIS Pro subtracts the earlier raster from the later one, and SNAP subtracts the second band from the first. None of the programs read checks that the two rasters are coherences of comparable pairs; the user is responsible for the choice. ArcGIS Pro (by its environment settings, `docs/research/analysis.md`, part 5.2), QGIS and GDAL accept inputs of different resolutions; the Lynkeus tool does not resample and refuses them. The Lynkeus tool reads GUNW layers only and makes the checks of part 2.2. |
| Read on | 15 Nov 2026 |

The legend of a change map in these programs is described in `docs/research/analysis.md`, part
5.5. It was not read again for this note.

## 6. Sources, programs, libraries and data of this part

| Item | Version | Licence | Use |
|---|---|---|---|
| NISAR L2 GUNW Product Specification, JPL D-102272 | Rev E, 1.2.1, 8 Nov 2024 | Document of NASA/JPL | Layers (part 1) |
| Product specification files `nisar_L2_GUNW.xml` | Versions 1.5.0 and 1.6.0, in nisarqa at commit `a8bc425` | As nisarqa (`docs/research/analysis.md`, part 6) | Layers of the pilot products |
| SDS L-SAR Product File Naming Conventions, JPL D-102255 | Rev C, 19 Oct 2025 | Document of NASA/JPL | Fields of the names of the product files |
| Fielding et al. (2005), <https://doi.org/10.1029/2004JB003299> | | Article; abstract read | Method |
| Stephenson et al. (2022), <https://doi.org/10.1109/TGRS.2021.3084209>; manuscript <https://arxiv.org/abs/2105.11544> | Accepted manuscript | Article; sections II-B and VI-A and the caption of Figure 1 read | Method; time span |
| Plank (2014), <https://doi.org/10.3390/rs6064870> | | Article, open access; sections 1.3, 2, 2.1, 2.3 and 4 read | Conditions for the two pairs |
| Touzi, Lopes, Bruniquel and Vachon (1999), <https://doi.org/10.1109/36.739146> | | Article; abstract read | Spacing of the two layers |
| Yun et al. (2015), <https://doi.org/10.1785/0220150152> | | Article; extracts of a web search read | Steps that the tool does not apply |
| [GDAL](https://github.com/OSGeo/gdal) | 3.12.2 (`GDAL 3.12.2 "Chicoutimi", released 2026/02/03`) | MIT style (`LICENSE.TXT` at the tag v3.12.2) | Source program of the comparison |
| [ISCE3](https://github.com/isce-framework/isce3) | `v0.25.16` and `v0.25.21` | Apache-2.0 (`docs/research/analysis.md`, part 6) | Program that made the layers; the two versions compared |
| [dpm-rnn-public](https://github.com/olliestephenson/dpm-rnn-public) | Commit `bc4247f`, 30 Jul 2021 | MIT (file `LICENSE`) | Read; not used |
| NumPy | 2.5.4 | As `docs/research/analysis.md`, part 6 | The only library that the function uses |
| rasterio; earthaccess; h5py; harmony-py | 1.5.2; 0.19.0; 3.16.0; 1.8.0 | Not read | Reading of the layer files and of the product files, and receiving of the layers. The function does not use them |
| Matplotlib | 3.11.2 | Not read | Colours of the two ends of `RdBu` (part 3). The function does not use it |
| NISAR GUNW products of the collections `NISAR_L2_GUNW_V1` and `NISAR_L2_GUNW_PROVISIONAL_V1` | The five products of part 4.1 | NASA data (<https://doi.org/10.5067/NIL2GUNW-V1>, <https://doi.org/10.5067/NIL2GUNW-P1>, the field `productDoi` of the products) | Measurements of part 4 |

The bibliographic records of the five articles were checked against Crossref on 15 Nov 2026.

## 7. Not confirmed

1. **The two releases of the processing.** Whether ISCE3 0.25.16 (provisional collection) and ISCE3
   0.25.21 (validated collection) give the same coherence for the same pair of images. No pair of
   the pilot area exists in both collections. Part 4.2 gives what was read: the same numbers of
   looks, the same bandwidth and the same file of the formula. The tool accepts two products of
   different releases.
2. **Unequal spans.** No source that was read requires equal spans or gives a correction. The tool
   refuses unequal spans (part 3, point 4). One pair of 24 days was measured (part 4.6). Whether
   such pairs should be accepted, with a notice in the result, is a decision of the owner of the
   project; the format of a result has no field for a notice.
3. **Overlapping pairs.** For example two pairs with the same reference date. No source was found
   that compares them, and the tool refuses them. No such products of the pilot area were looked
   for.
4. **The spatial baseline.** The tool does not read it. The critical baseline of NISAR and the
   size of the effect at the baselines of part 4.2 were not read.
5. **Bias correction and histogram matching** (Yun et al., 2015). Not applied. The article was not
   read in full.
6. **The full texts.** The articles of Fielding et al. (2005) and of Touzi et al. (1999) were read
   as abstracts only. The article of Zebker and Villasenor (1992), which the sources cite for the
   temporal decorrelation, was not read. The NISAR Algorithm Theoretical Basis Document was not
   read.
7. **The legend.** The fixed range −1 to 1 was not seen in a browser. On the pilot results the 99th
   percentile of the absolute values lies between 0.28 and 0.64 (part 4.3), so most cells
   are drawn in pale colours. The choice between the fixed range and a range from the values of each
   result is for the owner of the project.
8. **The web service.** The tool was run through `lynkeus.tools.run_tool` and not through a copy of
   the web service, so the job, the stored description and the sentence of a refusal as the
   interface receives them were not seen.
9. **Other cases.** The channel VV, products of other bandwidth modes, tracks and frames, and
   other areas were not received.

## Records

The records of the measurements are in `docs/research/records/analysis/coherence-change/`:

| File | Content |
|---|---|
| `catalogue_search.json` | The search of the NASA catalogue for GUNW products of the pilot area (part 4.1) |
| `received_layers.json` | The seven layers received: request, layer description, files with SHA-256, time (part 4.1) |
| `product_metadata.json` | Selected fields of the five HDF5 product files and of their catalogue records (part 4.2) |
| `lynkeus_side.json` | The runs of the tool, directly and through `run_tool`, the statistics of the layers and the refusals (parts 4.1 and 4.3 to 4.5) |
| `comparison.json` | The comparison with the source program (part 4.3) |
| `measurements.json` | The two measurements of part 4.6 |
