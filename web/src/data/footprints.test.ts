// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import OlMap from "ol/Map";
import View from "ol/View";
import { containsExtent, isEmpty } from "ol/extent";
import Draw from "ol/interaction/Draw";
import type { Style } from "ol/style";
import { expect, test } from "vitest";
import product from "../../../api/tests/data/product-gcov.json";
import {
  CASING_WIDTH,
  createFootprintLayer,
  footprintFeatures,
  isDrawing,
  nextSelection,
  OUTLINE_SYMBOL,
  outlinesExtent,
  PRODUCTS_LAYER_ID,
  productsAt,
  SELECTED_SYMBOL,
  showOutline,
  zoomTo,
  type FootprintLayer,
} from "./footprints";
import { isProduct, type Product } from "./products";

// The longitudes and the latitudes of the outline of the product of the test.
const longitudes = product.footprint.flat().map((point) => point[0] ?? Number.NaN);
const latitudes = product.footprint.flat().map((point) => point[1] ?? Number.NaN);

function gcov(): Product {
  if (!isProduct(product)) {
    throw new Error("the product of the test is not valid");
  }
  return product;
}

test("the outline of a product is one feature, named after the product, in degrees when the map is in degrees", () => {
  const [feature] = footprintFeatures([gcov()], "EPSG:4326");
  expect(feature?.getId()).toBe("G4405194348-ASF");
  expect(feature?.getGeometry()?.getExtent()).toEqual([
    Math.min(...longitudes),
    Math.min(...latitudes),
    Math.max(...longitudes),
    Math.max(...latitudes),
  ]);
});

test("the outline is moved to the projection of the map", () => {
  const [feature] = footprintFeatures([gcov()], "EPSG:3857");
  const [west] = feature?.getGeometry()?.getExtent() ?? [];
  // In Web Mercator one degree of longitude is about 111 319 metres at every latitude.
  expect(west).toBeCloseTo(Math.min(...longitudes) * 111319.49079327357, 3);
});

test("a product with two polygons gives one feature with both", () => {
  const ring = gcov().footprint[0] ?? [];
  const [feature] = footprintFeatures([{ ...gcov(), footprint: [ring, ring] }], "EPSG:4326");
  expect(feature?.getGeometry()?.getPolygons()).toHaveLength(2);
});

test("the layer of the outlines carries the id of its shape layer, and no place of its own in the drawing order", () => {
  const layer = createFootprintLayer();
  expect(PRODUCTS_LAYER_ID).toBe("products");
  expect(layer.get("id")).toBe("products");
  expect(layer.getZIndex()).toBeUndefined();
});

/** A layer with the outlines of two products, "plain" and "other". */
function twoOutlines(): FootprintLayer {
  const layer = createFootprintLayer();
  const products = [
    { ...gcov(), id: "plain" },
    { ...gcov(), id: "other" },
  ];
  layer.getSource()?.addFeatures(footprintFeatures(products, "EPSG:4326"));
  return layer;
}

/** What the layer draws for the outline of a product: the line, the fill and the order of each of its styles. */
function drawn(layer: FootprintLayer, id: string) {
  const feature = layer.getSource()?.getFeatureById(id);
  const styles = feature ? layer.getStyleFunction()?.(feature, 1) : undefined;
  const list: Style[] = Array.isArray(styles) ? styles : styles ? [styles] : [];
  return list.map((style) => ({
    line: style.getStroke()?.getColor(),
    width: style.getStroke()?.getWidth(),
    fill: style.getFill()?.getColor(),
    order: style.getZIndex(),
  }));
}

test("a plain outline is a thin line in the primary colour without a visible fill, as its symbol says", () => {
  expect(OUTLINE_SYMBOL).toEqual({ label: "Outline of a product", line: "#005ea2", width: 1 });
  expect(drawn(twoOutlines(), "plain")).toEqual([
    { line: OUTLINE_SYMBOL.line, width: OUTLINE_SYMBOL.width, fill: "rgba(0, 94, 162, 0)", order: undefined },
  ]);
});

test("the outline under the pointer keeps the primary colour, with a line of 2 pixels and a light fill", () => {
  const layer = twoOutlines();
  layer.set("hovered", "other");
  expect(drawn(layer, "other")).toEqual([{ line: "#005ea2", width: 2, fill: "rgba(0, 94, 162, 0.1)", order: 1 }]);
  expect(drawn(layer, "plain")).toHaveLength(1);
  expect(drawn(layer, "plain")[0]?.width).toBe(1);
});

test("the selected outline is a cyan line over a dark casing with a cyan fill, above the other outlines", () => {
  expect(SELECTED_SYMBOL).toEqual({
    label: "Selected product",
    line: "#00ffff",
    width: 3,
    casing: "#1b1b1b",
    fill: "rgba(0, 255, 255, 0.2)",
  });
  expect(CASING_WIDTH).toBe(5);
  const layer = twoOutlines();
  layer.set("selected", "other");
  // The casing comes first, so that the line is drawn over it.
  expect(drawn(layer, "other")).toEqual([
    { line: SELECTED_SYMBOL.casing, width: CASING_WIDTH, fill: undefined, order: 2 },
    { line: SELECTED_SYMBOL.line, width: SELECTED_SYMBOL.width, fill: SELECTED_SYMBOL.fill, order: 3 },
  ]);
  // The selection is drawn also while the pointer rests on its outline.
  layer.set("hovered", "other");
  expect(drawn(layer, "other").map(({ line }) => line)).toEqual(["#1b1b1b", "#00ffff"]);
  expect(drawn(layer, "plain")[0]?.line).toBe("#005ea2");
});

test("a hidden outline is not drawn, selected or under the pointer or neither", () => {
  const layer = twoOutlines();
  layer.set("hidden", new Set(["other"]));
  expect(drawn(layer, "other")).toEqual([]);
  expect(drawn(layer, "plain")).toHaveLength(1);
  layer.set("selected", "other");
  expect(drawn(layer, "other")).toEqual([]);
  layer.set("selected", null);
  layer.set("hovered", "other");
  expect(drawn(layer, "other")).toEqual([]);
  layer.set("hidden", new Set());
  expect(drawn(layer, "other")).toHaveLength(1);
});

test("the products whose outlines hold a place are found in the order of the list", () => {
  const moved = gcov().footprint.map((ring) => ring.map(([longitude, latitude]) => [longitude + 1, latitude] as const));
  const layer = createFootprintLayer();
  const products = [gcov(), { ...gcov(), id: "east", footprint: moved }, { ...gcov(), id: "same" }];
  layer.getSource()?.addFeatures(footprintFeatures(products, "EPSG:4326"));
  // The middle of the first outline lies inside the outline one degree to the east as well.
  const middle = [
    (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
    (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
  ];
  expect(productsAt(layer, middle, "EPSG:4326")).toEqual(["G4405194348-ASF", "east", "same"]);
  // A place near the western corner lies only in the outlines that were not moved.
  expect(productsAt(layer, [Math.min(...longitudes) + 0.5, 43], "EPSG:4326")).toEqual(["G4405194348-ASF", "same"]);
  expect(productsAt(layer, [0, 0], "EPSG:4326")).toEqual([]);
  // The same place on the copy of the world one turn to the east.
  expect(productsAt(layer, [(middle[0] ?? 0) + 360, middle[1] ?? 0], "EPSG:4326")).toHaveLength(3);
});

test("the pointer does not find a hidden outline", () => {
  const layer = createFootprintLayer();
  const products = [gcov(), { ...gcov(), id: "second" }, { ...gcov(), id: "third" }];
  layer.getSource()?.addFeatures(footprintFeatures(products, "EPSG:4326"));
  const middle = [
    (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
    (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
  ];
  layer.set("hidden", new Set(["second"]));
  expect(productsAt(layer, middle, "EPSG:4326")).toEqual(["G4405194348-ASF", "third"]);
  layer.set("hidden", new Set(["G4405194348-ASF", "second", "third"]));
  expect(productsAt(layer, middle, "EPSG:4326")).toEqual([]);
  layer.set("hidden", new Set());
  expect(productsAt(layer, middle, "EPSG:4326")).toEqual(["G4405194348-ASF", "second", "third"]);
});

test("a click selects the first product under the pointer, then the next, and ends the selection of an only one", () => {
  expect(nextSelection(["a", "b", "c"], null)).toBe("a");
  expect(nextSelection(["a", "b", "c"], "a")).toBe("b");
  expect(nextSelection(["a", "b", "c"], "c")).toBe("a");
  expect(nextSelection(["a", "b", "c"], "x")).toBe("a");
  expect(nextSelection(["a"], "a")).toBeNull();
  expect(nextSelection([], "a")).toBeNull();
});

test("the extent of the outlines is that of every product, or of the products named", () => {
  const moved = gcov().footprint.map((ring) =>
    ring.map(([longitude, latitude]) => [longitude + 20, latitude] as const),
  );
  const layer = createFootprintLayer();
  expect(isEmpty(outlinesExtent(layer))).toBe(true);
  layer.getSource()?.addFeatures(footprintFeatures([gcov(), { ...gcov(), id: "east", footprint: moved }], "EPSG:4326"));
  expect(outlinesExtent(layer)).toEqual([
    Math.min(...longitudes),
    Math.min(...latitudes),
    Math.max(...longitudes) + 20,
    Math.max(...latitudes),
  ]);
  expect(outlinesExtent(layer, ["east"])[0]).toBe(Math.min(...longitudes) + 20);
  expect(isEmpty(outlinesExtent(layer, ["other"]))).toBe(true);
});

function mapAt(center: [number, number], zoom: number): OlMap {
  const map = new OlMap({ view: new View({ center, zoom }) });
  map.setSize([800, 600]);
  return map;
}

function outlineOfProduct(): number[] {
  return footprintFeatures([gcov()], "EPSG:3857")[0]?.getGeometry()?.getExtent() ?? [];
}

test("the map moves to an outline that it does not show", () => {
  const map = mapAt([0, 0], 12);
  const outline = outlineOfProduct();
  showOutline(map, outline, 0);
  expect(containsExtent(map.getView().calculateExtent(map.getSize()), outline)).toBe(true);
});

test("the map moves to an outline that it shows too small", () => {
  const map = mapAt([0, 0], 1);
  const outline = outlineOfProduct();
  expect(containsExtent(map.getView().calculateExtent(map.getSize()), outline)).toBe(true);
  showOutline(map, outline, 0);
  expect(map.getView().getZoom()).toBeGreaterThan(5);
  expect(containsExtent(map.getView().calculateExtent(map.getSize()), outline)).toBe(true);
});

test("the map stays when it shows the outline at a readable size, or a part of it from close by", () => {
  const outline = outlineOfProduct();
  const map = mapAt([0, 0], 1);
  showOutline(map, outline, 0);
  const fitted = { centre: map.getView().getCenter(), zoom: map.getView().getZoom() };
  showOutline(map, outline, 0);
  expect({ centre: map.getView().getCenter(), zoom: map.getView().getZoom() }).toEqual(fitted);
  // A view of a few kilometres inside the outline.
  map.getView().setZoom(13);
  const close = { centre: map.getView().getCenter(), zoom: map.getView().getZoom() };
  showOutline(map, outline, 0);
  expect({ centre: map.getView().getCenter(), zoom: map.getView().getZoom() }).toEqual(close);
});

test("the map moves to an extent on request, and stays for an extent without content", () => {
  const map = mapAt([0, 0], 13);
  const outline = outlineOfProduct();
  zoomTo(map, outline, 0);
  expect(containsExtent(map.getView().calculateExtent(map.getSize()), outline)).toBe(true);
  const view = { centre: map.getView().getCenter(), zoom: map.getView().getZoom() };
  zoomTo(map, outlinesExtent(createFootprintLayer()), 0);
  expect({ centre: map.getView().getCenter(), zoom: map.getView().getZoom() }).toEqual(view);
});

test("a drawing tool that is switched on is noticed", () => {
  const map = mapAt([0, 0], 2);
  expect(isDrawing(map)).toBe(false);
  const draw = new Draw({ type: "Polygon" });
  map.addInteraction(draw);
  expect(isDrawing(map)).toBe(true);
  draw.setActive(false);
  expect(isDrawing(map)).toBe(false);
});
