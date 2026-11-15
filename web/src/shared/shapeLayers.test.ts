// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { beforeEach, expect, test } from "vitest";
import type { LayerDescription } from "./layer";
import { addToMap, mapLayersStore, removeFromMap } from "./mapLayers";
import {
  dropShapeLayer,
  FIRST_Z_INDEX,
  layerOrderStore,
  orderAfter,
  putShapeLayer,
  setLayerOrder,
  setShapeDisplay,
  shapeDisplayOf,
  shapeDisplayStore,
  shapeLayersStore,
  zIndexOf,
  type ShapeLayer,
} from "./shapeLayers";

function layer(id: string): LayerDescription {
  return {
    id,
    title: id,
    kind: "layer",
    url: `/files/${id}.tif`,
    quantity: "Interferometric coherence magnitude, HH",
    unit: "1",
    range: [0, 1],
    colours: "grey",
    dates: ["2026-10-21"],
    inputs: ["NISAR_L2_PR_GUNW"],
    program: "Lynkeus 0.1.0",
    method: null,
    record: `/files/${id}.json`,
  };
}

function shapes(id: string, title = id): ShapeLayer {
  return {
    id,
    title,
    symbols: [{ label: "Area", line: "#1b1b1b", width: 2 }],
    properties: [],
    remove: () => dropShapeLayer(id),
  };
}

beforeEach(() => {
  mapLayersStore.set([]);
  shapeLayersStore.set([]);
  shapeDisplayStore.set({});
});

test("a new shape layer is put on top, and a new layer of the store directly above the other layers of the store", () => {
  expect(orderAfter([], ["a"], [])).toEqual(["a"]);
  expect(orderAfter(["a"], ["a"], ["area"])).toEqual(["a", "area"]);
  expect(orderAfter(["a", "area"], ["a", "b"], ["area"])).toEqual(["a", "b", "area"]);
  expect(orderAfter(["area"], ["a"], ["area"])).toEqual(["a", "area"]);
  expect(orderAfter(["a", "area", "b"], ["a", "b", "c"], ["area", "products"])).toEqual([
    "a",
    "area",
    "b",
    "c",
    "products",
  ]);
});

test("a layer that has left the map leaves the order, and the others keep their places", () => {
  expect(orderAfter(["a", "area", "b", "products"], ["b"], ["area"])).toEqual(["area", "b"]);
});

test("the layers of the store keep the order of their own store at their places of the order", () => {
  expect(orderAfter(["a", "area", "b"], ["b", "a"], ["area"])).toEqual(["b", "area", "a"]);
});

test("the order follows the layers that are put on the map and taken off it", () => {
  addToMap(layer("a"));
  putShapeLayer(shapes("area"));
  addToMap(layer("b"));
  putShapeLayer(shapes("products"));
  expect(layerOrderStore.get()).toEqual(["a", "b", "area", "products"]);
  expect(zIndexOf("a")).toBe(FIRST_Z_INDEX);
  expect(zIndexOf("products")).toBe(FIRST_Z_INDEX + 3);
  expect(zIndexOf("absent")).toBeUndefined();
  removeFromMap("a");
  dropShapeLayer("area");
  expect(layerOrderStore.get()).toEqual(["b", "products"]);
});

test("a shape layer that is put again takes the new description in its place", () => {
  putShapeLayer(shapes("area"));
  putShapeLayer(shapes("products"));
  putShapeLayer(shapes("area", "Area of the search"));
  expect(shapeLayersStore.get().map(({ id, title }) => [id, title])).toEqual([
    ["area", "Area of the search"],
    ["products", "products"],
  ]);
  expect(layerOrderStore.get()).toEqual(["area", "products"]);
});

test("a new order moves a shape layer under a layer of the store, whose own store follows the order", () => {
  ["a", "b"].map(layer).forEach(addToMap);
  putShapeLayer(shapes("area"));
  setLayerOrder(["b", "area", "a"]);
  expect(layerOrderStore.get()).toEqual(["b", "area", "a"]);
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["b", "a"]);
});

test("an order that does not name every layer once changes nothing", () => {
  addToMap(layer("a"));
  putShapeLayer(shapes("area"));
  setLayerOrder(["area"]);
  setLayerOrder(["area", "area"]);
  setLayerOrder(["area", "other"]);
  expect(layerOrderStore.get()).toEqual(["a", "area"]);
});

test("a shape layer is shown and opaque at first, and loses its display when it is dropped", () => {
  putShapeLayer(shapes("area"));
  expect(shapeDisplayOf("area")).toEqual({ visible: true, opacity: 1 });
  setShapeDisplay("area", { visible: false });
  setShapeDisplay("area", { opacity: 0.5 });
  expect(shapeDisplayOf("area")).toEqual({ visible: false, opacity: 0.5 });
  dropShapeLayer("area");
  expect(shapeDisplayOf("area")).toEqual({ visible: true, opacity: 1 });
});
