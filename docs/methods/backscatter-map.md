# Backscatter, Thematic map

| | |
|---|---|
| Tool | `backscatter-map` (Analysis tab, group Backscatter, button Thematic map) |
| NISAR product | GCOV, Level-2 Geocoded Polarimetric Covariance |
| Result | The class of each cell on one date: not inundated, open water or inundated vegetation |
| State | The comparison with the source program (D-17) was made on 15 Nov 2026 on the layers `HHHH` and `HVHV` of the two validated GCOV products of the pilot area, of 21 Oct and 2 Nov 2026. The result of 21 Oct 2026 was made by a job of a private copy of the web service. |

## In brief

| | |
|---|---|
| What it shows | The class of each cell on one date (open water, inundated vegetation or not inundated), by the thresholds of the NISAR science team for wetland inundation. |
| Input | The Backscatter HH layer and the Backscatter HV layer of one GCOV product, received for the same area. |
| Formula | `open water: 0 < HH + HV <= 0.068; inundated vegetation: 0.4245 <= HH <= 10 and 1.2 <= HH / HV <= 500; not inundated: every other cell with HH + HV > 0` |
| Result | Three classes without unit: grey for not inundated, dark blue for open water and light blue for inundated vegetation, the colours of the notebook of the science team. A cell without data in either layer is left empty. |
| How to read | Open water is dark in both layers, because its smooth surface reflects the radar signal away from the satellite. Inundated vegetation is bright in HH and brighter in HH than in HV, because the signal bounces from the water to the stems and trunks and back to the radar. Every other cell, whether field, forest or town, is in the class not inundated. |
| Limits | The thresholds were set by the science team at a calibration site of the mission (Yucatan Lake), and no accuracy is known for other places. No mask of wetlands is applied, so buildings can fall into inundated vegetation, mudflats and smooth dry ground into open water, and water roughened by wind into not inundated. The last step of the notebook, which reduces the map to cells of one hectare by the most frequent class, is not done. |
| Checked | The classes equal those of the statements of the notebook of the science team in every cell of the test area (lower Merrimack River, 21 Oct and 2 Nov 2026). |
| References | [NISAR Mission Science Users' Handbook, 2nd edition, section 6.4](https://doi.org/10.48577/jpl.UD4HV3). [NISAR_Inundation, notebook of the science team](https://github.com/NISAR-Science-Algorithms/NISAR_Inundation). |

## Reference

1. NASA-ISRO SAR (NISAR) Mission Science Users' Handbook, second edition, version 2.0, released
   22 October 2025, Jet Propulsion Laboratory (<https://doi.org/10.48577/jpl.UD4HV3>, CC0 1.0, read
   15 Nov 2026). Section 6.4, Ecosystems Science – Inundation, printed pages 84 to 89. Page 84 gives
   the requirement of the mission, to "measure inundation extent within inland and coastal wetlands
   areas at a resolution of 1 hectare every 12 days with a classification accuracy of 80%", and the
   double bounce of inundated woody vegetation in the channel HH. Page 85 gives the thresholds of
   open water and of inundated vegetation and the cases in which they fail (bare ground and
   mudflats, wind on the water at steep incidence angles, floating vegetation), and states that the
   execution of the classification is detailed in the notebook of the NISAR project. Pages 86 to 88
   give the full algorithm (equations 6.4-1 to 6.4-7), and pages 88 and 89 the product for
   validation, which needs a mask of wetlands that excludes urban and agricultural areas.
2. NISAR_Inundation, the repository of the NISAR science team for wetland inundation
   (<https://github.com/NISAR-Science-Algorithms/NISAR_Inundation>), branch `main`, commit
   `85140c4` of 10 Jul 2026 (the repository has no release and no tag), Apache License 2.0.
   [Notebook `notebooks/NISAR_L3_Inundation_ProductGeneration.ipynb`](https://github.com/NISAR-Science-Algorithms/NISAR_Inundation/blob/85140c4c3cc11d9b3f8a58efecc8fea112edf39d/notebooks/NISAR_L3_Inundation_ProductGeneration.ipynb), "Combined Algorithm
   Theoretical Basis Document and Jupyter Notebook for Classification of Wetland Inundation Extent",
   by Bruce Chapman and Paul Siqueira (15 Feb 2022, last updated May 2026). Steps 4b, 5a, 5b and 6
   (code cells 20, 24, 26 and 28) compute the classes; Step 7 (cell 30) gives their names and
   colours, and Step 8 (cell 32) the cells of one hectare.
   [File `ancillary_data/wetland_calibration_parameters.yaml`](https://github.com/NISAR-Science-Algorithms/NISAR_Inundation/blob/85140c4c3cc11d9b3f8a58efecc8fea112edf39d/ancillary_data/wetland_calibration_parameters.yaml) (SHA-256
   `c522694cba28ae98bdbd98a3225c19d5a2ba3f33ac3b128552d5348e0e66e0dd`) holds the sets of thresholds
   `Yucatan_Lake`, `NewOrleans` and `Default`.
3. NASA SDS Product Specification, Level-2 Geocoded Polarimetric Covariance (L2 GCOV), JPL D-102274,
   Rev F, version 1.5.0, 8 July 2026: the layers `HHHH` and `HVHV`, as the sheet
   [Backscatter, One date](backscatter-state.md) gives them.
4. Science Data Systems (SDS) L-SAR Product File Naming Conventions, JPL D-102255, Rev C,
   19 October 2025. The tool reads the product type of each input from the name of its product file.
5. STAC Classification Extension, version 2.0.0
   (<https://github.com/stac-extensions/classification>, Apache License 2.0): the field
   `classification:classes` of the record of a result.

## Input layers

The inputs are given in this order.

| No. | Layer | Path in the product | Type | Unit | No data |
|---|---|---|---|---|---|
| 1 | Backscatter HH: gamma0 of the channel HH | `/science/LSAR/GCOV/grids/frequencyA/HHHH` | Float32 | `1` (linear power) | `nan` |
| 2 | Backscatter HV: gamma0 of the channel HV, of the same product file | `/science/LSAR/GCOV/grids/frequencyA/HVHV` | Float32 | `1` (linear power) | `nan` |

The notebook reads the same two layers of the group `frequencyA` (Step 3c), and the Data part
receives the layers of that group only (`_GROUPS` in `api/src/lynkeus/harmony.py`). The thresholds
apply to linear power, the unit of the layers. The two layers must be of one product file and be
received for the same area, so that they have one grid. As the lead decided on 15 Nov 2026, the form
takes them as the form of Surface displacement, One pair takes its two layers: the first field
holds the Backscatter HH layer, and the second offers the Backscatter HV layers of the same product.

The notebook searches for products whose file names match `*_D_*_DHDH_*` (descending orbits, the
channels HH and HV) in the collection `NISAR_L2_GCOV_BETA_V1` (cells 8 and 10), but only when a user
replaces its demonstration files by an area of his own. These are choices of files: Steps 4b to 6
read only the two layers of each date, and their statements are the same for any direction of the
orbit and any collection. The tool therefore accepts products of both directions and of every
collection that Lynkeus offers. The notebook classifies each date of its stack alone (the loop of
cell 28), so a result of the tool is one date of that stack.

The summary of the notebook and section 6.4.1 of the Handbook describe a longer algorithm: a
relative calibration of the dates, a multi-temporal average, the detection of changes of class, a
class "not classified", thresholds that depend on the incidence angle, and a mask of wetlands. The
code of the notebook at commit `85140c4` does none of these, and the tool computes what the code
computes.

### What the tool refuses

The tool makes the checks below in this order and reports the first fault that it finds, as one
sentence for the visitor (`LayerError` of `lynkeus.writing`).

| No. | The tool refuses the inputs when | Sentence for the visitor |
|---|---|---|
| 1 | the number of input layers is not two | `The number of input layers must be 2, and it is <number>.` |
| 2 | a layer was not received from one product file of the type GCOV | `The layer "<title>" is not a layer received from one NISAR GCOV product.` |
| 3 | the description of a layer does not hold the name of the layer inside its product | `The layer "<title>" does not record which layer of its product it is; receive it again with Get layer.` |
| 4 | the first layer is not `HHHH`, or the second is not `HVHV` | `The layer "<title>" is the layer <name> of its product, and the tool reads the layer HHHH.` (or `the layer HVHV`) |
| 5 | the unit of a layer is not `1` | `The layer "<title>" has the unit <unit>, and the tool reads the unit 1.` |
| 6 | a layer does not have one date | `The number of dates of the layer "<title>" must be 1, and it is <number>.` |
| 7 | the two arrays do not have the same number of rows and of columns | `The input layers do not have the same grid.` |
| 8 | the two layers are not of the same product file | `The two layers are not of the same product file.` |
| 9 | no cell of the result would hold a class | `The result would hold no value in any cell.` |

Checks 2 to 6 are made for the first layer and then for the second. The server compares the grids
before it calls the tool and refuses layers whose grids differ with the sentence "The layers of the
analysis do not have the same grid.", so check 7 cannot fail through the server. An array that is
not two-dimensional Float32 is a fault of the calling program and raises `ValueError`.
On 15 Nov 2026 six wrong inputs were sent to the private copy of the web service. The server
refused one layer given twice before any job, with the answer "The input inputs is not valid: a
layer is given more than once." (HTTP 400). The five other jobs ended as failed, each with the
sentence of the tool as its message: the Backscatter HV layer given first and the Backscatter HV
layer given twice (check 4), one layer only (check 1), the Backscatter HH layer of 21 Oct 2026 with
the Backscatter HV layer of 2 Nov 2026 (check 8), and a result given as input (check 2)
(`docs/research/records/analysis/backscatter-map/jobs_map.json`).

## Formula

```text
total = HHHH + HVHV                    in 32-bit numbers (Step 4b)
ratio = HHHH / HVHV                    in 32-bit numbers (Step 4b)

class = 0                              in every cell
class = 1  (not inundated)             where total > 0
class = 2  (open water)                where total > 0 and total <= 0.06800000369548798
class = 3  (inundated vegetation)      where class is not 2
                                       and 0.42448979591836733 <= HHHH <= 10
                                       and 1.2000000000000002 <= ratio <= 500
a cell of class 0 holds no data (nan)
```

Each statement replaces the class of the cells where it holds, in this order, as the three
statements of cell 28 do. A cell where either layer is `nan` keeps the class 0, because every
comparison with `nan` is false; so does a cell where `total` is not above 0. Where `HVHV` is 0, the
ratio is infinite or `nan` and no threshold accepts it, in the notebook and in the tool.

| Threshold of the set `Default` | Value in the file | In decibels | Used as |
|---|---|---|---|
| `open_water` `sum_min` | `0.0` | – | `total > sum_min` |
| `open_water` `sum_max` | `0.06800000369548798` | −11.67 dB | `total <= sum_max` |
| `inun_veg_single_class` `HH_min` | `0.42448979591836733` | −3.72 dB | `HHHH >= HH_min` |
| `inun_veg_single_class` `HH_max` | `10` | +10.00 dB | `HHHH <= HH_max` |
| `inun_veg_single_class` `ratio_min` | `1.2000000000000002` | +0.79 dB | `ratio >= ratio_min` |
| `inun_veg_single_class` `ratio_max` | `500` | +26.99 dB | `ratio <= ratio_max` |

The set `Default` holds the numbers of the set `Yucatan_Lake`, which the notebook uses by default
(cell 4). The set `NewOrleans` holds thresholds of the order of 10⁻⁹, which the repository does not
explain, and is not used. The notebook can classify open water by the product `HHHH * HVHV` instead
of the sum, but no set holds thresholds for the product (`product_min` and `product_max` are
`null`), so the tool uses the sum, as cell 4 does. The file describes the single class of inundated
vegetation as "either bright HH or high ratio", but cell 28 requires both conditions, as
equation 6.4-1 of the Handbook does; the tool follows cell 28. The arrays are 32-bit, and NumPy 2
compares a 32-bit array with a Python number in 32-bit numbers, in the notebook and in the tool: the
thresholds act as their nearest 32-bit numbers (`HH_min` as 0.4244897961616516, `ratio_min` as
1.2000000476837158; `sum_max` is a 32-bit number).

## Unit

Without unit (`1`): the numbers 1, 2 and 3 name the classes. The result is Float32 and its no-data
value is `nan`.

## Reduced copies of the result

The file of a result holds the classes at full resolution and reduced copies (overviews), which the
map draws when it is zoomed out. Each cell of a reduced copy holds the class that is most frequent
among the cells that it covers and that hold a class; a cell that covers no class holds no data.
Lynkeus writes the classes as 32-bit whole numbers with −1 for no data and reduces them with the
resampling `MODE` of GDAL; it reduces a second layer, 1 in each cell with a class and no data
elsewhere, with `AVERAGE`, and sets to no data each reduced cell where that layer has none. The
second layer is needed because GDAL 3.12.2 (in rasterio 1.5.2), with `MODE`, gives the value 0 to
a reduced cell whose cells all hold no data, for 32-bit real numbers with `nan` and for 32-bit
whole numbers with −1 alike (measured on 15 Nov 2026, `docs/research/analysis-inundation.md`). The
received layers that Lynkeus reduces by the most frequent value, `mask` of a GCOV product and
`connectedComponents` of a GUNW product, are now reduced in the same way, and their reduced copies
no longer hold 0 where the cells that they cover hold no data. The record of a result says:
"Reduced copies made by taking the most frequent class."
Measured on 15 Nov 2026 on the result of 21 Oct 2026, which has reduced copies at the factors 2, 4
and 8: at the factor 2, each of the 2,974,328 reduced cells whose four cells have one most frequent
class holds that class, and each of the 164,553 reduced cells whose four cells hold no data holds no
data (`docs/research/records/analysis/backscatter-map/lynkeus_side.json`).

For the reader: when the map is zoomed out, small patches of a class can disappear; at full zoom the
map shows the classes of the formula. Step 8 of the notebook is another reduction, to cells of
100 m (one hectare) by `gdal.Warp` with `GRA_Mode`, on a file that declares no value for no data, so
that the class 0 takes part in the vote. Lynkeus does not make that product.

## Legend

| Field of the layer description | Value |
|---|---|
| `quantity` | Wetland inundation class |
| `unit` | `1` |
| `range` | From 1 to 3, the first and the last class |
| `colours` | `classes`: each class is drawn in its own colour, without a colour scale |
| `classes` | The table below |

| Value | Name | Colour | Name and colour in the notebook (cell 30) |
|---|---|---|---|
| 1 | Not inundated | `#ececee` | `not inun`, (236, 236, 238) |
| 2 | Open water | `#151b73` | `open water`, (21, 27, 115) |
| 3 | Inundated vegetation | `#42e9f5` | `inun veg`, (66, 233, 245) |

The notebook names the class 0 `no data` and draws it in white; in Lynkeus a cell without data is
transparent unless the visitor gives it a colour in Symbology. The Contents pane lists the three
classes with their colours; Symbology offers only the colour of cells without data, and Properties
lists the classes instead of statistics. The record of a result carries the table in the field
`classification:classes` of its asset (STAC Classification Extension 2.0.0), and its GeoTIFF in the
tag `classes`. The pane Identify and the status bar show the number of the class.

## How to read the result

1. Open water. A smooth water surface reflects the radar signal away from the satellite, so little
   of it returns in either channel: open water is dark in HH and in HV, and the sum of the two is at
   most 0.068 (−11.7 dB).
2. Inundated vegetation. Where trees, shrubs or tall plants stand in water, the signal is reflected
   by the water surface to the stems and trunks and from them back to the radar (double bounce).
   This reflection keeps the polarization, so the return is strong in HH and weaker in HV: the cell
   is bright in HH (from 0.4245, −3.7 dB) and HH is at least 1.2 times HV.
3. Not inundated. Every other cell with data: dry land, fields, forests and towns, and inundated
   places that the thresholds do not find.
4. Wrong classes (Handbook, pages 85 and 88). Bare ground, mudflats and smooth dry surfaces can be as
   dark as open water; wind can make water brighter than the threshold of open water; floating
   vegetation is hard to tell from open water; buildings also give a double bounce. The Handbook
   asks for a mask of wetlands that excludes urban and agricultural areas, and neither the notebook
   nor the tool applies one.
5. One date. The classes are those of the time of the acquisition. Where the water level changes
   within the day, as in tidal marshes, two dates can differ because of the time of the acquisition
   alone.
6. In the pilot area on 21 Oct 2026, of the 14,316,413 cells with data, 57.8 % are not inundated,
   21.4 % open water and 20.8 % inundated vegetation; on 2 Nov 2026, 56.1 %, 21.4 % and 22.5 %. No
   reference map was compared, so it is not known how much of the class inundated vegetation is
   inundated.

## Comparison with the source program (D-17)

⟦COMPARISON⟧

## Not yet confirmed

1. The accuracy of the classes in the pilot area, or anywhere outside the calibration site: no
   reference map was compared.
2. Products of ascending orbits and of the provisional and beta collections: the tool accepts them,
   and none was classified.
3. How the interface draws the classes and lists them in the legend: tested in the simulated
   browser of the tests only (`web/src/contents/Legend.test.tsx`, `Symbology.test.tsx`,
   `Properties.test.tsx`). Nothing was seen in a browser.
4. Whether the colours of the notebook, grey, dark blue and light blue, read well on the base maps
   and for colour-blind readers.
