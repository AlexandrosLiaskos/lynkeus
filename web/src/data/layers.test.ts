// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { addToMap, mapLayersStore } from "../shared/mapLayers";
import {
  groupLayers,
  isLayerSource,
  layerEntry,
  layerExtent,
  layersFaultStore,
  layersReadStore,
  layersStore,
  loadLayers,
  removeLayer,
  renameLayer,
  resetLayers,
  sortLayers,
  unitWords,
  type LayerEntry,
} from "./layers";
import { formatDay } from "./products";
import { resetSession, sessionStore } from "./session";
import { layer, standIn } from "./testSession";

/** The request that made a layer, as `GET /api/layers` states it (docs/Storage.md, Addresses). */
const SOURCE = {
  process: "get-layer",
  inputs: {
    product: "GCOV",
    granule: "NISAR_L2_PR_GCOV_001",
    layer: "HHHH",
    area: { west: 1, south: 2, east: 3, north: 4 },
  },
};

beforeEach(() => {
  resetSession();
  resetLayers();
  mapLayersStore.set([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const titles = (entries: readonly LayerEntry[] = layersStore.get()) => entries.map((entry) => entry.layer.title);

test("an entry of the list carries the description, the size and the time of a layer", () => {
  expect(layerEntry({ layer: layer(), size: 4_200_000, created: "2026-11-14T16:25:00Z" })).toEqual({
    layer: layer(),
    size: 4_200_000,
    created: "2026-11-14T16:25:00Z",
    server: null,
  });
  expect(layerEntry({ layer: layer() })).toEqual({ layer: layer(), size: null, created: null, server: null });
  expect(layerEntry(layer())).toEqual({ layer: layer(), size: null, created: null, server: null });
});

test("an entry carries the request that made the layer, when the server states it", () => {
  expect(layerEntry({ layer: layer(), source: SOURCE })?.source).toEqual(SOURCE);
  // An answer of the older server has no such field, and a layer whose request is not known has null.
  expect(layerEntry({ layer: layer() })).not.toHaveProperty("source");
  expect(layerEntry({ layer: layer(), source: null })).not.toHaveProperty("source");
  expect(isLayerSource(SOURCE)).toBe(true);
});

test.each([
  ["it is a text", "get-layer"],
  ["it names no process", { inputs: {} }],
  ["the name of the process is empty", { process: "", inputs: {} }],
  ["it has no inputs", { process: "get-layer" }],
  ["the inputs are a list", { process: "get-layer", inputs: [] }],
])("an entry is rejected when the request that made the layer is wrong: %s", (_reason, source) => {
  expect(isLayerSource(source)).toBe(false);
  expect(layerEntry({ layer: layer(), source })).toBeNull();
});

test("the page records for which account the list was read", async () => {
  const server = standIn();
  server.layers = [{ layer: layer(), source: SOURCE }];
  expect(layersReadStore.get()).toBeNull();
  await loadLayers();
  expect(layersReadStore.get()).toEqual({ account: null });
  expect(layersStore.get()[0]?.source).toEqual(SOURCE);
  sessionStore.set({ state: "signed-in", user: "a_user", token: true });
  await loadLayers();
  expect(layersReadStore.get()).toEqual({ account: "a_user" });
  resetLayers();
  expect(layersReadStore.get()).toBeNull();
});

test("a list that arrives after the sign-in has changed is the list of nobody and is dropped", async () => {
  const server = standIn();
  server.layers = [{ layer: layer() }];
  sessionStore.set({ state: "signed-in", user: "a_user", token: true });
  const reading = loadLayers();
  sessionStore.set({ state: "signed-in", user: "b_user", token: true });
  await reading;
  expect(layersStore.get()).toEqual([]);
  expect(layersReadStore.get()).toBeNull();
});

test("a reading that fails leaves the record of the last list as it is", async () => {
  const server = standIn();
  await loadLayers();
  server.refuse("GET", "/api/layers", 500, null);
  await loadLayers();
  expect(layersReadStore.get()).toEqual({ account: null });
});

test("an entry names the own server that keeps the layer, and the project server by null", () => {
  const server = { id: "3f9a1c0b7e24d658", name: "Office computer" };
  expect(layerEntry({ layer: layer(), server })?.server).toEqual(server);
  expect(layerEntry({ layer: layer(), server: null })?.server).toBeNull();
  expect(layerEntry({ layer: layer(), server: { id: "office", name: "Office computer" } })).toBeNull();
  expect(layerEntry({ layer: layer(), server: "Office computer" })).toBeNull();
});

test.each([
  ["the description is not valid", { layer: { ...layer(), kind: "image" } }],
  ["the size is negative", { layer: layer(), size: -1 }],
  ["the size is a text", { layer: layer(), size: "4 MB" }],
  ["the time is not a date-time", { layer: layer(), created: "today" }],
  ["the entry is a text", "layer"],
])("an entry is rejected when %s", (_reason, value) => {
  expect(layerEntry(value)).toBeNull();
});

test("the layers of the server are kept in the order of the server", async () => {
  const server = standIn();
  server.layers = [
    { layer: layer({ id: "b", title: "Coherence" }), size: 1000, created: "2026-11-14T16:30:00Z" },
    { layer: layer({ id: "a", title: "Backscatter" }), size: 2000, created: "2026-11-14T16:25:00Z" },
  ];
  await loadLayers();
  expect(titles()).toEqual(["Coherence", "Backscatter"]);
  expect(layersStore.get()[0]?.size).toBe(1000);
  expect(layersFaultStore.get()).toBeNull();
  const first = layersStore.get();
  await loadLayers();
  expect(layersStore.get()).toBe(first);
});

test("a list of bare descriptions is read as well", async () => {
  const server = standIn();
  server.layers = [layer()] as never;
  await loadLayers();
  expect(layersStore.get()).toEqual([{ layer: layer(), size: null, created: null, server: null }]);
});

test("a reading that fails states the sentence of the server and keeps the list", async () => {
  const server = standIn();
  server.layers = [{ layer: layer() }];
  await loadLayers();
  server.refuse("GET", "/api/layers", 500, null);
  await loadLayers();
  expect(layersFaultStore.get()).toBe("The layers could not be read (the server answered 500).");
  expect(titles()).toHaveLength(1);
});

test("an answer that is not a list of layers is refused", async () => {
  const server = standIn();
  server.layers = [{ layer: { ...layer(), range: [1, 0] } as never }];
  await loadLayers();
  expect(layersFaultStore.get()).toBe("The answer of the server could not be read.");
  expect(layersStore.get()).toEqual([]);
});

test("a removed layer leaves the list and the map", async () => {
  const server = standIn();
  server.layers = [{ layer: layer({ id: "b" }) }, { layer: layer({ id: "a" }) }];
  await loadLayers();
  addToMap(layer({ id: "b" }));
  await removeLayer("b");
  expect(server.sent("DELETE")).toEqual([{ method: "DELETE", address: "/api/layers/b", content: undefined }]);
  expect(layersStore.get().map((entry) => entry.layer.id)).toEqual(["a"]);
  expect(mapLayersStore.get()).toEqual([]);
});

test("a layer that the server no longer holds leaves the list, and a refused removal keeps it", async () => {
  const server = standIn();
  server.layers = [{ layer: layer({ id: "a" }) }];
  await loadLayers();
  server.layers = [];
  await removeLayer("a");
  expect(layersStore.get()).toEqual([]);
  server.layers = [{ layer: layer({ id: "c" }) }];
  await loadLayers();
  server.refuse("DELETE", "/api/layers", 500, null);
  await expect(removeLayer("c")).rejects.toThrow("The layer could not be removed (the server answered 500).");
  expect(layersStore.get()).toHaveLength(1);
});

test("the answer to a reading that started before a removal does not bring the layer back", async () => {
  const server = standIn();
  server.layers = [{ layer: layer({ id: "a" }) }];
  await loadLayers();
  const slow = loadLayers();
  await removeLayer("a");
  await slow;
  expect(layersStore.get()).toEqual([]);
});

test("a renamed layer takes its new name in the list and on the map", async () => {
  const server = standIn();
  server.layers = [{ layer: layer({ id: "a" }), size: 1000 }, { layer: layer({ id: "b", title: "Other" }) }];
  await loadLayers();
  addToMap(layer({ id: "a" }));
  const renamed = await renameLayer("a", "Backscatter of Cape Ann");
  expect(server.sent("PATCH")).toEqual([
    { method: "PATCH", address: "/api/layers/a", content: { title: "Backscatter of Cape Ann" } },
  ]);
  expect(renamed.layer.title).toBe("Backscatter of Cape Ann");
  expect(titles()).toEqual(["Backscatter of Cape Ann", "Other"]);
  expect(layersStore.get()[0]?.size).toBe(1000);
  expect(mapLayersStore.get().map(({ title }) => title)).toEqual(["Backscatter of Cape Ann"]);
});

test("a layer that is not on the map is renamed in the list only, and a refusal is reported", async () => {
  const server = standIn();
  server.layers = [{ layer: layer({ id: "a" }) }];
  await loadLayers();
  await renameLayer("a", "New name");
  expect(mapLayersStore.get()).toEqual([]);
  server.refuse("PATCH", "/api/layers", 405, null);
  await expect(renameLayer("a", "Third name")).rejects.toThrow(
    "The layer could not be renamed (the server answered 405).",
  );
  expect(titles()).toEqual(["New name"]);
});

test("the extent of a layer is the bounding box of its STAC record", async () => {
  const server = standIn();
  server.files[layer().record] = { type: "Feature", bbox: [-71.2, 42.6, -70.75, 42.95] };
  await expect(layerExtent(layer())).resolves.toEqual([-71.2, 42.6, -70.75, 42.95]);
  server.files[layer().record] = { type: "Feature", bbox: [-71.2, 42.6, 0, -70.75, 42.95, 100] };
  await expect(layerExtent(layer())).resolves.toEqual([-71.2, 42.6, -70.75, 42.95]);
});

test.each([
  ["has no bounding box", { type: "Feature" }],
  ["has a bounding box of three numbers", { bbox: [1, 2, 3] }],
  ["has a side that is no number", { bbox: [1, 2, "3", 4] }],
  ["has its south above its north", { bbox: [1, 4, 3, 2] }],
])("the extent is refused when the record %s", async (_reason, record) => {
  const server = standIn();
  server.files[layer().record] = record;
  await expect(layerExtent(layer())).rejects.toThrow("The answer of the server could not be read.");
});

test("a record that the web server does not hold is reported", async () => {
  standIn();
  await expect(layerExtent(layer())).rejects.toThrow("Not found.");
});

const ENTRIES: LayerEntry[] = [
  {
    layer: layer({ id: "c", title: "Coherence", dates: ["2026-10-09", "2026-10-21"], quantity: "Coherence" }),
    size: 500,
    created: "2026-11-14T16:30:00Z",
    server: null,
  },
  {
    layer: layer({ id: "a", title: "Alpha", dates: ["2026-11-02"] }),
    size: 9000,
    created: "2026-11-14T16:10:00Z",
    server: null,
  },
  {
    layer: layer({ id: "b", title: "Change", kind: "result", method: "Method sheet", dates: ["2026-10-21"] }),
    size: null,
    created: "2026-11-14T16:20:00Z",
    server: null,
  },
];

test("the layers are sorted by time, name, date of the data and size", () => {
  const order = (sort: Parameters<typeof sortLayers>[1]) =>
    sortLayers(ENTRIES, sort)
      .map((entry) => entry.layer.id)
      .join("");
  expect(order("newest")).toBe("cba");
  expect(order("name")).toBe("abc");
  expect(order("date")).toBe("acb");
  expect(order("size")).toBe("acb");
  expect(ENTRIES.map((entry) => entry.layer.id).join("")).toBe("cab");
});

test("layers without a stated time keep the order of the server", () => {
  const entries = ENTRIES.map((entry) => ({ ...entry, created: null }));
  expect(sortLayers(entries, "newest").map((entry) => entry.layer.id)).toEqual(["c", "a", "b"]);
});

test("the layers are grouped by kind, quantity and date", () => {
  const groups = (grouping: Parameters<typeof groupLayers>[1]) =>
    groupLayers(ENTRIES, grouping, formatDay).map((group) => [group.title, titles(group.layers).join(", ")]);
  expect(groups("none")).toEqual([["", "Coherence, Alpha, Change"]]);
  expect(groups("kind")).toEqual([
    ["Received from NASA", "Coherence, Alpha"],
    ["Result of an analysis tool", "Change"],
  ]);
  expect(groups("quantity")).toEqual([
    ["Coherence", "Coherence"],
    ["Radar backscatter gamma nought, HH, linear power", "Alpha, Change"],
  ]);
  expect(groups("date")).toEqual([
    ["9 Oct 2026 and 21 Oct 2026", "Coherence"],
    ["2 Nov 2026", "Alpha"],
    ["21 Oct 2026", "Change"],
  ]);
});

test("the unit 1 is written as no unit", () => {
  expect(unitWords("1")).toBe("no unit");
  expect(unitWords("m3 m-3")).toBe("m3 m-3");
});

test("the layers are grouped by the server that keeps them", () => {
  const office = { id: "3f9a1c0b7e24d658", name: "Office computer" };
  const [first, second, third] = ENTRIES;
  const entries = [{ ...first, server: office }, second, { ...third, server: office }] as LayerEntry[];
  expect(
    groupLayers(entries, "server", formatDay).map((group) => [group.title, titles(group.layers).join(", ")]),
  ).toEqual([
    ["Office computer", "Coherence, Change"],
    ["Project server", "Alpha"],
  ]);
});

test("the list of the server names the own server of each layer", async () => {
  const server = standIn();
  const office = { id: "3f9a1c0b7e24d658", name: "Office computer" };
  server.layers = [
    { layer: layer({ id: "own" }), server: office },
    { layer: layer({ id: "site" }), server: null },
  ];
  await loadLayers();
  expect(layersStore.get().map((entry) => entry.server)).toEqual([office, null]);
});
