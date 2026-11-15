# Research note: Analysis tab, the masks of the products

| | |
|---|---|
| Part | Analysis tab, groups Backscatter and Coherence |
| Covers | The masks of the GCOV and GUNW products, and whether one of them becomes an input of the tools Backscatter, One date and Change, and Coherence, One pair and Change |
| Written | 15 Nov 2026. Every source below was read on that day. |
| Code state | Branch `masks`, made from `main` at commit `bf06107`. No code was changed |
| Pilot area | Lower Merrimack River: box −71.20, 42.60, −70.75, 42.95 (west, south, east, north); track 141, frame 67, descending |

The tools apply no mask of the product (`docs/research/analysis.md`, part 7, point 8), and the
decisions taken on the analysis research of 15 Nov 2026 made an optional input of the product's own
mask the first item of level 2. This note applies one rule to each mask. A mask becomes an input of a
tool only where NASA's product specification says that the cells it marks are not valid data, and
where it changes cells of the results of the pilot area. No mask meets the second condition, so no
code was added.

## 1. Answer

1. **GCOV.** The specification calls a cell with mask `0` not valid and fills the cells outside the
   acquisition with `255`. On four dates, every cell with mask `0` holds no value in the layers `HHHH`
   and `HVHV`, and no cell of the pilot rectangle holds `255`. The mask changes no cell of Backscatter,
   One date, and none of Backscatter, Change (part 3.2).
2. **GUNW.** The product holds a layer `mask` in each of its two interferogram groups and, from version
   1.6.0 of the specification, a layer `validDataMask` in each channel. The specification calls a cell
   not valid where a sub-swath digit of `mask` is 0 or a bit of `validDataMask` is 0. On five pairs at
   20 m and two pairs at 80 m, no cell in which a coherence layer holds a value is marked so. The masks
   change no cell of Coherence, One pair, and none of Coherence, Change (part 3.3).
3. **Decision.** No mask becomes an input of a tool. The rows Limits of the method sheets stay as they
   are, because "The tool applies no mask of the product" is still exact.

## 2. What the specifications say

### 2.1 GCOV

The layer `/science/LSAR/GCOV/grids/frequencyA/mask` is an unsigned 8-bit number with the no-data value
`255`. Versions 1.5.0 and 1.6.0 of the specification describe it in the same words (`nisar_L2_GCOV.xml`),
and the attribute `description` of the layer in the four product files of part 3.2 holds the same text:
"A GCOV sample is only considered valid if it is generated from fully-focused radar samples. If at least
one radar sample in the averaging set is partially focused or invalid, the corresponding mask pixel will
contain the value 0. GCOV pixels outside of the radar acquisition extent are filled with the value 255".

| Value | Meaning | Not valid data |
|---|---|---|
| `0` | At least one radar sample of the averaging set is partially focused or invalid | Yes |
| `1` to `5` | A valid sample; the number of its sub-swath | No |
| `255` | Outside the radar acquisition extent (the no-data value) | No data |

### 2.2 GUNW

The layer `mask` of the groups `wrappedInterferogram` (20 m) and `unwrappedInterferogram` (80 m) is an
unsigned 32-bit number with the no-data value `255` in versions 1.5.0 and 1.6.0 of the specification
(`nisar_L2_GUNW.xml`), and the product files of part 3.3 store it so (`uint32`). Its parts:

| Part | Meaning, in the words of the specification where quoted | Not valid data |
|---|---|---|
| Bits 0 to 7, first of three digits | The water flag of the reference image: 1 water, 0 not water | No |
| Bits 0 to 7, second and third digits | The sub-swath of the reference and of the secondary image; "a value of 0 in either digit indicates an invalid sample in the corresponding RSLC" | Yes, where a digit is 0 |
| Bits 8 to 15 and 16 to 23 | Anomaly flags of the secondary and of the reference image; "A value of 0 in the anomaly bits indicates that no anomaly is detected" | Not stated |
| Bit 24, group `unwrappedInterferogram` only | The cells that the filtering of the ionospheric phase "masked out and filled with interpolated data" | Not stated for the coherence |
| The value `255` | The no-data value | No data |

The layer `validDataMask` stands in the channel group (`[wrappedInterferogram or
unwrappedInterferogram]/HH/validDataMask`, unsigned 8-bit, no-data value `255`). Version 1.6.0 of the
specification gives it: "bit 1 = reference (1=valid, 0=invalid), bit 0 = secondary (1=valid,
0=invalid). Valid represents fully focused data and invalid represents partially focused or missing
data". Version 1.5.0 has no such layer. The products of specification 1.6.0 hold it, and those of
specification 1.5.0 do not. In every product the attribute `description` of each mask layer holds
the text of the specification of its version, up to the form of a dash.

## 3. What was measured

### 3.1 Method

The product files were read over HTTPS at the ASF DAAC on 15 Nov 2026, with earthaccess 0.19.0, h5py
3.16.0, numpy 2.5.4 and rasterio 1.5.2. Each was read in the window of the rectangle of the layer that
the earlier work received for the pilot box: 3,772 by 3,972 cells of 10 m for GCOV, and the
rectangles of the coherence layers for GUNW. In every product a central window of the term or of the
coherence (512 by 512 cells; 471 by 471 at 80 m) was compared with the received layer. Every cell
that holds a value in the received layer holds the same value in the product, bit for bit, and no cell
holds a value in the received layer only, so the windows match. At 80 m the window reaches the edge of
the box, and up to 4,983 of its cells hold a value in the product only: the received layer leaves every
cell outside the box empty.

The results were computed from the received layers, which are the inputs of the results of the pilot
area, by the rules of the tools. Backscatter, One date holds a value where the term is a finite number
above zero, and Change where both terms are and their ratio is finite in 32-bit numbers. Coherence, One
pair is its input, and Change holds a value where both inputs do. A mask changes a cell of a result
where it marks the cell as not valid data, or as no data, and the result holds a value there. No layer
`HVHV` had been received, so `HVHV` was read from the product over the whole rectangle, including the
cells outside the box that a received layer leaves empty (`docs/research/analysis.md`, part 4.4).

### 3.2 GCOV

| Date | Collection, product version, specification version | Mask `0` | Mask `1` | Other values | `HVHV` without a value | `HHHH` received: cells with a value; of these with mask `0` or `255` | `HVHV`: cells with a value; of these with mask `0` or `255` |
|---|---|---|---|---|---|---|---|
| 27 Sep 2026 | provisional, 1.0.11, 1.5.0 | 27 | 14,982,357 | 0 | 27 | 14,316,415; 0 | 14,982,357; 0 |
| 9 Oct 2026 | provisional, 1.0.11, 1.5.0 | 30 | 14,982,354 | 0 | 30 | 14,316,411; 0 | 14,982,354; 0 |
| 21 Oct 2026 | validated, 1.0.20, 1.6.0 | 29 | 14,982,355 | 0 | 29 | 14,316,413; 0 | 14,982,355; 0 |
| 2 Nov 2026 | validated, 1.0.20, 1.6.0 | 26 | 14,982,358 | 0 | 26 | 14,316,416; 0 | 14,982,358; 0 |

On every date the cells of `HVHV` without a value are exactly the cells with mask `0`, and the received
`HHHH` holds no value in any of them either. The mask of the product holds no `255` and no value from `2`
to `5` in the rectangle.

| Pair of dates | Cells where the two masks differ | `HHHH` received: cells with a value; cells that the masks would change | `HVHV`: cells with a value; cells that the masks would change |
|---|---|---|---|
| 27 Sep 2026 to 9 Oct 2026 | 17 | 14,316,405; 0 | 14,982,347; 0 |
| 9 Oct 2026 to 21 Oct 2026 | 19 | 14,316,403; 0 | 14,982,345; 0 |
| 21 Oct 2026 to 2 Nov 2026 | 23 | 14,316,405; 0 | 14,982,345; 0 |

### 3.3 GUNW

| Pair of dates | Layer | Collection, product version, specification version | Cells with a value | Of these, by `mask`: a sub-swath digit 0; the value 255 | Of these, by `validDataMask`: not valid; the value 255 | Of these, the water flag | Of these, an anomaly flag |
|---|---|---|---|---|---|---|---|
| 17 Jul 2026 to 10 Aug 2026 | 20 m | provisional, 1.0.11, 1.5.0 | 3,579,092 | 0; 0 | absent | 445,631 | 0 |
| 10 Aug 2026 to 22 Aug 2026 | 20 m | provisional, 1.0.11, 1.5.0 | 3,579,092 | 0; 0 | absent | 445,631 | 0 |
| 15 Sep 2026 to 27 Sep 2026 | 20 m | provisional, 1.0.11, 1.5.0 | 3,579,092 | 0; 0 | absent | 445,631 | 0 |
| 27 Sep 2026 to 9 Oct 2026 | 20 m | provisional, 1.0.11, 1.5.0 | 3,579,092 | 0; 0 | absent | 445,631 | 0 |
| 27 Sep 2026 to 9 Oct 2026 | 80 m | provisional, 1.0.11, 1.5.0 | 223,693 | 0; 0 | absent | 27,681 | 0 |
| 9 Oct 2026 to 21 Oct 2026 | 20 m | validated, 1.0.20, 1.6.0 | 3,579,092 | 0; 0 | 0; 0 | 445,631 | 0 |
| 9 Oct 2026 to 21 Oct 2026 | 80 m | validated, 1.0.20, 1.6.0 | 223,693 | 0; 0 | 0; 0 | 27,681 | 0 |

| Pairs of dates | Layer | Cells with a value | Cells that a mask would change |
|---|---|---|---|
| 10 Aug 2026 to 22 Aug 2026, then 15 Sep 2026 to 27 Sep 2026 | 20 m | 3,579,092 | 0 |
| 15 Sep 2026 to 27 Sep 2026, then 27 Sep 2026 to 9 Oct 2026 | 20 m | 3,579,092 | 0 |
| 15 Sep 2026 to 27 Sep 2026, then 9 Oct 2026 to 21 Oct 2026 | 20 m | 3,579,092 | 0 |
| 27 Sep 2026 to 9 Oct 2026, then 9 Oct 2026 to 21 Oct 2026 | 20 m | 3,579,092 | 0 |
| 27 Sep 2026 to 9 Oct 2026, then 9 Oct 2026 to 21 Oct 2026 | 80 m | 223,693 | 0 |

The water flag and the anomaly flags do not mark cells as not valid data, so the rule does not apply to
them; their counts stand in the first table for the record. Bit 24 of the layer `mask` at 80 m, which
concerns the ionospheric phase, is set in 120,109 of the 223,693 cells with a value of the pair of 27 Sep 2026 to 9 Oct 2026 and in 197,606 of the 223,693 cells with a value of the pair of 9 Oct 2026 to 21 Oct 2026. Bits 25 to 31 are 0 in every cell of every window.

## 4. Decision

No mask meets the rule. The cells that the masks mark as not valid data already hold no value in the
layers that the tools receive, so a mask input would change no cell of a result on the pilot area. The
tools Backscatter, One date and Change and Coherence, One pair and Change take no mask, and no code,
method sheet or comparison was changed. The measurement is repeated in the same way (part 3.1) on the
next area.

## 5. Not confirmed

1. One area was measured: four GCOV dates of two processing releases and five GUNW pairs of track 141,
   frame 67. Other areas, frames and dates may hold cells with a value where the mask marks them as not
   valid.
2. The layer `HVHV` was read from the product files, and no received layer of it exists. That a
   received `HVHV` equals the product in every cell with a value was shown for `HHHH` only (part 3.1;
   `docs/research/analysis.md`, part 4.4).
3. The band `frequencyB` and channels other than HH and HV were not read.
4. The tools Backscatter, Series and Coherence, Series read the same layers and were not measured on
   their own. Since no mask marks a cell that holds a value, the masks would not change their values
   either; this follows from the counts and was not run.
5. The meaning of each anomaly flag was not read; the specification does not call a flagged cell not
   valid.
6. In the 80 m layer `mask` of the provisional pair of 27 Sep 2026 to 9 Oct 2026, the cells with bit 24 hold
   the numbers 12 and 124 in bits 0 to 7, and its other cells 11 and 111. In the validated pair of
   9 Oct 2026 to 21 Oct 2026, the cells with bit 24 hold 11 and 111, as its other cells do. No digit is 0,
   so the rule does not apply; what the numbers mean was not studied.

## 6. Sources and records

| Source | Version | Read for |
|---|---|---|
| Product specification files `nisar_L2_GCOV.xml` and `nisar_L2_GUNW.xml` | Versions 1.5.0 and 1.6.0, in nisarqa at commit `a8bc425` | The entries of `mask` and `validDataMask` (part 2) |
| The GCOV and GUNW product files (HDF5) at the ASF DAAC | The granules named in the records | The attributes and the values of the masks (part 3) |

The records are kept in `docs/research/records/analysis/masks/`. The program that made them, with the
rules of the tools that it applies, is described in part 3.1.

| File | SHA-256 | Contents |
|---|---|---|
| `gcov_masks.json` | `e9718d1ed81208bdf312a88a22e1e0a68b67f1faaecaa225e94f400acf876937` | For each GCOV date: the granule, the product and specification versions, the attributes of the layers, the window, the check of the window, the values of the mask, and the cells of the results of One date and Change by value of the mask, for `HHHH` and `HVHV` |
| `gunw_masks.json` | `330f471163bf51cf47cbcc17d44be1c3b92a9c008018b4f3e9e079e03e9b87dd` | For each GUNW pair: the granule, the versions, the layers of the two interferogram groups, the attributes of the masks, the window, the check of the window, the values of `mask` and `validDataMask`, and the cells of the results of One pair and Change by part of each mask |
