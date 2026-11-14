import { expect, test } from "vitest";
import { isLayerDescription, isLayerRequest, type LayerDescription, type LayerRequest } from "./layer";

const LAYER: LayerDescription = {
  id: "gcov-hhhh-20261020",
  title: "Backscatter HH, 20 Oct 2026",
  kind: "layer",
  url: "/files/gcov-hhhh-20261020.tif",
  quantity: "Radar backscatter",
  unit: "dB",
  range: [-25, 0],
  colours: "grey",
  dates: ["2026-10-20"],
  inputs: ["product-file.h5"],
  program: "Lynkeus 0.1.0",
  method: null,
  record: "/files/gcov-hhhh-20261020.json",
};

const REQUEST: LayerRequest = {
  product: "GCOV",
  granule: "product-file",
  layer: "HHHH",
  area: { west: -122, south: 37.9, east: -121.5, north: 38.3 },
};

test("a complete layer description is accepted", () => {
  expect(isLayerDescription(LAYER)).toBe(true);
});

test("a result is accepted only with the reference of its method", () => {
  expect(isLayerDescription({ ...LAYER, kind: "result" })).toBe(false);
  expect(isLayerDescription({ ...LAYER, kind: "result", method: "Reference of the method" })).toBe(true);
});

test.each([
  ["the id is empty", { id: "" }],
  ["the kind is unknown", { kind: "other" }],
  ["the unit is missing", { unit: undefined }],
  ["the range has one value", { range: [0] }],
  ["the range is not increasing", { range: [0, 0] }],
  ["a date is not year-month-day", { dates: ["20 Oct 2026"] }],
  ["there is no date", { dates: [] }],
  ["there is no input file", { inputs: [] }],
  ["a layer carries a method", { method: "Reference of the method" }],
])("a layer description is rejected when %s", (_reason, change) => {
  expect(isLayerDescription({ ...LAYER, ...change })).toBe(false);
});

test("a complete layer request is accepted", () => {
  expect(isLayerRequest(REQUEST)).toBe(true);
});

test.each([
  ["the product type is unknown", { product: "RSLC" }],
  ["the product file is not named", { granule: "" }],
  ["the layer is not named", { layer: "" }],
  ["the area is not valid", { area: { west: 1, south: 0, east: 0, north: 1 } }],
])("a layer request is rejected when %s", (_reason, change) => {
  expect(isLayerRequest({ ...REQUEST, ...change })).toBe(false);
});
