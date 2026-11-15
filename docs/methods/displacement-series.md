# Surface displacement, Series

| | |
|---|---|
| Tool | `displacement-series` (Analysis tab, group Surface displacement, button Series) |
| NISAR product | GUNW, Level-2 Geocoded Unwrapped Interferogram |
| Result | Displacement of the ground along the line of sight of the radar at a point, on each date of a network of pairs, since the first date and relative to a reference point, in metres. The result is a series, not a layer |
| State | The comparison (D-17) with MintPy 1.6.4 was made on 15 Nov 2026 on the nine pairs of the pilot area (23 Jun to 21 Oct 2026; channel HH, 80 m), at five points with one reference point, and on a made-up network of 17 pairs. On the same day the tool ran as jobs of a private copy of the web service. The interface offers the tool and shows the series as a chart with a table; this was run in the tests of the interface and was not seen in a browser |

## In brief

| | |
|---|---|
| What it shows | The movement of the ground at a point toward or away from the radar on each date of a network of pairs, counted from the first date and relative to a reference point that you choose. |
| Input | The Unwrapped phase and Connected components layers of 2 to 25 GUNW pairs of one track, direction and frame, whose pairs link all their dates. A point and a reference point, each given by its latitude and longitude. |
| Formula | In each pair the phase of the reference point is subtracted from that of the point, the small-baseline inversion with equal weights and the minimum-norm velocity gives the phase of each date, and `d = -wavelength / (4 * pi) * phase`. |
| Result | A series in metres, one value for each date, positive toward the radar and 0 on the first date. It is shown as a chart and a table, and it has no file. |
| How to read | Each value is the movement of the point since the first date minus that of the reference point, so choose the reference on ground that you take as stable, near the point and at a similar height. A pair in which the point has no reliable phase, or lies in another connected component than the reference, is left out at the point, and the pairs used are listed with the series. In the test area the values at the five points change by up to 0.094 m between two dates, which the tool cannot tell from a delay of the atmosphere or the ionosphere. |
| Limits | The values are relative to the reference point and along the line of sight only, without a correction of the troposphere, the ionosphere or the solid Earth tides, and every pair has the same weight. The series of the test area mixes eight provisional pairs and one validated pair of the same major release, and whether they compare without a correction is not confirmed. The test area holds one chain of nine pairs, so no pair was redundant, and no ground with a known movement was compared. |
| Checked | At five points with one reference point of the test area (nine pairs, 23 Jun to 21 Oct 2026), the values differ by at most 0.000000013 m from those of MintPy 1.6.4 on the same layers, which computes in 32-bit numbers, and by at most 0.000000082 m on a made-up network of 17 pairs. |
| References | [Berardino et al. (2002)](https://doi.org/10.1109/TGRS.2002.803792) and [Yunjun et al. (2019)](https://doi.org/10.1016/j.cageo.2019.104331), cited and not read in full. [MintPy](https://github.com/insarlab/MintPy) 1.6.4, with its template of options. [NISAR L2 GUNW Product Specification, JPL D-102272 Rev E](https://nisar-docs.asf.alaska.edu/product-specification/). |

## Reference

1. Berardino, P., Fornaro, G., Lanari, R. and Sansosti, E. (2002). A new algorithm for surface
   deformation monitoring based on small baseline differential SAR interferograms. IEEE Transactions
   on Geoscience and Remote Sensing, 40(11), 2375-2383. <https://doi.org/10.1109/TGRS.2002.803792>.
   The method of the tool. The article could not be read in full on 15 Nov 2026; no statement of this
   sheet rests on its text. The statements on what the method computes rest on MintPy (reference 3),
   which names the article as the method of its options.
2. Yunjun, Z., Fattahi, H. and Amelung, F. (2019). Small baseline InSAR time series analysis:
   Unwrapping error correction and noise reduction. Computers & Geosciences, 133, 104331.
   <https://doi.org/10.1016/j.cageo.2019.104331>. The article of MintPy. It could not be read in full on
   15 Nov 2026; the guideline for the reference point is quoted from the template of MintPy, which cites
   its section 4.3.
3. MintPy 1.6.4, the package of the Python Package Index, licence GPL-3.0-or-later
   (<https://github.com/insarlab/MintPy>). The files read: `mintpy/ifgram_inversion.py`
   (`estimate_timeseries`, `read_stack_obs`, `mask_stack_obs`, `run_ifgram_inversion_patch`,
   `check_design_matrix`), `mintpy/objects/stack.py` (`get_design_matrix4timeseries`,
   `nonzero_mask`), `mintpy/reference_point.py` (`reference_file`, `read_reference_input`),
   `mintpy/prep_nisar.py` (`read_subset`, `prepare_stack`), and the template of the options
   `mintpy/defaults/smallbaselineApp.cfg`, sections reference_point and invert_network. MintPy was run
   for the comparison only, as a separate program; Lynkeus holds none of its code.
4. NASA SDS Product Specification, Level-2 Geocoded Unwrapped Interferogram (L2 GUNW), JPL D-102272,
   Rev E, version 1.2.1, 8 November 2024: section 2.2 and Table 5-3 (the layers `unwrappedPhase` and
   `connectedComponents`, and the corrections that are not applied).
5. NISAR L1 and L2 Algorithm Theoretical Basis Document, JPL D-95677, Rev A, 12 November 2023:
   section 5.9 (the phase is relative to arbitrary reference points) and section 5.9.1.7 (the
   connected components). The sheet `docs/methods/displacement-state.md` gives the pages.
6. Science Data Systems (SDS) L-SAR Product File Naming Conventions, JPL D-102255, Rev C,
   19 October 2025: section 3.8 (the times of the two acquisitions of a pair) and section 4.1 (the
   composite release identifier, CRID).

## Input layers

The tool takes, for each pair of dates, the layer `unwrappedPhase` and the layer
`connectedComponents` of one GUNW product, in any order: 4 to 50 layers, that is 2 to 25 pairs. The
layers of all pairs are of the same channel, of products of the same instrument, track, direction
and frame, and of the same environment and major release of the processing software (the first
three characters of the CRID), as for the other Series tools.

| Layer | Path in the product | Type | Unit | No data |
|---|---|---|---|---|
| `unwrappedPhase` | `/science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram/[HH or VV]/unwrappedPhase` | Float32 | `rad` | `nan` |
| `connectedComponents` | `/science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram/[HH or VV]/connectedComponents` | UInt16 | `1` | `65535`, read as `nan` |

Both layers have a spacing of 80 m. The description of each layer `unwrappedPhase` carries the
centre frequency of the radar band of its product, which Get layer reads from the ISO XML file of
the product (`docs/methods/displacement-state.md`). The request gives a point and a reference point,
each in degrees of longitude and latitude (WGS 84). The server turns each into the cell of the grid
of the layers that holds it, as for the other Series tools (`docs/methods/backscatter-series.md`).
The form of the interface offers the layers `unwrappedPhase` and sends beside each the layer
`connectedComponents` of its product, as the form of Surface displacement, One pair does.

The tool gives the series of a point only. A value of the tool is the movement of one cell relative
to the reference cell. The mean of such values over the area of the layers would be the movement of
all the ground of the box relative to one point: it mixes ground that moves with ground that does
not, its cells change from pair to pair as pairs are left out, and it is not an output of the
source program, which inverts the network cell by cell (`run_ifgram_inversion_patch`). The form
therefore has no choice between the whole area and a point.

### What the tool refuses

The server and the tool make the checks below in this order and report the first fault that they
find. A refusal is raised as `LayerError` of `lynkeus.writing`, and its message is one sentence for
the visitor. The checks 1 to 31 are made on the layer descriptions and on the grids, before any
value is read.

| No. | The tool refuses the input when | Sentence for the visitor |
|---|---|---|
| 1 | a layer of the request is not a layer of the session | `A layer of the analysis no longer exists.` |
| 2 | the layers differ in projection, transform, width or height | `The layers of the analysis do not have the same grid.` |
| 3 | the point lies outside the grid of the layers | `The point lies outside the area of the layers.` |
| 4 | the reference point lies outside the grid of the layers | `The reference point lies outside the area of the layers.` |
| 5 | the request has no point | `The tool gives the series of a point, and no point was given.` |
| 6 | the request has no reference point | `The tool gives the series relative to a reference point, and no reference point was given.` |
| 7 | the point and the reference point lie in one cell | `The point and the reference point lie in the same cell of the layers.` |
| 8 | a layer other than a layer `connectedComponents` was not received from one GUNW product file | `The layer "<title>" is not a layer received from one NISAR GUNW product.` |
| 9 | its description does not hold the name of the layer inside the product | `The layer "<title>" does not record which layer of its product it is; receive it again with Get layer.` |
| 10 | its name inside the product is not `unwrappedInterferogram/HH/unwrappedPhase` or `unwrappedInterferogram/VV/unwrappedPhase` | `The layer "<title>" is the layer <name> of its product, and the tool reads the layers unwrappedPhase and connectedComponents.` |
| 11 | its unit is not `rad` | `The layer "<title>" has the unit <unit>, and the tool reads the unit rad.` |
| 12 | it does not have two dates | `The number of dates of the layer "<title>" must be 2, and it is <number>.` |
| 13 | to 17: the same five checks on the layers `connectedComponents`, whose unit is `1` | The same sentences |
| 18 | the pairs are fewer than two | `A series needs at least 2 pairs of dates, and it has <number>.` |
| 19 | the layers `unwrappedPhase` are not the same layer of their products | `The layers are not the same layer of their products: "<title>" is <name> and "<title>" is <name>.` |
| 20 | the products are not of the same instrument, track, direction and frame | `The layers are not of the same instrument, track, direction and frame.` |
| 21 | the name of a product file does not end with the release of the processing software | `The name of the product file of the layer "<title>" does not hold the release of the processing software.` |
| 22 | the products are not of the same environment and major release | `The layers are not of the same major release of the processing software: "<title>" is of the release <CRID> and "<title>" of <CRID>.` |
| 23 | two layers `unwrappedPhase` have the same dates | `The layers "<title>" and "<title>" have the same dates.` |
| 24 | two layers `connectedComponents` are of one product file | `The layers "<title>" and "<title>" are of the same product file.` |
| 25 | a layer `unwrappedPhase` has no layer `connectedComponents` of its product file | `The layer of connected components of the product of the layer "<title>" is missing.` |
| 26 | the two layers of a product are of two channels | `The two layers are not of the same polarisation channel: the first is <name> and the second is <name>.` |
| 27 | a layer `unwrappedPhase` does not record the centre frequency of its radar band | `The layer "<title>" does not record the centre frequency of its radar band; receive it again with Get layer.` |
| 28 | two layers `unwrappedPhase` record different centre frequencies | `The layers "<title>" and "<title>" have different centre frequencies of their radar band, so their phases cannot be combined.` |
| 29 | the name of a product file does not give a reference acquisition earlier than the secondary one | `The name of the product file of the layer "<title>" does not give a reference date that is earlier than the secondary date.` |
| 30 | a layer `connectedComponents` has no layer `unwrappedPhase` of its product file | `The layer "<title>" is not of the product of any layer unwrappedPhase of the series.` |
| 31 | the pairs do not link all their dates into one network | `The pairs do not link all their dates into one network, so the movement between the separate groups of dates is unknown.` |
| 32 | the arrays of two layers differ in size | `The input layers do not have the same grid.` |
| 33 | a layer `connectedComponents` holds a value that is not a whole number from 0 | `The layer "<title>" holds values that are not whole numbers from 0, so it is not a layer of connected components.` |
| 34 | the reference point has no finite phase, or no connected component above 0, in a pair | `The reference point has no reliable phase in the layer "<title>", so choose a reference point with one in every pair.` |
| 35 | the pairs that are used at the point do not link all the dates | `At the point, the phase of <number> of the <number> pairs is not reliable relative to the reference point, and the other pairs do not link all the dates into one network.` |

A request with fewer than two layers or more than 50, with one layer given twice, or with a point or
a reference point outside −180 to 180 degrees of longitude or −90 to 90 degrees of latitude is
refused by the web service before a job is made, with the status 400. The tools Backscatter, Series
and Coherence, Series refuse a reference point with the sentence `The tool takes no reference
point.`

## Formula

For the cell `p` of the point and the cell `r` of the reference point, and the dates
`t_0 < t_1 < ... < t_(N-1)` of all the pairs:

```text
pair k of the dates t_i and t_j is used at p when phase_k(p) is finite and label_k(p) = label_k(r) > 0
y_k = phase_k(p) - phase_k(r)                                   (32-bit numbers)
unknowns: v_n, the mean velocity of the phase between t_(n-1) and t_n, for n = 1 ... N-1
equation of pair k:  sum over n = i+1 ... j of  v_n * (t_n - t_(n-1)) = y_k     (t in years of 365.25 days)
v = the least-squares solution of least norm (singular value decomposition; a singular value below
    1e-5 times the largest counts as zero)
phase(t_0) = 0,   phase(t_n) = sum over m = 1 ... n of  v_m * (t_m - t_(m-1))
d(t_n) = -(c / f) / (4 * pi) * phase(t_n)
```

with `c` = 299,792,458 m/s and `f` the centre frequency of the products. The inversion is made in
64-bit numbers with `numpy.linalg.lstsq` (LAPACK `gelsd`). The steps and their sources:

1. **Reference point.** The phase of the reference cell is subtracted from the phase of the cell of
   the point in each pair, as MintPy does before the inversion (`read_stack_obs` in
   `ifgram_inversion.py`; the reference is set by `reference_point.py` with a given row and column).
   The unwrapped phase of a product is relative to arbitrary reference points (reference 5, section
   5.9), so a value of one cell alone has no meaning; the difference of two cells of one connected
   component does.
2. **Connected components.** A pair is left out at the point where the point has no phase or the
   label 0, as MintPy does with `--mask-dset connectComponent` (`mask_stack_obs` sets such a phase to
   no data, and `estimate_timeseries` drops the pair for that cell). The integer number of turns of
   the unwrapped phase is fixed inside one component only (reference 5, section 5.9.1.7), so the tool
   also leaves out a pair in which the point and the reference lie in two different components.
   MintPy has no such rule; the pairs of the pilot area hold only the labels 0 and 1, where the two
   rules are the same.
3. **The reference must be valid in every pair.** MintPy refuses a given reference point that lies
   in the area that `maskConnComp.h5` masks, the cells with the label 0 or no data in any pair
   (`read_reference_input` in `reference_point.py`, with the mask that `generate_mask.py --nonzero`
   makes and that the template of MintPy names as the default of `mintpy.reference.maskFile`). The tool
   refuses such a reference with a sentence (check 34).
4. **Small-baseline inversion.** The unknowns, the design matrix of the time spans and the solution
   of least norm are those of `estimate_timeseries` with `min_norm_velocity=True` and no weights,
   which the template of MintPy calls the SBAS of Berardino et al. (2002): `SBAS (Berardino et al.,
   2002) = minNormVelocity (yes) + weightFunc (no)` (`smallbaselineApp.cfg`, section invert_network).
   The cut-off `1e-5` and the year of 365.25 days are those of MintPy. **Weights**: the tool gives
   every pair the same weight (`--weight-func no`). The default of MintPy weights each pair by the
   inverse of the variance of its phase, computed from the coherence and the number of looks; the
   form of the tool takes no coherence layer, and the template of MintPy recommends the masking of
   step 2 when no weights are used.
5. **First date zero.** The phase of the first date is 0, and the other dates are counted from it,
   as in MintPy, whose design matrix leaves out the first date of a network of many reference dates
   (`get_design_matrix4timeseries`; the result carries `REF_DATE` = the first date).
6. **A network that is not connected is refused.** With weights, MintPy stops on a network that is
   not fully connected (`check_design_matrix`: "Input network of interferograms is not fully
   connected!"); without weights it continues with the solution of least norm and warns that the
   result can be biased (`run_ifgram_inversion`). The tool refuses both the network of all pairs
   (check 31) and the network of the pairs used at the point (check 35), and gives no value that
   rests on the assumption of least norm alone. Where a pair is left out at a point of the pilot
   area, the network at that point is broken, because the nine pairs form one chain.
7. **Displacement.** `d = -(c / f) / (4 * pi) * phase`, the conversion of `run_ifgram_inversion_patch`
   (`phase2range`) and of Surface displacement, One pair, with the same sign: a positive value is a
   movement toward the radar, for pairs whose reference date is the earlier one.

## Unit

Metres (m), along the line of sight of the radar. The values are 64-bit numbers. The table of the
interface writes them with three decimals (millimetres).

## Reduced copies of the result

A series has no file and no reduced copies. The tool reads every layer at full resolution and keeps
only the values of the two cells. The field `reduction` of the series description is `mean`: the
value of a date is made from the one cell of the point (and the one cell of the reference).

## Legend

A series is drawn as a chart and has no colour scale. The fields below take the place of the legend.

| Field of the series description | Value |
|---|---|
| `quantity` | Displacement along the line of sight, relative to the reference point |
| `unit` | `m` |
| `range` | none |
| `reduction` | `mean` |
| `reference` | The reference point of the request and the cell that holds it |
| `inputs` | The product files of the pairs used at the point, the earliest pair first |

## How to read the result

A value is the displacement of the point along the line of sight between the first date and its
date, minus that of the reference point. A positive value is a movement of the point toward the
radar relative to the reference point. A value near 0 on every date means that the point moved as
the reference did; it does not mean that the ground was still. The template of MintPy, citing
section 4.3 of Yunjun et al. (2019), asks for a reference point in a coherent area, not affected by
strong atmospheric turbulence, and close to the area of interest at a similar elevation; the sheet
gives this as the guideline for the choice. The tool does not check the coherence of the reference.

The products of the pilot area are acquired every 12 days, with one span of 24 days (17 Jul to
10 Aug 2026). The line of sight of a descending track looks from the east toward the west and down;
the tool does not project the movement to the vertical or to the horizontal.

## Comparison with the source program (D-17)

| | |
|---|---|
| Source program | MintPy 1.6.4, the package of the Python Package Index (licence GPL-3.0-or-later), run as a separate program: `generate_mask.py --nonzero`, `reference_point.py -y <row> -x <column> -m maskConnComp.h5` and `ifgram_inversion.py --weight-func no --mask-dset connectComponent`, with the minimum-norm velocity, the minimum redundancy 1 and the cut-off `1e-5` of its defaults. MintPy needs the GDAL bindings to read a GUNW product with `prep_nisar.py`, which its environment lacks, so its interferogram stack was written from the same layer files with its own function `writefile.layout_hdf5`, in the layout of `prep_nisar.prepare_stack` (unwrapped phase and connected components as 32-bit numbers, no data as `nan`) |
| Comparison | The series of the tool, through `run_series` and as jobs of the web service, against the time series that MintPy writes in `timeseries.h5`, at the cells of five points with one reference point. The same on a made-up network of 17 pairs (each of the ten dates joined to the next two) on a grid of 6 by 8 cells, with the label 0 or no data in about 12 % of the cells of each pair |
| Files compared | The layers `unwrappedPhase` and `connectedComponents` (HH, 80 m) of the nine GUNW products of track 141, frame 67, from 23 Jun to 21 Oct 2026, as the web service received them for the box of the pilot area (471 by 496 cells): eight of the provisional collection (release `P05023`) and one of the validated collection (release `P05036`). The values that the two programs read are equal (SHA-256 of each array). The records are in `docs/research/records/analysis/displacement-series/` |
| Points | Reference: the centre of Haverhill (42.7761 N, 71.0772 W, cell 244, 131). Points p1 to p5 near 42.80 N 71.00 W, 42.70 N 70.90 W, 42.65 N 71.10 W, 42.90 N 70.80 W and 42.8126 N 70.8726 W (Newburyport); four of them were moved to the nearest cell that has the label 1 in all nine pairs, by 1 to 12 cells |
| Platform | `Linux-6.8.0-146-generic-x86_64-with-glibc2.41`, Python 3.13.18. Lynkeus: numpy 2.5.4, rasterio 1.5.2. Source program: numpy 2.5.4, scipy 1.18.1, h5py 3.16.0, rasterio 1.5.2 and pyresample 1.35.0, which the import of `ifgram_inversion` needs and which was added to its environment |
| Largest difference | At the five points: `1.2917132044543145e-08` m (p5); the largest at the other points lie between `4.2e-09` and `5.3e-09` m. MintPy solves the least squares in 32-bit numbers (LAPACK `sgelsd` through SciPy) and keeps the series in 32-bit numbers, and Lynkeus works in 64-bit numbers; the function `estimate_timeseries` of MintPy, given the same phases in 64-bit numbers, comes within `2.3e-09` m of the tool, and given them in 32-bit numbers it reproduces the file of MintPy. On the made-up network: `8.233957479730769e-08` m over 45 cells. The values of the five jobs of the web service equal those of `run_series` |
| Where the two differ by rule | Two cells of the made-up network, and the cell q1 of the pilot area (213, 210), in which the pairs used do not link all the dates: the tool refuses them (check 35), and MintPy gives a value from 13, 14 and 8 pairs, bridging each gap with a velocity of 0 (at q1 the values of 15 and 27 Sep 2026 are equal). A reference with the label 0 in the pair of 9 and 21 Oct 2026 (cell 246, 132) was refused by both programs |
| Not reached | A network with redundant pairs on real data; the weights of MintPy; labels of connected components above 1; a phase of exactly 0, which MintPy reads as no data and the tool does not (none occurs at the points); MintPy's own conversion of the reference point from latitude and longitude, which needs the package `utm` that its environment lacks (the cell was given by row and column) |

## Not yet confirmed

1. The weighting of MintPy by the variance of the phase, which its template recommends: the tool
   uses equal weights. It needs the coherence layer of each pair.
2. A network with redundant pairs on real data. The pilot area holds one chain of nine pairs, so the
   least squares were checked against MintPy on the made-up network only.
3. Whether a provisional and a validated product may be combined without a correction
   (`docs/research/analysis-series.md`, part 2.2).
4. Ground with a known movement, the channel VV, other bandwidths, and labels of connected
   components above 1: none occurs in the pilot area.
5. How the chart looks on a screen: it was run in the tests of the interface only and was not seen
   in a browser.
