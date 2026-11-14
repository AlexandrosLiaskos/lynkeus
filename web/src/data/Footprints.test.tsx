import { act, render } from "@testing-library/react";
import { containsExtent } from "ol/extent";
import { beforeEach, expect, test, vi } from "vitest";
import { MapContext } from "../shared/map";
import { Footprints, zoomToProducts } from "./Footprints";
import { footprintFeatures, type FootprintLayer } from "./footprints";
import { firstDraft, searchOfDraft, type ProductSearch } from "./search";
import { clearProducts, hoveredProductStore, outlinesStore, productsStore, selectedProductStore } from "./state";
import { someProducts, testMap } from "./testProducts";

function search(): ProductSearch {
  const made = searchOfDraft(firstDraft({ kind: "rectangle", west: "0", south: "0", east: "1", north: "1" }));
  if (typeof made === "string") {
    throw new Error(made);
  }
  return made;
}

function show() {
  const map = testMap();
  render(
    <MapContext value={map}>
      <Footprints />
    </MapContext>,
  );
  const layer = map
    .getLayers()
    .getArray()
    .find((candidate) => candidate.getZIndex() === 1000) as FootprintLayer | undefined;
  if (!layer) {
    throw new Error("the map has no layer of outlines");
  }
  return { map, layer };
}

beforeEach(() => {
  clearProducts();
  outlinesStore.set(true);
});

test("the map holds one outline for each product found, and none after the list is cleared", () => {
  const { layer } = show();
  expect(layer.getSource()?.getFeatures()).toHaveLength(0);
  act(() => productsStore.set({ search: search(), found: 3, products: someProducts(3) }));
  expect(
    layer
      .getSource()
      ?.getFeatures()
      .map((feature) => feature.getId()),
  ).toEqual(["G0-ASF", "G1-ASF", "G2-ASF"]);
  act(() => clearProducts());
  expect(layer.getSource()?.getFeatures()).toHaveLength(0);
});

test("the layer of the outlines knows the selected product and the product under the pointer", () => {
  const { layer } = show();
  act(() => productsStore.set({ search: search(), found: 3, products: someProducts(3) }));
  act(() => {
    selectedProductStore.set("G1-ASF");
    hoveredProductStore.set("G2-ASF");
  });
  expect([layer.get("selected"), layer.get("hovered")]).toEqual(["G1-ASF", "G2-ASF"]);
});

test("the outlines are hidden and shown again", () => {
  const { layer } = show();
  expect(layer.getVisible()).toBe(true);
  act(() => outlinesStore.set(false));
  expect(layer.getVisible()).toBe(false);
  act(() => outlinesStore.set(true));
  expect(layer.getVisible()).toBe(true);
});

test("the map moves to the outline of one product, or of every product", () => {
  const { map } = show();
  const [near, far] = someProducts(2);
  if (!near || !far) {
    throw new Error("the test has no products");
  }
  const east = { ...far, footprint: far.footprint.map((ring) => ring.map(([x, y]) => [x + 40, y] as const)) };
  act(() => productsStore.set({ search: search(), found: 2, products: [near, east] }));
  const extentOf = (...products: (typeof near)[]) =>
    footprintFeatures(products, "EPSG:3857").map((feature) => feature.getGeometry()?.getExtent() ?? []);
  const shown = () => map.getView().calculateExtent(map.getSize());
  const [eastExtent] = extentOf(east);
  const [nearExtent] = extentOf(near);
  map.getView().setCenter([0, 0]);
  zoomToProducts(map, east.id, 0);
  expect(containsExtent(shown(), eastExtent ?? [])).toBe(true);
  expect(containsExtent(shown(), nearExtent ?? [])).toBe(false);
  zoomToProducts(map, undefined, 0);
  expect(containsExtent(shown(), eastExtent ?? [])).toBe(true);
  expect(containsExtent(shown(), nearExtent ?? [])).toBe(true);
});

test("after a search the map moves to the products found when it does not show them", async () => {
  const { map } = show();
  map.getView().setCenter([0, 0]);
  const products = someProducts(2);
  act(() => productsStore.set({ search: search(), found: 2, products }));
  const [outline] = footprintFeatures(products, "EPSG:3857").map((feature) => feature.getGeometry()?.getExtent() ?? []);
  // The move takes a quarter of a second.
  await vi.waitFor(
    () => expect(containsExtent(map.getView().calculateExtent(map.getSize()), outline ?? [])).toBe(true),
    { timeout: 3000 },
  );
});
