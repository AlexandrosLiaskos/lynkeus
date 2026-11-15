// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { beforeEach, expect, test, vi } from "vitest";
import { testLayer } from "../map/testLayer";
import { addToMap, mapLayersStore, removeFromMap } from "../shared/mapLayers";
import { resetStorage, setPartKept, storageStore } from "../shared/storage/storage";
import { displayStore, setDisplay, type LayerDisplay } from "./state";
import { LAYERS_KEY, storedDisplay, storedLayers } from "./storedLayers";

const ONE = testLayer("one", "Backscatter of 21 October");
const TWO = testLayer("two", "Backscatter of 2 November");

const DISPLAY: LayerDisplay = {
  visible: false,
  opacity: 0.6,
  range: [-25, -5],
  colours: "viridis",
  decibels: true,
  inverted: true,
  noDataColour: "#ff0000",
  mask: [-30, 0],
  stretch: { kind: "percent", percent: 2 },
};

function stored(): unknown {
  const text = window.localStorage.getItem(LAYERS_KEY);
  return text === null ? null : JSON.parse(text);
}

beforeEach(() => {
  mapLayersStore.set([]);
  displayStore.set({});
  window.localStorage.clear();
  resetStorage();
});

test("the layers of the map are a part that the browser keeps, in their order and with the display of each", () => {
  expect(storageStore.get().parts.find(({ key }) => key === LAYERS_KEY)).toMatchObject({
    title: "Layers of the map",
    kept: true,
  });
  addToMap(ONE);
  addToMap(TWO);
  expect(stored()).toEqual({ v: 1, value: { layers: [ONE, TWO], displays: {} } });
  setDisplay(TWO, { opacity: 0.5 });
  expect(stored()).toEqual({
    v: 1,
    value: { layers: [ONE, TWO], displays: { two: { visible: true, opacity: 0.5, range: [0, 1], colours: "grey" } } },
  });
  mapLayersStore.set([TWO, ONE]);
  expect(stored()).toMatchObject({ value: { layers: [TWO, ONE] } });
});

test("the display of a layer that has left the map is not stored", () => {
  addToMap(ONE);
  addToMap(TWO);
  setDisplay(ONE, { visible: false });
  setDisplay(TWO, { visible: false });
  removeFromMap("one");
  expect(stored()).toMatchObject({ value: { layers: [TWO] } });
  expect(Object.keys((stored() as { value: { displays: object } }).value.displays)).toEqual(["two"]);
});

test("the stored layers return when the page opens, with their displays", async () => {
  window.localStorage.setItem(
    LAYERS_KEY,
    JSON.stringify({ v: 1, value: { layers: [TWO, ONE], displays: { one: DISPLAY } } }),
  );
  vi.resetModules();
  await import("./storedLayers");
  const layers = await import("../shared/mapLayers");
  const state = await import("./state");
  expect(layers.mapLayersStore.get()).toEqual([TWO, ONE]);
  expect(state.displayStore.get()).toEqual({ one: DISPLAY });
});

test("layers whose switch is off are not stored and not restored", async () => {
  addToMap(ONE);
  setPartKept(LAYERS_KEY, false);
  expect(stored()).toBeNull();
  addToMap(TWO);
  expect(stored()).toBeNull();
  window.localStorage.setItem(LAYERS_KEY, JSON.stringify({ v: 1, value: { layers: [ONE], displays: {} } }));
  vi.resetModules();
  await import("./storedLayers");
  const layers = await import("../shared/mapLayers");
  expect(layers.mapLayersStore.get()).toEqual([]);
  expect(stored()).toBeNull();
});

test("a valid display is accepted with its own fields only", () => {
  expect(storedDisplay({ ...DISPLAY, other: 1 })).toEqual(DISPLAY);
  expect(storedDisplay({ visible: true, opacity: 1, range: [0, 1], colours: "grey" })).toEqual({
    visible: true,
    opacity: 1,
    range: [0, 1],
    colours: "grey",
  });
  expect(storedDisplay({ ...DISPLAY, stretch: { kind: "deviations", count: 2.5 } })?.stretch).toEqual({
    kind: "deviations",
    count: 2.5,
  });
  expect(storedDisplay({ ...DISPLAY, stretch: { kind: "typed", percent: 2 } })?.stretch).toEqual({ kind: "typed" });
});

test.each([
  ["the value is a text", "display"],
  ["the visibility is a number", { ...DISPLAY, visible: 1 }],
  ["the opacity is above 1", { ...DISPLAY, opacity: 1.5 }],
  ["the opacity is below 0", { ...DISPLAY, opacity: -0.1 }],
  ["the opacity is a text", { ...DISPLAY, opacity: "0.6" }],
  ["the range is turned round", { ...DISPLAY, range: [1, 0] }],
  ["the range has one number", { ...DISPLAY, range: [0] }],
  ["the range is missing", { ...DISPLAY, range: undefined }],
  ["the colour scale has no name", { ...DISPLAY, colours: "" }],
  ["the name of the colour scale is too long", { ...DISPLAY, colours: "x".repeat(65) }],
  ["the decibels are a text", { ...DISPLAY, decibels: "yes" }],
  ["the inversion is a number", { ...DISPLAY, inverted: 0 }],
  ["the colour without data is a word", { ...DISPLAY, noDataColour: "red" }],
  ["the mask is turned round", { ...DISPLAY, mask: [0, -30] }],
  ["the rule of the range is not known", { ...DISPLAY, stretch: { kind: "histogram" } }],
  ["the percent of the rule is 50 or more", { ...DISPLAY, stretch: { kind: "percent", percent: 50 } }],
  ["the deviations of the rule are not above 0", { ...DISPLAY, stretch: { kind: "deviations", count: 0 } }],
])("a stored display is refused when %s", (_reason, value) => {
  expect(storedDisplay(value)).toBeUndefined();
});

test.each([
  ["the value is a list", [ONE]],
  ["the layers are missing", { displays: {} }],
  ["a layer is not a layer description", { layers: [ONE, { ...TWO, range: [1, 0] }], displays: {} }],
  ["a layer has no title", { layers: [{ ...ONE, title: "" }], displays: {} }],
  [
    "the file of a layer is on another server",
    { layers: [{ ...ONE, url: "https://example.org/one.tif" }], displays: {} },
  ],
  [
    "the file of a layer names another server without a scheme",
    { layers: [{ ...ONE, url: "//example.org/one.tif" }], displays: {} },
  ],
  ["two layers have one id", { layers: [ONE, { ...TWO, id: "one" }], displays: {} }],
  ["the displays are a list", { layers: [ONE], displays: [] }],
  ["the displays are missing", { layers: [ONE] }],
  ["a display is wrong", { layers: [ONE], displays: { one: { ...DISPLAY, opacity: 2 } } }],
  ["a display belongs to no layer", { layers: [ONE], displays: { two: DISPLAY } }],
])("stored layers are refused and removed when %s", async (_reason, value) => {
  expect(storedLayers(value)).toBeUndefined();
  window.localStorage.setItem(LAYERS_KEY, JSON.stringify({ v: 1, value }));
  vi.resetModules();
  await import("./storedLayers");
  const layers = await import("../shared/mapLayers");
  expect(layers.mapLayersStore.get()).toEqual([]);
  expect(window.localStorage.getItem(LAYERS_KEY)).toBeNull();
});
