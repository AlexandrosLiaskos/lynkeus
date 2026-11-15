# Surface displacement, One pair

| | |
|---|---|
| Tool | `displacement-state` (Analysis tab, group Surface displacement, button One pair) |
| NISAR product | GUNW, Level-2 Geocoded Unwrapped Interferogram |
| Result | Displacement of the ground along the line of sight of the radar between the two dates of one pair, in metres (m). The values are relative, and the effects of the atmosphere are not removed |
| State | The comparison (D-17) was made on 15 Nov 2026 on the layers of two pairs of the pilot area, which were received through `lynkeus.harmony.get_layer`. The tool was run on them directly and through `lynkeus.tools.run_tool`. It was not run as a job of the web service. On the same day the work was fitted onto the branch `analysis-raster`; the phase layer of the pair of 9 and 21 Oct 2026 was received again, and the tool and the comparison were repeated on the code of commit `6b7572e`, with the same frequency, the same results and the same legends. |

## In brief

| | |
|---|---|
| What it shows | The movement of the ground toward or away from the radar along its viewing direction between the two dates of one pair, relative to an unknown level, so only differences inside one map carry meaning. |
| Input | The Unwrapped phase layer (`unwrappedPhase`) and the Connected components layer (`connectedComponents`) of one GUNW product, channel and area. The phase holds the change of the distance to the radar as an angle. The components mark the cells where that angle is unreliable. |
| Formula | `displacement = -wavelength / (4 * pi) * phase`, with the wavelength as the speed of light divided by the centre frequency of the product. Cells of the connected component 0 are left empty. |
| Result | Metres (m), positive toward the radar. The legend runs from the 2nd to the 98th percentile of the result, from red (away from the radar) to blue (toward the radar). |
| How to read | A higher value is a movement toward the radar relative to a lower value. The radar looks at the ground from the side, so a value is neither a vertical nor a horizontal movement. The value of one cell alone is not a measurement: compare cells inside one map. |
| Limits | The values are not corrected for the atmosphere or the solid Earth tides; 96 % of the cells of the two test pairs span 0.10 m and 0.09 m, and the test area has no ground movement known to compare with. The sign was derived from the software of the mission and was not checked on ground with a known movement. Cells where the unwrapping is unreliable are left empty. |
| Checked | The result equals the output of the function `scale_data2disp_unit` of MintPy 1.6.4 for the same phase and wavelength, in every cell with a value (lower Merrimack River, pairs of 27 Sep to 9 Oct and 9 to 21 Oct 2026, channel HH). The empty cells were checked by a count. No ground with a known movement was compared. |
| References | [NISAR L1 and L2 Algorithm Theoretical Basis Document, JPL D-95677 Rev A](https://nisar.asf.earthdatacloud.nasa.gov/NISAR-SAMPLE-DATA/DOCS/NISAR_D-95677_NASA_L1_L2_ATBD_20231112_R3.4_w-sigs.pdf). [NISAR L2 GUNW Product Specification, JPL D-102272 Rev E](https://nisar-docs.asf.alaska.edu/product-specification/). [ISCE3 0.25.21](https://github.com/isce-framework/isce3) and [MintPy 1.6.4](https://github.com/insarlab/MintPy). |

## Reference

1. NISAR L1 and L2 Algorithm Theoretical Basis Document, JPL D-95677, Rev A, 12 November 2023
   (<https://nisar.asf.earthdatacloud.nasa.gov/NISAR-SAMPLE-DATA/DOCS/NISAR_D-95677_NASA_L1_L2_ATBD_20231112_R3.4_w-sigs.pdf>,
   read 15 Nov 2026). Section 5.9, pages 46 and 47: the relation of the phase to the path length,
   the unwrapped phase and what it is relative to. Sections 5.9.1.6 and 5.9.1.7, page 51: the
   constant offset of the unwrapped phase and the labels of the connected components.
2. NASA SDS Product Specification, Level-2 Geocoded Unwrapped Interferogram (L2 GUNW), JPL D-102272,
   Rev E, version 1.2.1, 8 November 2024. Section 2.2, pages 5 and 6; Table 5-3: `centerFrequency`
   on page 29, `unwrappedPhase` on pages 34 and 35, `connectedComponents` on pages 34 and 35,
   `ionospherePhaseScreen` on page 35. Rev E is the revision that the ASF DAAC links
   (<https://nisar-docs.asf.alaska.edu/product-specification/>, read 15 Nov 2026).
3. Product specification of version 1.6.0, which the products of the pilot area follow: file
   [`nisar_L2_GUNW.xml`](https://github.com/isce-framework/nisarqa/blob/a8bc425f5e8873174471d6a12fe622df338623d1/src/nisarqa/product_specs/1.6.0/nisar_L2_GUNW.xml),
   nisarqa commit `a8bc425` of 30 Sep 2026. Its entries of `centerFrequency`, `unwrappedPhase` and
   `connectedComponents` are those of version 1.2.1.
4. ISCE3, the program of the mission, version 0.25.21: [`Crossmul.cpp`, lines 304 to 306 and 320 to
   323](https://github.com/isce-framework/isce3/blob/v0.25.21/cxx/isce3/signal/Crossmul.cpp#L304-L323)
   (the order of the two images and the phase that is removed), [`Constants.h`, line
   50](https://github.com/isce-framework/isce3/blob/v0.25.21/cxx/isce3/core/Constants.h#L50) (the
   speed of light) and [`solid_earth_tides.py`, lines 269 to
   272](https://github.com/isce-framework/isce3/blob/v0.25.21/python/packages/nisar/workflows/solid_earth_tides.py#L269-L272)
   (the wavelength of a GUNW product).
5. Science Data Systems (SDS) L-SAR Product File Naming Conventions, JPL D-102255, Rev C, 19 October
   2025. Section 3.8, page 18. The tool reads the product type and the times of the reference and of
   the secondary acquisition from the name of the product file.
6. NISAR Solid Earth Team (2022). Algorithms to Validate NISAR L2 Coseismic, Transient and Secular
   Displacement Requirements, Algorithm Theoretical Basis Document, Revision A, 25 May 2022
   (<https://gitlab.com/nisar-science-algorithms/solid-earth/ATBD/-/blob/main/docs/SES_ATBD.pdf>,
   read 15 Nov 2026). Sections 2.2.3 and 3.2.1, pages 11, 15 and 16: the displacements of an
   interferogram are compared as differences between points, and a set of interferograms is
   referenced to one common location.

## Input layer

The tool has two inputs, in this order. Both are layers of the same GUNW product file and of the
same polarisation channel, at the spacing of 80 m.

| No. | Layer | Path in the product | Type | Unit | No data |
|---|---|---|---|---|---|
| 1 | Unwrapped phase | `/science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram/[HH or VV]/unwrappedPhase` | Float32 | `radians` in the product; `rad` in the layer description | `nan` |
| 2 | Connected components | `/science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram/[HH or VV]/connectedComponents` | UInt16 | `1` | `65535` in the product; `nan` in the array that the tool receives |

The tool also needs the centre frequency of the radar band of the product, in hertz. The product
holds it as `/science/LSAR/GUNW/grids/frequencyA/centerFrequency` (Float64, unit `hertz`). The tool
reads it from the field `frequency` of the layer description of the phase. The Data part fills this
field when it receives the layer `unwrappedPhase` of a GUNW product, and for no other layer: NASA
Harmony does not deliver the field of the product, so the Data part reads the same value from the
ISO XML file that accompanies the product in NASA's archive
(`docs/research/analysis-displacement.md`, part 2.3). The frequency
differs between the acquisition modes: 1,229,000,000 Hz, 1,239,000,000 Hz and 1,257,500,000 Hz were
read in products of the range bandwidths 20, 40 and 77 MHz (part 4.3 of the same note). The tool
therefore holds no wavelength of its own.

A GUNW product holds one pair of dates, the reference and the secondary. Under the current
processing baseline, only the group `frequencyA` is processed into GUNW products (specification,
section 4.3). The tool does not read the layers `mask`, `validDataMask`, `coherenceMagnitude`,
`ionospherePhaseScreen` and `ionospherePhaseScreenUncertainty` of the product.

### What the tool refuses

The tool receives the arrays of the two layers and their layer descriptions. It makes the checks
below in this order and reports the first fault that it finds. A refusal is raised as `LayerError`
of `lynkeus.writing`, and its message is one sentence for the visitor.

| No. | The tool refuses the input when | Sentence for the visitor |
|---|---|---|
| 1 | the number of input layers is not two | `The number of input layers must be 2, and it is <number>.` |
| 2 | the first layer was not received from one product file of the type GUNW | `The layer "<title>" is not a layer received from one NISAR GUNW product.` |
| 3 | the description of the first layer does not hold the name of the layer inside the product (field `layer`) | `The layer "<title>" does not record which layer of its product it is; receive it again with Get layer.` |
| 4 | the first layer is not `unwrappedInterferogram/HH/unwrappedPhase` or `unwrappedInterferogram/VV/unwrappedPhase` | `The layer "<title>" is the layer <name> of its product, and the tool reads the layer unwrappedPhase.` |
| 5 | the unit of the first layer is not `rad` | `The layer "<title>" has the unit <unit>, and the tool reads the unit rad.` |
| 6 | the first layer does not have two dates | `The number of dates of the layer "<title>" must be 2, and it is <number>.` |
| 7 | the second layer fails one of the checks 2, 3 and 6, is not `unwrappedInterferogram/HH/connectedComponents` or `unwrappedInterferogram/VV/connectedComponents`, or does not have the unit `1` | the sentences of the checks 2 to 6, with `the tool reads the layer connectedComponents.` and `the tool reads the unit 1.` |
| 8 | the two layers do not have the same grid | `The input layers do not have the same grid.` |
| 9 | the two layers are not of the same product file | `The two layers are not of the same product file.` |
| 10 | the two layers are not of the same polarisation channel | `The two layers are not of the same polarisation channel: the first is <name> and the second is <name>.` |
| 11 | the description of the phase does not hold the centre frequency (field `frequency`); this is the case of a layer that was received before Lynkeus recorded the frequency, and of a product whose ISO XML file could not be read | `The layer "<title>" does not record the centre frequency of its radar band; receive it again with Get layer.` |
| 12 | the name of the product file does not give the start times of its two acquisitions, or the reference acquisition does not start before the secondary acquisition | `The name of the product file of the layer "<title>" does not give a reference date that is earlier than the secondary date.` |
| 13 | a cell of the second layer holds a value that is not a whole number from 0 | `The layer "<title>" holds values that are not whole numbers from 0, so it is not a layer of connected components.` |
| 14 | no cell holds a phase in a connected component above 0 | `The result would hold no value in any cell.` |
| 15 | the 2nd and the 98th percentile of the result are equal | `The values of the result are too alike to give the legend a range.` |

The product type and the two start times are read from the name of the product file (naming
conventions, section 3.8). Arrays and descriptions that differ in number, and an array that is not
two-dimensional Float32, are faults of the calling program and raise `ValueError`, which is not a
refusal for the visitor.

Check 12 keeps the sign of the result true to its words: the result is the movement from the
reference date to the secondary date, and the tool gives it only for a pair whose reference date is
the earlier one. The two pairs of the pilot area are such pairs.

## Formula

```text
wavelength   = 299792458 / frequency             in metres, with the frequency in hertz
displacement = -wavelength / (4 * pi) * phase    where the connected component is above 0
displacement = no data                           where the phase is no data or infinite, and
                                                 where the connected component is 0 or no data
```

The ATBD of the mission gives the relation between the phase and the path length (section 5.9, page
46): the absolute interferometric phase is 4π/λ times δr, where λ is the radar wavelength and δr is
the one-way path length difference between the two acquisitions. The tool solves this relation for
the path length and changes the sign.

The sign follows the program of the mission. ISCE3 multiplies the image of the reference date by the
complex conjugate of the image of the secondary date (`Crossmul.cpp`, lines 304 to 306). It then
removes the phase 4π · range spacing · range offset / wavelength (lines 320 to 323), where the range
offset is the position of a point in the secondary image minus its position in the reference image.
A phase above zero is therefore a path that is longer on the secondary date than on the reference
date, which is a movement away from the radar. The tool gives the opposite sign, so a positive
result is a movement toward the radar. This reading of the sign is a conclusion of this sheet from
the code of ISCE3; no document of the mission that was read states it in words. MintPy, the source
program of the comparison, states the same two conventions for its own files
(`docs/research/analysis-displacement.md`, part 3.1).

The wavelength is the speed of light divided by the centre frequency of the product, as ISCE3
computes it for a GUNW product (`solid_earth_tides.py`, lines 269 to 272); the speed of light is the
constant of ISCE3, 299792458 m/s (`Constants.h`, line 50). For the products of the pilot area the
centre frequency is 1,239,000,000 Hz, the wavelength is 0.241963 m and the factor is -0.019255 m per
radian. One full turn of the phase, 2π, is half a wavelength, 0.1210 m.

The multiplication is made in 32-bit numbers: each phase value is multiplied by the factor as one
32-bit number, as the source program does.

## Unit

Metres (m). The result is Float32 and its no-data value is `nan`.

## Reduced copies of the result

The file of a result holds the values of the layer at full resolution, and reduced copies
(overviews) when the layer is large enough for them. Lynkeus makes each cell of a reduced copy as
the mean of the values of the cells that it covers, as it does for the layer that it receives. The
record of the result says: "Reduced copies made by averaging the values."

Measured on 15 Nov 2026: the result of each pair of the pilot area has a grid of 471 by 496 cells,
and its file holds no reduced copy. The reduced copies of this tool were therefore not measured.

For the reader: when the map is zoomed out, a cell would show the mean displacement of the cells
that it covers and that hold a value. The values of the file at full resolution are those of the
formula.

## Legend

| Field of the layer description | Value |
|---|---|
| `quantity` | Relative displacement along the line of sight |
| `unit` | `m` |
| `range` | from the 2nd to the 98th percentile of the result |
| `colours` | `RdBu`. The lowest value is red and the highest blue: a movement away from the radar is red and a movement toward the radar blue |
| `ends` | `away from the radar` for the lowest value, `toward the radar` for the highest |

The range is computed for each result, with the percentiles that Lynkeus applies to a layer that it
receives (`legend_range` of `lynkeus.writing`, rule `percentiles`). It is not centred on zero,
because the zero of the values is arbitrary (see How to read the result). ArcGIS Pro draws the
output of its conversion from unwrapped phase to displacement with a red-blue colour scheme
(`docs/research/analysis-displacement.md`, part 5); no document of the mission that was read gives a
legend for a displacement. The range and the colour scale are therefore choices of this sheet. For
the two pairs of the pilot area the range is -0.0264 to 0.0780 m (9 to 21 Oct 2026) and 0.0328 to
0.1228 m (27 Sep to 9 Oct 2026).

## How to read the result

1. A value is a movement along the line of sight of the radar, which looks at the ground from the
   side. It is not a vertical movement and not a horizontal one. A higher value is a movement toward
   the radar relative to a lower value.
2. The values are relative. The products RUNW and GUNW give the unwrapped phase "with respect to
   arbitrary, unspecified reference points" (ATBD, section 5.9, page 47), and the unwrapped phase is
   known up to a constant offset (section 5.9.1.6, page 51). Only the difference between two cells
   of the result is a measurement; the value of one cell alone is not. In the pilot area the median
   of the result is 0.0222 m for the pair of 9 to 21 Oct 2026 and 0.0820 m for the pair of 27 Sep to
   9 Oct 2026. These two numbers do not show that the ground moved by these amounts.
3. The effects of the atmosphere and of the solid Earth tides are part of the values. The product
   includes an estimate of the phase of the ionosphere as a layer of its own and does not apply it
   to the phase; the phases of the troposphere and of the solid Earth tides are in the product as
   tables and are not removed from the phase (specification, section 2.2, page 6). The tool removes
   none of them. A pattern of the result can therefore come from the ionosphere or the troposphere
   and not from the ground.
4. A cell holds no data where the connected component is 0. The label 0 marks phase values that
   "could not be reliably unwrapped" (ATBD, section 5.9.1.7, page 51). In the pilot area the phase
   holds a value in such cells: 26,889 cells of the pair of 9 to 21 Oct 2026 and 68,669 cells of the
   pair of 27 Sep to 9 Oct 2026.
5. Each connected component is a region that was unwrapped consistently in itself (ATBD, section
   5.9.1.7). The tool keeps every component above 0. The difference between two cells of two
   different components can be wrong by whole turns of the phase, each of 0.1210 m for the products
   of the pilot area. This is a conclusion of this sheet from the ATBD. The two pairs of the pilot
   area hold one component above 0 each, so the case was not seen.
6. The sheet states no accuracy and no threshold: none was measured, and the pilot area has no known
   movement with which the result could be compared.

## Comparison with the source program (D-17)

| | |
|---|---|
| Source program | MintPy 1.6.4, the package of the Python Package Index. Its function `mintpy.utils.plot.scale_data2disp_unit` (file `utils/plot.py`, lines 1922 to 2025; the factor at line 1972) scales data in radians to metres. Its file `prep_nisar.py` (line 775) takes the wavelength of a NISAR GUNW product as the speed of light divided by the field `centerFrequency` of the product |
| Licence | GPL-3.0-or-later. MintPy was run for the comparison only; none of its code is in the repository |
| Comparison | The array of the tool against the array that the function of MintPy returns for the same phase values, with the unit `radian`, the display unit `m` and the wavelength of the product. The wavelength was computed as line 775 of `prep_nisar.py` computes it, from the field `centerFrequency` that was read from the HDF5 product file (`1239000000.0` Hz for both pairs). The module `prep_nisar` was not imported, because it needs the GDAL Python bindings, which the environment of the comparison did not hold; its line was read, and the division was executed with the constant of `mintpy.constants`. The function `scale_data2disp_unit` was executed as it stands |
| Files compared | `gunw-unwrappedinterferogram-hh-unwrappedphase-20261009-20261021.tif` (SHA-256 `77024532e183d09a578088a47b362f470ef27bfc70066beb21f74ce568247583`) and `gunw-unwrappedinterferogram-hh-connectedcomponents-20261009-20261021.tif` (SHA-256 `07cb2f746ef6469737e7cf072cc6813cf933425e4d383149e26b417a20aa23ab`), layers of the product `NISAR_L2_PR_GUNW_032_141_D_067_033_4000_SH_20261009T234330_20261009T234405_20261021T234330_20261021T234405_P05036_N_F_J_001`; `gunw-unwrappedinterferogram-hh-unwrappedphase-20260927-20261009.tif` (SHA-256 `9e9390b2b46269b3d35b04624e95fa537bf318bc19f400277f77d7967c25f5d4`) and `gunw-unwrappedinterferogram-hh-connectedcomponents-20260927-20261009.tif` (SHA-256 `057974486c2c116c5a2aace2e40f16b8ba02fc3919c977d04bd78ec4a2b350fd`), layers of the product `NISAR_L2_PR_GUNW_031_141_D_067_032_4000_SH_20260927T234330_20260927T234405_20261009T234330_20261009T234405_P05023_N_F_J_001`. Each file is the Cloud Optimized GeoTIFF that the Data part wrote for the box of the pilot area, with cells of 80 m, read at full resolution |
| Platform | `Linux-6.8.0-146-generic-x86_64-with-glibc2.41`, Python 3.13.18, numpy 2.5.4 on both sides. The files were read with rasterio 1.5.2 (GDAL 3.12.2). The environment of MintPy held 24 packages, among them scipy 1.18.1, h5py 3.16.0, matplotlib 3.11.2 and pyproj 3.8.0. The comparison was made on 15 Nov 2026; its records are kept in `docs/research/records/analysis/displacement/` (`comparison.json`, `lynkeus_side.json`, `source_side.json`). It was repeated on the same day on the code of commit `6b7572e`, on the same platform and with the same versions, after the phase layer of the pair of 9 and 21 Oct 2026 had been received again (SHA-256 of that file `0e3ed0a05c20d75ec55d04a0c915e6d2b1e3c221b2aa74b3c1b9d07622c2551d`; its values equal those of the first file). The numbers of the repetition are those of this table (`refit_comparison.json`, `refit_lynkeus_side.json`, `refit_source_side.json`) |
| Largest difference | 0.0 m in both pairs. 0 of 196,804 cells differ in the pair of 9 and 21 Oct 2026, and 0 of 155,024 cells in the pair of 27 Sep and 9 Oct 2026: the result is bit-identical to the array of MintPy in every cell in which the tool gives a value. The function of MintPy converts every cell that holds a phase; the tool gives no data in 26,889 and 68,669 of these cells, which have the connected component 0. No cell holds a value in the tool only |
| Not reached | MintPy was not run as its own workflow on the HDF5 product files: one function of it was run on the values of the layers. The masking by the connected components is not part of that function; it was checked by a separate count: the cells without a value in the result are exactly the cells without a phase and the cells with the label 0. On 15 Nov 2026 each layer was read from the original HDF5 product file for the rectangle of the pilot area: the 223,693 cells that hold a value in a layer equal the product. One area, two pairs, the channel HH and the range bandwidth of 40 MHz were compared |

The exact numbers of the comparison are in `docs/research/analysis-displacement.md`, parts 4.4 to
4.7, and those of its repetition in part 4.9.

## Not yet confirmed

1. The sign of the result on data with a known movement. The sign was derived from the code of ISCE3
   and agrees with the convention that MintPy states; it was not checked against a measured movement
   of the ground.
2. The channel VV: the tool accepts the two layers of the channel VV by their names, and only layers
   of the channel HH were received and computed.
3. Products of the range bandwidths 20 and 77 MHz: their centre frequency was read from the product
   files and from the ISO XML files, and no layer of them was received or converted.
4. A product with more than one connected component above 0, and a pair whose reference date is the
   later one: neither was found among the products that were read.
5. The reduced copies of a result that is large enough to have them (see Reduced copies of the
   result).
6. The use of the layer `ionospherePhaseScreen`. The tool does not subtract it: no document that was
   read states the sign with which it is to be combined with the phase, and its values in the pilot
   pair (16.57 to 32.46 rad) are larger than those of the phase
   (`docs/research/analysis-displacement.md`, part 4.4).
7. The form of the tool and the page Methods in a browser. The interface holds the field
   `frequency` (`web/src/shared/layer.ts`) and offers the tool with a form of two layer fields. Its
   tests pass; nothing was seen in a browser, and the tool was not run as a job of the web service.
8. The legend in the Contents pane. The colour table `RdBu` of the interface
   (`web/src/contents/colourTables.ts`) begins in red at the lowest value and ends in blue at the
   highest. This was read in the code and was not seen in a browser.
