# Research note: Analysis and Help tabs

| | |
|---|---|
| Part | Analysis tab and Help tab |
| Covers | The three level-1 tools: Backscatter One date, Backscatter Change, Coherence One pair |
| Written | 14 Nov 2026. Every source below was read on that day. |
| Code state | The research and the comparison were made at commit `22167b4` of `main`. The server was read at commit `0ad795b` of `main` ("Merge pull request #12 from AlexandrosLiaskos/join", 14 Nov 2026, 18:09 UTC), which holds the part of the server that calls the tools. The files of this part are the same in both commits |
| Pilot area | Lower Merrimack River: track 141, frame 67, descending (part 4) |
| Names of the tools | `backscatter-state`, `backscatter-change`, `coherence-state`, the names of the buttons in `web/src/analysis/tab.ts` |

Before a tool of this part is built, this note records for it:

1. The NISAR product specification of its input layer, with the section or page: the name of the
   layer, its unit, its value for cells without data and its masks (part 2).
2. The publication of its method, with the section or page (part 3).
3. The source program with which its result is compared, with its version (parts 3, 4 and 6).
4. The limits found, and whatever could not be confirmed (parts 3 and 7).
5. The date on which each source was read (the table above, and the tables of part 5).

The note also answers the points that the Work Plan leaves to this part (part 1), gives what was
measured on the sample files of the pilot area (part 4) and records how GIS programs offer the same
functions (part 5). The sections About and Sources at its end record the research of the two
dialogs of the Help tab. The earlier measurements of this note, made on files that were downloaded
on 31 Oct 2026, were withdrawn; no statement of this note rests on them.

## 1. Points of the Work Plan, part 11

| Point | Answer | Source |
|---|---|---|
| Whether the GCOV values are stored as power or in decibels | As linear power, normalised to gamma0. They are not in decibels. | GCOV specification, section 2.2 (gamma0) and Table 5-3 (unit `1`); the fields `outputBackscatterExpressionConvention` = `Linear power` and `outputBackscatterNormalizationConvention` = `gamma0` (the default), as ISCE3 0.25.21 writes them (`GcovWriter.py`, lines 773 to 788; `share/nisar/defaults/gcov.yaml`, line 245); ASF NISAR Cookbook, change-detection notebook, cell 23 |
| Names, units and no-data values of the layers of GCOV and GUNW | See part 2. | GCOV specification Rev F; GUNW specification Rev E; the product specification XML files of version 1.6.0; the band tags of the sample files (part 4) |
| Names, units and no-data values of the layers of SME2 | Not checked. It is due before the soil moisture tools (level 2). | |
| The source program for the comparison of each level-1 tool | The ASF NISAR Cookbook for the two backscatter tools. ISCE3, the program of the mission, for the coherence layer. See part 3. | Part 3 |

This note numbers the cells of the notebook from 0, in the order of the notebook file: cell 24 is
its 25th cell, which Jupyter shows as `In [11]`.

## 2. Layers that the three tools use

### 2.1 GCOV

Specification: NASA SDS Product Specification, Level-2 Geocoded Polarimetric Covariance (L2 GCOV),
JPL D-102274, Rev F, version 1.5.0, 8 July 2026 (copy in `research/specifications/` of the team
folder). Rev F is the latest revision that the ASF DAAC publishes (read 14 Nov 2026). The products
of the pilot area follow version 1.6.0: the product files state `productSpecificationVersion` =
`1.6.0` and `productVersion` = `1.0.20` (metadata of the granules of 21 Oct 2026 and of the GUNW
pair, read over HTTPS on 14 Nov 2026 and recorded in `research/Pilot area and sample data.md`, part
3, of the team folder). The NASA catalogue records the software of these products: ISCE3 0.25.21
(field `SASVersionId`) and PGE R05.03.2 (field `PGEVersion`). Version 1.6.0 is public as the file
`nisar_L2_GCOV.xml` (nisarqa commit `a8bc425`, folder `src/nisarqa/product_specs/1.6.0/`). It
differs from version 1.5.0 in `inputDataExceptionMask` only.

| Layer (under `/science/LSAR/GCOV/grids/frequency[A or B]/`) | Type | Unit | No data | Meaning | Place in the specification |
|---|---|---|---|---|---|
| `HHHH`, `HVHV`, `VHVH`, `VVVV`, `RHRH`, `RVRV` | Float32 | `1` | `nan` | Diagonal covariance terms: the backscatter of each channel, `valid_min` 0 | Section 2.2; Table 5-3, pages 36 to 42 (frequencyA) and 44 to 50 (frequencyB) |
| `mask` | UByte | none | `255` | `0` invalid or partially focused; `1` to `5` valid, with the number of the sub-swath from which most of the radar samples came; `255` outside the acquisition | Section 4.3.3, pages 24 and 25; Table 5-3, page 36 |
| `numberOfLooks` | Float32 | `1` | `nan` | Number of radar-grid pixels averaged for each cell | Section 4.3.2; Table 5-3, page 35 |
| `rtcGammaToSigmaFactor` | Float32 | `1` | `nan` | Factor that turns gamma0 into sigma0 | Section 4.3.1; Table 5-3, page 36 |
| `inputDataExceptionMask` | UByte in version 1.5.0; unsigned 16-bit in version 1.6.0 | none | none stated in version 1.5.0; `65535` in version 1.6.0 | Bitwise codes of anomalies of the input data; version 1.6.0 adds validity bits for each polarisation | Table 5-3, page 36 (version 1.5.0); `nisar_L2_GCOV.xml` (version 1.6.0) |

The off-diagonal terms (for example `HHHV`) are complex and are not backscatter. The spacing is
80 m, 20 m or 10 m, by the range bandwidth of the acquisition (Table 2-3). The band tags of the two
GCOV sample files state `units` = `1`, `_FillValue` = `nan` and `valid_min` = `0`, as the
specification does.

### 2.2 GUNW

Specification: NASA SDS Product Specification, Level-2 Geocoded Unwrapped Interferogram (L2 GUNW),
JPL D-102272, Rev E, version 1.2.1, 8 November 2024 (copy in `research/specifications/`). Rev E is
the revision that the ASF DAAC links (read 14 Nov 2026); no PDF of a later version was found. The
product of the pilot area follows version 1.6.0, which is public as the file `nisar_L2_GUNW.xml`
(nisarqa commit `a8bc425`, folder `src/nisarqa/product_specs/1.6.0/`).

| Layer (under `/science/LSAR/GUNW/grids/frequencyA/`) | Type | Unit | No data | Spacing | Place in the specification |
|---|---|---|---|---|---|
| `unwrappedInterferogram/[HH or VV]/coherenceMagnitude` | Float32 | `1` | `nan` | 80 m | Section 2.2; Table 3-11; pages 35 and 36 |
| `wrappedInterferogram/[HH or VV]/coherenceMagnitude` | Float32 | `1` | `nan` | 20 m | Section 2.2; Table 3-11; pages 36 and 37 |
| `unwrappedInterferogram/mask`, `wrappedInterferogram/mask` | UByte in Rev E; unsigned 32-bit in versions 1.5.0 and 1.6.0 | none | `255` | as the group | Rev E, pages 31 and 36: a three-digit number (water flag, sub-swath of the reference, sub-swath of the secondary; a digit 0 is an invalid sample). `nisar_L2_GUNW.xml`, versions 1.5.0 and 1.6.0: bits 0 to 7 hold that number, bits 8 to 15 anomaly flags of the secondary, bits 16 to 23 anomaly flags of the reference, bit 24 (unwrapped group only) the cells masked and filled in the ionospheric filtering |
| `[unwrappedInterferogram or wrappedInterferogram]/[HH or VV]/validDataMask` | unsigned 8-bit | `1` | `255` | as the group | New in version 1.6.0 (`nisar_L2_GUNW.xml`): bit 1 for the reference and bit 0 for the secondary; 1 is valid (fully focused) |

The specification gives no `valid_min` and no `valid_max` for `coherenceMagnitude`, so it does not
state the range 0 to 1.

### 2.3 Names of the product files

Document: Science Data Systems (SDS) L-SAR Product File Naming Conventions, JPL D-102255, Rev C,
19 October 2025 (copy in the team folder). Section 3.7 gives the names of GCOV and SME2 products
(pages 16 and 17) and section 3.8 those of GUNW and GOFF products (pages 18 and 19). The two forms
are the same up to the frame. The tools read these fields from the beginning of a name.

| Field | Form and values, as the document gives them |
|---|---|
| Instrument | 1 character: `L` or `S` |
| Level | 1 character: 1, 2 or 3 in section 3.7; 1 or 2 in section 3.8 |
| Processing type | `PR` Production, `UR` Urgent Response, `OD` Science On-Demand |
| Product type | 4 characters; among them `GCOV`, `SME2`, `GUNW`, `GOFF` |
| Cycle | 3 characters, zero padded, starting at 001 |
| Track | 3 characters, zero padded, 001 to 173 |
| Direction | `A` ascending, `D` descending |
| Frame | 3 characters, zero padded, 001 to 176 |

The pattern of the code accepts any digit as the level and any three digits as the track and as the
frame, which is wider than the document. It only reads the fields.

## 3. The three tools

The method sheets in `docs/methods/` give the formula, the checks and the legend of each tool. This
part records the sources behind them. Part 5 records how GIS programs offer each function.

### 3.1 Backscatter, One date

1. **Existing function.** `numpy.log10` of NumPy 2.5.4, the version that `api/pyproject.toml` fixes.
   NumPy is the only library that the three functions use. Tried with this version: the logarithm of
   0 is `-inf` with the warning "divide by zero encountered in log10", and the logarithm of a
   negative value is `nan` with the warning "invalid value encountered in log10". The tests count
   every warning as an error (`filterwarnings` in `api/pyproject.toml`), so the function takes the
   logarithm only of the cells that hold a finite value above zero.
2. **Specification and method.** Part 2.1. The GCOV files carry the formula:
   `/science/LSAR/GCOV/metadata/ceosAnalysisReadyData/outputBackscatterDecibelConversionFormula` =
   `10*log10(<GCOV_TERM>)`. The specification lists the field (Table 5-7, page 78) and not its
   value; ISCE3 writes the value as a constant (`GcovWriter.py`, lines 494 to 497, tag `v0.25.21`).
3. **Source program.** ASF NISAR Cookbook, notebook `NISAR_GCOV_SARChangeDetectionMethods.ipynb`,
   cell 24: `datacube_db = 10*np.log10(datacube)`. Commit `17b69c8` of 3 Nov 2026; the repository
   has no tag and no release. Licence Apache-2.0 (file `LICENSE`).
   <https://github.com/ASFOpenSARlab/NISAR_Cookbook/blob/17b69c87a7320610740be7f2c7e605601cb7fe43/notebooks/NISAR_GCOV_SARChangeDetectionMethods.ipynb>.
   nisarqa has the same conversion in `pow2db` (`10.0 * np.log10(power)`, file
   `src/nisarqa/processing/calc.py`, commit `a8bc425` of 30 Sep 2026).
4. **Legend.** The Cookbook draws the decibel values in grey between the 5th and the 95th percentile
   (cell 26). nisarqa clips its backscatter images to the same percentiles by default
   (`percentile_for_clipping`, default `(5.0, 95.0)`, file
   `src/nisarqa/parameters/rslc_caltools_params.py`). No fixed range in decibels was found in these
   sources, so the sheet gives the rule and no fixed numbers. Cell 26 takes its percentiles over all
   dates of the data cube of the notebook. The tool receives one date and applies the same line to
   that date (part 4.2).
5. **Rules of the code.** A cell is no data where the input is `nan`, zero, negative or infinite.
   The tool refuses an input that is not one diagonal covariance term of one GCOV product file with
   the unit `1` and one date, a layer whose description does not hold the name of its layer inside
   the product, a result without any value and a legend without a range. A refusal is raised as
   `lynkeus.writing.LayerError` with one sentence for the visitor. The method sheet lists the refusals. Part 7,
   point 10, gives what the server does with a refusal.
6. **Limits.**
   1. The tool does not read the `mask` layer, and the statements of the notebook apply no mask.
      Part 4.4 gives the evidence of the pilot area and what it does not show. In `main` at commit
      `0ad795b` the Data part offers the mask as a layer of its own and does not apply it to the
      terms (`api/src/lynkeus/harmony.py`, line 291).
   2. The name of the layer inside the product is the field `layer` of the layer description
      (`LayerDescription` in `api/src/lynkeus/layers.py`), added on 15 Nov 2026. `_get_layer` gives
      it the name of the layer request (`LayerRequest.layer`), and `write_layer` writes it into the
      description and, as the field `name` of the band, into the STAC record. STAC 1.1.0 defines
      the name of a band as "typically the name the data provider uses for the band" (common
      metadata, Band Object,
      <https://github.com/radiantearth/stac-spec/blob/v1.1.0/commons/common-metadata.md#band-object>,
      read 15 Nov 2026). A result of a tool has no name. A description that was stored before the
      field existed is read with the value `None`, and the tools refuse such a layer with a
      sentence that asks the visitor to receive it again. The tool accepts the six diagonal terms of
      Table 5-3 of the specification, which have the type Float32, and refuses every other name;
      the seven other terms of the table have the type CFloat32. The field does not name the
      frequency: the Data part receives the layers of the group `frequencyA` only (`_GROUPS` in
      `api/src/lynkeus/harmony.py`). Part 3.4 gives the refusals and what was tried.
   3. The range of the legend is computed for each result. Two dates then have different ranges
      (part 4.2), which matters when two dates are compared side by side.
   4. The layer `inputDataExceptionMask` is not used.

### 3.2 Backscatter, Change

1. **Existing function.** `numpy.divide`, `numpy.log10` and `numpy.quantile` of NumPy 2.5.4. With
   its percentiles in a list, `numpy.quantile` interpolates 32-bit values in 64-bit numbers, as the
   source program does; with one percentile as a Python number it returns a 32-bit number (part
   4.3).
2. **Method.** Rignot and van Zyl (1993), <https://doi.org/10.1109/36.239913>. Its abstract states
   that the ratio of the intensities of two dates is better adapted to the statistics of radar data
   than their difference, and that it works best when the number of looks is large. The full text
   was not read.
3. **Source program.** The same notebook, cell 56: `ratio_dB = 10 * np.log10(date_1 / date_0)`,
   where `date_0` is the earlier date. Its text calls the result "the log ratio in dB, corresponding
   to the difference in dB" (cell 55).
4. **Legend.** The Cookbook draws the ratio with the scale `RdBu` between minus and plus the 99th
   percentile of its absolute value (cell 59). In `RdBu` of Matplotlib 3.11.2 the lowest value is
   dark red and the highest dark blue (tried on 14 Nov 2026). The notebook uses −2 dB as an example
   of a threshold; the sheet sets no threshold. Parts 5.5 and 5.7 give the research on the colours.
5. **Rules of the code.** A cell is no data where either input is `nan`, zero, negative or infinite,
   or where the ratio is beyond the range of 32-bit numbers. The tool refuses inputs that are not
   two diagonal covariance terms of GCOV product files with the unit `1` and one date each, two
   arrays of different size, two different terms, two products that are not of the same instrument,
   track, direction and frame, a first layer that is not of the earlier date, a result without any
   value and a legend without a range.
6. **Limits.**
   1. The tool does not resample. The function receives no coordinates. In `main` at commit
      `0ad795b`, `run_tool` reads the layers and refuses layers whose grids differ in projection,
      transform, width or height, before it calls the tool (`api/src/lynkeus/tools.py`, lines 82 to
      89; `Grid` in `api/src/lynkeus/writing.py`, lines 71 to 92). The GCOV specification does not
      state that two products of one track and frame share one grid (Appendix B, page 89, says that
      the projection of a frame is held constant).
   2. The tool compares the names of its two layers inside their products (limit 2 of part 3.1) and
      refuses two different terms, for example `HHHH` with `HVHV`. It compares the instrument (`L`
      or `S`) of the two file names together with the track, the direction and the frame. The two
      terms are of the same frequency, because the Data part receives the group `frequencyA` only.
   3. The tool does not read the masks (part 4.4).
   4. A ratio that 32-bit numbers hold only as a subnormal number (below 1.18e-38, a change below
      −379.3 dB) gives a value with few digits. The review of the first version of the code measured
      differences of up to 3.0096 dB from the 64-bit formula in such cells. The lowest change of the
      pilot pair is −37.06 dB.
   5. On the pilot pair, twelve days apart, the 5th and the 95th percentile of the change are
      −4.30 dB and 4.27 dB (part 4.3). This is the variation between two dates of that area.

### 3.3 Coherence, One pair

1. **Existing function.** None is needed: the result is the input array itself.
2. **Specification and method.** Part 2.2. The GUNW specification names the layer "normalized
   interferometric coherence magnitude" (section 2.2) and gives no formula. The formula was read in
   the source code of ISCE3 at the version that the NASA catalogue records for the product of the
   pilot area (`SASVersionId` = `ISCE3 0.25.21`): file `cxx/isce3/signal/Crossmul.cpp`, lines 368 to
   373, tag `v0.25.21`.
   <https://github.com/isce-framework/isce3/blob/v0.25.21/cxx/isce3/signal/Crossmul.cpp#L368-L373>.
   The file is identical at tag `v0.25.16`. Touzi et al. (1999),
   <https://doi.org/10.1109/36.739146>: the abstract states that the space-averaged coherence
   magnitude is biased toward higher values and that a coarser resolution gives a more accurate
   estimate. Zebker and Villasenor (1992), <https://doi.org/10.1109/36.175330>: the abstract states
   that several sources contribute to the correlation of the echoes and that one term describes the
   change of the surface. The full texts were not read.
3. **Source program.** ISCE3 produced the layer. Licence Apache-2.0 (file `LICENSE` at tag
   `v0.25.21`). The comparison of D-17 is the identity of the result with the layer as NASA Harmony
   delivered it (part 4.5). On 15 Nov 2026 the layer of the original HDF5 product file was compared
   for the whole rectangle of the sample: the 3,579,092 cells that hold a value in the sample equal
   the product bit for bit (`step4_record.json`).
4. **Legend.** nisarqa draws the coherence magnitude in grey from 0 to 1 (`cmap="gray"`, `vmin=0.0`,
   `vmax=1.0`; files `src/nisarqa/processing/insar/unwrapped_coh_mag.py` and
   `wrapped_phase_image_and_coh_mag.py`, commit `a8bc425`).
5. **Rules of the code.** The tool refuses an input that is not one of the four layers
   `coherenceMagnitude` of one GUNW product file with the unit `1` and two dates, a layer whose
   description does not hold the name of its layer inside the product, a layer without any value,
   and a layer with a value outside 0 to 1. One such cell refuses the whole layer.
6. **Limits.**
   1. The GUNW layers `mask` and `validDataMask` are not used. Part 2.2 gives their meaning.
   2. The workflow `python/packages/nisar/workflows/crossmul.py` of ISCE3 0.25.21 (lines 65 and 67)
      creates `isce3.signal.Crossmul`, the class of the formula, or `isce3.cuda.signal.Crossmul`.
      Which of the two the mission runs, and how the 80 m layer is derived, was not traced.
   3. The tool reads the name of the layer inside the product (limit 2 of part 3.1). It accepts the
      four layers `coherenceMagnitude` that the specification lists (pages 35 to 37): those of the
      unwrapped and of the wrapped interferogram, for the channels HH and VV. Part 3.4 gives what
      was tried.

### 3.4 Layers that the tools refuse by their names

A tool reads the kind, the product file, the name of the layer inside the product, the unit and the
number of dates of a layer (method sheets, section What the tool refuses). The Data part offers
more layers with the unit `1` than the tools read (`_layers`, `_interferogram_layers` and `_offsets`
in `api/src/lynkeus/harmony.py`):

| Product | Layer | Unit | Read by |
|---|---|---|---|
| GCOV | The terms `HHHH`, `HVHV`, `VHVH` and `VVVV` | `1` | `backscatter-state`, `backscatter-change` |
| GCOV | `rtcGammaToSigmaFactor` | `1` | No tool |
| GCOV | `numberOfLooks` | `1` | No tool |
| GCOV | `mask` | `1` | No tool |
| GUNW | `coherenceMagnitude` of the unwrapped interferogram (80 m) and of the wrapped interferogram (20 m) | `1` | `coherence-state` |
| GUNW | `connectedComponents` of the unwrapped interferogram | `1` | No tool |
| GUNW | `correlationSurfacePeak` of the pixel offsets, with the legend 0 to 1 | `1` | No tool |

The other layers of a GUNW product that the Data part offers carry the unit `rad` or `m`. The
layers of GOFF and SME2 products are refused by the check of the product file.

All layers of the table carry the kind, the product file, the unit and the number of dates that a
tool expects. A tool tells them apart by the field `layer` of the layer description (part 3.1,
limit 2), and it refuses a layer that it does not read with one sentence for the visitor.

The tests of `api/tests/analysis/` call the three functions with made-up arrays and with
descriptions that carry the field. They cover, for the two backscatter tools, each of the six
diagonal terms (accepted) and the names `mask`, `numberOfLooks`, `rtcGammaToSigmaFactor`, `HHHV`,
`HHVV`, `inputDataExceptionMask` and `hhhh` (refused); for Backscatter, Change, two different terms
and two products that differ in the instrument, the track, the direction or the frame; for
Coherence, One pair, the four layers `coherenceMagnitude` (accepted) and eleven other names, among
them `unwrappedInterferogram/HH/connectedComponents` and `pixelOffsets/HH/correlationSurfacePeak`
(refused); and, for all three tools, a description without the field.

On 15 Nov 2026 the refusals were tried through the web service, as jobs on layers that the process
`get-layer` had received for the pilot area (part 4.7). Each job failed, and its message was the
sentence below. The record is `jobs.json`.

| Tool | Input layers | Message of the failed job |
|---|---|---|
| `backscatter-state` | GCOV `mask` of 21 Oct 2026 | The layer "Mask of valid samples, 21 Oct 2026" is the layer mask of its product, and the tool reads a diagonal covariance term (HHHH, HVHV, VHVH, VVVV, RHRH or RVRV). |
| `backscatter-state` | GUNW `wrappedInterferogram/HH/coherenceMagnitude` | The layer "Coherence HH, 20 m, 9 Oct 2026 to 21 Oct 2026" is not a layer received from one NISAR GCOV product. |
| `backscatter-state` | The result of `backscatter-state` for 21 Oct 2026 | The layer "Backscatter HH in dB, 21 Oct 2026" is not a layer received from one NISAR GCOV product. |
| `backscatter-state` | `HHHH` of 21 Oct 2026 and `HHHH` of 2 Nov 2026 | The number of input layers must be 1, and it is 2. |
| `backscatter-state` | `HHHH` of 2 Nov 2026, with the field `layer` taken out of its stored description | The layer "Backscatter HH, 2 Nov 2026" does not record which layer of its product it is; receive it again with Get layer. |
| `backscatter-change` | `HHHH` of 2 Nov 2026, then `HHHH` of 21 Oct 2026 | The first layer must be of an earlier date than the second. |
| `backscatter-change` | `HHHH` of 21 Oct 2026, then `HVHV` of 2 Nov 2026 | The two layers are not the same covariance term: the first is HHHH and the second is HVHV. |
| `backscatter-change` | `mask` of 21 Oct 2026, then `HHHH` of 2 Nov 2026 | The layer "Mask of valid samples, 21 Oct 2026" is the layer mask of its product, and the tool reads a diagonal covariance term (HHHH, HVHV, VHVH, VVVV, RHRH or RVRV). |
| `backscatter-change` | `HHHH` of 21 Oct 2026 alone | The number of input layers must be 2, and it is 1. |
| `backscatter-change` | `HHHH` of 21 Oct 2026, then `HHHH` of 2 Nov 2026 without the field `layer` | The layer "Backscatter HH, 2 Nov 2026" does not record which layer of its product it is; receive it again with Get layer. |
| `coherence-state` | GCOV `HHHH` of 21 Oct 2026 | The layer "Backscatter HH, 21 Oct 2026" is not a layer received from one NISAR GUNW product. |
| `coherence-state` | GUNW `unwrappedInterferogram/HH/connectedComponents` | The layer "Connected components HH, 9 Oct 2026 to 21 Oct 2026" is the layer unwrappedInterferogram/HH/connectedComponents of its product, and the tool reads the layer coherenceMagnitude. |

Three further refusals of the same trial come from the server and not from a tool. `run_tool`
refused `HHHH` of 21 Oct 2026 with the coherence layer for Backscatter, Change with the sentence
"The layers of the analysis do not have the same grid.", and the name of a layer that the session
does not hold with "A layer of the analysis no longer exists." The web service refused a request
that gives one layer twice, before it made a job, with the status 400 and the sentence "The input
inputs is not valid: a layer is given more than once."

For the layer without the field, the trial took the field `layer` out of the description of a
received layer in the record file of the private copy of the service, and put it back afterwards.
No layer that an earlier version of Lynkeus had stored was at hand. The service listed that layer
without the field (`GET /api/layers` returns the stored description), and the interface reads such
a description (`isLayerDescription` in `web/src/shared/layer.ts`).

Not tried through the service: the terms `VHVH`, `VVVV`, `RHRH` and `RVRV`; the layers
`numberOfLooks`, `rtcGammaToSigmaFactor` and `correlationSurfacePeak`; and two products of
different instruments, tracks, directions or frames, because `run_tool` compares the grids of two
layers before it calls a tool and no two such layers on one grid were received.

## 4. What was measured on real files

The files are the three sample files of the pilot area: the lower Merrimack River, box −71.20,
42.60, −70.75, 42.95 (west, south, east, north), track 141, frame 67, descending. NASA Harmony
delivered each file as a GeoTIFF clipped to the box, from a product of a validated collection
(`NISAR_L2_GCOV_V1`, `NISAR_L2_GUNW_V1`). The file `samples.json` of the team folder lists them.
Every number of this part is copied from a record that the repository keeps in
`docs/research/records/analysis/`.

| Record | SHA-256 | What it holds |
|---|---|---|
| `comparison.json` | `30e521ff531e756accf16544ec15a08c8bc5f49cc0f4236a449e88542e714944` | The comparison of the three tools with the source program, made on 15 Nov 2026 (parts 4.1 to 4.3, 4.5 and 4.6) |
| `source_side.json` | `7c36dc764d2d2f59c1dffaeeaa564723c40b56fd004a99c16243000aafa96f1a` | The statements of the notebook that this comparison executed, and their environment |
| `lynkeus_side.json` | `8581930514ecb74432b701e5b4b14a6cb3a770b3e5e91b7e6de60f8285788a2d` | The sample files and the results of the three tools in this comparison |
| `mask_measurement.json` | `2d1c6263edff0ad3ba1d12ebca0a769dd2f8121c4e604eba8d8ba69cee77e79c` | The mask files of the two sample products against the `HHHH` samples, measured on 15 Nov 2026 (part 4.4) |
| `step4_record.json` | `48a526504006e4e668470b8994e848c74d77abbbd51940c4ce341f3012a659f9` | The layers `HHHH`, `mask` and `coherenceMagnitude` and the metadata fields of the three product files (HDF5), read at the ASF DAAC on 15 Nov 2026 and compared with the sample files (parts 4.4 and 4.6). The paths that it holds under `/data/work/` are values of the metadata of the products |
| `step4b_record.json` | `6f3e1d07992d10491f20a9de4dfc894b603ebff824cd480e835626367d2a650e` | The cells that NASA Harmony emptied in the samples and in the mask files, against the box of the request (parts 4.4 and 4.6) |
| `samples_check.json` | `9f6b7bbf1d1a8efae017bff701cf91bf80695df217e5100089b685e56f4bf88e` | The three tools of the branch `analysis` on the sample files, against the arrays of the comparison of 14 Nov 2026 (part 4.6) |
| `jobs.json` | `a5b09d9d04e4e0b5ca94531e55b66ceaa30836bcc8db5f79f8c65d9731855929` | The jobs of the first run of the tools through the web service, on 15 Nov 2026 (parts 3.4 and 4.7). The field `service`, the address of the private copy of the service, was removed from the stored copy |
| `jobs_check.json` | `c96ef649c32d94535702be913e539886d214e5ae9e5b5e1149c93762e32c95c7` | The files and the records that these jobs wrote, read back (part 4.7) |

The measurements of parts 4.1 to 4.5 were first made on 14 Nov 2026 and were repeated on 15 Nov
2026 with a second set of scripts, written separately (part 4.6). The records of 14 Nov 2026 are
not kept in the repository. All measurements were made at full resolution.

### 4.1 The sample files

| File | SHA-256 | Layer and product file |
|---|---|---|
| `gcov-hhhh-20261021.tif` | `e808a7bfed69c0bd1eabc38faae539bae7aaadd81c86b1bf963900c996dffb84` | `HHHH` of `NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001.h5` |
| `gcov-hhhh-20261102.tif` | `f9d950ad3b30c07d6d77a3f63d1dd4c106fa1b775982c0834c35e715ac91ac43` | `HHHH` of `NISAR_L2_PR_GCOV_034_141_D_067_4005_DHDH_A_20261102T234330_20261102T234405_P05036_N_F_J_001.h5` |
| `gunw-coherence-20261009-20261021.tif` | `e02cb42feeae25a9420c6298a98b59583b0f3a3e70cd0cba5241be484ea1de81` | `coherenceMagnitude` of `NISAR_L2_PR_GUNW_032_141_D_067_033_4000_SH_20261009T234330_20261009T234405_20261021T234330_20261021T234405_P05036_N_F_J_001.h5` |

| Measure | `gcov-hhhh-20261021.tif` | `gcov-hhhh-20261102.tif` | `gunw-coherence-20261009-20261021.tif` |
|---|---|---|---|
| Columns by rows | 3772 by 3972 | 3772 by 3972 | 1886 by 1985 |
| Size of a cell | 10 m | 10 m | 20 m |
| Projection | EPSG:32619 | EPSG:32619 | EPSG:32619 |
| Cells | 14,982,384 | 14,982,384 | 3,743,710 |
| Cells with `nan` | 665,971 | 665,968 | 164,618 |
| Cells with a value | 14,316,413 | 14,316,416 | 3,579,092 |
| Cells that are zero, negative, infinite | 0, 0, 0 | 0, 0, 0 | 0, 0, 0 |
| Lowest value | `0.0006908252835273743` | `0.0011148601770401` | `0.004557579755783081` |
| Highest value | `3504.90625` | `3488.90625` | `0.9964798092842102` |

The SHA-256 of each file, its lowest and highest value and its number of cells with a value equal
those of `samples.json`. No sample holds a zero, a negative or an infinite cell. The two GCOV files
have the same grid.

Each file is the rectangle in the projection that encloses the requested box. NASA Harmony fills
the cells whose centre lies outside the box with the no-data value: 665,944 cells of the 10 m grid
and 164,618 cells of the 20 m grid. Of the cells with `nan` of the GCOV files, 665,942 hold a value
in the product; the others (29 on 21 Oct 2026, 26 on 2 Nov 2026) hold `nan` in the product as well
(`step4_record.json`, `step4b_record.json`).

### 4.2 Backscatter, One date

| Measure | 21 Oct 2026 | 2 Nov 2026 |
|---|---|---|
| Cells with a value in the result of the tool and of the source program | 14,316,413 | 14,316,416 |
| Cells with `nan` in both | 665,971 | 665,968 |
| Cells with a value in one result only | 0 and 0 | 0 and 0 |
| Largest difference, tool minus source program (dB) | `0.0` | `0.0` |
| Cells with a difference | 0 | 0 |
| Lowest and highest value of the result (dB) | `-31.606319427490234`, `35.4467658996582` | `-29.52779769897461`, `35.42689514160156` |
| Median of the result (dB) | `-6.749910354614258` | `-6.594919204711914` |
| Legend of the tool: 5th and 95th percentile (dB) | `-17.824283599853516`, `-0.8974864482879639` | `-18.472387313842773`, `-0.731230616569519` |
| Legend of the source program, cell 26 on this date alone (dB) | `-17.824283599853516`, `-0.8974864482879639` | `-18.472387313842773`, `-0.731230616569519` |
| Tool minus source program, this date alone (dB) | `0.0`, `0.0` | `0.0`, `0.0` |
| Legend of the source program, cell 26 as written, over both dates (dB) | `-18.15253448486328`, `-0.8111261129379272` | the same |
| Tool minus source program, both dates (dB) | `0.3282508850097656`, `-0.08636033535003662` | `-0.3198528289794922`, `0.0798954963684082` |
| Largest difference of the result from the formula in 64-bit numbers (dB) | `4.0759852240057626e-06` | `4.0759852240057626e-06` |

The arrays of the tool and of the source program are bit-identical on both dates. The legend of the
tool equals the quantile line of cell 26 applied to one date. The legend of cell 26 as written, over
both dates, belongs to no Lynkeus tool. The difference from the formula in 64-bit numbers is that of
32-bit arithmetic, which the source program has as well.

### 4.3 Backscatter, Change

| Measure | 21 Oct 2026 to 2 Nov 2026 |
|---|---|
| Cells with a value in the result of the tool and of the source program | 14,316,405 |
| Cells with `nan` in both (an input is `nan`) | 665,979 |
| Cells with a value in one result only | 0 and 0 |
| Largest difference, tool minus source program (dB) | `0.0` |
| Cells with a difference | 0 |
| Lowest and highest value of the result (dB) | `-37.05588150024414`, `31.312570571899414` |
| 5th percentile, median and 95th percentile of the result (dB) | `-4.303584289550781`, `0.03496593236923218`, `4.265582275390623` |
| Legend of the tool: 99th percentile of the absolute values (dB) | ±`7.168050689697264` |
| Legend of the source program, `dynamic_range` of cell 59 (dB) | `7.168050689697264` |
| Tool minus source program (dB) | `0.0` |
| The two sorted absolute values of the result around the 99th percentile (dB) | `7.168048858642578`, `7.168050765991211` |
| 99th percentile of the absolute values of the formula in 64-bit numbers (dB) | `7.168050660909336` |
| Largest difference of the result from the formula in 64-bit numbers (dB) | `4.001166438172277e-06` |

The arrays of the tool and of the source program are bit-identical, and the legend of the tool
equals `dynamic_range`. The 99th percentile lies between two different sorted values, so its value
depends on the numbers in which numpy interpolates. The first version of the code gave the
percentile as one Python number. numpy 2.5.4 then returns a 32-bit number, and the first run of the
comparison found a difference of 7.629394715991111e-08 dB from the source program. The code
therefore gives the percentile in a list: numpy then interpolates in 64-bit numbers, as the source
program does, and the difference is 0.0 dB.

### 4.4 The GCOV mask

The layer `/science/LSAR/GCOV/grids/frequencyA/mask` of the two sample products was received from
NASA Harmony with harmony-py 1.8.0, for the same collection, box and format as the samples. Harmony
delivered one GeoTIFF for each product, of the type uint8, with the no-data value 255, on the grid
of the `HHHH` sample of its date: the same size, transform, projection and bounds.

| | 21 Oct 2026 | 2 Nov 2026 |
|---|---|---|
| Granule | `G4405194348-ASF` | `G4408709868-ASF` |
| Harmony job | `d8be36ac-42b3-4f25-871e-7554cd9ccc1c` | `65a3eaaa-10a0-4e58-adc4-8756a97700f1` |
| SHA-256 of the mask file | `63513f354b619e6fd3378861c6833a46b2b3ae9bf594e5c7cbd16797fd707acf` | `b97a766ebeb92ecdc564989f285b261c5ef6210ecefc66bf3f08c1eb121f9224` |
| Cells with mask `0` | 27 | 24 |
| Cells with mask `1` | 14,316,413 | 14,316,416 |
| Cells with mask `2` to `5` | 0 | 0 |
| Cells with mask `255` | 665,944 | 665,944 |
| Cells with mask `0` that hold `nan` in `HHHH` | 27 | 24 |
| Cells with mask `255` that hold `nan` in `HHHH` | 665,944 | 665,944 |
| Cells with a value of `HHHH` where the mask is `0` or `255` | 0 | 0 |
| Cells with `nan` in `HHHH` where the mask is `1` to `5` | 0 | 0 |
| Cells of `HHHH` below −40 dB | 0 | 0 |
| Cells that the mask would turn into no data, One date | 0 | 0 |
| Band tag `min_value` of the `HHHH` sample | `1.6706227e-16` | `7.2686074e-17` |
| Band tag `max_value` of the `HHHH` sample | `51839.094` | `24645.711` |

1. On both dates the cells of `HHHH` without data are exactly the cells with mask `0` or `255`.
   The 665,944 cells with the value `255` are not cells outside the acquisition. They are the cells
   of the file whose centre lies outside the requested box, which NASA Harmony fills with the
   no-data value. In the product files these cells hold the mask `1` (665,942 cells) or `0` (2
   cells), and no cell of the rectangle holds `255` (table below).
2. In the mask files of Harmony, inside the box, 16 cells have mask `0` on both dates, and the
   masks differ between the two dates in 19 cells. Of the 14,316,405 cells with mask `1` on both
   dates in these files, all hold a value of the change; 0 cells hold a value of the change where
   either mask is `0` or `255` (`mask_measurement.json`, `step4b_record.json`).
   In the product files, over the whole rectangle, the pairs of mask values are `0`, `0` in 16
   cells; `0`, `1` in 13; `1`, `0` in 10; and `1`, `1` in 14,982,345, all of which hold a value of
   the change. The masks of the product differ in 23 cells (`step4_record.json`).
3. Applying the mask would turn 0 cells of the change into no data. No legend of the pilot area
   would change.
4. The band tags `min_value` and `max_value` lie outside the range of the values of the box (part
   4.1). They are attributes of the layer `HHHH` in the product file, where the layer has 36,072
   by 35,640 cells: `min_value` is `1.6706226695065618e-16` and `max_value` is `51839.09375` on
   21 Oct 2026, and `7.268607434326375e-17` and `24645.7109375` on 2 Nov 2026
   (`step4_record.json`). The files of the box carry the same values as band tags. The frame
   therefore holds values far below any value of the box.

The layers were also read from the two product files (HDF5) at the ASF DAAC on 15 Nov 2026, over
the rectangle of each sample (`step4_record.json`, `step4b_record.json`).

| | 21 Oct 2026 | 2 Nov 2026 |
|---|---|---|
| Cells of the rectangle | 14,982,384 | 14,982,384 |
| Cells with mask `0` in the product; with mask `1` | 29; 14,982,355 | 26; 14,982,358 |
| Cells with mask `0` in the product that hold `nan` in `HHHH` of the product | 29 | 26 |
| Cells with a value of `HHHH` in the product where its mask is `0` | 0 | 0 |
| Cells with `nan` in `HHHH` of the product where its mask is `1` | 0 | 0 |
| Cells with a value in the product and no data in the `HHHH` sample | 665,942 | 665,942 |
| Of these, cells whose centre lies outside the box of the request | 665,942 | 665,942 |
| Cells with `255` in the mask file of Harmony; of these, with mask `0` in the product | 665,944; 2 | 665,944; 2 |
| Cells with `255` in the mask file whose centre lies inside the box | 0 | 0 |
| Other cells of the mask file that differ from the mask of the product | 0 | 0 |
| Fields `validSamplesSubSwathMaskingApplied` and `shadowMaskingApplied` of the product | `False`, `False` | `False`, `False` |
| Field `/science/LSAR/identification/isDithered` of the product | `True` | `True` |

In these two products every cell with mask `0` holds `nan` in `HHHH` in the product file itself.
Harmony emptied the cells whose centre lies outside the box of the request and no other cell, in
the samples and in the mask files; inside the box its mask files equal the mask of the product.

What the evidence does not show:

1. That the mask is unnecessary elsewhere. It is one box on a coast, two dates of one track and
   frame, and the term `HHHH` of frequency A only.
2. How `HHHH` behaves where sub-swaths meet. The only valid value in the box is `1`. Section 4.3.3
   of the specification (page 25) says that a product of an acquisition with dithered pulse
   repetition frequency holds one sub-swath, so that the valid part of its mask is 1; the field
   `isDithered` of both products reads `True`. These products therefore hold no boundary between
   sub-swaths.
3. Why the product holds `nan` in the cells with mask `0`. The two masking fields read `False` on
   both dates; which step of the processing sets these cells was not read.
4. Anything about provisional products.
5. The reduced copies (overviews) inside the mask files, which were not examined.

NASA Harmony lists 20 variables for the collection `NISAR_L2_GCOV_V1`, among them the mask of
frequency A and of frequency B, and 23 variables for `NISAR_L2_GUNW_V1`, among them the three `mask`
layers and the four `coherenceMagnitude` layers (lists saved on 14 Nov 2026).

### 4.5 Coherence, One pair

| Measure | 9 Oct 2026 and 21 Oct 2026 |
|---|---|
| Cells | 3,743,710 |
| Cells with `nan` | 164,618 |
| Cells with a value | 3,579,092 |
| Lowest and highest value | `0.004557579755783081`, `0.9964798092842102` |
| Cells above 1; cells below 0 | 0; 0 |
| 5th and 95th percentile | `0.16716375276446344`, `0.766340959072113` |
| Cells of the result that differ from the values of the sample file | 0 |
| Legend | `0.0` to `1.0` |

The result is bit-identical to the values of the sample file, and it is the input array itself. On
15 Nov 2026 the layer of the original HDF5 product file was compared for the whole rectangle of the
sample: the 3,579,092 cells that hold a value in the sample equal the product bit for bit
(`step4_record.json`).

### 4.6 How the comparison was run

The comparison was made twice, with two sets of scripts that were written separately, and both
gave the same result: the arrays of the tools and of the source program are bit-identical and the
legends are equal. The first run was made on 14 Nov 2026; its record is not kept in the
repository. The table describes the second run, of 15 Nov 2026, from its records
(`comparison.json`, `source_side.json`, `lynkeus_side.json`).

| | |
|---|---|
| Platform | `Linux-6.8.0-146-generic-x86_64-with-glibc2.41`, Python 3.13.18 on both sides |
| Lynkeus | The three functions of this part, with numpy 2.5.4 and pydantic 2.14.3. The files were read with rasterio 1.5.2 (GDAL 3.12.2) |
| Source program | The notebook at commit `17b69c87a7320610740be7f2c7e605601cb7fe43` (SHA-256 of the file `a6373e20921ab15989c82aa1f13d7c4d93eea87e4a5981f12d3a0f48af92cc7f`, 74 cells). Statements of the cells 11, 12, 13, 16, 24, 26, 54, 56, 58 and 59 were executed |
| Statements replaced | Cell 11 opens HDF5 product files; the two GeoTIFF samples were opened with `rioxarray.open_rasterio` in its place. Cell 12 reads the time from the name of the product file; the names of `samples.json` were given. The statement of cell 13 that reads the projection was not executed. Cell 16: the term `HHHH` in place of `HVHV`, and the whole box without the window of 3000 by 3000 cells. Cell 54: the dates of the samples. The quantile line of cell 26 was also executed on each date alone |
| Environment of the source program | numpy 2.5.3, xarray 2026.7.0, dask 2025.12.0, rioxarray 0.22.0, rasterio 1.4.4 (GDAL 3.10.3), matplotlib 3.11.2; 29 packages in all |
| Input of both sides | The same values: the record states that the inputs are equal on both sides for both dates. The statements were executed twice, with the cube as dask arrays (`chunks="auto"`) and in memory, and the two variants gave the same arrays and the same legends |

On 15 Nov 2026 the three functions of the branch `analysis`, with the checks of the name of the
layer, were also run on the sample files in the image of the web service (commit `d9d54d5`, numpy
2.5.4). The SHA-256 of each result array and each legend equal those of the first run, and each
backscatter array is bit-identical to the array of the source program of that run
(`samples_check.json`).

What the comparison does not show:

1. The cells in which the tools give no data and the source program does not. The samples hold no
   zero, negative or infinite cell, and no pair of cells whose ratio 32-bit numbers cannot hold. The
   tests of `api/tests/analysis/` cover these cells on made-up grids.
2. The source program on the HDF5 product files that the notebook opens: it was given the GeoTIFF
   samples. The values of the samples were compared with the product files on 15 Nov 2026
   (`step4_record.json`): every cell that holds a value in a sample holds the same value in the
   product file, with a largest difference of 0.0, for 14,316,413 cells (`HHHH`, 21 Oct 2026),
   14,316,416 cells (`HHHH`, 2 Nov 2026) and 3,579,092 cells (`coherenceMagnitude` at 20 m). The
   other cells of each sample hold no data; the product holds a value in 665,942, 665,942 and
   164,618 of them, and the centre of each of these lies outside the box of the request
   (`step4b_record.json`).
3. The conda-forge builds of the lock file of the Cookbook and its Python 3.13.0, which were not
   used.
4. Other areas and dates. One pair of dates and one area were compared.

### 4.7 The first jobs of the tools through the web service

On 15 Nov 2026, from 06:48 to 06:55 UTC, the three tools ran as jobs of a private copy of the web
service. The copy was a container of the image built from `api/` of the branch `analysis` at commit
`d9d54d5`, with the settings of `compose.yaml` (read-only file system, user 10001, init process,
2 gigabytes of memory), one processor, a data folder of its own and a port bound to the machine
itself. A program signed in to the service with a user token of the Earthdata account of the
server, started every job with `POST /api/processes/<name>/execution` and read its state and its
result from `/api/jobs/`. The records are `jobs.json` and `jobs_check.json`.

The process `get-layer` received six layers for the box −71.20, 42.60, −70.75, 42.95.

| Layer (field `layer`) | Product | Time of the job, from its start | Cells without data | Against the sample file |
|---|---|---|---|---|
| `HHHH` | GCOV of 21 Oct 2026 | 121 s | 665,971 of 14,982,384 | Same grid; 0 cells differ |
| `HHHH` | GCOV of 2 Nov 2026 | 120 s | 665,968 of 14,982,384 | Same grid; 0 cells differ |
| `wrappedInterferogram/HH/coherenceMagnitude` | GUNW of 9 to 21 Oct 2026 | 63 s | 164,618 of 3,743,710 | Same grid; 0 cells differ |
| `HVHV` | GCOV of 2 Nov 2026 | 107 s | 665,968 of 14,982,384 | No sample |
| `mask` | GCOV of 21 Oct 2026 | 88 s | 665,944 of 14,982,384 | No sample |
| `unwrappedInterferogram/HH/connectedComponents` | GUNW of 9 to 21 Oct 2026 | 47 s | 9,923 of 233,616 | No sample |

Each description carries the name of the layer in the field `layer`, and each STAC record carries
it as the `name` of the band. Each file is valid for `cog_validate` in strict mode, and each record
is valid against the schemas of STAC 1.1.0 and of its extensions.

The four jobs of the tools ended as `successful`.

| | Backscatter, One date, 21 Oct 2026 | Backscatter, One date, 2 Nov 2026 | Backscatter, Change | Coherence, One pair |
|---|---|---|---|---|
| Time of the job, from its start | 19 s | 18 s | 15 s | 9 s |
| Size of the file (bytes) | 62,855,703 | 62,921,256 | 69,599,539 | 15,194,288 |
| Cells with a value; without data | 14,316,413; 665,971 | 14,316,416; 665,968 | 14,316,405; 665,979 | 3,579,092; 164,618 |
| Cells that differ from the array of the comparison (part 4.6) | 0 | 0 | 0 | 0 |
| Cells that differ from the array of the source program | 0 | 0 | 0 | not applicable |
| `unit` | dB | dB | dB | `1` |
| `range` | `-17.824283599853516`, `-0.8974864482879639` | `-18.472387313842773`, `-0.731230616569519` | `-7.168050689697264`, `7.168050689697264` | `0.0`, `1.0` |
| `colours` | `grey` | `grey` | `RdBu` | `grey` |
| `dates` | 2026-10-21 | 2026-11-02 | 2026-10-21, 2026-11-02 | 2026-10-09, 2026-10-21 |
| Reduced copies (factors) | 2, 4, 8 | 2, 4, 8 | 2, 4, 8 | 2, 4 |

For each result, the SHA-256 of the values read back from the file equals that of the comparison;
the grid is that of the input layers; `inputs` holds the product files of the input layers;
`method`, `quantity`, `unit`, `range` and `colours` are those that the function returns; the field
`layer` is null; the band of the record has the unit of the result, the no-data value `nan` and no
`name`; the links `derived_from` of the record lead to the records of the input layers, in their
order; the file is valid for `cog_validate` in strict mode; and the record is valid against the
schemas.

The reduced copies (overviews) of a result are made by `write_layer` with the resampling `AVERAGE`
of GDAL, as for a received layer, because `run_tool` does not say otherwise. For a result in
decibels this averages decibel values, and `write_layer` states in its documentation string that
the values averaged for a power must be linear. Measured on the first reduced copy (factor 2;
3,581,043 cells with a value):

| | Backscatter, One date, 21 Oct 2026 | Backscatter, One date, 2 Nov 2026 | Backscatter, Change |
|---|---|---|---|
| Largest difference of the reduced copy from the mean of the four decibel values (dB) | `9.5367431640625e-07` | `9.5367431640625e-07` | `9.5367431640625e-07` |
| Compared with | the decibels of the mean power of the four cells | the same | the decibels of the ratio of the mean powers of the four cells |
| Mean difference (dB) | `-0.49659152788303923` | `-0.49450889286976357` | `0.0020877364925495864` |
| Largest difference (dB) | `15.234850031091355` | `15.681339741737233` | `11.585588051056583` |
| Cells that differ by more than 0.5 dB; by more than 1 dB | 1,204,178; 405,244 | 1,200,764; 402,948 | 758,093; 168,757 |

The values at full resolution are not affected. A map that draws a reduced copy of a One date
result shows values that are on average 0.5 dB lower than the decibels of the mean power. The
correction belongs to `lynkeus.tools` and `lynkeus.writing` and is not made here (part 7, point
17). The reduced copy of the coherence result has 992 rows for 1985 rows of the layer, so it was
not compared block by block.

Not measured: the memory of a job of a tool, and the display of a result in a browser.

## 5. How GIS programs offer these functions

The tables follow the row layout of `docs/research/data.md`. The pages read are those of the ArcGIS
Pro documentation 3.7 (each page states version 3.7 and the date 17 Aug 2026; the address
`pro.arcgis.com/en/pro-app/latest/` now leads to `doc.esri.com/en/arcgis-pro/latest/`), of the QGIS
User Guide 3.44 (pages last updated 30 Oct 2026), of the SNAP Online Help 14.0.0 and of the
Matplotlib 3.11.2 documentation. A statement is made only where the page states it. SNAP is
described from its documentation only; no code of SNAP was read. The research on the tool dialog and
on the record of a result is not part of this note yet.

### 5.1 Backscatter, One date (linear power to decibels)

| | |
|---|---|
| ArcGIS Pro | The tool Convert SAR Units stands in the Synthetic Aperture Radar toolset of the Image Analyst toolbox. Its parameters are Input Radar Data, Output Radar Data and the optional Conversion Type, which has six values; "Linear to dB" is the default. The page gives no formula and does not say what happens to a value that is zero or negative. Every licence level needs the Image Analyst extension ([Convert SAR Units](https://doc.esri.com/en/arcgis-pro/latest/tool-reference/image-analyst/convert-sar-units.html), [overview of the Synthetic Aperture Radar toolset](https://doc.esri.com/en/arcgis-pro/latest/tool-reference/image-analyst/an-overview-of-the-synthetic-aperture-radar-toolset.html)). A second way changes only the display: a layer whose source type is SAR can be drawn with the stretch type Logarithm, which stretches the "10log10 values" of the pixels and writes no new raster ([Change the symbology of imagery](https://doc.esri.com/en/arcgis-pro/latest/help/data/imagery/symbology-pane.html), [Use the SAR source type](https://doc.esri.com/en/arcgis-pro/latest/help/analysis/image-analyst/use-the-sar-source-type.html)). The general tools are the Log10 tool (Math toolset) and the Log10 raster function: an input value that is zero or negative becomes NoData, and the output is always floating point ([Log10 tool](https://doc.esri.com/en/arcgis-pro/latest/tool-reference/image-analyst/log10.html), [Log10 function](https://doc.esri.com/en/arcgis-pro/latest/help/analysis/raster-functions/log10-function.html)). The Raster Calculator (Map Algebra toolset) runs one map algebra expression in Python syntax and opens only from the Geoprocessing pane or ModelBuilder ([Raster Calculator](https://doc.esri.com/en/arcgis-pro/latest/tool-reference/image-analyst/raster-calculator.html)). The Log10 tool and the Raster Calculator need the Image Analyst or the Spatial Analyst extension. A contextual SAR tab appears on the ribbon when a SAR raster layer is selected in the Contents pane; it has the groups Visualization, Process and Analysis, and the Process group holds a gallery of the SAR geoprocessing tools ([SAR tab](https://doc.esri.com/en/arcgis-pro/latest/help/analysis/image-analyst/sar-tab.html)). The page does not list the tools of the gallery. |
| QGIS | The page of raster analysis algorithms holds no algorithm for radar units ([Raster analysis algorithms](https://docs.qgis.org/3.44/en/docs/user_manual/processing_algs/qgis/rasteranalysis.html)). The general means is the Raster Calculator of the Raster menu. A band is written as `layer_name@band_number`; the page names the arithmetic operators "sqrt, abs, ln" and others, and does not name a logarithm of base 10 ([Raster Calculator](https://docs.qgis.org/3.44/en/docs/user_manual/working_with_raster/raster_analysis.html)). The same calculator is a Processing algorithm (`native:rastercalc`), with a second form that creates a virtual layer (since 3.34) ([Raster analysis algorithms](https://docs.qgis.org/3.44/en/docs/user_manual/processing_algs/qgis/rasteranalysis.html)). The GDAL Raster calculator of the Processing Toolbox takes an expression in numpy syntax; all inputs must have the same dimensions and the projection is not checked ([GDAL raster miscellaneous algorithms](https://docs.qgis.org/3.44/en/docs/user_manual/processing_algs/gdal/rastermiscellaneous.html)). The manual documents the Orfeo ToolBox as a provider that is installed separately ([Configuring external applications](https://docs.qgis.org/3.44/en/docs/user_manual/processing/3rdParty.html)); its applications were not read. |
| Reference program | ESA SNAP 14.0.0. The group Data Conversion of the Raster menu has two entries for decibels. "Converts bands to/from dB" runs the operator LinearToFromdB, whose page lists one parameter, the source bands. "Linear to/from dB" is a command that creates a virtual band, in decibels or linear, from a band ([Raster Menu](https://step.esa.int/main/wp-content/help/versions/14.0.0/snap/org.esa.snap.snap.help/desktop/RasterMenu.html), [LinearToFromdB Operator](https://step.esa.int/main/wp-content/help/versions/14.0.0/snap/org.esa.snap.snap.gpf.ui/gpf/org_esa_snap_raster_gpf_LinearTodBOp.html)). Neither page gives the formula or the treatment of zero. An ESA [tutorial "Synergetic use of radar and optical data"](https://step.esa.int/docs/tutorials/S1TBX%20Synergetic%20use%20of%20S1%20%28SAR%29%20and%20S2%20%28optical%29%20data%20Tutorial.pdf) (A. Braun, issued February 2020, updated June 2021) reaches the command by a right-click on a band; the new virtual band takes the ending `_db`. |
| Standard | The source program of the comparison (D-17) converts with `10*np.log10(datacube)` and states in its text that the GCOV values are stored in linear power ([ASF NISAR Cookbook, change-detection notebook](https://github.com/ASFOpenSARlab/NISAR_Cookbook/blob/17b69c87a7320610740be7f2c7e605601cb7fe43/notebooks/NISAR_GCOV_SARChangeDetectionMethods.ipynb), cells 23 and 24). ASF describes the decibel scale as 10 times the Log10 of the power values. It notes that this scale separates very dark pixels better, and that decibel values do not suit some statistical analyses ([Sentinel-1 RTC Product Guide](https://hyp3-docs.asf.alaska.edu/guides/rtc_product_guide/), [Introduction to SAR](https://hyp3-docs.asf.alaska.edu/guides/introduction_to_sar/)). |
| Function used | `backscatter_state` in `api/src/lynkeus/analysis/backscatter.py`: 10 · log10 of the gamma0 linear power; a cell without data holds `nan`. Method sheet `docs/methods/backscatter-state.md`. |
| Limits | No program read here asks the user for the unit of the input. ArcGIS Pro and SNAP leave the direction of the conversion to the user (a list, or one command for both directions), so a layer can be converted twice by mistake. The Lynkeus tool reads layers of GCOV products only and converts in one direction, so it needs no such choice. It refuses a layer that is not a diagonal covariance term (part 3.1). Only the ArcGIS Pro pages of Log10 state a rule for zero and negative values. |
| Read on | 14 Nov 2026 |

### 5.2 Backscatter, Change (log ratio of two dates)

| | |
|---|---|
| ArcGIS Pro | The Synthetic Aperture Radar toolset has no tool that computes the ratio of two dates ([overview of the Synthetic Aperture Radar toolset](https://doc.esri.com/en/arcgis-pro/latest/tool-reference/image-analyst/an-overview-of-the-synthetic-aperture-radar-toolset.html)). The general tool is Compute Change Raster (Image Analyst toolbox). Its first two parameters are From Raster, the earlier raster, and To Raster, the later one. The default method Difference gives Output = To Raster − From Raster; the method Relative difference divides this difference by the larger of the two values. If the cell sizes or extents differ, the environment settings Cell Size and Output Extent decide ([Compute Change Raster](https://doc.esri.com/en/arcgis-pro/latest/tool-reference/image-analyst/compute-change-raster.html)). Applied to two rasters in decibels, the difference is the log ratio. The Change Detection Wizard guides the same calculation through the panes Configure, Band Difference, Classify Difference and Post-processing. It opens from the Change Detection button of the Imagery tab, group Analysis, and offers a preview layer and a histogram of the difference with handles for a lower and an upper limit ([Change Detection Wizard](https://doc.esri.com/en/arcgis-pro/latest/help/analysis/image-analyst/the-change-detection-wizard.html), [Detect pixel value change](https://doc.esri.com/en/arcgis-pro/latest/help/analysis/image-analyst/pixel-value-change-detection.html)). The Raster Calculator serves for a ratio written by hand ([Raster Calculator](https://doc.esri.com/en/arcgis-pro/latest/tool-reference/image-analyst/raster-calculator.html)). |
| QGIS | No change-detection algorithm for two rasters was found in the page of raster analysis algorithms ([Raster analysis algorithms](https://docs.qgis.org/3.44/en/docs/user_manual/processing_algs/qgis/rasteranalysis.html)). The means is the Raster Calculator, as above. If an input has another resolution, its values are resampled with the nearest neighbour ([Raster Calculator](https://docs.qgis.org/3.44/en/docs/user_manual/working_with_raster/raster_analysis.html)). |
| Reference program | ESA SNAP 14.0.0, menu Raster, group Change Detection, entry Change Detection; the page is titled Log Ratio Change Detection. The input is a stack of two co-registered images. The user selects two bands, B0 and B1; without a selection the first two intensity or amplitude bands are taken. Check boxes choose the outputs: difference (B0 − B1), ratio (B0 / B1), log ratio, written `log(B0 / B1)`, and normalised ratio. An upper and a lower threshold produce a mask: 1 above the upper threshold, −1 below the lower threshold and 0 between the two ([Log Ratio Change Detection](https://step.esa.int/main/wp-content/help/versions/14.0.0/snap-toolboxes/eu.esa.microwavetbx.sar.op.feature.extraction.ui/operators/ChangeDetection.html)). The page does not state the base of the logarithm and gives no factor of 10, so the result is not stated to be in decibels. The first band stands in the numerator, which is the reverse of the order of ArcGIS Pro and of the source program. |
| Standard | The source program computes `10 * np.log10(date_1 / date_0)`, where `date_0` is the earlier date, and its text names the result "the log ratio in dB" ([ASF NISAR Cookbook, change-detection notebook](https://github.com/ASFOpenSARlab/NISAR_Cookbook/blob/17b69c87a7320610740be7f2c7e605601cb7fe43/notebooks/NISAR_GCOV_SARChangeDetectionMethods.ipynb), cells 55 and 56). ASF describes the same idea as the log difference `Log10(date2/date1)` with a classified symbology: a negative value is a decrease of the backscatter with time, a positive value an increase ([Sentinel-1 RTC Product Guide](https://hyp3-docs.asf.alaska.edu/guides/rtc_product_guide/)). The ASF ArcGIS Toolbox has a tool for this log difference, meant for rasters in amplitude scale; a cell with a negative number in either raster becomes NoData ([ASF ArcGIS Toolbox](https://hyp3-docs.asf.alaska.edu/tools/arcgis_toolbox/)). |
| Function used | `backscatter_change` in `api/src/lynkeus/analysis/backscatter.py`: 10 · log10(later / earlier), in decibels. Method sheet `docs/methods/backscatter-change.md`. |
| Limits | The programs do not agree on the order of the two inputs (ArcGIS Pro and the source program: later relative to earlier; SNAP: first band over second) or on the scale (decibels in the source program; a logarithm without the factor 10 in the ASF guide and in SNAP). The dialog and the method sheet must therefore state the order and the unit in words. ArcGIS Pro and QGIS resample inputs that do not share a grid; the Lynkeus tool does not resample (part 3.2). |
| Read on | 14 Nov 2026 |

### 5.3 Coherence, One pair (display of the coherence magnitude)

| | |
|---|---|
| ArcGIS Pro | The tool Compute Coherence (Synthetic Aperture Radar toolset) computes the coherence from a reference and a secondary complex radar dataset, which must be co-registered. Its parameters are the two inputs, Output Radar Data, Polarization Bands, Range Window Size (default 10) and Azimuth Window Size. The output ranges from 0, no coherence, to 1, perfect coherence, and the page calls a value of "0.3 or above" a good coherence. The page names coherent change detection and the reliability of an interferogram as uses ([Compute Coherence](https://doc.esri.com/en/arcgis-pro/latest/tool-reference/image-analyst/compute-coherence.html)). The tool Generate Multitemporal Coherence builds a false colour composite from ground range detected and coherence products ([Generate Multitemporal Coherence](https://doc.esri.com/en/arcgis-pro/latest/tool-reference/image-analyst/generate-multitemporal-coherence.html)). No tool was found that only displays a coherence layer delivered by a mission; such a layer is an ordinary raster in the Symbology pane. |
| QGIS | No tool for coherence was found in the pages read. A delivered coherence layer is an ordinary single-band raster, which QGIS draws with the renderer Singleband gray when the file is neither multiband nor paletted ([Raster Properties Dialog](https://docs.qgis.org/3.44/en/docs/user_manual/working_with_raster/raster_properties.html)). |
| Reference program | ESA SNAP 14.0.0, menu Radar, Interferometric, Products, Coherence Estimation. The operator estimates the coherence from a stack of co-registered complex images; its parameters are the source bands and the size of the estimation window in azimuth and range. The page states that the operator is general and not limited to interferometry ([Coherence estimation](https://step.esa.int/main/wp-content/help/versions/14.0.0/snap-toolboxes/org.jlinda.jlinda.nest.ui/operators/CoherenceOp.html)). The page does not state the range of the output. |
| Standard | ASF, for its InSAR products: the coherence file ranges from 0.0, total decorrelation, to 1.0, perfectly coherent ([InSAR Product Guide](https://hyp3-docs.asf.alaska.edu/guides/insar_product_guide/)). The NISAR GUNW specification and the formula of ISCE3 are in part 3.3. |
| Function used | `coherence_state` in `api/src/lynkeus/analysis/coherence.py`: the GUNW layer `coherenceMagnitude` is passed through unchanged. Method sheet `docs/methods/coherence-state.md`. |
| Limits | ArcGIS Pro and SNAP compute the coherence from complex images and let the user choose the window. Lynkeus computes nothing, so the window is that of the mission and the dialog offers no such choice. The value 0.3 is a statement of the ArcGIS Pro page; no mission document read here gives a threshold, so the reading text of Lynkeus should not state one as a rule. |
| Read on | 14 Nov 2026 |

### 5.4 Legend of the backscatter in decibels

| | |
|---|---|
| ArcGIS Pro | A layer with the SAR source type can use the stretch types Square Root and Logarithm. The stretch type Percent Clip cuts a percentage of the highest and lowest values before a linear stretch ([Change the symbology of imagery](https://doc.esri.com/en/arcgis-pro/latest/help/data/imagery/symbology-pane.html)). On the SAR tab a single polarization is drawn with a "brown-orange-yellow" colour scheme ([SAR tab](https://doc.esri.com/en/arcgis-pro/latest/help/analysis/image-analyst/sar-tab.html)). No fixed range in decibels is given. |
| QGIS | The limits of a single-band raster are set in one of three ways: Cumulative count cut, whose standard range is 2 % to 98 %; the full range of the band; or the mean with a number of standard deviations. A single band that is neither multiband nor paletted is drawn in grey ([Raster Properties Dialog](https://docs.qgis.org/3.44/en/docs/user_manual/working_with_raster/raster_properties.html)). |
| Reference program | ESA SNAP 14.0.0, Colour Manipulation window: the user selects a palette, the range and a logarithmic scaling; buttons set the range to cover 1, 2 or 3 standard deviations, 95 % or 100 % of the pixels of the band ([Colour Manipulation](https://step.esa.int/main/wp-content/help/versions/14.0.0/snap/org.esa.snap.snap.help/desktop/ColorManipulationWindow.html)). The ESA [tutorial "Synergetic use of radar and optical data"](https://step.esa.int/docs/tutorials/S1TBX%20Synergetic%20use%20of%20S1%20%28SAR%29%20and%20S2%20%28optical%29%20data%20Tutorial.pdf) states the value range of calibrated data in decibels as −35 to +10 dB (Sentinel-1, C band). |
| Standard | The source program draws the decibel values in grey (`cmap="grey"`) between the 5th and the 95th percentile, with the label "γ⁰ (dB)" ([ASF NISAR Cookbook, change-detection notebook](https://github.com/ASFOpenSARlab/NISAR_Cookbook/blob/17b69c87a7320610740be7f2c7e605601cb7fe43/notebooks/NISAR_GCOV_SARChangeDetectionMethods.ipynb), cell 26). nisarqa, the quality program of the mission, clips its backscatter images to the percentiles 5 and 95 by default and applies a gamma correction of 0.5 by default ([`rslc_caltools_params.py`](https://github.com/isce-framework/nisarqa/blob/a8bc425/src/nisarqa/parameters/rslc_caltools_params.py), commit `a8bc425`, the latest commit on 14 Nov 2026). For images in power scale ASF suggests a stretch of 2 standard deviations or the limits 0 and 0.3, and notes that the decibel scale can look washed out for general viewing ([Sentinel-1 RTC Product Guide](https://hyp3-docs.asf.alaska.edu/guides/rtc_product_guide/)). |
| Function used | The 5th and the 95th percentile of the cells of the result that hold a value, in grey, as the source program. |
| Limits | No source read here gives a fixed range in decibels for NISAR L-band gamma0. The only fixed numbers found, −35 to +10 dB, are from a tutorial for Sentinel-1 and are not used. A range computed for each result differs between two dates; part 4.2 gives the numbers of the pilot area. The NISAR Handbook and the CEOS-ARD specification of Normalised Radar Backscatter were not read. |
| Read on | 14 Nov 2026 |

### 5.5 Legend of the change

| | |
|---|---|
| ArcGIS Pro | The Change Detection Wizard shows the histogram of the differences. The user sets a lower and an upper limit with handles, adds classes with a name and a colour, or keeps the unclassified differences ([Detect pixel value change](https://doc.esri.com/en/arcgis-pro/latest/help/analysis/image-analyst/pixel-value-change-detection.html)). For a classified layer with a critical break at a central value, the Symbology page advises a diverging colour scheme ([Change the symbology of imagery](https://doc.esri.com/en/arcgis-pro/latest/help/data/imagery/symbology-pane.html)). The pages name no default colour scheme for a difference raster. |
| QGIS | No page read gives a legend for a difference. The renderer Singleband pseudocolor draws one band with a colour ramp between a minimum and a maximum that the user can change ([Raster Properties Dialog](https://docs.qgis.org/3.44/en/docs/user_manual/working_with_raster/raster_properties.html)). |
| Reference program | ESA SNAP 14.0.0: the page of the change detection operator describes the thresholds of the mask and gives no colour scale ([Log Ratio Change Detection](https://step.esa.int/main/wp-content/help/versions/14.0.0/snap-toolboxes/eu.esa.microwavetbx.sar.op.feature.extraction.ui/operators/ChangeDetection.html)). |
| Standard | The source program draws the log ratio with the scale `RdBu` between minus and plus the 99th percentile of its absolute value, so that zero is at the centre; it uses −2 dB as an example of a threshold ([ASF NISAR Cookbook, change-detection notebook](https://github.com/ASFOpenSARlab/NISAR_Cookbook/blob/17b69c87a7320610740be7f2c7e605601cb7fe43/notebooks/NISAR_GCOV_SARChangeDetectionMethods.ipynb), cell 59). In `RdBu` of Matplotlib 3.11.2 the lowest value is dark red, the centre near white and the highest value dark blue (tried on 14 Nov 2026), so a decrease is red and an increase blue. The figure of the ASF guide uses the opposite colours: red for an increase, blue for a decrease and yellow for little change ([Sentinel-1 RTC Product Guide](https://hyp3-docs.asf.alaska.edu/guides/rtc_product_guide/)). Crameri and others advise a diverging colour map for data that diverge about a central value such as zero, and warn that a colour gradient must be understood even when the colour bar is missing (Crameri, Shephard and Heron (2020), <https://doi.org/10.1038/s41467-020-19160-7>). Matplotlib gives the same use for diverging colour maps ([Choosing Colormaps in Matplotlib](https://matplotlib.org/stable/users/explain/colors/colormaps.html)). |
| Function used | From −r to +r, where r is the 99th percentile of the absolute values of the cells of the result that hold a value; scale `RdBu`. |
| Limits | The two ASF sources colour an increase differently. The legend of Lynkeus must therefore name its two ends in words (decrease, increase) and not rely on a convention of colour. No source read gives a fixed range in decibels for a change map. |
| Read on | 14 Nov 2026 |

### 5.6 Legend of the coherence

| | |
|---|---|
| ArcGIS Pro | The output of Compute Coherence ranges from 0 to 1 ([Compute Coherence](https://doc.esri.com/en/arcgis-pro/latest/tool-reference/image-analyst/compute-coherence.html)). The page names no colour scheme. |
| QGIS | Not read for this quantity. The default renderer of a single band is grey, with the limits of the section above ([Raster Properties Dialog](https://docs.qgis.org/3.44/en/docs/user_manual/working_with_raster/raster_properties.html)). |
| Reference program | ESA SNAP 14.0.0: the page of the coherence operator gives no range and no colour scale ([Coherence estimation](https://step.esa.int/main/wp-content/help/versions/14.0.0/snap-toolboxes/org.jlinda.jlinda.nest.ui/operators/CoherenceOp.html)). |
| Standard | nisarqa draws the coherence magnitude of the GUNW product in grey with the fixed limits 0 and 1 (`cmap="gray"`, `vmin=0.0`, `vmax=1.0`; [`unwrapped_coh_mag.py`](https://github.com/isce-framework/nisarqa/blob/a8bc425/src/nisarqa/processing/insar/unwrapped_coh_mag.py) and [`wrapped_phase_image_and_coh_mag.py`](https://github.com/isce-framework/nisarqa/blob/a8bc425/src/nisarqa/processing/insar/wrapped_phase_image_and_coh_mag.py), commit `a8bc425`). ASF gives the range 0.0 to 1.0 for the coherence file of its InSAR products ([InSAR Product Guide](https://hyp3-docs.asf.alaska.edu/guides/insar_product_guide/)). |
| Function used | Fixed limits 0 and 1, in grey. |
| Limits | A stretch by percentiles, such as the cumulative count cut of QGIS, would hide that the scale is fixed. The limits of the Lynkeus legend stay 0 and 1 for every pair, so that two pairs can be compared. |
| Read on | 14 Nov 2026 |

### 5.7 Colour scales and colour-blind readers

| | |
|---|---|
| Matplotlib | The most common deficiency of colour vision concerns the difference between red and green, so the documentation advises against colour maps that hold both. For diverging maps it wants the lightness to rise to a maximum at the centre and to fall to about equal values at the two ends, and by these measures it calls `RdBu` one of the "good options". The lightness of the grey map runs over the whole range from 0 to 100 ([Choosing Colormaps in Matplotlib](https://matplotlib.org/stable/users/explain/colors/colormaps.html), Matplotlib 3.11.2). The colours of `RdBu` come from the ColorBrewer designs of Cynthia Brewer ([`_cm.py`, tag v3.11.2](https://github.com/matplotlib/matplotlib/blob/v3.11.2/lib/matplotlib/_cm.py)). |
| ColorBrewer | The scheme RdBu carries the value 1 in the property `blind` for every number of classes (3 to 11). The page turns this value into the label "color blind friendly", and the filter "colorblind safe" keeps the scheme. The schemes RdYlGn, Spectral and RdGy do not carry the value 1 for every number of classes ([ColorBrewer 2.0](https://colorbrewer2.org/), files [`colorbrewer_schemes.js`](https://colorbrewer2.org/colorbrewer_schemes.js) and [`colorbrewer.js`](https://colorbrewer2.org/colorbrewer.js)). |
| Literature | Crameri, Shephard and Heron (2020): colour maps that hold red and green of similar lightness cannot be read by a large part of the readers; the general estimate is that 0.5 % of women and 8 % of men have a deficiency of colour vision. The article tests colour maps for the three forms of dichromacy and in grey scale, which stands for total colour blindness and for black-and-white print (Crameri, Shephard and Heron (2020), <https://doi.org/10.1038/s41467-020-19160-7>). The Scientific colour maps of the same author (version 8.0.1 of 5 Oct 2023) are described as readable by people with a deficiency of colour vision and in black-and-white print ([Scientific colour maps](https://www.fabiocrameri.ch/colourmaps/)). Matplotlib 3.11.2 includes three diverging maps of that set with a dark centre, Berlin, Managua and Vanimo ([Choosing Colormaps in Matplotlib](https://matplotlib.org/stable/users/explain/colors/colormaps.html)). |
| Function used | `grey` for the backscatter and the coherence; `RdBu` for the change. |
| Limits | The rating of ColorBrewer was given to the scheme in 3 to 11 classes. Matplotlib interpolates the colours into a continuous scale, for which no rating was found. `RdBu` pairs red with blue, not with green, and so avoids the pair that the sources warn against. A grey scale has no hue to confuse. No test with a simulator of colour-vision deficiency was run for this note. The User guide of the Scientific colour maps was not read, so no map of that set is named as a replacement. |
| Read on | 14 Nov 2026 |

## 6. Sources, programs, libraries and data of this part

| Item | Version | Licence | Use |
|---|---|---|---|
| NISAR L2 GCOV Product Specification, JPL D-102274 | Rev F, 1.5.0, 8 Jul 2026 | Document of NASA/JPL | Layers, units, mask, formula field |
| NISAR L2 GUNW Product Specification, JPL D-102272 | Rev E, 1.2.1, 8 Nov 2024 | Document of NASA/JPL | Coherence layers |
| Product specification files `nisar_L2_GCOV.xml` and `nisar_L2_GUNW.xml` | Version 1.6.0, in nisarqa at commit `a8bc425` | As nisarqa | Layers of the products of the pilot area |
| SDS L-SAR Product File Naming Conventions, JPL D-102255 | Rev C, 19 Oct 2025 | Document of NASA/JPL | Fields of the names of the product files |
| [ASF NISAR Cookbook](https://github.com/ASFOpenSARlab/NISAR_Cookbook) | Commit `17b69c8`, 3 Nov 2026 (UTC) | Apache-2.0 | Source program of the two backscatter tools; legends |
| [ISCE3](https://github.com/isce-framework/isce3) | `v0.25.21` | Apache-2.0 | Source program of the coherence layer; formula |
| [nisarqa](https://github.com/isce-framework/nisarqa) | Commit `a8bc425`, 30 Sep 2026 (UTC) | BSD-3-Clause or Apache-2.0, at the choice of the user (`README.md`, section License) | Legends; product specification XML files of version 1.6.0 |
| [NumPy](https://pypi.org/pypi/numpy/2.5.4/json) | 2.5.4 | `BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0` (licence expression of the package on PyPI) | The only library that the three functions use |
| Matplotlib | 3.11.2 | Not read | Order of the colours of `RdBu`, and the documentation of colour maps (part 5). The functions do not use it |
| numpy, xarray, dask, rioxarray, rasterio | 2.5.3, 2026.7.0, 2025.12.0, 0.22.0, 1.4.4 | Not read | Environment of the source program in the comparison (part 4.6). Lynkeus does not use them |
| rasterio; harmony-py | 1.5.2; 1.8.0 | Not read | Reading of the sample files and receiving of the masks for part 4. The functions do not use them |
| Shiroma, Lavalle and Buckley (2022), <https://doi.org/10.1109/TGRS.2022.3147472> | | Article | Terrain correction of GCOV |
| Rignot and van Zyl (1993), <https://doi.org/10.1109/36.239913> | | Article | Method of Backscatter, Change |
| Touzi, Lopes, Bruniquel and Vachon (1999), <https://doi.org/10.1109/36.739146> | | Article | Reading of the coherence |
| Zebker and Villasenor (1992), <https://doi.org/10.1109/36.175330> | | Article | Reading of the coherence |
| Crameri, Shephard and Heron (2020), <https://doi.org/10.1038/s41467-020-19160-7> | | Article | Colour scales (part 5) |
| NISAR GCOV and GUNW products of the validated collections `NISAR_L2_GCOV_V1` and `NISAR_L2_GUNW_V1` | The three products of part 4.1; product version 1.0.20, CRID `P05036` | NASA data | Measurements of part 4 |

The bibliographic records of the four articles on radar were checked against Crossref. Only their
abstracts were read.

## 7. Not confirmed, and what is needed from the other members

1. **Andreas: what the comparison did not reach.** The four points at the end of part 4.6.
2. **Andreas: the mask in other areas.** Part 4.4 lists what the evidence of the pilot area does not
   show. The measurement is repeated on the next area.
3. **Andreas: the statistics of the whole frame.** The band tags `min_value` and `max_value` of the
   samples are attributes of the layer `HHHH` in the product files, where the layer covers the whole
   frame (part 4.4, point 4; `step4_record.json`). The place of the specification that defines them
   was not read, and the cells of the frame that hold those values were not examined.
4. **Andreas: the metadata of the pilot products.** The fields
   `outputBackscatterExpressionConvention` (`Linear power`),
   `outputBackscatterNormalizationConvention` (`gamma0`),
   `outputBackscatterDecibelConversionFormula` (`10*log10(<GCOV_TERM>)`), `softwareVersion`
   (`0.25.21`), the two fields of the algorithm references, `productSpecificationVersion` (`1.6.0`),
   `productVersion` (`1.0.20`), the two masking fields and `isDithered` were read from the two GCOV
   product files on 15 Nov 2026, with these values on both dates (`step4_record.json`). The field
   `softwareVersion` of the GUNW product file reads `0.25.21`.
5. **Andreas: the text of version 1.6.0 of the specifications.** No PDF of this version is public.
   The XML files give its tables. The running text was read for versions 1.5.0 (GCOV) and 1.2.1
   (GUNW) only.
6. **Andreas: the articles and the routine of ISCE3.** No full text of an article was read. Which
   routine of ISCE3 the mission runs for the coherence was not traced (part 3.3).
7. **Andreas: SME2 and GOFF.** Their layers are not yet researched. They are due before the level-2
   tools. The research on the tool dialog and on the record of a result is due before the dialog is
   built.
8. **Alexandros and Andreas: the GCOV mask.** NASA Harmony lists the mask among the variables of
   `NISAR_L2_GCOV_V1` and delivered it for the pilot area (part 4.4). The Data part offers the mask
   as a layer of its own, with the unit `1`, and does not apply it to the terms (`_layers` in
   `api/src/lynkeus/harmony.py`). The tools apply no mask, as the cells of the source program apply
   none, and they refuse the layer `mask` as an input (part 3.4). On the pilot area the mask would
   change no cell and no legend (part 4.4).
9. **Alexandros: the name of the layer inside the product.** Done on 15 Nov 2026: the layer
   description has the field `layer` (part 3.1, limit 2), the Data part fills it, and every tool
   reads it (part 3.4). A layer that was received before the field existed has to be received
   again before a tool accepts it.
10. **Andreas: the refusals of the tools.** A tool raises `lynkeus.writing.LayerError` with one
    sentence for the visitor, as `api/README.md` of `main` asks of a tool (lines 32 to 34 at commit
    `0ad795b`). There `run_tool` passes a `LayerError` on and turns every other exception of a tool
    into the sentence "Lynkeus could not compute the result because of an internal error."
    (`api/src/lynkeus/tools.py`, lines 59 to 64), and a job shows the sentence of an error of its
    process (`api/src/lynkeus/jobs.py`, lines 159 to 161). A fault of the calling program (arrays
    and descriptions that differ in number; an array that is not two-dimensional Float32) stays a
    `ValueError` and so is shown as an internal error. The package `lynkeus.analysis` therefore
    imports `lynkeus.writing`, and with it rasterio; the functions still read and write no file.
    On 15 Nov 2026 the refusals were tried as jobs of a private copy of the web service: the
    message of each failed job was the sentence of the tool, and `GET /api/jobs/<name>/results`
    answered with the status 500 and the same sentence as its `detail` (part 3.4; `jobs.json`).
    How the interface shows the sentence was not seen in a browser.
11. **Alexandros: what the checks rely on.** The checks expect that a received layer carries the
    kind `layer`, the unit `1` and one name in `inputs`, which begins as the name of the product
    file (for example `<granule>.h5`); a folder or an address before the name is refused. At commit
    `0ad795b` the Data part writes these values (`api/src/lynkeus/harmony.py`, lines 238 to 244),
    and `run_tool` compares the grids of the layers before it calls a tool (part 3.2, limit 1). The
    point is confirmed in the code and, since 15 Nov 2026, by the jobs of part 4.7, whose layers
    were described by `harmony.py`. The checks now also expect the field `layer`. The point stays
    here because a change of these values would make the tools refuse every layer.
12. **Alexandros: the records of the measurements.** The records that this note quotes are kept in
    `docs/research/records/analysis/` (part 4). The records of the first measurements, of
    14 Nov 2026, and of the trial that part 3.4 described before 15 Nov 2026 are not kept, and the
    note quotes none of them. The arrays of the measurements are not kept in the repository.
13. **Alexandros: the GUNW specification.** The project folder holds Rev E (version 1.2.1), which is
    the latest PDF that the ASF DAAC links (read 14 Nov 2026). The products of the pilot area follow
    version 1.6.0, which is public as XML only (part 2.2). The ASF page names a Revision F in its
    text and links the Rev E file.
14. **Stelios: the colour scales.** The functions name the scales `grey` and `RdBu`, as the source
    programs do. The names in the Contents pane, the end of `grey` that is black, the words at the
    two ends of the legend of the change (decrease, increase) and the readability of `RdBu` for
    colour-blind readers (part 5.7) are his to confirm. At commit `0ad795b` the Data part gives the
    same two names to layers of its own (`api/src/lynkeus/harmony.py`, lines 275 and 320). A later
    commit of `main`, `5095ee0`, holds both scales in `web/src/contents/colours.ts` (lines 19 and
    27), with `grey` from black at the lowest value to white; its legend names no words at the two
    ends (`web/src/contents/Legend.tsx`). These files were read and nothing was tried.
15. **Stelios: the range of the legend.** For the two backscatter tools the `range` of the layer
    description is computed for each result and is not a fixed pair of numbers (part 4.2).
16. **Alexandros: the tools as processes of the server.** At commit `0ad795b`,
    `api/src/lynkeus/offered.py` offers one process of the web service for every tool of `TOOLS`
    (lines 150 to 152), and its function calls `run_tool` in a job (lines 84 to 93). With the three
    tools in `TOOLS`, the server therefore offers them without a further change. The title of a
    process is the name of the tool with spaces, for example "Backscatter state", and its
    description is the first paragraph of the documentation string of the function (lines 141 and
    142). On 15 Nov 2026 the three tools ran as jobs of a private copy of the web service (part
    4.7). Nothing was tried in a browser.
17. **Alexandros: the reduced copies of a result in decibels.** `run_tool` lets `write_layer` make
    the reduced copies of every result by averaging. For a result in decibels the reduced copy is
    then the mean of decibel values, which is on average 0.5 dB below the decibels of the mean
    power for the One date results of the pilot area (part 4.7). The values at full resolution are
    correct. The correction is in `api/src/lynkeus/tools.py` or `api/src/lynkeus/writing.py`, which
    are not files of this part.
18. **Andreas: the second reading of part 5.** The sources of part 5 were read on 14 Nov 2026. An
    independent verification of 15 Nov 2026 read them a second time in part only. Not opened for
    the second reading: the five pages of the QGIS User Guide 3.44 and the page Scientific colour
    maps (the server received HTTP 403 for each), the ESA tutorial "Synergetic use of radar and
    optical data" and the text of Crameri, Shephard and Heron (2020). Of the pages of ArcGIS Pro, of
    SNAP and of ASF, some sentences were read and confirmed; for the other statements of these rows
    only the presence of the quoted terms was tested. The page of SNAP on Log Ratio Change
    Detection was opened once more on 15 Nov 2026: it gives the mask as 1 above the upper
    threshold, −1 below the lower threshold and 0 between the two. No full text of the four cited
    articles on radar was obtained (point 6). The time and the memory of the first comparison were
    not measured again, and part 4.6 does not give them.

## About

| | |
|---|---|
| ArcGIS Pro | The page About ArcGIS Pro, among the settings of the program, states the version of the software and whether an update is available ([Update ArcGIS Pro](https://pro.arcgis.com/en/pro-app/3.5/get-started/update-arcgis-pro.htm)). |
| QGIS | The Help menu holds the item About ([QGIS GUI, Help](https://docs.qgis.org/3.44/en/docs/user_manual/introduction/qgis_gui.html)). What its dialog shows was not read. |
| Standard | A file `CITATION.cff` at the root of a repository tells how to cite the work, and GitHub shows from it the link "Cite this repository" with an APA and a BibTeX form ([GitHub Docs, About CITATION files](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-citation-files)). The specification of the Citation File Format 1.2.0 itself was not read. |
| Function used | The `Dialog` of `web/src/shared/dialog/`, with the properties that the search dialog uses. The dialog About is a notice: it has no field and runs nothing, so it is not a tool pane. The version is the field `version` of `web/package.json`, imported by name: Vite 8.3.8 reads a JSON file as a module, and the built file held the text of the version and no other field of `package.json` (searched in `dist/assets/`). |
| Statements | Each statement is copied from `README.md`, `NOTICE` or `CITATION.cff`, and a test compares it with its file. A test also checks that `CITATION.cff`, `api/pyproject.toml` and `api/src/lynkeus/__init__.py` state the version of `web/package.json`. |
| What is stored | Read from the code of `main` at commit 69f0eca. In `web/src/`, only `map/bookmarks.ts` uses the storage of the browser: it keeps the bookmarks under the name `lynkeus.bookmarks`. No file uses a cookie from the page, and `web/index.html` does not load the script of the visit counter. `api/src/lynkeus/sessions.py` describes a session in the words that the dialog quotes; `routes.py` creates one at `GET /api/session`, at the sign-in and at the start of a job, and sets the cookie `lynkeus_session` for `/api`, for 7 days, with `HttpOnly`, `SameSite=Strict` and, unless a setting says otherwise, `Secure`; `store.py` records for a session its name, the digest of its key and the times of its creation and last use, with its jobs and layers. The interface does not call these addresses yet. The page of the team log loads `web/public/assets/visits.js`, which keeps the marker `lynkeus-visit-counted` in the storage of the browser, and `api/src/lynkeus/visits.py` stores the total and writes no log. `web/nginx.conf` sets `access_log off` for `/api/visit` only, so nginx writes its request log for every other address: without a setting, `access_log` writes the predefined format `combined`, which holds the address of the client, the time, the request, its status and size, the referring page and the user agent ([nginx, Module ngx_http_log_module](https://nginx.org/en/docs/http/ngx_http_log_module.html)). `compose.yaml` runs Uvicorn with `--no-access-log`. Tests compare each of these statements with its file and fail when the code changes, so that the dialog is changed with it. |
| Limits | The public texts of the repository name the team and one author, so the dialog names no other member. The citation is shown as the fields of `CITATION.cff` and not in a citation style, because the entry has no date. The dialog shows no logo. A link opens in the same tab and so leaves the application: a link that opens a new window needs a warning on the link itself ([WCAG technique G201](https://www.w3.org/WAI/WCAG21/Techniques/general/G201)), and the page does not compile the style of an external link of the design system. The configuration of the nginx image on which the site runs and the front web server of the machine are not in the repository and were not read, so what they add to the request log, and how long the log is kept, is not confirmed. The browser loads the background maps from the two services named in `README.md`, which so receive its requests; the dialog does not say this. |
| Tried | In the simulated browser of the tests (happy-dom 21.0.4): the button opens the dialog, the dialog shows each statement, the version of `package.json` and the two links with their addresses, and the close button closes it. In Chromium, through Playwright 1.65.1, one trial opened the dialog with a click in a window of 1440 by 900 pixels and saved a picture of it before the trial was stopped: the dialog was about 480 pixels wide and all its text was in view. The picture was taken before the dialog received the smaller sizes of the frame and before the sentences on the bookmarks and the sessions were added. Nothing else was tried in a real browser: the keyboard, the Escape key and the return of the focus, a window of 390 pixels, the console and the requests. |
| Read on | 14 Nov 2026 |

## Sources

| | |
|---|---|
| ArcGIS Pro | The help page [Copyright Information](https://doc.esri.com/en/arcgis-pro/latest/get-started/copyright-information.html) points to the acknowledgement documents on the site of Esri ([Open Source Acknowledgements](https://www.esri.com/en-us/legal/requirements/open-source-acknowledgements)), which holds one file for each version of the program. The report of version 2.8 is a table with the columns Library, Licenses and Copyrights ([ArcGIS Pro 2.8 Attribution Report](https://www.esri.com/content/dam/esrisites/en-us/media/legal/open-source-acknowledgements/arcgis-pro-2-8-attribution-report.html)). Whether the program shows such a list in a window of its own was not read. |
| QGIS | Not read. |
| Standard | A simple table has a header cell with `scope="col"` for each column and with `scope="row"` for each row, and a scrollable table must be able to take the keyboard focus, with `tabindex="0"` on the element that scrolls ([U.S. Web Design System, Table](https://designsystem.digital.gov/components/table/)). |
| Function used | The table of the U.S. Web Design System 3.14.0 (package `usa-table`, which `styles.scss` compiles), in its borderless and compact form, inside the scrollable frame of the design system. The `Dialog` of `web/src/shared/dialog/`, with the properties that the search dialog uses; the page is a notice and not a tool. The lists are the constants `SOURCES` of `web/src/map/`, `web/src/data/` and `web/src/analysis/`, of the type `Source` of `web/src/shared/sources.ts`. The Map part keeps a second list in `web/src/statusbar/`, which the page shows under Map after the first. |
| Choices of Lynkeus | The name of a part is a heading, and the table carries it as its name through `aria-labelledby`, because a part without sources has a heading and no table. A dialog that holds the sources takes the width of the large modal of the design system through the selector `:has()`, without a new property of the dialog. The scrollable frame of the design system keeps the text of a cell in one line; here a cell breaks into lines. The stacked form of the table of the design system was read and not used: it shows the cells as blocks, and whether a screen reader still reads them as a table was not tried. |
| Lists | A program copied the list of Data from the table Third-party software of `README.md`: its 32 rows without OpenLayers, which belongs to the Map part. A second program compared the 31 entries with the table: 124 fields, no difference. The lists of Map and Analysis belong to their parts and are shown as they are: on `main` at commit 69f0eca the two lists of Map hold three sources each, and the list of Analysis is empty. No name appears in two lists. The section Data of `README.md` is text and not a table; it gives no licence and no address for the records of NASA's Common Metadata Repository, so the list of Data does not hold them. |
| Limits | The page shows what the lists hold and cannot know what is missing from them. The list of Data and `README.md` are kept alike by hand: no test compares them, because a list may hold a method or a dataset that the table of software does not. A link opens in the same tab. |
| Tried | In the simulated browser of the tests (happy-dom 21.0.4): the button opens the dialog; a part with sources is a table with its header cells, one row for each source and a link to each address; a part without sources shows its sentence; the function `sourceFaults` names an entry without a needed field and a name that appears twice, and finds no fault in the lists. In Chromium, through Playwright 1.65.1, one trial saved a picture of the dialog in a window of 1440 by 900 pixels before the trial was stopped: the dialog was about 880 pixels wide, the Map part showed its sentence, and the table of Data was wider than the dialog and cut at its right edge. The style was changed after that picture, so that a cell breaks into lines and a table scrolls inside its frame, and the changed style was not tried in a real browser; nor were the lists of Map, which were empty then. Not tried in a real browser at all: the keyboard, the Escape key and the return of the focus, a window of 390 pixels, what a screen reader says, the console and the requests. |
| Read on | 14 Nov 2026 |
