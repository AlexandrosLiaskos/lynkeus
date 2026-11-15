// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { layer } from "../data/testSession";
import type { LayerDescription } from "../shared/layer";

/** The product files of the sample files of the pilot area, as the method sheets name them. */
export const GCOV_OCT =
  "NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001.h5";
export const GCOV_NOV =
  "NISAR_L2_PR_GCOV_034_141_D_067_4005_DHDH_A_20261102T234330_20261102T234405_P05036_N_F_J_001.h5";
export const GUNW_PAIR =
  "NISAR_L2_PR_GUNW_032_141_D_067_033_4000_SH_20261009T234330_20261009T234405_20261021T234330_20261021T234405_P05036_N_F_J_001.h5";

/** The product files of two earlier pairs of dates of the pilot area, of 12 and of 24 days, and of two SME2 products. */
export const GUNW_SEP =
  "NISAR_L2_PR_GUNW_031_141_D_067_032_4000_SH_20260927T234330_20260927T234405_20261009T234330_20261009T234405_P05023_N_F_J_001.h5";
export const GUNW_JUL =
  "NISAR_L2_PR_GUNW_025_141_D_067_027_4000_SH_20260717T234332_20260717T234407_20260810T234331_20260810T234406_P05023_N_F_J_001.h5";
export const SME2_SEP =
  "NISAR_L3_PR_SME2_031_141_D_067_4005_DHDH_A_20260927T234330_20260927T234405_P05023_N_F_J_001.h5";
export const SME2_OCT =
  "NISAR_L3_PR_SME2_032_141_D_067_4005_DHDH_A_20261009T234330_20261009T234405_P05023_N_F_J_001.h5";

/** A layer Backscatter of a GCOV product, as the server describes it after it was received, for the tests. */
export function term(change: Partial<LayerDescription> = {}): LayerDescription {
  return layer({
    id: "hh-oct",
    title: "Backscatter HH, 21 Oct 2026",
    layer: "HHHH",
    dates: ["2026-10-21"],
    inputs: [GCOV_OCT],
    ...change,
  });
}

/** The same term of the product of 2 November 2026. */
export function laterTerm(change: Partial<LayerDescription> = {}): LayerDescription {
  return term({
    id: "hh-nov",
    title: "Backscatter HH, 2 Nov 2026",
    dates: ["2026-11-02"],
    inputs: [GCOV_NOV],
    ...change,
  });
}

/** A layer Coherence of a GUNW product, as the server describes it after it was received, for the tests. */
export function coherence(change: Partial<LayerDescription> = {}): LayerDescription {
  return layer({
    id: "coherence-80",
    title: "Coherence HH, 80 m, 9 Oct 2026 to 21 Oct 2026",
    layer: "unwrappedInterferogram/HH/coherenceMagnitude",
    quantity: "Interferometric coherence magnitude, HH",
    range: [0, 1],
    dates: ["2026-10-09", "2026-10-21"],
    inputs: [GUNW_PAIR],
    ...change,
  });
}

/** The 20 m layer Coherence of the pair of 9 and 21 October 2026, the later pair of the tests of Coherence, Change. */
export function laterPair(change: Partial<LayerDescription> = {}): LayerDescription {
  return coherence({
    id: "pair-oct",
    title: "Coherence HH, 20 m, 9 Oct 2026 to 21 Oct 2026",
    layer: "wrappedInterferogram/HH/coherenceMagnitude",
    ...change,
  });
}

/** The same layer of the pair of 27 September and 9 October 2026, which ends on the first date of the later pair. */
export function earlierPair(change: Partial<LayerDescription> = {}): LayerDescription {
  return laterPair({
    id: "pair-sep",
    title: "Coherence HH, 20 m, 27 Sep 2026 to 9 Oct 2026",
    dates: ["2026-09-27", "2026-10-09"],
    inputs: [GUNW_SEP],
    ...change,
  });
}

/** The same layer of the pair of 17 July and 10 August 2026, which spans 24 days. */
export function longPair(change: Partial<LayerDescription> = {}): LayerDescription {
  return laterPair({
    id: "pair-jul",
    title: "Coherence HH, 20 m, 17 Jul 2026 to 10 Aug 2026",
    dates: ["2026-07-17", "2026-08-10"],
    inputs: [GUNW_JUL],
    ...change,
  });
}

/**
 * A layer Unwrapped phase of a GUNW product, as the server describes it after it was received, for the tests.
 * Its centre frequency is the one of the products of the pilot area (`docs/methods/displacement-state.md`).
 */
export function phase(change: Partial<LayerDescription> = {}): LayerDescription {
  return layer({
    id: "phase-hh",
    title: "Unwrapped phase HH, 9 Oct 2026 to 21 Oct 2026",
    layer: "unwrappedInterferogram/HH/unwrappedPhase",
    quantity: "Unwrapped interferometric phase, HH",
    unit: "rad",
    range: [-4, 4],
    colours: "RdBu",
    dates: ["2026-10-09", "2026-10-21"],
    inputs: [GUNW_PAIR],
    frequency: 1239000000,
    ...change,
  });
}

/** The layer Connected components of the same product and channel, for the tests. */
export function components(change: Partial<LayerDescription> = {}): LayerDescription {
  return layer({
    id: "components-hh",
    title: "Connected components HH, 9 Oct 2026 to 21 Oct 2026",
    layer: "unwrappedInterferogram/HH/connectedComponents",
    quantity: "Connected component of the phase unwrapping, HH",
    range: [0, 1],
    colours: "tab10",
    dates: ["2026-10-09", "2026-10-21"],
    inputs: [GUNW_PAIR],
    ...change,
  });
}

/** A layer Soil moisture of an SME2 product, as the server describes it after it was received, for the tests. */
export function soil(change: Partial<LayerDescription> = {}): LayerDescription {
  return layer({
    id: "soil-sep",
    title: "Soil moisture, 27 Sep 2026",
    layer: "soilMoisture",
    quantity: "Soil moisture",
    unit: "m3 m-3",
    range: [0.239, 0.33],
    colours: "YlGnBu",
    dates: ["2026-09-27"],
    inputs: [SME2_SEP],
    ...change,
  });
}

/** The same layer of the product of 9 October 2026. */
export function laterSoil(change: Partial<LayerDescription> = {}): LayerDescription {
  return soil({
    id: "soil-oct",
    title: "Soil moisture, 9 Oct 2026",
    dates: ["2026-10-09"],
    inputs: [SME2_OCT],
    ...change,
  });
}

/** The layer Retrieval quality flag of the product of 27 September 2026, as the server describes it, for the tests. */
export function soilFlag(change: Partial<LayerDescription> = {}): LayerDescription {
  return layer({
    id: "flag-sep",
    title: "Retrieval quality flag, 27 Sep 2026",
    layer: "retrievalQualityFlag",
    quantity: "Retrieval quality flag of the soil moisture, whose lowest bit marks a retrieval not recommended",
    unit: "1",
    range: [3, 15],
    colours: "tab10",
    dates: ["2026-09-27"],
    inputs: [SME2_SEP],
    ...change,
  });
}

/** The same layer of the product of 9 October 2026. */
export function laterSoilFlag(change: Partial<LayerDescription> = {}): LayerDescription {
  return soilFlag({
    id: "flag-oct",
    title: "Retrieval quality flag, 9 Oct 2026",
    dates: ["2026-10-09"],
    inputs: [SME2_OCT],
    ...change,
  });
}
