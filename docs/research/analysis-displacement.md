# Research note: Analysis tab, group Surface displacement

| | |
|---|---|
| Part | Analysis tab, group Surface displacement |
| Covers | The tool Surface displacement, One pair (`displacement-state`), and why the tool Change (`displacement-change`) and the pixel offsets were not built |
| Written | 15 Nov 2026. Every source below was read on that day. |
| Code state | Branch `an2-disp`, made from the branch `analysis-level-2` at commit `05930fb` |
| Pilot area | Lower Merrimack River: box −71.20, 42.60, −70.75, 42.95 (west, south, east, north); track 141, frame 67, descending |
| Names of the tools | `displacement-state` is listed in `lynkeus.analysis.TOOLS`. `displacement-change`, `displacement-series` and `displacement-map` are not built |

This note records, for the tool of this part:

1. The NISAR product specification of its input layers, with the section or page (part 2).
2. The publication of its method, with the section or page (part 3).
3. The source program with which its result is compared, with its version (parts 3 and 4).
4. What was measured on real files of the pilot area (part 4).
5. How GIS programs offer the same function (part 5).
6. The sources with the date on which each was read (part 6), and what is not confirmed (part 7).

It follows the form of `docs/research/analysis.md`, which holds the research of the three tools of
level 1.

## 1. The questions of this part and their answers

| Question | Answer | Part |
|---|---|---|
| Which formula turns the layer `unwrappedPhase` into displacement along the line of sight, and with which sign? | displacement = −wavelength / (4π) · phase; a positive result is a movement toward the radar, for a pair whose reference date is the earlier one | 3.1 |
| Which wavelength does the formula need, where does the product record it, and does it differ between acquisition modes? | The speed of light divided by `/science/LSAR/GUNW/grids/frequencyA/centerFrequency`. The value differs: 1229, 1239 and 1257.5 MHz were read in products of 20, 40 and 77 MHz range bandwidth | 2.2, 4.3 |
| How can Lynkeus know it for a received layer? | NASA Harmony delivers neither the field nor a tag with it. The ISO XML file of the product states the same value. The Data part now reads it and writes it into the new field `frequency` of the layer description | 2.3, 4.3 |
| What is the phase relative to? | To arbitrary, unspecified reference points; the mission does not determine the absolute phase | 3.1 |
| Which corrections has the product applied? | The phase is flattened for the ellipsoid and the topography. The ionosphere, the troposphere and the solid Earth tides are not removed | 3.1 |
| What is the role of `connectedComponents` and of `ionospherePhaseScreen`? | A label 0 marks cells that could not be unwrapped reliably; the tool gives no data there. The ionosphere screen is an estimate that the product does not apply; the tool does not use it | 3.1, 4.4 |
| Is a One pair map of a pixel offset layer, as delivered, a sound second input of the tool? | No. It was not built | 3.2, 4.8 |
| Does the difference of the displacement of two pairs have a sound published definition? | Not without a reference location that is common to the two pairs. It was not built | 3.3 |

## 2. Layers and fields that the tool uses

### 2.1 GUNW layers

Specification: NASA SDS Product Specification, Level-2 Geocoded Unwrapped Interferogram (L2 GUNW),
JPL D-102272, Rev E, version 1.2.1, 8 November 2024 (PDF of the ASF DAAC, SHA-256
`218cec04610d8c106a7efd3246c9eb348c0d6db692241e227e5fff01cd1b9848`). The products of the pilot area
follow version 1.6.0, which is public as the file `nisar_L2_GUNW.xml` (nisarqa commit `a8bc425`,
folder `src/nisarqa/product_specs/1.6.0/`). The page numbers below are those printed on the pages of
Rev E.

| Layer or field (under `/science/LSAR/GUNW/grids/frequencyA/`) | Type | Unit | No data | Meaning | Place in the specification |
|---|---|---|---|---|---|
| `unwrappedInterferogram/[HH or VV]/unwrappedPhase` | Float32 | `radians` | `nan` | "Unwrapped interferogram between HH layers" | Section 2.2, pages 5 and 6; Table 5-3, pages 34 and 35 |
| `unwrappedInterferogram/[HH or VV]/connectedComponents` | UInt16 | `1` | `65535` | "Connected components for HH layer" | Table 5-3, pages 34 and 35 |
| `unwrappedInterferogram/[HH or VV]/ionospherePhaseScreen` | Float32 | `radians` | `nan` | "Ionosphere phase screen" | Section 2.2, page 6; Table 5-3, page 35 |
| `unwrappedInterferogram/[HH or VV]/ionospherePhaseScreenUncertainty` | Float32 | `radians` | `nan` | "Uncertainty of the ionosphere phase screen" | Table 5-3, page 35 |
| `centerFrequency` | Float64, scalar | `hertz` | none | "Center frequency of the processed image in hertz" | Table 5-3, page 29 |
| `pixelOffsets/[HH or VV]/slantRangeOffset`, `alongTrackOffset` | Float32 | `meters` | `nan` | "Slant range offset", "Along-track offset" | Section 2.2, pages 5 and 6; Table 5-3, pages 37 and 38 |

The entries of `unwrappedPhase`, `connectedComponents`, `ionospherePhaseScreen` and
`centerFrequency` in `nisar_L2_GUNW.xml` of version 1.6.0 give the same type, unit, no-data value
and description. The specification gives no `valid_min` and no `valid_max` for the phase, and it
does not give the formula that turns the phase into a distance, the sign of the phase or the meaning
of the label 0 of the connected components. The layers have a spacing of 80 m (section 2.2). The
unwrapped layers are geocoded with a bilinear interpolation, and the connected components with the
nearest neighbour (section 2.2, page 5).

The Data part writes the unit of the phase as `rad` (`_interferogram_layers` in
`api/src/lynkeus/harmony.py`), and Lynkeus reads the no-data value `65535` of the connected
components as `nan` (`read_layer` of `lynkeus.writing`).

### 2.2 The centre frequency of the product

The wavelength of a product is not a constant of the mission. The mission computes it from the field
`centerFrequency` of the product:

1. ISCE3 0.25.21, `python/packages/nisar/workflows/solid_earth_tides.py`, lines 269 to 272: the
   wavelength of a GUNW product is `isce3.core.speed_of_light` divided by the field
   `centerFrequency` of `frequencyA`. `troposphere.py`, lines 87 and 88, does the same.
   `cxx/isce3/core/Constants.h`, line 50, gives `speed_of_light = 299792458.0`.
2. nisarqa, commit `a8bc425`, `src/nisarqa/input_product_readers/nisar_product.py`, lines 921 to
   943: the wavelength is the speed of light of ISCE3 divided by the processed centre frequency.
3. MintPy 1.6.4, `prep_nisar.py`: the attribute `WAVELENGTH` of a NISAR GUNW product is the speed of
   light of `mintpy.constants` (299792458 m/s) divided by the field `centerFrequency` (part 4.5
   gives the line).

The centre frequency differs between the acquisition modes. The ASF NISAR documentation gives the
centre frequency of Frequency A for each L-band bandwidth: 1257.5 MHz for 77 MHz, 1239 MHz for 40+5
MHz, 1229 MHz for 20+5 MHz and for 20+20 MHz, and 1221.5 MHz for 5+5 MHz (file
`about-nisar/nisar-intro.md`, table "Center frequencies (MHz) for NISAR acquisition bandwidths",
repository `ua-asf/nisar-docs`, commit `47d55b1` of 13 Nov 2026). Part 4.3 gives the values read in
twelve product files: they agree with this table for 20, 40 and 77 MHz. The wavelengths of 1229 MHz
and 1257.5 MHz differ by 2.3 per cent, so a displacement computed with one constant wavelength would
be wrong by up to that amount.

The name of the product file holds the bandwidth mode code of the primary and the secondary band
(naming conventions, section 3.8, page 18: "40, 20, 77, 05, or 00"), and NASA's catalogue holds the
range bandwidth of a product (additional attribute `FREQUENCY_A_RANGE_BANDWIDTH`). Neither holds the
centre frequency. A table from bandwidth to centre frequency inside Lynkeus would be a set of
constants and not the value of the product, so it was not used.

### 2.3 How Lynkeus knows the centre frequency of a layer

What was tried on 15 Nov 2026, with the pair of the pilot area (records of part 4.1):

1. **The GeoTIFF of NASA Harmony.** Its metadata hold the attributes of the layer itself
   (`description`, `units`, `_FillValue` and the statistics) and no field of the group. The file
   that NASA Harmony delivered for the coherence sample of the pilot area holds 15 items, none of
   them a frequency.
2. **The field itself through NASA Harmony.** A request for the variable
   `/science/LSAR/GUNW/grids/frequencyA/centerFrequency` was refused at once: "Coverages were not
   found for the provided variables" (`harmony_scalar.json`).
3. **The ISO XML file of the product.** NASA's catalogue lists, for each product, a file
   `<name>.h5.iso.xml` with the type `EXTENDED METADATA`. For the pilot pair it has 113,240 bytes
   and holds 23 additional attributes. One has the name `center frequency`, the description `center
   frequency of the processed image - frequency A`, the unit `Hz` and the value `1239000000.0`. The
   client of harmony-py fetched the file with the credentials of the environment and with an
   Earthdata user token, in 5.1 and 3.0 seconds (`iso_download.json`). In twelve products the value
   equals the field `centerFrequency` of the HDF5 file (part 4.3).

The smallest change that carries the value is therefore:

1. **Layer description.** `LayerDescription` in `api/src/lynkeus/layers.py` has a new optional field
   `frequency`: the centre frequency of the radar band of the layer, in hertz. Only a layer received
   from NASA may have one. A description that was stored before the field existed is read with the
   value `None`.
2. **Data part.** `get_layer` in `api/src/lynkeus/harmony.py` fills the field for a layer of a GUNW
   product whose unit is `rad`. `_find` returns the address of the ISO XML file from the record of
   the product, and `_centre_frequency` fetches the file with the client of Harmony, that is with
   the credentials of the request, and reads the attribute. Because the credentials go with the
   request, an address is used only when it begins with `https://` and its host is under `nasa.gov`.
   The value is taken only when exactly one attribute has the name, the description and the unit
   given above and its value is a finite number above zero. In every other case, and when the file
   cannot be fetched, the layer is received without a frequency, and the tool refuses it with a
   sentence.
3. **Interface.** The copy of the format in `web/src/shared/layer.ts` was not changed, because this
   part changes nothing under `web/`. Its check `isLayerDescription` (lines 82 to 106) reads the
   fields that it knows and does not refuse a description with a further field; this was read in the
   code and not tried in a browser.

The field stands in the layer description only. It is not written into the GeoTIFF or into the STAC
record of the layer.

### 2.4 Names of the product files

Science Data Systems (SDS) L-SAR Product File Naming Conventions, JPL D-102255, Rev C, 19 October
2025, section 3.8 (page 18): the name of a GUNW or GOFF product holds, after the polarisation, the
start and the end time of the reference acquisition and then the start and the end time of the
secondary acquisition. The tool reads the two start times and gives a result only when the reference
acquisition starts before the secondary one, so that the sign of the result has one meaning (part
3.1). In all twelve products of part 4.3 the reference date is the earlier date.

### 2.5 Pixel offsets of GUNW and GOFF

NASA SDS Product Specification, Level-2 Geocoded Pixel Offsets (L2 GOFF), JPL D-105010, Rev C,
version 1.2.1, 8 November 2024 (PDF of the ASF DAAC, SHA-256
`2898b7a110ac164b944a587fd1e2fd7ebccc3c5063b6f9b51be4d91f934f0126`).

| Layer | Type | Unit | No data | Description in the specification | Place |
|---|---|---|---|---|---|
| `/science/LSAR/GOFF/grids/frequencyA/pixelOffsets/[HH or VV]/layer[1, 2 or 3]/slantRangeOffset` | Float32 | `meters` | `nan` | "Raw (unculled, unfiltered) slant range pixel offsets" | GOFF, Table 5-3, page 33 |
| `.../layer[1, 2 or 3]/alongTrackOffset` | Float32 | `meters` | `nan` | "Raw (unculled, unfiltered) along-track pixel offsets" (text of the product writer of ISCE3) | GOFF, Table 5-3; ISCE3 0.25.21, `GOFF_writer.py`, lines 210 to 215 |
| `/science/LSAR/GUNW/grids/frequencyA/pixelOffsets/[HH or VV]/slantRangeOffset`, `alongTrackOffset` | Float32 | `meters` | `nan` | "Slant range offset", "Along-track offset" | GUNW, Table 5-3, pages 37 and 38 |

The GOFF specification states that the layers are the offsets "between a pair of coarsely
coregistered RSLC granules" and that they "are distributed without performing any conventional
post-processing operation i.e., layers might contain offsets outliers and are not low pass filtered
to reduce noise in the data" (section 2.2, page 5). The layers `layer1` to `layer3` differ in
resolution; `layer1` is the finest (section 4.3). In a GUNW product the offsets come from
"incoherent cross-correlation", either blended from the layers of a ROFF product or computed "on a
coarse radar grid" (GUNW specification, section 2.2, pages 5 and 6); the pilot product states
`isOffsetsBlendingApplied` = `False`. ISCE3 writes the slant range offset as the offset in range
samples times the slant range spacing of the reference image (`offsets_product.py`, lines 498 to
538). Neither specification states the sign of an offset.

## 3. The tools

### 3.1 Surface displacement, One pair

1. **Existing function.** The multiplication of NumPy 2.5.4, the version that `api/pyproject.toml`
   fixes. NumPy is the only library that the function uses. The product of a 32-bit array and one
   Python number is computed in 32-bit numbers.
2. **Specification and method.** Part 2.1 gives the layers. The formula is in the NISAR L1 and L2
   Algorithm Theoretical Basis Document, JPL D-95677, Rev A, 12 November 2023, section 5.9, page 46:
   "The absolute interferometric phase [...] is the unambiguous phase proportional to the
   differential range between the interferometric pair", equal to 4π/λ · δr, "where λ is the radar
   wavelength and δr is the one-way path length difference between the two antenna and target
   positions". The tool solves this relation for δr.
3. **Sign.** No document of the mission that was read states in words which direction of movement a
   positive phase means. The sign was read in the code of ISCE3 0.25.21:
   `cxx/isce3/signal/Crossmul.cpp`, lines 304 to 306, forms the interferogram as the reference image
   times the complex conjugate of the secondary image; lines 320 to 323 compute the phase that is
   removed as 4π · range spacing · range offset / wavelength; and `cxx/isce3/geometry/Geo2rdr.cpp`,
   line 164, computes the range offset as the position of a point in the second image minus its
   column in the first. A phase above zero is therefore a slant range that is longer on the
   secondary date than on the reference date: a movement away from the radar, when the reference
   date is the earlier one. The tool gives −λ/(4π) · phase, so a positive result is a movement
   toward the radar. MintPy states the same two conventions for its own files: a positive phase is a
   motion away from the satellite for a pair written "date1_date2" with date1 the earlier
   acquisition, and a positive displacement is a motion toward the satellite (`docs/FAQs.md`, lines
   5, 7 and 51, commit `b9bc621`). The same holds for the Sentinel-1 products of ASF HyP3 (part 5).
   The troposphere workflow of ISCE3 turns a delay into a phase as −(reference − secondary) · 4π /
   wavelength (`troposphere.py`, lines 137 and 450), which is the same sign. The solid Earth tides
   workflow multiplies the tide of the reference minus the tide of the secondary, projected on the
   line of sight, by −4π / wavelength (`solid_earth_tides.py`, lines 380 to 396); how that sign
   relates to the sign of the phase was not worked out (part 7).
4. **What the phase is relative to.** ATBD, section 5.9, page 47: the unwrapped phase equals the
   absolute phase plus 2π times "a fixed integer value"; the step that would find this integer, the
   absolute phase determination, "is not performed by the NISAR L-SAR processor. The unwrapped
   products RUNW and GUNW represent the unwrapped phase with respect to arbitrary, unspecified
   reference points". Section 5.9.1.6, page 51: the integration of the phase gradients gives the
   unwrapped phase "up to a constant offset". The result of the tool is therefore relative: only
   differences between its cells are measurements. The science team of the mission validates the
   displacements of single interferograms as differences between pairs of points ("point-to-point
   relative LOS measurements", ATBD of the Solid Earth team, Revision A, 25 May 2022, section 2.2.3,
   page 11), and it references a set of interferograms to "a common location" with MintPy (section
   3.2.1, page 16). The tool subtracts no reference value: its inputs are layers only, and no source
   gives a reference that can be found without a choice of the user.
5. **Corrections.** GUNW specification, section 2.2, page 6: the ionospheric phase screen "is
   included as a layer in the product but not applied to the data layers within GUNW by default",
   and the lookup tables of the solid Earth tides and of the hydrostatic and wet troposphere "are
   not removed from the interferometric data". The pilot product states
   `ellipsoidalFlatteningApplied` = `True` and `topographicFlatteningApplied` = `True` for the
   unwrapped interferogram; its four flags of ionospheric and tropospheric correction stand in the
   group `geocoding` and are described as corrections "to improve geolocation"; its group
   `radarGrid` holds `slantRangeSolidEarthTidesPhase`, `hydrostaticTroposphericPhaseScreen` and
   `wetTroposphericPhaseScreen` (`h5_metadata.json`). The tool removes nothing: the tables of the
   group `radarGrid` are not layers that the Data part receives.
6. **Connected components.** ATBD, section 5.9.1.7, page 51: a connected component is "a contiguous
   region of points in the unwrapped phase that is believed to have been reliably unwrapped in a
   self-consistent manner"; the components have "unique positive integer labels", and "Invalid
   unwrapped phase values are assigned a label of 0, indicating that they could not be reliably
   unwrapped". nisarqa counts the valid components "excluding 0 and the fill value"
   (`src/nisarqa/processing/calc.py`, lines 661 to 666, commit `a8bc425`). The pilot product states
   the unwrapping algorithm `snaphu`. The tool gives no data where the label is 0 or no data, and
   keeps every label above 0. The integer of the unwrapped phase is fixed inside one component only,
   so the difference between cells of two components can be wrong by whole turns of 2π; this is a
   conclusion of this note from the ATBD.
7. **Ionosphere phase screen.** The tool does not use it. No document that was read states the sign
   with which the screen is combined with the phase, and the ASF documentation lists known faults of
   the layer in the products released so far (file `data-availability/product-known-issues.md` of
   `ua-asf/nisar-docs`, section Ionospheric Correction Layer). Part 4.4 gives its values in the
   pilot pair.
8. **Source program.** MintPy 1.6.4, licence GPL-3.0-or-later. It reads NISAR GUNW products
   (`prep_nisar.py`) and is the program with which the Solid Earth team of the mission makes its
   displacement time series (ATBD of the Solid Earth team, sections 3.2 and 3.2.2). Its function
   `mintpy.utils.plot.scale_data2disp_unit` scales data in radians to metres with −wavelength /
   (4π). MintPy was run for the comparison only; none of its code is in the repository. Part 4.5
   gives the comparison.
9. **Legend.** No document of the mission gives a legend for a displacement. ArcGIS Pro draws the
   output of its conversion with a red-blue colour scheme (part 5). The tool uses the scale `RdBu`
   between the 2nd and the 98th percentile of the result, the percentiles of the rule `percentiles`
   of `legend_range` in `lynkeus.writing`. The range is not centred on zero, because the zero of the
   values is arbitrary (point 4): in the pair of 27 Sep to 9 Oct 2026 the 2nd percentile of the
   result is already above zero (part 4.4).
10. **Rules of the code.** The method sheet `docs/methods/displacement-state.md` lists the fifteen
    refusals. The tool takes two layers of one product file and one channel, the phase first.
11. **Limits.**
    1. The result is not a displacement of the ground where the atmosphere changed between the two
       dates more than the ground moved. The tool cannot tell the two apart.
    2. The layers `mask` and `validDataMask` of the product are not used.
    3. The tool does not project the line of sight to the vertical or to the horizontal. The group
       `radarGrid` holds the line-of-sight unit vectors (specification, section 4.4, page 22), which
       the Data part does not receive.

### 3.2 Pixel offsets as a second input: not built

A One pair map of a pixel offset layer would be the layer itself, in metres, as the coherence tool
passes its layer through. It was not built, for these reasons:

1. The specifications call the offsets raw: unculled, unfiltered, with possible outliers (part 2.5).
   A map of them is not a displacement of the ground without a culling and a filtering, and no
   published rule for these steps was found for the GUNW or GOFF layers in the documents read. The
   ATBD of the ice sheet products was not read.
2. In the pilot pair the offsets are not near zero over ground that is not known to have moved: the
   median slant range offset is -0.988 m and the median along-track offset is 1.257 m (part 4.8).
   The offsets therefore hold a shift of the whole image, and the layers do not say what they are
   relative to.
3. Neither specification states the sign of an offset (part 2.5).
4. No GOFF product covers the pilot area: NASA's catalogue held no GOFF product of track 141, frame
   67, in the validated and in the provisional collection on 15 Nov 2026. A GOFF input could
   therefore not be proven on files of the pilot area.

### 3.3 Surface displacement, Change: not built

The tool would be the difference of the displacement of two pairs. It was not built. Each unwrapped
phase is relative to its own arbitrary, unspecified reference points (part 3.1, point 4), so the
difference of two results holds the difference of two unknown constants in every connected
component. The published way to combine interferograms first references them to one common location
(ATBD of the Solid Earth team, section 3.2.1, page 16) and then estimates a time series (section
3.2.2). A reference location is a choice of the user, and a tool receives layers only. The
difference would also hold the difference of the atmosphere of four dates. No source that was read
defines the difference of two unreferenced interferograms as a measure of change. The tool stays out
of `TOOLS`. The second pair of the pilot area was received and converted (part 4.4), so the inputs
for a trial exist.

## 4. What was measured on real files

All measurements were made on 15 Nov 2026 on layers of the pilot area that were received through the
function of the project, `lynkeus.harmony.get_layer`, from products of the collections
`NISAR_L2_GUNW_V1` (validated) and `NISAR_L2_GUNW_PROVISIONAL_V1`. Every number of this part is
copied from a record of the folder `docs/research/records/analysis/displacement/`.

### 4.1 The records

| Record | SHA-256 | What it holds |
|---|---|---|
| `comparison.json` | `0373d0842c0a0035a3297ddebe3d9195d816b8daf85d60558a31c357f27c41b3` | The result of the tool against the result of the source program, for the two pairs (part 4.5) |
| `lynkeus_side.json` | `2fc412bc41c55e79dd0414766e324b74294a10c7eda1ca3df1f0e5ad39b35a6f` | The tool on the layers of the two pairs: inputs, result, legend, the run through `run_tool` and the refusals (parts 4.4 and 4.7) |
| `source_side.json` | `decd00d538094fbc8a6ae87e907ee8a07d2045890ab7fb5586c89590b79257f8` | The run of MintPy: version, licence, the places of its two statements, its environment and its results (part 4.5) |
| `h5_layers.json` | `e04af74a984f37ff93493f44c7001b80d6b5fd470d7cd961058621168d5f5398` | The layers received against the same rectangle of the HDF5 product files (part 4.6) |
| `h5_metadata.json` | `d6a7f2ad29760288c00175a0cfff0b694d0d07bff48f21ae2f5da40e2a64fd46` | Fields of twelve HDF5 product files, read over HTTPS: `centerFrequency`, the bandwidths of the two images, and for the pilot product and one GOFF product the processing parameters, the algorithms and the attributes of the layers (parts 2 and 4.3). The paths that it holds under `/data/` and `/home/` are values of the metadata of the products. The field `runConfigurationContents` was left out |
| `iso_check.json` | `584a59f8e1885be10925e11f2a8cd963f78650512c15e5cc98d06d6206116b49` | The centre frequency of the ISO XML file of each of these twelve products against the HDF5 field (part 4.3) |
| `iso_download.json` | `c04a3e5381e3e60a4dc7d7dd2c3f34de9997be255bff0384f802e7ab8eb0f948` | The ISO XML file of the pilot pair, fetched with the client of harmony-py in the two ways of signing in (part 2.3) |
| `harmony_scalar.json` | `7f03ccaebde043afaf708f3a79a1907bcbbfe6788cd8e8488571211f147f77a8` | The request to NASA Harmony for the field `centerFrequency`, and its refusal (part 2.3) |
| `layers_described.json` | `18a40d418f3d30e2d1ae6a447be9e15a2c14f0460cead361884fc9021dc51ea8` | Grid, values and labels of the ten layers received (parts 4.2, 4.4 and 4.8) |
| `received_a.json` | `3b8dfdbeaedaeff4a5ee28810120eeb6e58c7e4baec02eb175c1c36265cf5544` | The five layers of the pair of 9 and 21 Oct 2026 that were received before the change of the Data part, with their layer descriptions |
| `received_b.json` | `053446bf19cedc85f587e63218ad13d7fe33a817685b4cc4eba793cfdf9b9c66` | The offset layers of that pair and the two layers of the pair of 27 Sep and 9 Oct 2026, received with the changed Data part |
| `received_c.json` | `c9f13771f9bac2ad10344649b5b5a1dff261242af0c1040f0c154feaee746277` | The phase layer of the pair of 9 and 21 Oct 2026, received again with the changed Data part |
| `received_d.json` | `01edb7a4a9b67c5dbcf5fff42f64163c5b8043a6e410e206dbade622caa2b3b6` | The phase layer of the pair of 9 and 21 Oct 2026, received once more with the final state of the Data part, in which the address of the ISO XML file must be of a NASA host |
| `sidecar.json` | `3793c18b2ab9d29c772c0e8d2568ed1722e3e7aaf41dd1c805db560161cc70e4` | The small files that accompany the pilot product (ISO XML, run configuration, quality summary), searched for the centre frequency (part 2.3) |

### 4.2 The layers received

| Layer | Product | File | SHA-256 |
|---|---|---|---|
| `unwrappedPhase` (HH) | pair of 9 and 21 Oct 2026, validated | `gunw-unwrappedinterferogram-hh-unwrappedphase-20261009-20261021.tif` | `77024532e183d09a578088a47b362f470ef27bfc70066beb21f74ce568247583` |
| `connectedComponents` (HH) | the same | `gunw-unwrappedinterferogram-hh-connectedcomponents-20261009-20261021.tif` | `07cb2f746ef6469737e7cf072cc6813cf933425e4d383149e26b417a20aa23ab` |
| `ionospherePhaseScreen` (HH) | the same | `gunw-unwrappedinterferogram-hh-ionospherephasescreen-20261009-20261021.tif` | `bff50de01110c0e9f736e2b760af5e3b4e8e58db73ad88579ea2de38638b69e8` |
| `slantRangeOffset` (HH) | the same | `gunw-pixeloffsets-hh-slantrangeoffset-20261009-20261021.tif` | `98287d637dbd9e4d22b2dbc75af56b12288cb7104477f1e77f04453c52f50b3c` |
| `alongTrackOffset` (HH) | the same | `gunw-pixeloffsets-hh-alongtrackoffset-20261009-20261021.tif` | `5374e2b6ec82e671c7df2fb04343e46a577302fee25f368f9bf96e742969f36c` |
| `unwrappedPhase` (HH) | pair of 27 Sep and 9 Oct 2026, provisional | `gunw-unwrappedinterferogram-hh-unwrappedphase-20260927-20261009.tif` | `9e9390b2b46269b3d35b04624e95fa537bf318bc19f400277f77d7967c25f5d4` |
| `connectedComponents` (HH) | the same | `gunw-unwrappedinterferogram-hh-connectedcomponents-20260927-20261009.tif` | `057974486c2c116c5a2aace2e40f16b8ba02fc3919c977d04bd78ec4a2b350fd` |

The products are
`NISAR_L2_PR_GUNW_032_141_D_067_033_4000_SH_20261009T234330_20261009T234405_20261021T234330_20261021T234405_P05036_N_F_J_001`
and
`NISAR_L2_PR_GUNW_031_141_D_067_032_4000_SH_20260927T234330_20260927T234405_20261009T234330_20261009T234405_P05023_N_F_J_001`.
Each file is the Cloud Optimized GeoTIFF that the Data part wrote. Its grid has 471 columns by 496
rows of 80 m in EPSG:32619, 233,616 cells. In every layer 9,923 cells hold no data and 223,693 hold
a value. The layers `ionospherePhaseScreenUncertainty`, `coherenceMagnitude` (80 m) and
`correlationSurfacePeak` of the first pair were received as well (`layers_described.json`).

| Measure | Pair of 9 and 21 Oct 2026 | Pair of 27 Sep and 9 Oct 2026 |
|---|---|---|
| Phase: lowest and highest value (rad) | `-10.02682876586914`, `9.785455703735352` | `-15.53519058227539`, `7.752892017364502` |
| Phase: median (rad) | `-1.0718718767166138` | `-4.208395004272461` |
| Connected components: cells with the label 0 | 26,889 | 68,669 |
| Connected components: cells with the label 1 | 196,804 | 155,024 |
| Other labels | none | none |
| Cells with a phase and the label 0 | 26,889 | 68,669 |
| Cells with a phase and no label | 0 | 0 |

The phase holds a value in every cell with the label 0. Without the layer of the connected
components, a map of the phase would show these cells as if they were measurements.

### 4.3 The centre frequency in twelve product files

The field `centerFrequency` was read from the HDF5 product file over HTTPS, and the attribute
`center frequency` from the ISO XML file of the same product (`h5_metadata.json`, `iso_check.json`).
The products are the two of the pilot area, three GUNW products for each of the mode codes 2000,
4000 and 7700 of the validated and the provisional collection, and one GOFF product.

| Product | Mode code | `centerFrequency` of the HDF5 file (Hz) | `center frequency` of the ISO XML file (Hz) | Equal |
|---|---|---|---|---|
| `NISAR_L2_PR_GUNW_032_141_D_067_033_4000_SH_20261009T234330_20261009T234405_20261021T234330_20261021T234405_P05036_N_F_J_001` | 4000 | `1239000000.0` | `1239000000.0` | yes |
| `NISAR_L2_PR_GUNW_031_141_D_067_032_4000_SH_20260927T234330_20260927T234405_20261009T234330_20261009T234405_P05023_N_F_J_001` | 4000 | `1239000000.0` | `1239000000.0` | yes |
| `NISAR_L2_PR_GUNW_032_141_D_085_033_2000_SH_20261009T235335_20261009T235349_20261021T235335_20261021T235349_P05036_N_P_J_001` | 2000 | `1229000000.0` | `1229000000.0` | yes |
| `NISAR_L2_PR_GUNW_032_141_D_078_033_2000_SH_20261009T234941_20261009T235013_20261021T234941_20261021T235013_P05036_N_F_J_001` | 2000 | `1229000000.0` | `1229000000.0` | yes |
| `NISAR_L2_PR_GUNW_032_139_A_041_033_2000_SH_20261009T200900_20261009T200925_20261021T200900_20261021T200925_P05023_N_F_J_001` | 2000 | `1229000000.0` | `1229000000.0` | yes |
| `NISAR_L2_PR_GUNW_032_141_D_085_033_4000_SH_20261009T235335_20261009T235345_20261021T235335_20261021T235345_P05036_N_P_J_001` | 4000 | `1239000000.0` | `1239000000.0` | yes |
| `NISAR_L2_PR_GUNW_032_141_D_084_033_4000_SH_20261009T235308_20261009T235336_20261021T235308_20261021T235336_P05036_N_F_J_001` | 4000 | `1239000000.0` | `1239000000.0` | yes |
| `NISAR_L2_PR_GUNW_032_139_D_091_033_4000_SH_20261009T203740_20261009T203744_20261021T203740_20261021T203744_P05023_N_P_J_001` | 4000 | `1239000000.0` | `1239000000.0` | yes |
| `NISAR_L2_PR_GUNW_032_141_D_055_033_7700_SH_20261009T233633_20261009T233713_20261021T233633_20261021T233713_P05036_N_P_J_001` | 7700 | `1257500000.0` | `1257500000.0` | yes |
| `NISAR_L2_PR_GUNW_032_141_D_054_033_7700_SH_20261009T233558_20261009T233634_20261021T233558_20261021T233634_P05036_N_P_J_001` | 7700 | `1257500000.0` | `1257500000.0` | yes |
| `NISAR_L2_PR_GUNW_032_131_A_038_033_7700_SH_20261009T064807_20261009T064813_20261021T064807_20261021T064813_P05023_N_P_J_001` | 7700 | `1257500000.0` | `1257500000.0` | yes |
| `NISAR_L2_PR_GOFF_032_141_D_055_033_7700_SH_20261009T233633_20261009T233713_20261021T233633_20261021T233713_P05036_N_P_J_001` | 7700 | `1257500000.0` | `1257500000.0` | yes |

The search by mode code found no GUNW product with the codes 2020, 0500, 0505, 2005 and 4005, so the
bandwidth of 5 MHz was not read. Each of the twelve ISO XML files holds exactly one attribute
`center frequency`. In the two products of the pilot area the reference and the secondary image have
the same range bandwidth, 40 MHz; the product of 9 and 21 Oct 2026 states `isMixedMode` = `False`
for its reference image.

Received through the changed Data part, the phase layer of each pair of the pilot area carries
`frequency` = `1239000000.0` (`received_b.json`, `received_c.json`). The layer of the pair of 9 and
21 Oct 2026 was received once more with the final state of the Data part and carries the same value
(`received_d.json`). The phase layer of the first pair that was received before the change carries
no such field (`received_a.json`).

### 4.4 Surface displacement, One pair

| Measure | Pair of 9 and 21 Oct 2026 | Pair of 27 Sep and 9 Oct 2026 |
|---|---|---|
| Centre frequency of the layer description (Hz) | `1239000000.0` | `1239000000.0` |
| Wavelength (m) | `0.2419632429378531` | `0.2419632429378531` |
| Factor (m per rad) | `-0.01925482308005223` | `-0.01925482308005223` |
| Cells | 233,616 | 233,616 |
| Cells with a value | 196,804 | 155,024 |
| Cells with `nan` | 36,812 | 78,592 |
| of these: no phase | 9,923 | 9,923 |
| of these: a phase and the label 0 | 26,889 | 68,669 |
| Lowest and highest value (m) | `-0.06903063505887985`, `0.12131945043802261` | `-0.008647125214338303`, `0.1922072470188141` |
| Median (m) | `0.02217055857181549` | `0.08200004696846008` |
| Legend: 2nd and 98th percentile (m) | `-0.026392306499183178`, `0.07798769235610963` | `0.03276995480060577`, `0.12282590895891192` |
| SHA-256 of the values of the result | `5e6c37b691f7ceb9d81442dcccc7f9d00f3738c297c4c53e218e2a565b01b311` | `2cfc62ef3163384b2609674e3b568a9aee3f7f3966ee8409fa1b5a12c361f661` |

The cells without a value are exactly the cells without a phase and the cells with the label 0
(`lynkeus_side.json`). The medians of the two results, about 0.022 m and 0.082 m, differ by 0.06 m
between two pairs of twelve days over the same ground; the level of a result has no meaning (part
3.1, point 4).

The ionosphere phase screen of the pair of 9 and 21 Oct 2026 lies between `16.571060180664062` and
`32.46390151977539` rad (median `25.313508987426758`), and its uncertainty layer between
`0.8676495552062988` and `1.7222509384155273` rad, in the same 223,693 cells
(`layers_described.json`). The screen spans about 16 rad over the area, which is more than the span
of the phase in the cells with the label 1 (`-6.3007307052612305` to `3.585108995437622` rad). What
this means for the product was not studied.

### 4.5 Comparison with the source program

The comparison was made on 15 Nov 2026 (`comparison.json`, `source_side.json`, `lynkeus_side.json`).

| | |
|---|---|
| Platform | `Linux-6.8.0-146-generic-x86_64-with-glibc2.41`, Python 3.13.18 on both sides |
| Lynkeus | `displacement_state`, with numpy 2.5.4. The files were read with `read_layer` of `lynkeus.writing`, rasterio 1.5.2 (GDAL 3.12.2) |
| Source program | MintPy 1.6.4 of the Python Package Index, licence GPL-3.0-or-later (metadata of the package). Function `mintpy.utils.plot.scale_data2disp_unit`, file `utils/plot.py`, lines 1922 to 2025 (SHA-256 of the file `5f2edb4ec5c798f98903d9bb70bca965ece96bfa017d8d6845177fc2a05bdfe6`); the factor −wavelength / (4π) is computed at line 1972 |
| Statement replaced | `prep_nisar.py`, line 775, sets `WAVELENGTH` to the speed of light divided by the field `centerFrequency` of the product, whose path line 83 gives (SHA-256 of the file `598b93df157dca35436359f2b4f2f6ec0e4220c973da76d28196f405da1d397a`). The module needs the GDAL Python bindings (`osgeo`), which the environment did not hold, and its function reads a whole product file. The line was therefore read and not executed: the same division was executed with `mintpy.constants.SPEED_OF_LIGHT` (`299792458`) and the value of `centerFrequency` that was read from the HDF5 product file (`1239000000.0` Hz, part 4.3) |
| Call | `scale_data2disp_unit(phase, metadata, disp_unit="m")` with `UNIT` = `radian` and `WAVELENGTH` = `0.2419632429378531`. The function returned the scale `-0.01925482308005223` and the unit `m` |
| Environment of the source program | numpy 2.5.4, scipy 1.18.1, h5py 3.16.0, matplotlib 3.11.2, pyproj 3.8.0, rasterio 1.5.2 (GDAL 3.12.2); 24 packages in all. MintPy was installed without its dependencies, and no further module had to be added for the import of `mintpy.utils.plot` |
| Input of both sides | The same values: the SHA-256 of the phase array is equal on both sides for both pairs |

| Measure | Pair of 9 and 21 Oct 2026 | Pair of 27 Sep and 9 Oct 2026 |
|---|---|---|
| Cells with a value in the tool | 196,804 | 155,024 |
| Cells with a value in the source program | 223,693 | 223,693 |
| Cells with a value in the source program only (label 0) | 26,889 | 68,669 |
| Cells with a value in the tool only | 0 | 0 |
| Cells that differ, among those with a value in the tool | 0 | 0 |
| Largest difference (m) | `0.0` | `0.0` |
| Centre frequency of the layer and of the product (Hz) | `1239000000.0`, `1239000000.0` | `1239000000.0`, `1239000000.0` |

The arrays are bit-identical in every cell in which the tool gives a value. What the comparison does
not show:

1. MintPy as a workflow on the HDF5 product files (`prep_nisar`, the inversion of a network of
   interferograms, the reference point). One function of MintPy was run on the values of the layers.
2. The masking. The function of MintPy has no mask; the tool was checked against the rule itself
   (part 4.4).
3. Cells with an infinite phase: the layers hold none. The tests of
   `api/tests/analysis/test_displacement.py` cover them on made-up grids.
4. Other areas, the channel VV and other bandwidths. One area, two pairs, the channel HH and the
   bandwidth of 40 MHz were compared.

### 4.6 The layers against the product files

The rectangle of each layer was read from the original HDF5 product file over HTTPS and compared
with the file that the Data part wrote (`h5_layers.json`). The grid of the product has 4,509 columns
by 4,455 rows of 80 m; the rectangle of the pilot area starts at row 1,613 and column 1,708.

| Layer | Cells with a value in both | Equal in these cells | Cells with a value in the product only |
|---|---|---|---|
| `unwrappedPhase`, 9 and 21 Oct 2026 | 223,693 | yes, bit for bit | 9,923 |
| `connectedComponents`, 9 and 21 Oct 2026 | 223,693 | yes | 9,923 |
| `ionospherePhaseScreen`, 9 and 21 Oct 2026 | 223,693 | yes, bit for bit | 9,923 |
| `unwrappedPhase`, 27 Sep and 9 Oct 2026 | 223,693 | yes, bit for bit | 9,923 |
| `connectedComponents`, 27 Sep and 9 Oct 2026 | 223,693 | yes | 9,923 |

The 9,923 cells that hold a value in the product only are the cells without data of the received
layers. `docs/research/analysis.md`, part 4.1, records for the samples of level 1 that NASA Harmony
empties the cells whose centre lies outside the requested box; whether these 9,923 cells are such
cells was not measured here.

### 4.7 The tool through `run_tool`, and the refusals

`lynkeus.tools.run_tool` read the two files of each pair, called the tool from `TOOLS` and wrote the
result (`lynkeus_side.json`). For both pairs the values of the written file equal the values of the
function, the grid equals the grid of the inputs, and the unit of the band is `m`. The files have
658,561 and 567,475 bytes and hold no reduced copy. The record of each result names the two layers,
the method and "Reduced copies made by averaging the values."

Refusals that were tried through `run_tool` on the real files, each with the sentence that it gave:

| Trial | Sentence |
|---|---|
| The two layers in the other order (9 and 21 Oct 2026) | `The layer "Connected components HH, 9 Oct 2026 to 21 Oct 2026" is the layer unwrappedInterferogram/HH/connectedComponents of its product, and the tool reads the layer unwrappedPhase.` |
| The phase alone (9 and 21 Oct 2026) | `The number of input layers must be 2, and it is 1.` |
| A phase stored without its centre frequency (9 and 21 Oct 2026) | `The layer "Unwrapped phase HH, 9 Oct 2026 to 21 Oct 2026" does not record the centre frequency of its radar band; receive it again with Get layer.` |
| UnwrappedInterferogram/HH/ionospherePhaseScreen in place of the phase (9 and 21 Oct 2026) | `The layer "Ionosphere phase screen HH, 9 Oct 2026 to 21 Oct 2026" is the layer unwrappedInterferogram/HH/ionospherePhaseScreen of its product, and the tool reads the layer unwrappedPhase.` |
| UnwrappedInterferogram/HH/ionospherePhaseScreen in place of the connected components (9 and 21 Oct 2026) | `The layer "Ionosphere phase screen HH, 9 Oct 2026 to 21 Oct 2026" is the layer unwrappedInterferogram/HH/ionospherePhaseScreen of its product, and the tool reads the layer connectedComponents.` |
| UnwrappedInterferogram/HH/coherenceMagnitude in place of the phase (9 and 21 Oct 2026) | `The layer "Coherence HH, 80 m, 9 Oct 2026 to 21 Oct 2026" is the layer unwrappedInterferogram/HH/coherenceMagnitude of its product, and the tool reads the layer unwrappedPhase.` |
| UnwrappedInterferogram/HH/coherenceMagnitude in place of the connected components (9 and 21 Oct 2026) | `The layer "Coherence HH, 80 m, 9 Oct 2026 to 21 Oct 2026" is the layer unwrappedInterferogram/HH/coherenceMagnitude of its product, and the tool reads the layer connectedComponents.` |
| PixelOffsets/HH/slantRangeOffset in place of the phase (9 and 21 Oct 2026) | `The layer "Slant range offset HH, 9 Oct 2026 to 21 Oct 2026" is the layer pixelOffsets/HH/slantRangeOffset of its product, and the tool reads the layer unwrappedPhase.` |
| PixelOffsets/HH/slantRangeOffset in place of the connected components (9 and 21 Oct 2026) | `The layer "Slant range offset HH, 9 Oct 2026 to 21 Oct 2026" is the layer pixelOffsets/HH/slantRangeOffset of its product, and the tool reads the layer connectedComponents.` |
| The connected components of another pair (9 and 21 Oct 2026) | `The two layers are not of the same product file.` |
| The two layers in the other order (27 Sep and 9 Oct 2026) | `The layer "Connected components HH, 27 Sep 2026 to 9 Oct 2026" is the layer unwrappedInterferogram/HH/connectedComponents of its product, and the tool reads the layer unwrappedPhase.` |
| The phase alone (27 Sep and 9 Oct 2026) | `The number of input layers must be 2, and it is 1.` |
| A phase stored without its centre frequency (27 Sep and 9 Oct 2026) | `The layer "Unwrapped phase HH, 27 Sep 2026 to 9 Oct 2026" does not record the centre frequency of its radar band; receive it again with Get layer.` |

The tool was not run as a job of the web service.

### 4.8 The pixel offsets of the pilot pair

| Measure | `slantRangeOffset` | `alongTrackOffset` |
|---|---|---|
| Cells with a value | 223,693 | 223,693 |
| Lowest and highest value (m) | `-1.3226752281188965`, `-0.6676369905471802` | `0.09659607708454132`, `1.9972424507141113` |
| Median (m) | `-0.9881583452224731` | `1.2568720579147339` |
| 2nd and 98th percentile (m) | `-1.066510992050171`, `-0.8192856192588805` | `0.49278629422187803`, `1.6934837245941161` |

The layers are those of the GUNW product of 9 and 21 Oct 2026 (`layers_described.json`). The results
of the phase of the same pair span about 0.19 m (part 4.4). The offsets are about one metre from
zero in every cell, with a spread of some tenths of a metre.

## 5. How GIS programs offer this function

The table follows the row layout of `docs/research/analysis.md`, part 5. A statement is made only
where the page states it.

| | |
|---|---|
| ArcGIS Pro | The tool Convert SAR Units of the Synthetic Aperture Radar toolset (Image Analyst toolbox) has the conversion type "Unwrapped phase to displacement": "The unwrapped interferogram phase in radians will be converted to displacement using the sensor's wavelength." Its parameters are Input Radar Data, Output Radar Data and the optional Conversion Type. The output is "rendered using the red-blue continuous color scheme". The page gives no formula, no sign, no unit of the output and no word on a reference or on the atmosphere ([Convert SAR Units](https://pro.arcgis.com/en/pro-app/latest/tool-reference/image-analyst/convert-sar-units.htm)). The page of the DInSAR workflow lists the tool as the last step before the terrain correction, for Sentinel-1 SLC data ([DInSAR workflow](https://pro.arcgis.com/en/pro-app/latest/help/analysis/image-analyst/dinsar-workflow-s1.htm)) |
| QGIS | The page of raster analysis algorithms of QGIS 3.44 holds no algorithm for an interferogram or a phase: the words do not occur in it ([Raster analysis algorithms](https://docs.qgis.org/3.44/en/docs/user_manual/processing_algs/qgis/rasteranalysis.html)). The general means is the Raster Calculator, in which a band is written as `layer_name@band_number` and multiplied by a number ([Raster Calculator](https://docs.qgis.org/3.44/en/docs/user_manual/working_with_raster/raster_analysis.html)). The user has to know the wavelength and the sign |
| Reference program | MintPy 1.6.4, the source program of the comparison (part 3.1, point 8). The page of the operator Phase to Displacement of ESA SNAP 14.0.0 was not found at the address tried, so SNAP is not described |
| Standard | ASF, for its Sentinel-1 InSAR products: the older image is the reference, so that "positive values in the resulting unwrapped interferogram represent movement away from the SAR platform"; the line-of-sight displacement file has the sign "opposite to that of the unwrapped phase: positive values indicate motion towards the sensor"; the unwrapped phase is zero at a reference point, which is by default the pixel of the highest coherence, and the guide gives a correction for another reference point ([Sentinel-1 InSAR Product Guide](https://hyp3-docs.asf.alaska.edu/guides/insar_product_guide/)). These statements are about Sentinel-1 products of another processor and are given for the convention only |
| Function used | `displacement_state` in `api/src/lynkeus/analysis/displacement.py`: −wavelength / (4π) · phase, in metres, where the connected component is above 0. Method sheet `docs/methods/displacement-state.md` |
| Limits | ArcGIS Pro takes the wavelength of the sensor; the page does not say from where. Lynkeus takes the centre frequency that the product states, and refuses a layer without it. No program read here masks by the connected components in this step, and none names the reference of the result on the page of the tool; the method sheet of Lynkeus states both |
| Read on | 15 Nov 2026 |

## 6. Sources, programs, libraries and data of this part

| Item | Version | Licence | Use |
|---|---|---|---|
| [NISAR L1 and L2 Algorithm Theoretical Basis Document, JPL D-95677](https://nisar.asf.earthdatacloud.nasa.gov/NISAR-SAMPLE-DATA/DOCS/NISAR_D-95677_NASA_L1_L2_ATBD_20231112_R3.4_w-sigs.pdf) | Rev A, 12 Nov 2023 (SHA-256 of the PDF `c7301021ef1e76c5abbd094d6438dbb59464135754486ec5dad9691bd35fe0c3`) | Document of NASA/JPL | Formula, reference of the phase, connected components (section 5.9) |
| [NISAR L2 GUNW Product Specification, JPL D-102272](https://nisar.asf.earthdatacloud.nasa.gov/NISAR-SAMPLE-DATA/DOCS/NISAR_D-102272_RevE_NASA_SDS_Product_Specification_L2_GUNW_Nov8_2024_w-sigs.pdf) | Rev E, 1.2.1, 8 Nov 2024 | Document of NASA/JPL | Layers, units, corrections that are not applied |
| [NISAR L2 GOFF Product Specification, JPL D-105010](https://nisar.asf.earthdatacloud.nasa.gov/NISAR-SAMPLE-DATA/DOCS/NISAR_D-105010_RevC_NASA_SDS_Product_Specification_L2_GOFF_Nov8_2024_w-sigs.pdf) | Rev C, 1.2.1, 8 Nov 2024 | Document of NASA/JPL | Pixel offset layers |
| Product specification file `nisar_L2_GUNW.xml` | Version 1.6.0, in nisarqa at commit `a8bc425` | As nisarqa | Layers of the products of the pilot area |
| SDS L-SAR Product File Naming Conventions, JPL D-102255 | Rev C, 19 Oct 2025 | Document of NASA/JPL | Times of the two acquisitions in the name of a product file; mode code |
| [Algorithms to Validate NISAR L2 Coseismic, Transient and Secular Displacement Requirements](https://gitlab.com/nisar-science-algorithms/solid-earth/ATBD/-/blob/main/docs/SES_ATBD.pdf) | Revision A, 25 May 2022 (SHA-256 of the PDF `0f34048614129c09f349e46b2adabb8492d7d21ffcb0ef5accce750f51b71c0f`) | Document of the NISAR Solid Earth Team; the first page states "All rights reserved" | Relative measurements; referencing; MintPy as the program of the science team |
| [ISCE3](https://github.com/isce-framework/isce3) | `v0.25.21` | Apache-2.0 | Program of the mission: order of the two images, flattening, speed of light, wavelength of a product, writers of the layers |
| [nisarqa](https://github.com/isce-framework/nisarqa) | Commit `a8bc425`, 30 Sep 2026 (UTC) | BSD-3-Clause or Apache-2.0, at the choice of the user (`README.md`, section License) | Wavelength of a product; meaning of the label 0; product specification XML files |
| [MintPy](https://github.com/insarlab/MintPy) | 1.6.4 (package of the Python Package Index) for the code; commit `b9bc621` of 7 Nov 2026 for the file `docs/FAQs.md` | GPL-3.0-or-later | Source program of the comparison; sign conventions. Run only; no code copied |
| [ASF NISAR documentation, repository `ua-asf/nisar-docs`](https://github.com/ua-asf/nisar-docs) | Commit `47d55b1`, 13 Nov 2026 | CC0 1.0 Universal (file `LICENSE`) | Centre frequencies of the acquisition modes; product pages of GUNW and GOFF; known issues |
| [ASF HyP3, Sentinel-1 InSAR Product Guide](https://hyp3-docs.asf.alaska.edu/guides/insar_product_guide/) | Page as read on 15 Nov 2026 | Not read | Convention of sign and of the reference point in another product family (part 5) |
| ArcGIS Pro documentation; QGIS User Guide 3.44 | Pages as read on 15 Nov 2026 | Not read | Part 5 |
| [NumPy](https://pypi.org/pypi/numpy/2.5.4/json) | 2.5.4 | `BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0` (licence expression of the package on PyPI, as `docs/research/analysis.md` records it) | The only library that the function uses |
| harmony-py; earthaccess; rasterio; h5py; fsspec; PyMuPDF | 1.8.0; 0.19.0; 1.5.2 (GDAL 3.12.2); 3.16.0 (HDF5 2.0.0); 2026.9.0; 2.1 | Not read | Receiving the layers, reading the product files and the text of the PDF documents for part 4. The function does not use them |
| scipy, matplotlib, pyproj | 1.18.1, 3.11.2, 3.8.0 | Not read | Environment of MintPy in the comparison. Lynkeus does not use them here |
| NISAR GUNW products of the collections `NISAR_L2_GUNW_V1` and `NISAR_L2_GUNW_PROVISIONAL_V1`; one GOFF product of `NISAR_L2_GOFF_V1` | The twelve products of part 4.3; CRID `P05036` and `P05023` | NASA data | Measurements of part 4 |

The two articles that are usually cited for the relation of phase and displacement, Massonnet and
Feigl (1998), <https://doi.org/10.1029/97RG03139>, and Rosen et al. (2000),
<https://doi.org/10.1109/5.838084>, could not be read in full on 15 Nov 2026, so no statement of
this note rests on them. The ATBD of the mission cites Simons and Rosen (2007) for the formula; that
text was not read.

## 7. Not confirmed, and questions for the owner of the project

1. **The sign on data with a known movement.** Part 3.1, point 3: the sign was read in the code of
   ISCE3 and agrees with MintPy and with the convention of ASF. It was not checked against a
   movement that is known from another measurement. The sign of the solid Earth tides table of ISCE3
   was not reconciled with it.
2. **The change of the layer description.** The field `frequency` exists on the server only. The
   copy of the format in `web/src/shared/layer.ts` and the pages that show a layer do not know it.
   Whether the field is wanted in this form, and whether the STAC record of a layer should carry the
   frequency as well, is for the owner to decide.
3. **The change of the Data part.** `get_layer` now fetches one more file for a phase layer of a
   GUNW product. When the file cannot be read, the layer is received without a frequency and the
   tool refuses it. The other choice, to refuse the layer itself, was not taken.
4. **The ISO XML file.** No document was found that specifies its content. Its attribute was
   compared with the HDF5 field in twelve products acquired between 27 Sep and 21 Oct 2026 (CRID
   `P05036` and `P05023`); products of the bandwidth 5 MHz, of S-band and of mixed modes were not
   read.
5. **Channel VV, other bandwidths, more than one component, a later reference date.** Not received
   or not found (method sheet, Not yet confirmed).
6. **The web service and the browser.** The tool ran through `run_tool`, not as a job of the web
   service, and nothing was seen in a browser.
7. **The heading "Input layer" of the method sheet.** The sheet follows the headings of
   `docs/methods/coherence-state.md`, as asked, although the tool has two inputs; the two
   backscatter sheets use "Input layers".
8. **A reference for the result.** A reference point or a reference area would make the level of the
   result meaningful and would allow the tool Change. It needs an input that is not a layer, which
   the form of a tool does not have today.
