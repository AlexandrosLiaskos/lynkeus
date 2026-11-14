import { beforeEach, expect, test } from "vitest";
import type { LayerDescription } from "../shared/layer";
import { addToMap, mapLayersStore } from "../shared/mapLayers";
import {
  forgetAbsentLayers,
  listedLayers,
  moveLayer,
  placeAfter,
  placeLayer,
  placeOf,
  removeLayer,
  renameLayer,
} from "./order";
import { displayStore, selectedLayerStore, setDisplay } from "./state";

function layer(id: string): LayerDescription {
  return {
    id,
    title: id,
    kind: "layer",
    url: `/files/${id}/${id}.tif`,
    quantity: "Interferometric coherence magnitude, HH",
    unit: "1",
    range: [0, 1],
    colours: "grey",
    dates: ["2026-10-21"],
    inputs: ["NISAR_L2_PR_GUNW"],
    program: "Lynkeus 0.1.0",
    method: null,
    record: `/files/${id}/${id}.json`,
  };
}

/** The ids of the layers as the Contents pane lists them, the top layer first. */
const listed = () => listedLayers(mapLayersStore.get()).map(({ id }) => id);

beforeEach(() => {
  mapLayersStore.set([]);
  displayStore.set({});
  selectedLayerStore.set(null);
  // The layer added last is drawn on top, so the pane lists: c, b, a.
  ["a", "b", "c"].forEach((id) => addToMap(layer(id)));
});

test("the pane lists the top layer first", () => {
  expect(listed()).toEqual(["c", "b", "a"]);
  expect(placeOf("c")).toBe(0);
  expect(placeOf("a")).toBe(2);
  expect(placeOf("absent")).toBe(-1);
});

test("a layer moves one place up or down, to the top or to the bottom", () => {
  moveLayer("a", "up");
  expect(listed()).toEqual(["c", "a", "b"]);
  moveLayer("c", "down");
  expect(listed()).toEqual(["a", "c", "b"]);
  moveLayer("b", "top");
  expect(listed()).toEqual(["b", "a", "c"]);
  moveLayer("b", "bottom");
  expect(listed()).toEqual(["a", "c", "b"]);
  // The store keeps the drawing order, the bottom layer first.
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["b", "c", "a"]);
});

test("a move beyond an end of the list changes nothing", () => {
  const before = mapLayersStore.get();
  moveLayer("c", "up");
  moveLayer("c", "top");
  moveLayer("a", "down");
  moveLayer("absent", "up");
  expect(mapLayersStore.get()).toBe(before);
  expect(placeAfter(0, "up", 3)).toBe(0);
  expect(placeAfter(2, "down", 3)).toBe(2);
});

test("a layer is put at a place of the list", () => {
  placeLayer("a", 0);
  expect(listed()).toEqual(["a", "c", "b"]);
  placeLayer("a", 1);
  expect(listed()).toEqual(["c", "a", "b"]);
  placeLayer("c", 99);
  expect(listed()).toEqual(["a", "b", "c"]);
});

test("a layer takes another name, and an empty name changes nothing", () => {
  renameLayer("b", "  Coherence, October  ");
  expect(mapLayersStore.get().find(({ id }) => id === "b")?.title).toBe("Coherence, October");
  const before = mapLayersStore.get();
  renameLayer("b", "   ");
  renameLayer("b", "Coherence, October");
  renameLayer("absent", "Name");
  expect(mapLayersStore.get()).toBe(before);
  expect(listed()).toEqual(["c", "b", "a"]);
});

test("a removed layer leaves the map and loses its display and its selection", () => {
  setDisplay(layer("b"), { opacity: 0.5 });
  selectedLayerStore.set("b");
  removeLayer("b");
  expect(listed()).toEqual(["c", "a"]);
  expect(displayStore.get()).toEqual({});
  expect(selectedLayerStore.get()).toBeNull();
});

test("removing a layer keeps the selection of another layer", () => {
  selectedLayerStore.set("a");
  removeLayer("b");
  expect(selectedLayerStore.get()).toBe("a");
});

test("a layer that another part took off the map loses its display and its selection", () => {
  setDisplay(layer("a"), { visible: false });
  setDisplay(layer("b"), { visible: false });
  selectedLayerStore.set("a");
  mapLayersStore.set(mapLayersStore.get().filter(({ id }) => id !== "a"));
  forgetAbsentLayers();
  expect(Object.keys(displayStore.get())).toEqual(["b"]);
  expect(selectedLayerStore.get()).toBeNull();
});
