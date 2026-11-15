import { beforeEach, expect, test } from "vitest";
import type { LayerDescription } from "../shared/layer";
import { addToMap, mapLayersStore } from "../shared/mapLayers";
import {
  dropShapeLayer,
  layerOrderStore,
  putShapeLayer,
  shapeLayersStore,
  type ShapeLayer,
} from "../shared/shapeLayers";
import {
  forgetAbsentLayers,
  listedLayers,
  moveLayer,
  placeAfter,
  placeLayer,
  placeOf,
  removeLayer,
  removeShapeLayer,
  renameLayer,
} from "./order";
import { displayStore, propertiesStore, selectedLayerStore, setDisplay } from "./state";

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

/** A shape layer whose owner takes it off the map when it is removed. */
function shape(id: string): ShapeLayer {
  return { id, title: id, symbols: [], properties: [], remove: () => dropShapeLayer(id) };
}

/** The ids of the layers as the Contents pane lists them, the top layer first. */
const listed = () => listedLayers(mapLayersStore.get()).map(({ id }) => id);

/** The ids of the layers of both kinds as the Contents pane lists them, the top layer first. */
const listedAll = () => listedLayers(layerOrderStore.get());

beforeEach(() => {
  mapLayersStore.set([]);
  shapeLayersStore.set([]);
  displayStore.set({});
  selectedLayerStore.set(null);
  propertiesStore.set(null);
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

test("the places count the layers of both kinds, in the one drawing order", () => {
  putShapeLayer(shape("area"));
  expect(listedAll()).toEqual(["area", "c", "b", "a"]);
  expect(placeOf("area")).toBe(0);
  expect(placeOf("c")).toBe(1);
  expect(placeOf("a")).toBe(3);
});

test("a shape layer moves under the other layers and back, and their store is left as it was", () => {
  putShapeLayer(shape("area"));
  const before = mapLayersStore.get();
  moveLayer("area", "down");
  expect(listedAll()).toEqual(["c", "area", "b", "a"]);
  moveLayer("area", "bottom");
  expect(listedAll()).toEqual(["c", "b", "a", "area"]);
  moveLayer("area", "down");
  expect(listedAll()).toEqual(["c", "b", "a", "area"]);
  placeLayer("area", 2);
  expect(listedAll()).toEqual(["c", "b", "area", "a"]);
  moveLayer("area", "top");
  expect(listedAll()).toEqual(["area", "c", "b", "a"]);
  expect(mapLayersStore.get()).toBe(before);
});

test("a layer of the store moves across a shape layer, and the order of its store follows", () => {
  putShapeLayer(shape("area"));
  moveLayer("c", "up");
  expect(listedAll()).toEqual(["c", "area", "b", "a"]);
  expect(listed()).toEqual(["c", "b", "a"]);
  moveLayer("a", "top");
  expect(listedAll()).toEqual(["a", "c", "area", "b"]);
  // The store keeps its layers in the drawing order, the bottom layer first.
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["b", "c", "a"]);
  expect(layerOrderStore.get()).toEqual(["b", "area", "c", "a"]);
});

test("a selected shape layer keeps its selection while it is on the map, and loses it when it is dropped", () => {
  putShapeLayer(shape("area"));
  selectedLayerStore.set("area");
  propertiesStore.set({ id: "area", time: 1 });
  forgetAbsentLayers();
  expect(selectedLayerStore.get()).toBe("area");
  expect(propertiesStore.get()).toEqual({ id: "area", time: 1 });
  dropShapeLayer("area");
  forgetAbsentLayers();
  expect(selectedLayerStore.get()).toBeNull();
  // The Properties window does not open again when a layer of the same id returns.
  expect(propertiesStore.get()).toBeNull();
});

test("the Properties window of a layer of the store stays while the layer is on the map", () => {
  propertiesStore.set({ id: "b", time: 1 });
  forgetAbsentLayers();
  expect(propertiesStore.get()).toEqual({ id: "b", time: 1 });
  mapLayersStore.set(mapLayersStore.get().filter(({ id }) => id !== "b"));
  forgetAbsentLayers();
  expect(propertiesStore.get()).toBeNull();
});

test("a removed shape layer is taken off the map by its owner and loses its selection", () => {
  const area = shape("area");
  putShapeLayer(area);
  putShapeLayer(shape("products"));
  selectedLayerStore.set("area");
  expect(removeShapeLayer(area)).toBe(true);
  expect(listedAll()).toEqual(["products", "c", "b", "a"]);
  expect(selectedLayerStore.get()).toBeNull();
});

test("a shape layer that its owner keeps stays on the map with its selection", () => {
  const kept = { ...shape("area"), remove: () => undefined };
  putShapeLayer(kept);
  selectedLayerStore.set("area");
  expect(removeShapeLayer(kept)).toBe(false);
  expect(listedAll()).toEqual(["area", "c", "b", "a"]);
  expect(selectedLayerStore.get()).toBe("area");
});
