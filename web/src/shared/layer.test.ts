// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  isAreaStatistics,
  isLayerDescription,
  isLayerRequest,
  isShape,
  type AreaStatistics,
  type LayerDescription,
  type LayerRequest,
} from "./layer";

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

const SHAPE = {
  crs: "EPSG:3857",
  kind: "polygon",
  points: [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 0],
  ],
} as const;

const STATISTICS: AreaStatistics = {
  area: SHAPE,
  cells: 3,
  mean: -10.5,
  deviation: 1.25,
  minimum: -12,
  median: -10,
  maximum: -9.5,
};

test("a result may carry its statistics inside an area drawn on the map, and a layer may not", () => {
  const result = { ...LAYER, kind: "result", layer: null, method: "Reference of the method" };
  expect(isLayerDescription({ ...result, statistics: STATISTICS })).toBe(true);
  expect(isLayerDescription({ ...result, statistics: null })).toBe(true);
  expect(isLayerDescription({ ...LAYER, statistics: STATISTICS })).toBe(false);
  const none = { area: SHAPE, cells: 0, mean: null, deviation: null, minimum: null, median: null, maximum: null };
  expect(isAreaStatistics(none)).toBe(true);
  expect(isAreaStatistics({ ...none, mean: 1 })).toBe(false);
  expect(isAreaStatistics({ ...STATISTICS, median: null })).toBe(false);
  expect(isAreaStatistics({ ...STATISTICS, cells: 2.5 })).toBe(false);
  expect(isAreaStatistics({ ...STATISTICS, area: { ...SHAPE, crs: "WGS 84" } })).toBe(false);
});

test("an area drawn on the map has 4 to 251 points of two numbers, the last equal to the first", () => {
  expect(isShape(SHAPE)).toBe(true);
  expect(isShape({ ...SHAPE, kind: "circle" })).toBe(false);
  expect(isShape({ ...SHAPE, points: SHAPE.points.slice(0, 3) })).toBe(false);
  expect(isShape({ ...SHAPE, points: [...SHAPE.points.slice(0, 3), [1, 1]] })).toBe(false);
  expect(
    isShape({
      ...SHAPE,
      points: [
        [0, 0],
        [10, 0],
        [10, "10"],
        [0, 0],
      ],
    }),
  ).toBe(false);
  const many = Array.from({ length: 251 }, (_, index) => [index, index % 2] as const);
  expect(isShape({ ...SHAPE, points: [...many, many[0]] })).toBe(false);
});

test("the server gives an area and its statistics the same form", () => {
  const layers = readFileSync("../api/src/lynkeus/layers.py", "utf8");
  for (const line of [
    '    crs: str = Field(pattern=r"^EPSG:[0-9]{1,6}$")\n',
    '    kind: Literal["rectangle", "polygon"]\n',
    "    points: tuple[tuple[float, float], ...] = Field(min_length=4, max_length=MOST_CORNERS + 1)\n",
    "    cells: int = Field(ge=0)\n",
    "    statistics: AreaStatistics | None = None\n",
    '            raise ValueError("only a result has statistics in an area")\n',
  ]) {
    expect(layers).toContain(line);
  }
});
