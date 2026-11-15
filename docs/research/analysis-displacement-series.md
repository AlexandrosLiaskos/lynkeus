# Research note: Analysis tab, group Surface displacement, tool Series

| | |
|---|---|
| Part | Analysis tab, group Surface displacement, button Series |
| Covers | The tool Surface displacement, Series (`displacement-series`): the movement of the ground at a point on many dates, relative to a reference point, from a network of GUNW pairs |
| Written | 15 Nov 2026. Every source below was read on that day. |
| Code state | Branch `displacement-series`, made from `main` at commit `fef2618`. The server part is commit `81f9e9a`, on which the jobs of part 4.6 ran |
| Pilot area | Lower Merrimack River: box −71.20, 42.60, −70.75, 42.95 (west, south, east, north); track 141, frame 67, descending |
| Names of the tools | `displacement-series` is listed in `lynkeus.analysis.SERIES_TOOLS`. The buttons of `displacement-change` and `displacement-map` were removed from the Analysis tab on 15 Nov 2026 (`docs/research/analysis-displacement.md`) |

This note follows the form of `docs/research/analysis-displacement.md`, which holds the research of the
layers, the formula and the sign of Surface displacement, One pair. It records the method of the series,
the choices of the source program that the tool follows, the rules that it settles, what was measured
on the files of the pilot area, and what is not confirmed.

## 1. The questions of this part and their answers

| Question | Answer | Part |
|---|---|---|
| Which published method does the tool compute? | The small-baseline inversion of Berardino et al. (2002) as MintPy 1.6.4 computes it: the mean velocities of the phase between consecutive dates, the solution of least norm of the least squares, the phase of a date as the sum of the velocities times the spans | 3.1 |
| Which options of MintPy does it follow? | `reference_point` with a given reference and the mask `maskConnComp.h5`; `ifgram_inversion` with `--weight-func no`, `--mask-dset connectComponent`, the minimum-norm velocity, the minimum redundancy 1 and the cut-off `1e-5` | 3.2 |
| What is the value of the first date? | 0; the dates are counted from the first date of the network | 3.3, rule 1 |
| What happens to a pair in which the point or the reference has no reliable phase? | The pair is left out at the point when the point has no phase, the label 0, or another label than the reference; the series is refused when the reference has no phase or the label 0 in a pair | 3.3, rules 2 and 3 |
| What happens to a network that is not connected? | It is refused with one sentence: the network of all pairs, and the network of the pairs used at the point | 3.3, rule 4 |
| Is a series for the area meaningful? | No; the tool gives the series of a point only | 3.3, rule 5 |
| Which layers may stand in one series? | Those of the other Series tools: one track, direction and frame, one channel, the same environment and major release of the CRID; in addition one centre frequency | 3.3, rule 6 |
| What is the sign? | That of Surface displacement, One pair: a positive value is a movement toward the radar, here relative to the reference point | 3.1 |
| Does the tool equal the source program on the files of the pilot area? | Yes, to `1.2917132044543145e-08` m at five points; the difference comes from the 32-bit numbers of MintPy | 4.4 |

## 2. Layers and fields that the tool uses

The tool reads the layers `unwrappedPhase` (radians, `nan` for no data) and `connectedComponents`
(whole numbers, 0 where the phase could not be unwrapped reliably, `65535` for no data, which Lynkeus
reads as `nan`) of the group `unwrappedInterferogram` of GUNW products, at 80 m, and the centre
frequency of each product that Get layer records in the description of the layer `unwrappedPhase`.
`docs/research/analysis-displacement.md`, part 2, gives the specification (JPL D-102272 Rev E, Table
5-3), the fields, the centre frequency and how Lynkeus reads it. The two dates of each pair are read
from the name of its product file (JPL D-102255 Rev C, section 3.8).

The series job of the server (`lynkeus.tools.run_series`) turns the point and the reference point of
the request into the cells of the grid of the layers that hold them, with `cell_of`, which the series
tools of `docs/research/analysis-series.md` use and which was compared there with the notebook
`NISAR_Pixel_Conversion.ipynb` of the ASF NISAR Cookbook.

## 3. The tool

### 3.1 Method

1. **Publication.** Berardino, P., Fornaro, G., Lanari, R. and Sansosti, E. (2002), IEEE Transactions
   on Geoscience and Remote Sensing, 40(11), 2375-2383, <https://doi.org/10.1109/TGRS.2002.803792>,
   and Yunjun, Z., Fattahi, H. and Amelung, F. (2019), Computers & Geosciences, 133, 104331,
   <https://doi.org/10.1016/j.cageo.2019.104331>. Neither article could be read in full on 15 Nov
   2026: no open copy of the first was found, and the second could not be read beyond its landing page
   (`crossref.json` holds their records). No statement of this note rests on their text; the
   statements on the method rest on the code and the template of MintPy, which cite them.
2. **Source program.** MintPy 1.6.4, licence GPL-3.0-or-later, the program with which the Solid Earth
   team of the mission makes its time series (`docs/research/analysis-displacement.md`, part 3.1, point
   8). The function `estimate_timeseries` of `mintpy/ifgram_inversion.py` (line 91) states in its
   documentation that the traditional SBAS of Berardino et al. (2002) is its setting
   `min_norm_velocity=True` without weights, and the template `mintpy/defaults/smallbaselineApp.cfg`
   (line 174) writes `SBAS (Berardino et al., 2002) = minNormVelocity (yes) + weightFunc (no)`.
3. **Equations.** For the dates `t_0 < ... < t_(N-1)` of the pairs, the unknowns are the mean
   velocities `v_n` of the phase between `t_(n-1)` and `t_n`. A pair of the dates `t_i` and `t_j` gives
   the equation `sum over n = i+1 ... j of v_n (t_n - t_(n-1)) = y`, where `y` is its phase at the
   point minus its phase at the reference point. MintPy builds this design matrix `B` in
   `get_design_matrix4timeseries` (`mintpy/objects/stack.py`, line 1292), with the spans in years of
   365.25 days (line 1318), and solves `B v = y` with `scipy.linalg.lstsq(B, y, cond=rcond)`
   (`ifgram_inversion.py`, line 185), the routine `gelsd` of LAPACK, which gives the solution of least
   norm through the singular value decomposition; `rcond` is `1e-5` (line 92). The phase of a date is
   the cumulative sum of the velocities times the spans (line 196), and the phase of the first date is
   0. The phase is turned into metres with `-wavelength / (4 * pi)` (`phase2range`, line 910).
4. **The function of Lynkeus.** `displacement_series` in `api/src/lynkeus/analysis/displacement.py`
   writes the same equations: the phase of the reference is subtracted in 32-bit numbers, as in MintPy
   (`read_stack_obs`, line 430, on a 32-bit stack), the design matrix holds the spans in years of
   365.25 days, the least squares are solved with `numpy.linalg.lstsq` with `rcond=1e-5` in 64-bit
   numbers, the phase of the first date is 0, and the factor is that of Surface displacement, One pair,
   `-(c / f) / (4 * pi)` with `c` = 299,792,458 m/s and `f` the centre frequency of the products. NumPy
   is the only library that the function uses; it holds none of the code of MintPy.
5. **Sign.** Positive toward the radar, relative to the reference point, for pairs whose reference date
   is the earlier one; `docs/research/analysis-displacement.md`, part 3.1, point 3, derives the sign.

### 3.2 The options of MintPy that the tool follows

| Step of MintPy | Option | Source | The tool |
|---|---|---|---|
| `generate_mask.py ifgramStack.h5 --nonzero -o maskConnComp.h5` | The cells with a label above 0 in every pair (`nonzero_mask`, `stack.py`, lines 972 to 996) | The template names `maskConnComp.h5` as the default mask of the reference point (`smallbaselineApp.cfg`, line 125) | Check 34 of the sheet: the reference needs a phase and a label above 0 in every pair |
| `reference_point.py -y <row> -x <column> -m maskConnComp.h5` | A reference given by the visitor; MintPy raises `input reference point is in masked OUT area defined by maskConnComp.h5!` for a masked one (`reference_point.py`, line 358) | The template recommends choosing the reference by hand in a coherent area, without strong atmospheric turbulence, close to the area of interest at a similar elevation (`smallbaselineApp.cfg`, lines 118 to 122, citing section 4.3 of Yunjun et al., 2019) | The visitor gives the reference point; the sheet gives the guideline |
| `ifgram_inversion.py --weight-func no` | Equal weights, the SBAS of Berardino et al. (2002) (`smallbaselineApp.cfg`, lines 173 and 174) | The default of MintPy is `var`, the inverse of the variance of the phase from the coherence (line 170) | Equal weights: the form takes no coherence layer, and the method named in the task is that of Berardino et al. (2002) |
| `ifgram_inversion.py --mask-dset connectComponent` | A phase with the label 0 or no data becomes no data (`mask_stack_obs`, lines 434 to 454) and the pair is dropped for that cell (`skip_invalid_obs`, line 268) | The template recommends the masking when no weights are used (`smallbaselineApp.cfg`, lines 179 and 181) | A pair is left out at the point (rule 2) |
| minimum-norm velocity, `--min-redun 1`, `rcond=1e-5` | The defaults (`cli/ifgram_inversion.py`; `ifgram_inversion.py`, lines 91 and 92) | | The same |

### 3.3 The rules that the tool settles

1. **The first date is zero.** MintPy removes the first date from the design matrix of a network of
   many reference dates (`get_design_matrix4timeseries`, line 1344) and writes `REF_DATE` = the first
   date into the result (`ifgram_inversion.py`, line 1031). The tool gives the value 0 to the first
   date of the pairs.
2. **The point.** A pair is left out at the point when the point has no finite phase, the label 0 or
   no label, as MintPy does with `--mask-dset connectComponent`. The integer number of turns of the
   unwrapped phase is fixed inside one connected component only (ATBD JPL D-95677, section 5.9.1.7;
   `docs/research/analysis-displacement.md`, part 3.1, point 6), so the tool also leaves out a pair in
   which the point lies in another component than the reference. MintPy has no such rule; its step
   `unwrap_error_bridging` would correct jumps between components, and it is off by default
   (`smallbaselineApp.cfg`, line 148). The nine pairs of the pilot area hold only the labels 0 and 1, so
   the two rules give the same pairs there (`lynkeus_side.json`, `labels_above_1_in_any_pair` = 0).
3. **The reference.** The series is refused when the reference has no finite phase or no label above
   0 in a pair, as MintPy refuses a reference in the area that `maskConnComp.h5` masks (part 3.2). This
   was run on the pilot area: the cell 246, 132, with the label 0 in the pair of 9 and 21 Oct 2026, was
   refused by both programs (`source_side.json`, `comparison.json`, `jobs.json`).
4. **A network that is not connected is refused.** MintPy stops a weighted inversion of a network that
   is not fully connected (`check_design_matrix`, lines 368 to 382: "Input network of interferograms is
   not fully connected!"), and without weights it warns that the "Inversion result can be biased" and
   uses the solution of least norm (line 377 and line 1012). The tool refuses the network of all pairs
   with the sentence `The pairs do not link all their dates into one network, so the movement between
   the separate groups of dates is unknown.`, and the network of the pairs used at the point with the
   sentence of check 35 of the sheet. At the cell q1 (213, 210) of the pilot area, where the pair of 15
   and 27 Sep 2026 has the label 0, MintPy used 8 pairs and gave the same value to 15 and 27 Sep 2026,
   the velocity 0 of the solution of least norm over the gap (`comparison.json`); the tool refuses the
   cell. The check of MintPy on the number of pairs of each date, `--min-redun 1`
   (`estimate_timeseries`, line 162), is contained in the check of the network.
5. **The point only.** A value is the movement of one cell relative to the reference cell. A mean over
   the area of the layers would mix ground that moves with ground that does not, its cells would change
   with the pairs left out, and MintPy has no such output: it inverts each cell on its own
   (`run_ifgram_inversion_patch`, line 596, inverts the cells with all pairs together and the others one
   by one, line 809). The form therefore offers no choice of the place.
6. **The layers of a series.** The rules of `lynkeus.analysis.series` apply to the layers
   `unwrappedPhase`: at least two, the same layer of their products, one instrument, track, direction
   and frame, one environment and major release of the CRID, different dates
   (`docs/research/analysis-series.md`, part 2.2). The tool also requires one centre frequency: MintPy
   holds one `WAVELENGTH` for the whole stack (`prep_nisar.py`, line 775), and a phase is a distance
   only with its own wavelength. All nine pilot pairs have 1,239,000,000 Hz. The provisional release
   `P05023` and the validated release `P05036` stand in one series, as in the other Series tools.
7. **A phase of exactly 0.** MintPy reads a phase of exactly 0 as no data, before and after the
   referencing (`read_stack_obs`, line 430; `run_ifgram_inversion_patch`, line 714). The tool keeps it,
   because the product writes no data as `nan`. No such value occurs at the cells of the comparison
   (`lynkeus_side.json`, `referenced_phase_exactly_0` and `phase_of_the_point_exactly_0`).

### 3.4 Limits

1. The values are relative to the reference point and along the line of sight. The tool does not
   remove the ionosphere, the troposphere or the solid Earth tides; the product does not apply them
   (`docs/research/analysis-displacement.md`, part 3.1, point 5). At the five points of the pilot area
   the values change by up to 0.094 m between two dates (part 4.4); the tool cannot tell such a delay
   of the atmosphere from a movement of the ground.
2. Equal weights, where MintPy recommends the inverse of the variance of the phase.
3. The nine pairs of the pilot area form one chain: every date is linked to the next by one pair, so
   the least squares reduce to the sum of the pairs, and a pair left out at a point breaks the network.
4. Eight provisional pairs and one validated pair are combined; whether they compare without a
   correction is not confirmed (`docs/research/analysis-series.md`, part 2.2).

## 4. What was measured on real files

### 4.1 The records

All records are in `docs/research/records/analysis/displacement-series/`.

| Record | SHA-256 | What it holds |
|---|---|---|
| `catalogue.json` | `d256d4315a9d4d44ecd65f763deecb3099492a3aab887627719feea1476ab043` | The search of NASA's catalogue for the GUNW products of track 141, frame 67 in the validated, provisional and beta collections, with the address of each query (part 4.2) |
| `received.json` | `112cce972e1e0d4e66e6a9d84085859e90c75c20814489685cec58b3c3fd314c` | The 18 jobs of `get-layer` of the private copy of the web service, with the descriptions of the layers received |
| `lynkeus_side.json` | `fc52c2b01a120d1f7604014a03d2b96e1666db06d8e195fd11a19cbe27eb5224` | The layers, their labels, the cells of the points, the series of the tool through `run_series` and the function, the refusals, and the series of the tool on the made-up network |
| `manifest.json` | `317aa1f284840287780b054d7d10879ea234bb18f63b39aad8a69faaefc49cfe` | What the source program read: the files of the pairs and the cells of the points |
| `source_side.json` | `f012d288403861abb99c43647f56ed902ea85ebbf36207f190711cb0013a243c` | The run of MintPy: versions, licence, SHA-256 of seven of its files, the stack written, the reference, and the last lines that each step printed |
| `comparison.json` | `82869407a84404d67261f51fa59e313dc644523c60ad56744a804a183cee17cb` | The values of the two programs at each point and on the made-up network, and their differences |
| `jobs.json` | `f1879f9a9ccc6ca6f855112aa78a3f319f19791a31228eda545f0227dd96db3e` | The jobs of `displacement-series` on the private copy of the web service: five series and seven refusals |
| `synthetic.json` | `351feafd0e1f335699e3f302a716a592e5451546c365484c93768f0654e4e44e` | The made-up network: its dates, pairs, phases and labels |
| `crossref.json` | `6f70a68e9e3c79b8f5630dda7ed94b416007dfd2c655624c7517cf90365f5d29` | The records of the two articles in Crossref, with their licences |
| `mintpy_environment.txt` | `7f672d976e03a1e5c8773b53b44579c1e3e6939bc572cff888cb3db57c618a95` | The packages of the environment of the source program |

### 4.2 The pairs of the pilot area

The catalogue was searched on 15 Nov 2026 with the address
`https://cmr.earthdata.nasa.gov/search/granules.umm_json` and the parameters `short_name`,
`readable_granule_name[]=*GUNW_*_141_D_067_*` with `options[readable_granule_name][pattern]=true`,
`page_size=200` and `sort_key=start_date` (`catalogue.json`). It gave one product in
`NISAR_L2_GUNW_V1` (9 and 21 Oct 2026, `P05036`), eight in `NISAR_L2_GUNW_PROVISIONAL_V1` (23 Jun to
9 Oct 2026, `P05023`) and one in `NISAR_L2_GUNW_BETA_V1` (13 and 25 Dec 2025, `X05010`), which a series
of the other eight would refuse by its release. Eight pairs of 12 days and one of 24 days (17 Jul
to 10 Aug 2026; no product of 29 Jul 2026 exists) link the ten dates from 23 Jun to 21 Oct 2026 into
one chain. All are of the bandwidth mode `4000`, channel HH.

| Pair | Product | Cells with the label 0 | Cells with the label 1 | SHA-256 of the phase file | SHA-256 of the file of the labels |
|---|---|---|---|---|---|
| 2026-06-23 to 2026-07-05 | `NISAR_L2_PR_GUNW_023_141_D_067_024_4000_SH_20260623T234333_20260623T234408_20260705T234333_20260705T234408_P05023_N_F_J_001` | 44,116 | 179,577 | `fe3f9111eeff7fdb…` | `85c2c33045789f94…` |
| 2026-07-05 to 2026-07-17 | `NISAR_L2_PR_GUNW_024_141_D_067_025_4000_SH_20260705T234333_20260705T234408_20260717T234332_20260717T234407_P05023_N_F_J_001` | 24,986 | 198,707 | `8dc79acfc3e3271f…` | `3867b80d42a1c0da…` |
| 2026-07-17 to 2026-08-10 | `NISAR_L2_PR_GUNW_025_141_D_067_027_4000_SH_20260717T234332_20260717T234407_20260810T234331_20260810T234406_P05023_N_F_J_001` | 25,927 | 197,766 | `5c8a2fa3135c2c94…` | `8ff066aa1a64fdf3…` |
| 2026-08-10 to 2026-08-22 | `NISAR_L2_PR_GUNW_027_141_D_067_028_4000_SH_20260810T234331_20260810T234406_20260822T234330_20260822T234405_P05023_N_F_J_001` | 27,221 | 196,472 | `12d2be2c15a9da8a…` | `612c48cfe8530527…` |
| 2026-08-22 to 2026-09-03 | `NISAR_L2_PR_GUNW_028_141_D_067_029_4000_SH_20260822T234330_20260822T234405_20260903T234330_20260903T234405_P05023_N_F_J_001` | 27,491 | 196,202 | `7a009a3a35f47483…` | `927e87310dce6feb…` |
| 2026-09-03 to 2026-09-15 | `NISAR_L2_PR_GUNW_029_141_D_067_030_4000_SH_20260903T234330_20260903T234405_20260915T234330_20260915T234405_P05023_N_F_J_001` | 22,826 | 200,867 | `2de5b65018922aa2…` | `67bdc7ad24e7e6f5…` |
| 2026-09-15 to 2026-09-27 | `NISAR_L2_PR_GUNW_030_141_D_067_031_4000_SH_20260915T234330_20260915T234405_20260927T234330_20260927T234405_P05023_N_F_J_001` | 47,142 | 176,551 | `3573741357b2e147…` | `c5d98e4b89445915…` |
| 2026-09-27 to 2026-10-09 | `NISAR_L2_PR_GUNW_031_141_D_067_032_4000_SH_20260927T234330_20260927T234405_20261009T234330_20261009T234405_P05023_N_F_J_001` | 68,669 | 155,024 | `af6d9ff105fe7165…` | `4732714bb0e30bc1…` |
| 2026-10-09 to 2026-10-21 | `NISAR_L2_PR_GUNW_032_141_D_067_033_4000_SH_20261009T234330_20261009T234405_20261021T234330_20261021T234405_P05036_N_F_J_001` | 26,889 | 196,804 | `d0cfcf7a7181a27b…` | `14b49916fd7fed29…` |

Every layer has 471 by 496 cells of 80 m (EPSG:32619); 223,693 cells hold a value and 9,923 hold none
in every layer. No layer holds a label above 1, and no cell holds a phase without a label. 130,357
cells have the label 1 in all nine pairs, and 30,630 have it in none. The 18 layers were received in
13 minutes through `get-layer` on a private copy of the web service built from `main` at `fef2618`;
each phase layer carries the centre frequency `1239000000.0` Hz.

### 4.3 The points

The reference point is the centre of Haverhill (42.7761 N, 71.0772 W), built-up ground near the middle
of the box, whose cell 244, 131 has the label 1 in every pair. The five points are those of the series
tools (`docs/research/analysis-series.md`); a point whose cell does not have the label of the
reference in every pair was moved to the nearest cell that has it, so that every pair is used.

| Point | Asked | Cell | Place | Lowest and highest value (m) | 21 Oct 2026 (m) | Largest difference from MintPy (m) | From `estimate_timeseries` in 64-bit numbers (m) |
|---|---|---|---|---|---|---|---|
| p1 | 42.8 N, 71.0 W | 214, 210 | moved by 1.41 cells | `-0.0352` to `0.0290` | `-0.0274` | `5.093571705042099e-09` | `1.1476768910223534e-09` |
| p2 | 42.7 N, 70.9 W | 354, 311 | moved by 1.00 cells | `-0.0175` to `0.0566` | `0.0064` | `5.2752677295875294e-09` | `2.295353775105813e-09` |
| p3 | 42.65 N, 71.1 W | 417, 104 | moved by 1.00 cells | `-0.0161` to `0.0405` | `0.0405` | `4.194713305871733e-09` | `1.1476768840834595e-09` |
| p4 | 42.9 N, 70.8 W | 78, 407 | moved by 12.00 cells | `-0.0649` to `0.0863` | `-0.0649` | `4.199090603007605e-09` | `3.469446951953614e-18` |
| p5 | 42.8126 N, 70.8726 W | 198, 342 | as asked | `-0.0332` to `0.0678` | `-0.0332` | `1.2917132044543145e-08` | `2.2953537820447067e-09` |

### 4.4 Comparison with the source program

MintPy 1.6.4 read a stack written from the same files with its function `writefile.layout_hdf5`, in
the layout of `prep_nisar.prepare_stack`, because `prep_nisar.py` needs the GDAL bindings, which its
environment lacks; the arrays of both sides have the same SHA-256 (`source_side.json`, `inputs`). The
import of `ifgram_inversion` needs the package `pyresample`, which was added to the environment
(`mintpy_environment.txt`). The steps ran with the options of part 3.2; the result states
`mintpy.networkInversion.weightFunc` = `no`, `maskDataset` = `connectComponent`, `minNormVelocity` =
`True` and `REF_DATE` = `20260623`.

1. At the five points the largest difference is `1.2917132044543145e-08` m (p5), and the dates are the
   same. MintPy solves in 32-bit numbers and keeps its series in 32-bit numbers. Its own function
   `estimate_timeseries`, given the referenced phases in 32-bit numbers, reproduces its file at the five
   points; given them in 64-bit numbers, it differs from the tool by at most `2.295353782e-09` m, the
   rounding of its 32-bit output array.
2. At the reference cell MintPy gives 0 on every date, as the tool does by definition; the tool refuses
   a point in the cell of the reference (check 7).
3. On the made-up network of 17 pairs on the ten dates (`synthetic.json`), the largest difference over
   the 45 cells that the tool computes is `8.233957479730769e-08` m. The tool refused two cells, in
   which 4 and 3 pairs have no reliable phase and the others do not link all the dates; MintPy gave them
   values from 13 and 14 pairs (`comparison.json`, `refused_cells`).
4. The cell q1 and the reference of check 34: part 3.3, rules 3 and 4.

### 4.5 The tool through `run_series` and the function

`run_series` read the 18 files and gave, at each point, the values of the function
`displacement_series` called on the arrays in memory (`lynkeus_side.json`, `function_equals_run_series`
= `true` for the five points).

### 4.6 Jobs of the web service

The process `displacement-series` was offered by a private copy of the web service, run with uvicorn
from the clone at commit `81f9e9a` in the environment of the checks, on the data folder of part 4.2;
no image was built for it. `GET /api/processes` listed the eleven processes, and the description of the
process gives the inputs `inputs`, `title`, `point` and `reference` (`jobs.json`). The five series
jobs ended in 4 to 17 seconds, and their values equal those of `run_series`. The refusals, each a job
that failed with its sentence: a pair left out at q1, a reference with the label 0 in a pair, the pairs
without the pair of 17 Jul to 10 Aug 2026, no reference point, a reference point outside the area, and
the point in the cell of the reference. A reference point at longitude 200 was refused before a job,
with the status 400.

## 5. How GIS programs offer this function

Not studied in this part. The source program of the comparison, MintPy, is also the program with which
the Solid Earth team of the mission makes its time series.

## 6. Sources, programs, libraries and data of this part

| Item | Version | Licence | Use |
|---|---|---|---|
| [Berardino et al. (2002)](https://doi.org/10.1109/TGRS.2002.803792) | IEEE TGRS 40(11), 2375-2383 | No licence is named in its Crossref record | The method; cited, not read in full |
| [Yunjun et al. (2019)](https://doi.org/10.1016/j.cageo.2019.104331) | Computers & Geosciences 133, 104331 | Elsevier licence for text and data mining (Crossref record) | The article of MintPy and the guideline for the reference point; cited, not read in full |
| [MintPy](https://github.com/insarlab/MintPy) | 1.6.4 (package of the Python Package Index) | GPL-3.0-or-later | Source program; run only, no code copied. SHA-256 of the files read in `source_side.json` |
| pyresample, pykdtree, configobj, donfig, platformdirs, PyYAML | 1.35.0, 1.4.3, 5.0.9, 0.8.1.post1, 4.14.5, 6.0.3 | Not read | Needed for the import of MintPy |
| NumPy | 2.5.4 | `BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0` (licence expression of the package on PyPI, `docs/research/analysis.md`, part 6) | The only library of the function |
| SciPy, h5py and NumPy of the environment of the source program | 1.18.1, 3.16.0 and 2.5.4 (`mintpy_environment.txt`) | Not read | `scipy.linalg.lstsq` solves the least squares of MintPy; h5py reads and writes its files |
| NISAR GUNW products of `NISAR_L2_GUNW_V1` and `NISAR_L2_GUNW_PROVISIONAL_V1` | CRID `P05036` and `P05023` | NASA data | Part 4 |
| [NISAR L1 and L2 ATBD, JPL D-95677](https://nisar.asf.earthdatacloud.nasa.gov/NISAR-SAMPLE-DATA/DOCS/NISAR_D-95677_NASA_L1_L2_ATBD_20231112_R3.4_w-sigs.pdf) | Rev A, 12 Nov 2023 | Document of NASA/JPL | Connected components; the reference of the phase |
| NISAR L2 GUNW Product Specification, JPL D-102272 | Rev E, version 1.2.1, 8 Nov 2024 | Document of NASA/JPL | Layers |
| SDS L-SAR Product File Naming Conventions, JPL D-102255 | Rev C, 19 Oct 2025 | Document of NASA/JPL | Dates and release in the name of a product file |

## 7. Not confirmed, and questions for the owner of the project

1. **Weights.** The tool gives every pair the same weight. The weighting of MintPy by the inverse of
   the variance of the phase needs the coherence layer and the number of looks of each pair; whether
   the form should take the coherence layers is for the owner to decide.
2. **Redundant networks on real data.** The pilot area offers one chain of pairs; the least squares
   with redundant pairs were compared on the made-up network only.
3. **The rule of the components.** A pair in which the point and the reference lie in two components
   is left out; MintPy has no such rule. No pilot pair holds more than one component.
4. **Provisional and validated products in one series**, as for the other Series tools.
5. **Atmosphere.** Changes of several centimetres between dates at the five points, which no
   correction of the tool removes; no ground with a known movement was compared.
6. **The chart in a browser.** The form and the pane were run in the tests of the interface only.
