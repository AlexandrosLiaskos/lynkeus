import { beforeEach, expect, test } from "vitest";
import type { LayerDescription } from "./layer";
import { addToMap, mapLayersStore, removeFromMap } from "./mapLayers";

function layer(id: string, title = id): LayerDescription {
  return {
    id,
    title,
    kind: "layer",
    url: `/files/${id}.tif`,
    quantity: "Radar backscatter",
    unit: "dB",
    range: [-25, 0],
    colours: "grey",
    dates: ["2026-10-20"],
    inputs: ["product-file.h5"],
    program: "Lynkeus 0.1.0",
    method: null,
    record: `/files/${id}.json`,
  };
}

beforeEach(() => {
  mapLayersStore.set([]);
});

test("a new layer is drawn above the others", () => {
  addToMap(layer("a"));
  addToMap(layer("b"));
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["a", "b"]);
});

test("a layer that is added again keeps its place", () => {
  addToMap(layer("a"));
  addToMap(layer("b"));
  addToMap(layer("a", "New title"));
  expect(mapLayersStore.get().map(({ id, title }) => [id, title])).toEqual([
    ["a", "New title"],
    ["b", "b"],
  ]);
});

test("a removed layer leaves the others in their order", () => {
  addToMap(layer("a"));
  addToMap(layer("b"));
  addToMap(layer("c"));
  removeFromMap("b");
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["a", "c"]);
});
