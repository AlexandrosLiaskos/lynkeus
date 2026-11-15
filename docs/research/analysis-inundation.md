# Analysis: Backscatter, Thematic map (wetland inundation)

Research note of the tool `backscatter-map`, 15 Nov 2026. The method sheet is
[`docs/methods/backscatter-map.md`](../methods/backscatter-map.md); the records are in
[`records/analysis/backscatter-map/`](records/analysis/backscatter-map/).

## 1. Question

Which published classification of the NISAR science team can make the thematic map of the group
Backscatter, and does Lynkeus compute exactly what its program computes on real products of the pilot
area? The research on thematic maps of 15 Nov 2026 found one that can be finished now: the wetland
inundation classification of the repository NISAR_Inundation, which the Handbook names as the
execution of its section 6.4.

## 2. The source program

The notebook `notebooks/NISAR_L3_Inundation_ProductGeneration.ipynb` of NISAR_Inundation (commit
`85140c4` of 10 Jul 2026, Apache License 2.0) reads the layers `HHHH` and `HVHV` of the group
`frequencyA` of each GCOV product of a stack (Step 3c), computes their ratio and sum in 32-bit numbers
(Step 4b, cell 20), reads one set of thresholds of `ancillary_data/wetland_calibration_parameters.yaml`
(Steps 5a and 5b, cells 24 and 26) and gives each cell of each date a class (Step 6, cell 28): 0 no
data, 1 not inundated, 2 open water, 3 inundated vegetation. Step 7 (cell 30) draws the classes and
Step 8 (cell 32) reduces them to cells of 100 m by the most frequent value. The cells of Steps 4b to 6
were read in full and run unchanged for the comparison (part 5).

Taken from the notebook: the two layers, the order of the three statements, the 32-bit arithmetic, the
set `Default` (the numbers of the set `Yucatan_Lake`, which cell 4 uses by default), the sum as the
combination for open water (cell 4; no set holds thresholds for the product), the names and colours of
the classes (cell 30). Decided by the lead on 15 Nov 2026: the form takes two layers of one product,
the class 0 becomes no data, the cell size of the layers is kept and Step 8 is not done, and the set
`Default` is used. Not taken, because they choose files and do not change a class: the file filter
`*_D_*_DHDH_*` and the collection `NISAR_L2_GCOV_BETA_V1` of cells 8 and 10, which apply only when a
user replaces the demonstration files by an area of his own.

The summary of the notebook and section 6.4.1 of the Handbook describe a longer algorithm (relative
calibration, multi-temporal average, change of class, the class not classified, thresholds that depend
on the incidence angle, a mask of wetlands). The code at commit `85140c4` does none of these. The file
of thresholds describes the single class of inundated vegetation as "either bright HH or high ratio",
while cell 28, like equation 6.4-1 of the Handbook, requires both conditions.

## 3. A result of classes

A result had one continuous range and a colour scale. This branch adds a table of classes (value, name,
colour) to the result of a tool and to the layer description (`LayerClass`, field `classes`, allowed
for results only), the colours `classes`, and the reduction `mode`. The record of a result carries the
table as `classification:classes` of its asset (STAC Classification Extension 2.0.0, whose schema
validates the field there), and the GeoTIFF as the tag `classes`. The interface draws each class in its
colour, the legend lists the classes, Symbology offers only the colour of cells without data, and
Properties lists the classes instead of statistics. Every continuous result is unchanged; its
description carries `classes: null`.

Reduced copies by the most frequent value. With GDAL 3.12.2 (rasterio 1.5.2), the overview resampling
`MODE` gives 0, not no data, to a reduced cell whose cells all hold no data. This was measured on
15 Nov 2026 in a throw-away container on 32-bit real numbers with `nan` and on 32-bit whole numbers
with −1 declared as no data alike; a block that is only partly empty was reduced correctly. Lynkeus
reduced the received layers `mask` (GCOV) and `connectedComponents` (GUNW) in this way, so their
reduced copies held 0 in empty blocks. The writer now reduces a layer of classes as 32-bit whole
numbers with `MODE` and a second layer, 1 where a cell holds a value, with `AVERAGE`, and sets to no
data each reduced cell where the second layer has none. The tests of `api/tests/test_writing.py` check
empty blocks, partly empty blocks, the class 0 and the refusal of values that are not whole numbers
from 0. The received `mask` and `connectedComponents` layers of real products were not written again
with the new writer.

## 4. Products of the pilot area

Catalogue query of 15 Nov 2026 (NASA CMR, box −71.20, 42.60, −70.75, 42.95; record `catalogue.json`):
2 validated GCOV products (`NISAR_L2_GCOV_V1`, 21 Oct and 2 Nov 2026), 9 provisional
(`NISAR_L2_GCOV_PROVISIONAL_V1`, 23 Jun to 9 Oct 2026) and 2 beta (`NISAR_L2_GCOV_BETA_V1`, 13 and
25 Dec 2025), all of track 141, frame 67, descending, with the polarizations `DHDH`. Because the free
disk of the server was low on 15 Nov 2026, only the two validated dates were classified: the layers
`HHHH` and `HVHV` of 21 Oct 2026 and `HVHV` of 2 Nov 2026 were received through the private copy of the
web service, and `HHHH` of 2 Nov 2026 was taken from the files of the Series track.

## 5. Comparison (D-17)

⟦NOTE_COMPARISON⟧

## 6. Sources

| Source | Version | Licence | Use |
|---|---|---|---|
| NISAR Mission Science Users' Handbook, 2nd edition (<https://doi.org/10.48577/jpl.UD4HV3>) | Version 2.0, 22 Oct 2025 | CC0 1.0 | Section 6.4, the method |
| NISAR_Inundation (<https://github.com/NISAR-Science-Algorithms/NISAR_Inundation>) | Commit `85140c4`, 10 Jul 2026 | Apache-2.0 | Source program |
| STAC Classification Extension (<https://github.com/stac-extensions/classification>) | 2.0.0 | Apache-2.0 | Table of classes in the record |
| NISAR Validated Geocoded Polarimetric Covariance Product (<https://doi.org/10.5067/NIL2GCOV-V1>) | `NISAR_L2_GCOV_V1` | NASA ESDIS data use guidance | The two products compared |

## 7. Records

In `records/analysis/backscatter-map/`: `catalogue.json` (the catalogue query), `jobs_receive.json` and
`jobs_map.json` (the jobs of the private copy of the web service, the refusals and the processes it
offered), `lynkeus_side.json` (the files, the classes and the reduced copies of the Lynkeus side) and
`comparison.json` (the notebook side and the comparison).
