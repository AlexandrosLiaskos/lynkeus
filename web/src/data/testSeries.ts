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
    shape: null,
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
    shape: null,
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

/** An entry of the list of series, as the server sends it, for the tests. */
export function seriesItem(description: SeriesDescription = series(), created = "2026-11-15T13:02:11Z"): SeriesItem {
  return { series: description, created };
}
