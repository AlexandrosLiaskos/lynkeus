// The record of a real product file, which the tests of the server check as well.
import gcov from "../../../api/tests/data/product-gcov.json";
import type { LayerChoice, RequestProduct, Ring } from "./getLayer";

/** Two layers of a GCOV product with their cell size, and one layer without a stated cell size. */
export const HH: LayerChoice = { name: "HHHH", title: "Backscatter HH", spacing: 10 };
export const HV: LayerChoice = { name: "HVHV", title: "Backscatter HV", spacing: 10 };
export const MASK: LayerChoice = { name: "mask", title: "Mask of valid samples" };

/** An area inside the outline of the product of the tests. */
export const AREA = { west: -71.2, south: 42.6, east: -70.75, north: 42.95 };

/** A product that the search found, with the layers that Lynkeus receives of it, for the tests. */
export function product(change: Partial<RequestProduct> = {}): RequestProduct {
  return {
    id: gcov.id,
    name: gcov.name,
    product: "GCOV",
    dates: gcov.dates,
    track: gcov.track,
    frame: gcov.frame,
    footprint: gcov.footprint as unknown as Ring[],
    layers: [HH, HV, MASK],
    ...change,
  };
}
