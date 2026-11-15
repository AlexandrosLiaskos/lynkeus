// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { beforeEach, expect, test, vi } from "vitest";
import { againStore, resetAgain } from "../data/again";
import { layersReadStore, layersStore, resetLayers, type LayerSource } from "../data/layers";
import { resetJobs } from "../data/jobs";
import { resetSession, sessionStore } from "../data/session";
import { testLayer } from "../map/testLayer";
import type { LayerDescription } from "../shared/layer";
import { addToMap, mapLayersStore, removeFromMap } from "../shared/mapLayers";
import { resetStorage, setPartKept, storageStore } from "../shared/storage/storage";
import { keptStore, resetKept, statesStore } from "./kept";
import { displayStore, setDisplay, type LayerDisplay } from "./state";
import { LAYERS_KEY, layersToStore, storedDisplay, storedLayers } from "./storedLayers";

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

/** The request that made a received layer, as the list of the server states it. */
const REQUEST: LayerSource = {
  process: "get-layer",
  inputs: { product: "GCOV", granule: "product.h5", layer: "HHHH", area: { west: 1, south: 2, east: 3, north: 4 } },
};

/** The fields of a stored map that are empty when no account, no request and no job of Get again is recorded. */
const EMPTY = { accounts: {}, sources: {}, again: {} };

function stored(): unknown {
  const text = window.localStorage.getItem(LAYERS_KEY);
  return text === null ? null : JSON.parse(text);
}

/** Give the page the sign-in of an account and the list of its layers on the server. */
function signedIn(user: string, layers: readonly LayerDescription[], sources: Record<string, LayerSource> = {}): void {
  sessionStore.set({ state: "signed-in", user, token: true });
  layersStore.set(
    layers.map((layer) => {
      const source = sources[layer.id];
      return { layer, size: null, created: null, server: null, ...(source ? { source } : {}) };
    }),
  );
  layersReadStore.set({ account: user });
}

/** Do what another window of the browser does when it stores a map: the storage changes, and this window is told. */
function otherWindowStores(value: unknown): void {
  const text = JSON.stringify({ v: 1, value });
  window.localStorage.setItem(LAYERS_KEY, text);
  window.dispatchEvent(new StorageEvent("storage", { key: LAYERS_KEY, newValue: text }));
}

beforeEach(() => {
  resetKept();
  mapLayersStore.set([]);
  displayStore.set({});
  resetSession();
  resetLayers();
  resetJobs();
  resetAgain();
  resetKept();
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
  expect(stored()).toEqual({ v: 1, value: { layers: [ONE, TWO], displays: {}, ...EMPTY } });
  setDisplay(TWO, { opacity: 0.5 });
  expect(stored()).toEqual({
    v: 1,
    value: {
      layers: [ONE, TWO],
      displays: { two: { visible: true, opacity: 0.5, range: [0, 1], colours: "grey" } },
      ...EMPTY,
    },
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

test("the browser stores with each layer its account and the request that made it", () => {
  signedIn("a_user", [ONE, TWO], { one: REQUEST });
  addToMap(ONE);
  addToMap(TWO);
  expect(stored()).toEqual({
    v: 1,
    value: {
      layers: [ONE, TWO],
      displays: {},
      accounts: { one: "a_user", two: "a_user" },
      sources: { one: REQUEST },
      again: {},
    },
  });
  expect(layersToStore()).toEqual((stored() as { value: unknown }).value);
});

test("the layers that are not drawn stay stored, at their places and with their displays", () => {
  signedIn("a_user", [ONE, TWO], { one: REQUEST });
  addToMap(ONE);
  addToMap(TWO);
  setDisplay(ONE, { opacity: 0.5 });
  const before = stored();
  // After a sign-out no layer of the account is drawn, and the stored map is the same.
  sessionStore.set({ state: "signed-out" });
  expect(mapLayersStore.get()).toEqual([]);
  expect(stored()).toEqual(before);
  // A layer that the server removed stays stored too, with the job that makes it again.
  signedIn("a_user", [TWO]);
  againStore.set({ one: "job-1" });
  expect(mapLayersStore.get()).toEqual([TWO]);
  expect(stored()).toMatchObject({
    value: {
      layers: [ONE, TWO],
      displays: { one: { opacity: 0.5 } },
      accounts: { one: "a_user", two: "a_user" },
      again: { one: "job-1" },
    },
  });
});

/** Open the page anew: the modules are loaded again, which restores the stored parts. */
async function openPage() {
  vi.resetModules();
  await import("./storedLayers");
  return {
    layers: await import("../shared/mapLayers"),
    state: await import("./state"),
    kept: await import("./kept"),
    session: await import("../data/session"),
    list: await import("../data/layers"),
    again: await import("../data/again"),
  };
}

test("the stored layers return when the page opens, and are drawn when the sign-in and the list have answered", async () => {
  window.localStorage.setItem(
    LAYERS_KEY,
    JSON.stringify({
      v: 1,
      value: {
        layers: [TWO, ONE],
        displays: { one: DISPLAY },
        accounts: { one: "a_user", two: "a_user" },
        sources: { one: REQUEST },
        again: {},
      },
    }),
  );
  const page = await openPage();
  // Before the first answers nothing is drawn, and the browser keeps the layers as they were stored.
  expect(page.layers.mapLayersStore.get()).toEqual([]);
  expect(page.kept.keptStore.get().map(({ layer, account, aside }) => [layer.id, account, aside])).toEqual([
    ["two", "a_user", true],
    ["one", "a_user", true],
  ]);
  expect(stored()).toMatchObject({ value: { layers: [TWO, ONE], displays: { one: DISPLAY } } });

  page.session.sessionStore.set({ state: "signed-in", user: "a_user", token: true });
  page.list.layersStore.set([ONE, TWO].map((layer) => ({ layer, size: null, created: null, server: null })));
  page.list.layersReadStore.set({ account: "a_user" });
  expect(page.layers.mapLayersStore.get()).toEqual([TWO, ONE]);
  expect(page.state.displayStore.get()).toEqual({ one: DISPLAY });
  expect(page.kept.keptStore.get().find(({ layer }) => layer.id === "one")?.source).toEqual(REQUEST);
});

test("a map that was stored in the older form, without accounts, is still read", async () => {
  window.localStorage.setItem(
    LAYERS_KEY,
    JSON.stringify({ v: 1, value: { layers: [TWO, ONE], displays: { one: DISPLAY } } }),
  );
  const page = await openPage();
  expect(page.kept.keptStore.get().map(({ layer, account, source }) => [layer.id, account, source])).toEqual([
    ["two", null, null],
    ["one", null, null],
  ]);
  // The layers count as those of the account that signs in, when its list holds them.
  page.session.sessionStore.set({ state: "signed-in", user: "a_user", token: true });
  page.list.layersStore.set([ONE, TWO].map((layer) => ({ layer, size: null, created: null, server: null })));
  page.list.layersReadStore.set({ account: "a_user" });
  expect(page.layers.mapLayersStore.get()).toEqual([TWO, ONE]);
  expect(page.state.displayStore.get()).toEqual({ one: DISPLAY });
  expect(stored()).toMatchObject({ value: { accounts: { one: "a_user", two: "a_user" } } });
});

test("a restored layer whose file is gone is listed as removed from the server and is not drawn", async () => {
  window.localStorage.setItem(
    LAYERS_KEY,
    JSON.stringify({
      v: 1,
      value: {
        layers: [ONE, TWO],
        displays: {},
        accounts: { one: "a_user", two: "a_user" },
        sources: { one: REQUEST },
      },
    }),
  );
  const page = await openPage();
  page.session.sessionStore.set({ state: "signed-in", user: "a_user", token: true });
  // The server removed the first layer after the keeping time: its list holds the second one only.
  page.list.layersStore.set([{ layer: TWO, size: null, created: null, server: null }]);
  page.list.layersReadStore.set({ account: "a_user" });
  expect(page.layers.mapLayersStore.get()).toEqual([TWO]);
  expect(page.kept.statesStore.get()).toEqual({ one: "removed", two: "ready" });
  // The browser still keeps the removed layer, with the request that makes it again.
  expect(stored()).toMatchObject({ value: { layers: [ONE, TWO], sources: { one: REQUEST } } });
});

test("the job of Get again returns with the stored map", async () => {
  window.localStorage.setItem(
    LAYERS_KEY,
    JSON.stringify({
      v: 1,
      value: {
        layers: [ONE],
        displays: {},
        accounts: { one: "a_user" },
        sources: { one: REQUEST },
        again: { one: "job-1" },
      },
    }),
  );
  const page = await openPage();
  expect(page.again.againStore.get()).toEqual({ one: "job-1" });
});

test("a map that another window of the browser stores reaches this page, which stores nothing in answer", () => {
  signedIn("a_user", [ONE, TWO]);
  addToMap(ONE);
  const written = vi.spyOn(Storage.prototype, "setItem");
  otherWindowStores({ layers: [TWO, ONE], displays: { two: DISPLAY }, accounts: { one: "a_user", two: "a_user" } });
  expect(mapLayersStore.get()).toEqual([TWO, ONE]);
  expect(displayStore.get()).toEqual({ two: DISPLAY });
  expect(statesStore.get()).toEqual({ two: "ready", one: "ready" });
  expect(written).not.toHaveBeenCalled();
  written.mockRestore();
  // A change of this window afterwards is stored with the layer that the other window added.
  removeFromMap("one");
  expect(stored()).toMatchObject({ value: { layers: [TWO], displays: { two: DISPLAY } } });
});

test("a layer that another window removed from the map leaves this page too", () => {
  signedIn("a_user", [ONE, TWO]);
  addToMap(ONE);
  addToMap(TWO);
  otherWindowStores({ layers: [TWO], displays: {}, accounts: { two: "a_user" } });
  expect(mapLayersStore.get()).toEqual([TWO]);
  expect(keptStore.get().map(({ layer }) => layer.id)).toEqual(["two"]);
});

test("a map of another window that is not valid is not taken", () => {
  signedIn("a_user", [ONE]);
  addToMap(ONE);
  otherWindowStores({ layers: [{ ...TWO, url: "https://example.org/two.tif" }], displays: {} });
  expect(mapLayersStore.get()).toEqual([ONE]);
});

test("layers whose switch is off are not stored and not restored", async () => {
  addToMap(ONE);
  setPartKept(LAYERS_KEY, false);
  expect(stored()).toBeNull();
  addToMap(TWO);
  expect(stored()).toBeNull();
  window.localStorage.setItem(LAYERS_KEY, JSON.stringify({ v: 1, value: { layers: [ONE], displays: {} } }));
  const page = await openPage();
  expect(page.layers.mapLayersStore.get()).toEqual([]);
  expect(page.kept.keptStore.get()).toEqual([]);
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
  ["the accounts are a list", { layers: [ONE], displays: {}, accounts: ["a_user"] }],
  ["an account is empty", { layers: [ONE], displays: {}, accounts: { one: "" } }],
  ["an account is not a text", { layers: [ONE], displays: {}, accounts: { one: 7 } }],
  ["an account is longer than a name", { layers: [ONE], displays: {}, accounts: { one: "x".repeat(257) } }],
  ["an account belongs to no layer", { layers: [ONE], displays: {}, accounts: { two: "a_user" } }],
  ["a request names no process", { layers: [ONE], displays: {}, sources: { one: { inputs: {} } } }],
  ["a request belongs to no layer", { layers: [ONE], displays: {}, sources: { two: REQUEST } }],
  ["a job of Get again is not a text", { layers: [ONE], displays: {}, again: { one: 7 } }],
  ["a job of Get again belongs to no layer", { layers: [ONE], displays: {}, again: { two: "job-1" } }],
])("stored layers are refused and removed when %s", async (_reason, value) => {
  expect(storedLayers(value)).toBeUndefined();
  window.localStorage.setItem(LAYERS_KEY, JSON.stringify({ v: 1, value }));
  vi.resetModules();
  await import("./storedLayers");
  const layers = await import("../shared/mapLayers");
  expect(layers.mapLayersStore.get()).toEqual([]);
  expect(window.localStorage.getItem(LAYERS_KEY)).toBeNull();
});

test("a valid stored map is accepted with its accounts, its requests and its jobs of Get again", () => {
  const value = {
    layers: [ONE, TWO],
    displays: { one: DISPLAY },
    accounts: { one: "a_user" },
    sources: { one: REQUEST },
    again: { two: "job-1" },
  };
  expect(storedLayers({ ...value, other: 1 })).toEqual(value);
  // The older form has none of the three fields.
  expect(storedLayers({ layers: [ONE], displays: {} })).toEqual({ layers: [ONE], displays: {}, ...EMPTY });
});
