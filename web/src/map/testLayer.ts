import type { LayerDescription } from "../shared/layer";

/** Return the description of a layer of radar backscatter, for the tests of the tools that read the layers. */
export function testLayer(id: string, title: string): LayerDescription {
  return {
    id,
    title,
    kind: "layer",
    url: `/files/${id}/${id}.tif`,
    quantity: "Radar backscatter (gamma nought), HH",
    unit: "linear power",
    range: [0, 1],
    colours: "grey",
    dates: ["2026-10-21"],
    inputs: ["product.h5"],
    program: "Lynkeus 0.1.0",
    method: null,
    record: `/files/${id}/${id}.json`,
  };
}
