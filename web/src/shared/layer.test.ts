import { readFileSync } from "node:fs";
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
  layer: "HHHH",
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
  expect(isLayerDescription({ ...LAYER, kind: "result", layer: null })).toBe(false);
  expect(isLayerDescription({ ...LAYER, kind: "result", layer: null, method: "Reference of the method" })).toBe(true);
});

test("a layer stored without the name of its layer inside the product is accepted", () => {
  const stored: Record<string, unknown> = { ...LAYER };
  delete stored.layer;
  expect(isLayerDescription(stored)).toBe(true);
  expect(isLayerDescription({ ...stored, layer: null })).toBe(true);
});

test("a result is accepted only without the name of a layer inside a product", () => {
  const result = { ...LAYER, kind: "result", method: "Reference of the method" };
  expect(isLayerDescription(result)).toBe(false);
  expect(isLayerDescription({ ...result, layer: null })).toBe(true);
  expect(isLayerDescription({ ...result, layer: undefined })).toBe(true);
});

test("a result may name the two ends of its legend in words, and a layer may not", () => {
  const result = { ...LAYER, kind: "result", layer: null, method: "Reference of the method" };
  expect(isLayerDescription({ ...result, ends: ["decrease", "increase"] })).toBe(true);
  expect(isLayerDescription({ ...result, ends: null })).toBe(true);
  expect(isLayerDescription(result)).toBe(true);
  expect(isLayerDescription({ ...LAYER, ends: null })).toBe(true);
  expect(isLayerDescription({ ...LAYER, ends: ["low", "high"] })).toBe(false);
});

test("a layer may carry the centre frequency of its radar band, in hertz, and a result may not", () => {
  const result = { ...LAYER, kind: "result", layer: null, method: "Reference of the method" };
  expect(isLayerDescription({ ...LAYER, frequency: 1239000000 })).toBe(true);
  expect(isLayerDescription({ ...LAYER, frequency: null })).toBe(true);
  expect(isLayerDescription({ ...LAYER, frequency: undefined })).toBe(true);
  expect(isLayerDescription({ ...result, frequency: null })).toBe(true);
  expect(isLayerDescription({ ...result, frequency: 1239000000 })).toBe(false);
});

test.each([
  ["zero", 0],
  ["negative", -1239000000],
  ["infinite", Infinity],
  ["not a number", NaN],
  ["a text", "1239000000"],
  ["a list", [1239000000]],
])("a layer is rejected when its centre frequency is %s", (_, frequency) => {
  expect(isLayerDescription({ ...LAYER, frequency })).toBe(false);
});

test("the server gives the centre frequency the same form: a number above zero, of a layer only", () => {
  const layers = readFileSync("../api/src/lynkeus/layers.py", "utf8");
  expect(layers).toContain("    frequency: float | None = Field(default=None, gt=0)\n");
  expect(layers).toContain('        if self.kind == "result" and self.frequency is not None:\n');
});

test.each([
  ["one word", ["decrease"]],
  ["three words", ["decrease", "none", "increase"]],
  ["an empty word", ["decrease", ""]],
  ["a word that is not text", ["decrease", 1]],
  ["one text", "decrease"],
])("a result is rejected when the words of the ends of its legend are %s", (_, ends) => {
  const result = { ...LAYER, kind: "result", layer: null, method: "Reference of the method" };
  expect(isLayerDescription({ ...result, ends })).toBe(false);
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
  ["the name of the layer inside the product is empty", { layer: "" }],
  ["the name of the layer inside the product is not text", { layer: 1 }],
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
