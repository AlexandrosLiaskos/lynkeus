import type { LayerClass, LayerDescription } from "../shared/layer";

/** The classes of Backscatter, Thematic map, with the colours of the notebook of the NISAR science team. */
export const INUNDATION_CLASSES: readonly LayerClass[] = [
  { value: 1, name: "Not inundated", colour: "#ececee" },
  { value: 2, name: "Open water", colour: "#151b73" },
  { value: 3, name: "Inundated vegetation", colour: "#42e9f5" },
];

/** A result of classes, as the server describes the wetland inundation map of 21 October 2026, for the tests. */
export function inundation(change: Partial<LayerDescription> = {}): LayerDescription {
  return {
    id: "inundation",
    title: "Wetland inundation, 21 Oct 2026",
    kind: "result",
    url: "/files/inundation/backscatter-map.tif",
    quantity: "Wetland inundation class",
    unit: "1",
    range: [1, 3],
    colours: "classes",
    dates: ["2026-10-21"],
    inputs: ["NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001.h5"],
    layer: null,
    classes: INUNDATION_CLASSES,
    program: "Lynkeus 0.1.0",
    method: "Reference of the method",
    record: "/files/inundation/backscatter-map.json",
    ...change,
  };
}
