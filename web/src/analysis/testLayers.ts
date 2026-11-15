import { layer } from "../data/testSession";
import type { LayerDescription } from "../shared/layer";

/** The product files of the sample files of the pilot area, as the method sheets name them. */
export const GCOV_OCT =
  "NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001.h5";
export const GCOV_NOV =
  "NISAR_L2_PR_GCOV_034_141_D_067_4005_DHDH_A_20261102T234330_20261102T234405_P05036_N_F_J_001.h5";
export const GUNW_PAIR =
  "NISAR_L2_PR_GUNW_032_141_D_067_033_4000_SH_20261009T234330_20261009T234405_20261021T234330_20261021T234405_P05036_N_F_J_001.h5";

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
