// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type { SeriesDescription } from "../shared/series";
import type { SeriesItem } from "./series";

/**
 * The series of the mean backscatter of the pilot area on four dates, as a job of the web service returned it
 * on 15 November 2026 (`docs/research/records/analysis/series/`), for the tests.
 */
export function series(change: Partial<SeriesDescription> = {}): SeriesDescription {
  return {
    id: "00e8a880b5c5ef8fdbca05f9d128a63d",
    title: "Backscatter HH, mean of the area",
    kind: "series",
    quantity: "Radar backscatter gamma0",
    unit: "dB",
    reduction: "mean-power",
    range: null,
    point: null,
    cell: null,
    reference: null,
    area: { west: -71.21240946923143, south: 42.59232397512833, east: -70.74021462753375, north: 42.957757337981135 },
    entries: [
      { dates: ["2026-09-27"], value: -4.315111978395169, cells: 14316415 },
      { dates: ["2026-10-09"], value: -4.832534317123461, cells: 14316411 },
      { dates: ["2026-10-21"], value: -4.833044960998819, cells: 14316413 },
      { dates: ["2026-11-02"], value: -4.73623294188971, cells: 14316416 },
    ],
    inputs: [
      "NISAR_L2_PR_GCOV_031_141_D_067_4005_DHDH_A_20260927T234330_20260927T234405_P05023_N_F_J_001.h5",
      "NISAR_L2_PR_GCOV_032_141_D_067_4005_DHDH_A_20261009T234330_20261009T234405_P05023_N_F_J_001.h5",
      "NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001.h5",
      "NISAR_L2_PR_GCOV_034_141_D_067_4005_DHDH_A_20261102T234330_20261102T234405_P05036_N_F_J_001.h5",
    ],
    layer: "HHHH",
    program: "Lynkeus 0.1.0",
    method:
      "Mean of the backscatter in linear power over the cells that hold a value, converted to decibels with 10*log10 (ASF NISAR Cookbook, notebook NISAR_GCOV_Time_Series_Example, section 8, commit 17b69c8; NASA SDS Product Specification, L2 GCOV, JPL D-102274 Rev F, Table 5-7)",
    ...change,
  };
}

/** The series of the coherence of three pairs at a point of the pilot area, as a job returned it on the same day. */
export function pairSeries(change: Partial<SeriesDescription> = {}): SeriesDescription {
  return {
    id: "512101804fc7dba341a7a9d2f67fecb6",
    title: "Coherence HH at p1",
    kind: "series",
    quantity: "Interferometric coherence (magnitude)",
    unit: "1",
    reduction: "mean",
    range: [0, 1],
    point: { longitude: -71, latitude: 42.8 },
    cell: { row: 852, column: 846, longitude: -71.00003754277799, latitude: 42.80004114499954 },
    reference: null,
    area: { west: -71.21240624479763, south: 42.59241396597496, east: -70.74021713322617, north: 42.957667328501266 },
    entries: [
      { dates: ["2026-09-15", "2026-09-27"], value: 0.36974722146987915, cells: 1 },
      { dates: ["2026-09-27", "2026-10-09"], value: 0.3215233087539673, cells: 1 },
      { dates: ["2026-10-09", "2026-10-21"], value: 0.6482067108154297, cells: 1 },
    ],
    inputs: [
      "NISAR_L2_PR_GUNW_030_141_D_067_031_4000_SH_20260915T234330_20260915T234405_20260927T234330_20260927T234405_P05023_N_F_J_001.h5",
      "NISAR_L2_PR_GUNW_031_141_D_067_032_4000_SH_20260927T234330_20260927T234405_20261009T234330_20261009T234405_P05023_N_F_J_001.h5",
      "NISAR_L2_PR_GUNW_032_141_D_067_033_4000_SH_20261009T234330_20261009T234405_20261021T234330_20261021T234405_P05036_N_F_J_001.h5",
    ],
    layer: "wrappedInterferogram/HH/coherenceMagnitude",
    program: "Lynkeus 0.1.0",
    method:
      "Mean of the layer coherenceMagnitude of the product over the cells that hold a value (NASA SDS Product Specification, L2 GUNW, JPL D-102272 Rev E; Touzi et al., 1999, https://doi.org/10.1109/36.739146)",
    ...change,
  };
}

/**
 * The series of the displacement at a point of the pilot area (p5, Newburyport) relative to a reference point in
 * Haverhill, from nine pairs, as a job of the web service returned it on 15 November 2026
 * (`docs/research/records/analysis/displacement-series/`).
 */
export function displacementSeries(change: Partial<SeriesDescription> = {}): SeriesDescription {
  return {
    id: "201b5cef21b0ee646dbf8445079474c0",
    title: "Displacement HH at p5",
    kind: "series",
    quantity: "Displacement along the line of sight, relative to the reference point",
    unit: "m",
    reduction: "mean",
    range: null,
    point: { longitude: -70.8726, latitude: 42.8126 },
    cell: { row: 198, column: 342, longitude: -70.87238755399747, latitude: 42.81273615289848 },
    reference: {
      point: { longitude: -71.0772, latitude: 42.7761 },
      cell: { row: 244, column: 131, longitude: -71.07761957345936, latitude: 42.77605683580816 },
    },
    area: { west: -71.21240624479763, south: 42.5925939476634, east: -70.74070951939615, north: 42.957659830200946 },
    entries: [
      { dates: ["2026-06-23"], value: 0.0, cells: 1 },
      { dates: ["2026-07-05"], value: 0.05738998227098248, cells: 1 },
      { dates: ["2026-07-17"], value: 0.009576881621917619, cells: 1 },
      { dates: ["2026-08-10"], value: 0.045624198491511586, cells: 1 },
      { dates: ["2026-08-22"], value: 0.04217738507878396, cells: 1 },
      { dates: ["2026-09-03"], value: 0.06664725194653955, cells: 1 },
      { dates: ["2026-09-15"], value: 0.06784881915248117, cells: 1 },
      { dates: ["2026-09-27"], value: 0.0026931730201448776, cells: 1 },
      { dates: ["2026-10-09"], value: -0.016184734606434117, cells: 1 },
      { dates: ["2026-10-21"], value: -0.033151987451354635, cells: 1 },
    ],
    inputs: [
      "NISAR_L2_PR_GUNW_023_141_D_067_024_4000_SH_20260623T234333_20260623T234408_20260705T234333_20260705T234408_P05023_N_F_J_001.h5",
      "NISAR_L2_PR_GUNW_024_141_D_067_025_4000_SH_20260705T234333_20260705T234408_20260717T234332_20260717T234407_P05023_N_F_J_001.h5",
      "NISAR_L2_PR_GUNW_025_141_D_067_027_4000_SH_20260717T234332_20260717T234407_20260810T234331_20260810T234406_P05023_N_F_J_001.h5",
      "NISAR_L2_PR_GUNW_027_141_D_067_028_4000_SH_20260810T234331_20260810T234406_20260822T234330_20260822T234405_P05023_N_F_J_001.h5",
      "NISAR_L2_PR_GUNW_028_141_D_067_029_4000_SH_20260822T234330_20260822T234405_20260903T234330_20260903T234405_P05023_N_F_J_001.h5",
      "NISAR_L2_PR_GUNW_029_141_D_067_030_4000_SH_20260903T234330_20260903T234405_20260915T234330_20260915T234405_P05023_N_F_J_001.h5",
      "NISAR_L2_PR_GUNW_030_141_D_067_031_4000_SH_20260915T234330_20260915T234405_20260927T234330_20260927T234405_P05023_N_F_J_001.h5",
      "NISAR_L2_PR_GUNW_031_141_D_067_032_4000_SH_20260927T234330_20260927T234405_20261009T234330_20261009T234405_P05023_N_F_J_001.h5",
      "NISAR_L2_PR_GUNW_032_141_D_067_033_4000_SH_20261009T234330_20261009T234405_20261021T234330_20261021T234405_P05036_N_F_J_001.h5",
    ],
    layer: "unwrappedInterferogram/HH/unwrappedPhase",
    program: "Lynkeus 0.1.0",
    method:
      "Small-baseline inversion of the unwrapped phase of the pairs at the cell of the point, each pair referenced to the cell of the reference point, with equal weights and the minimum-norm velocity, the first date being zero, times -wavelength/(4*pi); relative to the reference point, not corrected for the ionosphere, the troposphere or the solid Earth tides (Berardino et al., 2002, https://doi.org/10.1109/TGRS.2002.803792; Yunjun et al., 2019, https://doi.org/10.1016/j.cageo.2019.104331; MintPy 1.6.4, reference_point and ifgram_inversion with --weight-func no and --mask-dset connectComponent)",
    ...change,
  };
}

/** An entry of the list of series, as the server sends it, for the tests. */
export function seriesItem(description: SeriesDescription = series(), created = "2026-11-15T13:02:11Z"): SeriesItem {
  return { series: description, created };
}
