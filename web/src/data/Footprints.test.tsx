import { act, render } from "@testing-library/react";
import type OlMap from "ol/Map";
import MapBrowserEvent from "ol/MapBrowserEvent";
import type { Coordinate } from "ol/coordinate";
import { containsExtent } from "ol/extent";
import { beforeEach, expect, test, vi } from "vitest";
import { closeToolPane, openToolPane, resetDock } from "../shared/dock/dock";
import { MapContext } from "../shared/map";
import {
  FIRST_Z_INDEX,
  layerOrderStore,
  putShapeLayer,
  setLayerOrder,
  setShapeDisplay,
  shapeDisplayOf,
  shapeDisplayStore,
  shapeLayersStore,
  type ShapeLayer,
} from "../shared/shapeLayers";
import { Footprints, showOutlines, zoomToProducts } from "./Footprints";
import { footprintFeatures, OUTLINE_SYMBOL, SELECTED_SYMBOL, type FootprintLayer } from "./footprints";
import { describeSearch, firstDraft, searchOfDraft, type ProductSearch } from "./search";
import {
  clearProducts,
  hiddenProductsStore,
  hoveredProductStore,
  outlinesStore,
  productsStore,
  SEARCH_PANE,
  selectedProductStore,
  setProductVisible,
} from "./state";
import { pairProduct, someProducts, testMap } from "./testProducts";

function search(): ProductSearch {
  const area = { kind: "rectangle", west: "0", south: "0", east: "1", north: "1" } as const;
  const made = searchOfDraft(firstDraft(area, new Date("2026-11-14T12:00:00Z")));
  if (typeof made === "string") {
    throw new Error(made);
  }
  return made;
}

function show() {
  const map = testMap();
  const page = render(
    <MapContext value={map}>
      <Footprints />
    </MapContext>,
  );
  const layer = map
    .getLayers()
    .getArray()
    .find((candidate) => candidate.get("id") === "products") as FootprintLayer | undefined;
  if (!layer) {
    throw new Error("the map has no layer of outlines");
  }
  return { map, layer, page };
}

/** The description of the outlines among the shape layers, as the Contents pane reads it. */
function listed(): ShapeLayer | undefined {
  return shapeLayersStore.get().find(({ id }) => id === "products");
}

/** Put a number of products in the list, as a search that found them does. */
function find(count: number, found = count) {
  act(() => productsStore.set({ search: search(), found, products: someProducts(count) }));
}

/** A place of the map inside the outlines of the products of the test, which all lie on one frame. */
function inside(): Coordinate {
  const [feature] = footprintFeatures(someProducts(1), "EPSG:3857");
  return feature?.getGeometry()?.getInteriorPoints().getFirstCoordinate().slice(0, 2) ?? [];
}

/** Move the pointer to a place of the map, or click there. */
function point(map: OlMap, type: "pointermove" | "singleclick", place: Coordinate) {
  const event = new MapBrowserEvent(type, map, new PointerEvent(type === "singleclick" ? "click" : "pointermove"));
  event.coordinate = place;
  act(() => {
    map.dispatchEvent(event);
  });
}

beforeEach(() => {
  clearProducts();
  outlinesStore.set(true);
  shapeLayersStore.set([]);
  shapeDisplayStore.set({});
  resetDock();
});

test("the map holds one outline for each product found, and none after the list is cleared", () => {
  const { layer } = show();
  expect(layer.getSource()?.getFeatures()).toHaveLength(0);
  find(3);
  expect(
    layer
      .getSource()
      ?.getFeatures()
      .map((feature) => feature.getId()),
  ).toEqual(["G0-ASF", "G1-ASF", "G2-ASF"]);
  act(() => clearProducts());
  expect(layer.getSource()?.getFeatures()).toHaveLength(0);
});

test("the layer of the outlines knows the selected product, the product under the pointer and the hidden ones", () => {
  const { layer } = show();
  find(3);
  act(() => {
    selectedProductStore.set("G1-ASF");
    hoveredProductStore.set("G2-ASF");
    hiddenProductsStore.set(["G0-ASF"]);
  });
  expect([layer.get("selected"), layer.get("hovered")]).toEqual(["G1-ASF", "G2-ASF"]);
  expect(layer.get("hidden")).toEqual(new Set(["G0-ASF"]));
});

test("the outlines are listed as the layer Products found, with its legend, its properties and one member for each product", () => {
  show();
  expect(listed()).toBeUndefined();
  act(() =>
    productsStore.set({
      search: search(),
      found: 3,
      products: [...someProducts(2), pairProduct("2026-10-09", "2026-10-21")],
    }),
  );
  const layer = listed();
  expect(layer).toMatchObject({ id: "products", title: "Products found", line: "3 products" });
  expect(layer?.symbols).toEqual([
    { label: "Outline of a product", line: "#005ea2", width: 1 },
    { label: "Selected product", line: "#00ffff", width: 3, casing: "#1b1b1b", fill: "rgba(0, 255, 255, 0.2)" },
  ]);
  // The legend states the values with which the map draws.
  expect(layer?.symbols).toEqual([OUTLINE_SYMBOL, SELECTED_SYMBOL]);
  expect(layer?.properties).toEqual([
    { name: "Kind", value: "Outlines of the products found" },
    { name: "Search", value: describeSearch(search()).join(" ") },
    { name: "Products listed", value: "3" },
    { name: "Products in NASA's catalogue", value: "3" },
  ]);
  expect(layer?.properties[1]?.value).toMatch(
    /^GCOV .* in the rectangle from 0° E to 1° E and from 0° N to 1° N, from .* to 14 Nov 2026\.$/,
  );
  // The members are the products in the order of the list, named as the list of the Catalog pane names them.
  expect(layer?.members?.items).toEqual([
    { id: "G0-ASF", title: "21 Oct 2026", line: "Track 141, frame 67, descending" },
    { id: "G1-ASF", title: "9 Oct 2026", line: "Track 141, frame 67, descending" },
    { id: "G-2026-10-09-ASF", title: "9 Oct 2026 and 21 Oct 2026", line: "Track 141, frame 67, descending" },
  ]);
  expect(layer?.members).toMatchObject({ name: "Products", selected: null, hidden: [] });
});

test("the line of the layer states how many products are listed, and how many the catalogue holds when it holds more", () => {
  show();
  find(1);
  expect(listed()?.line).toBe("1 product");
  find(200, 1240);
  expect(listed()?.line).toBe("200 of 1,240 products");
  expect(listed()?.properties.slice(2)).toEqual([
    { name: "Products listed", value: "200" },
    { name: "Products in NASA's catalogue", value: "1,240" },
  ]);
  expect(listed()?.members?.items).toHaveLength(200);
});

test("the layer leaves the Contents pane when the list holds no product, is cleared, or leaves the page", () => {
  const { page } = show();
  find(2);
  expect(listed()).toBeDefined();
  // A search that found nothing.
  find(0);
  expect(listed()).toBeUndefined();
  find(2);
  setShapeDisplay("products", { opacity: 0.5 });
  act(() => clearProducts());
  expect(shapeLayersStore.get()).toEqual([]);
  // The display of the layer is forgotten with it.
  expect(shapeDisplayStore.get()).toEqual({});
  find(2);
  expect(listed()).toBeDefined();
  page.unmount();
  expect(shapeLayersStore.get()).toEqual([]);
});

test("the description is put again only when something that it states has changed", () => {
  show();
  find(3);
  const first = listed();
  let puts = 0;
  const end = shapeLayersStore.subscribe(() => {
    puts += 1;
  });
  // The pointer, the display and the drawing order are not stated by the description.
  act(() => hoveredProductStore.set("G1-ASF"));
  act(() => setShapeDisplay("products", { visible: false, opacity: 0.3 }));
  act(() => setShapeDisplay("products", { visible: true }));
  expect(puts).toBe(0);
  expect(listed()).toBe(first);
  act(() => selectedProductStore.set("G1-ASF"));
  expect(puts).toBe(1);
  expect(listed()?.members?.selected).toBe("G1-ASF");
  // The members are the same list while the products stay.
  expect(listed()?.members?.items).toBe(first?.members?.items);
  act(() => setProductVisible("G2-ASF", false));
  expect(puts).toBe(2);
  expect(listed()?.members?.hidden).toEqual(["G2-ASF"]);
  end();
});

test("the Contents pane selects a member, hides it, shows it and moves the map to it", async () => {
  const { map, layer } = show();
  const [near, far] = someProducts(2);
  if (!near || !far) {
    throw new Error("the test has no products");
  }
  const east = { ...far, footprint: far.footprint.map((ring) => ring.map(([x, y]) => [x + 40, y] as const)) };
  act(() => productsStore.set({ search: search(), found: 2, products: [near, east] }));
  act(() => listed()?.members?.select("G0-ASF"));
  expect(selectedProductStore.get()).toBe("G0-ASF");
  expect(layer.get("selected")).toBe("G0-ASF");
  act(() => listed()?.members?.select(null));
  expect(selectedProductStore.get()).toBeNull();
  act(() => listed()?.members?.setVisible("G1-ASF", false));
  expect(hiddenProductsStore.get()).toEqual(["G1-ASF"]);
  expect(listed()?.members?.hidden).toEqual(["G1-ASF"]);
  act(() => listed()?.members?.setVisible("G1-ASF", false));
  expect(hiddenProductsStore.get()).toEqual(["G1-ASF"]);
  act(() => listed()?.members?.setVisible("G1-ASF", true));
  expect(hiddenProductsStore.get()).toEqual([]);
  const [outline] = footprintFeatures([east], "EPSG:3857").map((feature) => feature.getGeometry()?.getExtent() ?? []);
  const shown = () => map.getView().calculateExtent(map.getSize());
  // The move after the search has ended before the map is moved away.
  await vi.waitFor(() => expect(map.getView().getAnimating()).toBe(false), { timeout: 3000 });
  map.getView().setCenter([0, 0]);
  expect(containsExtent(shown(), outline ?? [])).toBe(false);
  act(() => listed()?.members?.zoomTo("G1-ASF"));
  await vi.waitFor(() => expect(containsExtent(shown(), outline ?? [])).toBe(true), { timeout: 3000 });
});

test("a hidden product is not drawn, and selecting it shows it again", () => {
  const { layer } = show();
  find(3);
  const styleOf = (id: string) => {
    const feature = layer.getSource()?.getFeatureById(id);
    return feature ? layer.getStyleFunction()?.(feature, 1) : null;
  };
  expect(styleOf("G1-ASF")).toBeDefined();
  act(() => setProductVisible("G1-ASF", false));
  expect(styleOf("G1-ASF")).toBeUndefined();
  expect(styleOf("G0-ASF")).toBeDefined();
  // The selection of another product leaves it hidden.
  act(() => selectedProductStore.set("G0-ASF"));
  expect(hiddenProductsStore.get()).toEqual(["G1-ASF"]);
  act(() => selectedProductStore.set("G1-ASF"));
  expect(hiddenProductsStore.get()).toEqual([]);
  expect(listed()?.members).toMatchObject({ selected: "G1-ASF", hidden: [] });
  expect(styleOf("G1-ASF")).toHaveLength(2);
});

test("clearing the list hides no product of the next list", () => {
  show();
  find(3);
  act(() => setProductVisible("G1-ASF", false));
  act(() => clearProducts());
  expect(hiddenProductsStore.get()).toEqual([]);
});

test("removing the layer takes the outlines off the map and keeps the list of the Catalog pane", () => {
  const { map, layer } = show();
  find(3);
  act(() => selectedProductStore.set("G1-ASF"));
  expect(map.getLayers().getArray()).toContain(layer);
  act(() => listed()?.remove());
  expect(outlinesStore.get()).toBe(false);
  expect(shapeLayersStore.get()).toEqual([]);
  expect(map.getLayers().getArray()).not.toContain(layer);
  expect(productsStore.get()?.products).toHaveLength(3);
  expect(selectedProductStore.get()).toBe("G1-ASF");
  // The pointer finds no outline of a removed layer.
  point(map, "singleclick", inside());
  expect(selectedProductStore.get()).toBe("G1-ASF");
  // The button of the Catalog pane and a new search put the outlines back.
  act(() => showOutlines());
  expect(outlinesStore.get()).toBe(true);
  expect(map.getLayers().getArray()).toContain(layer);
  expect(listed()).toMatchObject({ title: "Products found", line: "3 products" });
  expect(layer.getSource()?.getFeatures()).toHaveLength(3);
});

test("the Contents pane hides the layer, shows it and sets its opacity", () => {
  const { layer } = show();
  find(2);
  expect([layer.getVisible(), layer.getOpacity()]).toEqual([true, 1]);
  act(() => setShapeDisplay("products", { visible: false }));
  expect(layer.getVisible()).toBe(false);
  act(() => setShapeDisplay("products", { visible: true, opacity: 0.4 }));
  expect([layer.getVisible(), layer.getOpacity()]).toEqual([true, 0.4]);
  // The layer that the Catalog pane shows again is the hidden one.
  act(() => setShapeDisplay("products", { visible: false }));
  act(() => showOutlines());
  expect(shapeDisplayOf("products")).toEqual({ visible: true, opacity: 0.4 });
  expect(layer.getVisible()).toBe(true);
});

test("the layer is drawn at its place in the drawing order", () => {
  putShapeLayer({ id: "area", title: "Area", symbols: [], properties: [], remove: () => undefined });
  const { layer } = show();
  find(2);
  expect(layerOrderStore.get()).toEqual(["area", "products"]);
  expect(layer.getZIndex()).toBe(FIRST_Z_INDEX + 1);
  act(() => setLayerOrder(["products", "area"]));
  expect(layer.getZIndex()).toBe(FIRST_Z_INDEX);
});

test("the pointer finds the outlines only while the layer is shown, and never a hidden outline", () => {
  const { map } = show();
  find(3);
  const place = inside();
  point(map, "pointermove", place);
  expect(hoveredProductStore.get()).toBe("G0-ASF");
  point(map, "singleclick", place);
  expect(selectedProductStore.get()).toBe("G0-ASF");
  // A hidden outline is passed over: the pointer and the click find the next product at the place.
  act(() => selectedProductStore.set(null));
  act(() => setProductVisible("G0-ASF", false));
  point(map, "pointermove", place);
  expect(hoveredProductStore.get()).toBe("G1-ASF");
  point(map, "singleclick", place);
  expect(selectedProductStore.get()).toBe("G1-ASF");
  // A hidden layer answers neither the pointer nor the click.
  act(() => setShapeDisplay("products", { visible: false }));
  expect(hoveredProductStore.get()).toBeNull();
  point(map, "pointermove", place);
  expect(hoveredProductStore.get()).toBeNull();
  point(map, "singleclick", place);
  expect(selectedProductStore.get()).toBe("G1-ASF");
  act(() => setShapeDisplay("products", { visible: true }));
  point(map, "singleclick", place);
  expect(selectedProductStore.get()).toBe("G2-ASF");
});

test("the outlines stay on the map as a layer after the search pane closes", () => {
  const { map, layer } = show();
  act(() => openToolPane(SEARCH_PANE));
  find(3);
  act(() => closeToolPane(SEARCH_PANE));
  expect(map.getLayers().getArray()).toContain(layer);
  expect(layer.getVisible()).toBe(true);
  expect(layer.getSource()?.getFeatures()).toHaveLength(3);
  expect(listed()).toMatchObject({ id: "products", line: "3 products" });
  expect(outlinesStore.get()).toBe(true);
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
  // The map moves to the products also while their layer is removed from it.
  act(() => outlinesStore.set(false));
  map.getView().setCenter([0, 0]);
  zoomToProducts(map, east.id, 0);
  expect(containsExtent(shown(), eastExtent ?? [])).toBe(true);
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
