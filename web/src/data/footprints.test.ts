import OlMap from "ol/Map";
import View from "ol/View";
import { containsExtent } from "ol/extent";
import { expect, test } from "vitest";
import product from "../../../api/tests/data/product-gcov.json";
import { createFootprintLayer, footprintFeatures, showOutline } from "./footprints";
import { isProduct } from "./products";

// The longitudes and the latitudes of the outline of the product of the test.
const longitudes = product.footprint.flat().map((point) => point[0] ?? Number.NaN);
const latitudes = product.footprint.flat().map((point) => point[1] ?? Number.NaN);

test("the outline of a product is one feature, named after the product, in degrees when the map is in degrees", () => {
  if (!isProduct(product)) {
    throw new Error("the product of the test is not valid");
  }
  const [feature] = footprintFeatures([product], "EPSG:4326");
  expect(feature?.getId()).toBe("G4405194348-ASF");
  expect(feature?.getGeometry()?.getExtent()).toEqual([
    Math.min(...longitudes),
    Math.min(...latitudes),
    Math.max(...longitudes),
    Math.max(...latitudes),
  ]);
});

test("the outline is moved to the projection of the map", () => {
  if (!isProduct(product)) {
    throw new Error("the product of the test is not valid");
  }
  const [feature] = footprintFeatures([product], "EPSG:3857");
  const [west] = feature?.getGeometry()?.getExtent() ?? [];
  // In Web Mercator one degree of longitude is about 111 319 metres at every latitude.
  expect(west).toBeCloseTo(Math.min(...longitudes) * 111319.49079327357, 3);
});

test("a product with two polygons gives one feature with both", () => {
  if (!isProduct(product)) {
    throw new Error("the product of the test is not valid");
  }
  const ring = product.footprint[0] ?? [];
  const [feature] = footprintFeatures([{ ...product, footprint: [ring, ring] }], "EPSG:4326");
  expect(feature?.getGeometry()?.getPolygons()).toHaveLength(2);
});

test("the layer of the outlines is drawn above the other layers", () => {
  expect(createFootprintLayer().getZIndex()).toBe(1000);
});

function mapAt(center: [number, number], zoom: number): OlMap {
  const map = new OlMap({ view: new View({ center, zoom }) });
  map.setSize([800, 600]);
  return map;
}

function outlineOfProduct(): number[] {
  if (!isProduct(product)) {
    throw new Error("the product of the test is not valid");
  }
  return footprintFeatures([product], "EPSG:3857")[0]?.getGeometry()?.getExtent() ?? [];
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
