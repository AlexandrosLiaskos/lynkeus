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

/** A result of the three classes of the wetland inundation map, with the colours of its method. */
const CLASSES = [
  { value: 1, name: "Not inundated", colour: "#ececee" },
  { value: 2, name: "Open water", colour: "#151b73" },
  { value: 3, name: "Inundated vegetation", colour: "#42e9f5" },
];
const OF_CLASSES = {
  ...LAYER,
  kind: "result",
  layer: null,
  unit: "1",
  range: [1, 3],
  colours: "classes",
  method: "Reference of the method",
  classes: CLASSES,
};

test("a result may carry a table of classes, and a layer may not", () => {
  expect(isLayerDescription(OF_CLASSES)).toBe(true);
  expect(isLayerDescription({ ...OF_CLASSES, classes: null })).toBe(true);
  expect(isLayerDescription({ ...OF_CLASSES, classes: undefined })).toBe(true);
  expect(isLayerDescription({ ...OF_CLASSES, kind: "layer", layer: "HHHH", method: null })).toBe(false);
});

test.each([
  ["it is empty", []],
  ["it has one class", CLASSES.slice(0, 1)],
  ["two classes have one value", [CLASSES[0], CLASSES[0], CLASSES[2]]],
  ["the values do not increase", [CLASSES[1], CLASSES[0], CLASSES[2]]],
  ["a value is not a whole number", [{ ...CLASSES[0], value: 0.5 }, CLASSES[1], CLASSES[2]]],
  ["a value is below zero", [{ ...CLASSES[0], value: -1 }, CLASSES[1], CLASSES[2]]],
  ["a name is empty", [{ ...CLASSES[0], name: "" }, CLASSES[1], CLASSES[2]]],
  ["a colour has capital letters", [{ ...CLASSES[0], colour: "#ECECEE" }, CLASSES[1], CLASSES[2]]],
  ["a colour has no #", [{ ...CLASSES[0], colour: "ececee" }, CLASSES[1], CLASSES[2]]],
  ["it is not a list", "classes"],
])("a result is rejected when its table of classes %s", (_reason, classes) => {
  expect(isLayerDescription({ ...OF_CLASSES, classes })).toBe(false);
});

test("the range of a result of classes runs from its lowest to its highest class", () => {
  expect(isLayerDescription({ ...OF_CLASSES, range: [0, 3] })).toBe(false);
  expect(isLayerDescription({ ...OF_CLASSES, range: [1, 4] })).toBe(false);
});

test("the server gives the table of classes the same form, for a result only", () => {
  const layers = readFileSync("../api/src/lynkeus/layers.py", "utf8");
  expect(layers).toContain("    value: int = Field(ge=0, strict=True)\n");
  expect(layers).toContain('    colour: str = Field(pattern=r"^#[0-9a-f]{6}$")\n');
  expect(layers).toContain("    classes: tuple[LayerClass, ...] | None = None\n");
  expect(layers).toContain('                raise ValueError("only a result may have classes")\n');
  expect(layers).toContain("            if len(values) < 2 or values != sorted(set(values)):\n");
  expect(layers).toContain("            if self.range != (values[0], values[-1]):\n");
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
