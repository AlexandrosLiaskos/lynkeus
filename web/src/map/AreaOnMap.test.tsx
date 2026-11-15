import { act, render, screen } from "@testing-library/react";
import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat } from "ol/proj";
import { beforeEach, expect, test } from "vitest";
import { areaStore } from "../shared/area";
import { MapContext } from "../shared/map";
import { addToMap, mapLayersStore } from "../shared/mapLayers";
import { messagesStore } from "../shared/messages/messages";
import {
  FIRST_Z_INDEX,
  layerOrderStore,
  putShapeLayer,
  setLayerOrder,
  setShapeDisplay,
  shapeDisplayOf,
  shapeDisplayStore,
  shapeLayersStore,
} from "../shared/shapeLayers";
import { AREA_FAULTS, extentOfArea } from "./area";
import { AREA_EDIT_Z_INDEX, AREA_LAYER_ID, BOX, type AreaLayer } from "./areaLayer";
import { AreaOnMap } from "./AreaOnMap";
import { zoomToArea } from "./commands";
import { toolKeysStore } from "./keys";
import { toolStore } from "./state";
import { testLayer } from "./testLayer";

const AREA = { west: -71.2, south: 42.6, east: -70.75, north: 42.95 };
const OTHER_AREA = { west: 22.35, south: 36.4, east: 22.6, north: 36.9 };

function start() {
  const map = new OlMap({ view: new View({ center: fromLonLat([-71, 42.8]), zoom: 9 }) });
  const { unmount } = render(
    <MapContext value={map}>
      <AreaOnMap />
    </MapContext>,
  );
  const layer = map.getAllLayers().find((candidate) => candidate.get("id") === AREA_LAYER_ID) as AreaLayer | undefined;
  const features = () => layer?.getSource()?.getFeatures() ?? [];
  return { map, layer, features, unmount };
}

/** Return the description of the area among the shape layers, or undefined when it is not listed. */
function listed() {
  return shapeLayersStore.get().find(({ id }) => id === AREA_LAYER_ID);
}

/** Put the outlines of the products on the map, as the search does: a second shape layer. */
function putProducts() {
  putShapeLayer({
    id: "products",
    title: "Products",
    symbols: [{ label: "Outline of a product", line: "#005ea2", width: 2 }],
    properties: [],
    remove: () => undefined,
  });
}

beforeEach(() => {
  areaStore.set(null);
  toolStore.set(null);
  messagesStore.set([]);
  mapLayersStore.set([]);
  shapeLayersStore.set([]);
  shapeDisplayStore.set({});
});

test("the area is drawn on its own layer whenever one is set, and removed with it", () => {
  const { map, layer, features } = start();
  expect(layer).toBeDefined();
  expect(features()).toHaveLength(0);
  act(() => areaStore.set(AREA));
  expect(features().map((feature) => feature.getId())).toEqual([BOX]);
  const drawn = layer?.getSource()?.getExtent() ?? [];
  extentOfArea(AREA, map.getView().getProjection()).forEach((side, index) => {
    expect(drawn[index]).toBeCloseTo(side, 6);
  });
  expect(screen.getByRole("status").textContent).toBe(
    "The area is west -71.2, south 42.6, east -70.75, north 42.95 degrees.",
  );
  act(() => areaStore.set(null));
  expect(features()).toHaveLength(0);
  expect(screen.getByRole("status").textContent).toBe("No area is set.");
});

test("while the Rectangle button is on, the rectangle carries its eight handles", () => {
  const { features } = start();
  act(() => areaStore.set(AREA));
  act(() => toolStore.set("area-rectangle"));
  expect(features()).toHaveLength(9);
  act(() => toolStore.set(null));
  expect(features()).toHaveLength(1);
  expect(toolKeysStore.get()).toBeNull();
});

test("with the keyboard, the Enter key at two places sets the area", () => {
  start();
  act(() => toolStore.set("area-rectangle"));
  act(() => toolKeysStore.get()?.point(fromLonLat([-71.2, 42.6])));
  expect(areaStore.get()).toBeNull();
  expect(screen.getByRole("status").textContent).toMatch(/^The first corner is set\./);
  act(() => toolKeysStore.get()?.point(fromLonLat([-70.75, 42.95])));
  expect(areaStore.get()).toEqual(AREA);
});

test("a rectangle across the meridian of 180 degrees is refused in a sentence and the area stays", () => {
  const { features } = start();
  act(() => areaStore.set(AREA));
  act(() => toolStore.set("area-rectangle"));
  act(() => toolKeysStore.get()?.point(fromLonLat([170, 10])));
  act(() => toolKeysStore.get()?.point([(fromLonLat([180, 0])[0] ?? 0) + 1e6, 0]));
  expect(areaStore.get()).toBe(AREA);
  expect(messagesStore.get().map(({ kind, text }) => [kind, text])).toEqual([["error", AREA_FAULTS.meridian]]);
  expect(features()).toHaveLength(9);
});

test("the Escape key gives up a rectangle that is being drawn", () => {
  const { features } = start();
  act(() => areaStore.set(AREA));
  act(() => toolStore.set("area-rectangle"));
  act(() => toolKeysStore.get()?.point(fromLonLat([0, 0])));
  expect(features()).toHaveLength(1);
  let given = false;
  act(() => {
    given = toolKeysStore.get()?.cancel() ?? false;
  });
  expect(given).toBe(true);
  expect(features()).toHaveLength(9);
  expect(screen.getByRole("status").textContent).toMatch(/^The area is west -71\.2/);
});

test("an area is listed as the layer Area with its symbol and its four sides", () => {
  start();
  expect(shapeLayersStore.get()).toEqual([]);
  act(() => areaStore.set(AREA));
  expect(shapeLayersStore.get()).toHaveLength(1);
  const description = listed();
  expect(description?.title).toBe("Area");
  expect(description?.line).toBe("Rectangle");
  expect(description?.symbols).toEqual([{ label: "Area", line: "#1b1b1b", width: 2, dash: [8, 6], casing: "#ffffff" }]);
  expect(description?.properties).toEqual([
    { name: "Kind", value: "Rectangle" },
    { name: "West", value: "-71.2°" },
    { name: "South", value: "42.6°" },
    { name: "East", value: "-70.75°" },
    { name: "North", value: "42.95°" },
  ]);
  expect(description?.members).toBeUndefined();
  expect(layerOrderStore.get()).toEqual([AREA_LAYER_ID]);
});

test("the layer leaves the list when the area is cleared and when the area leaves the page", () => {
  const { unmount } = start();
  act(() => areaStore.set(AREA));
  act(() => setShapeDisplay(AREA_LAYER_ID, { opacity: 0.5 }));
  act(() => areaStore.set(null));
  expect(shapeLayersStore.get()).toEqual([]);
  expect(layerOrderStore.get()).toEqual([]);
  expect(shapeDisplayStore.get()).toEqual({});
  act(() => areaStore.set(AREA));
  expect(listed()).toBeDefined();
  unmount();
  expect(shapeLayersStore.get()).toEqual([]);
  expect(areaStore.get()).toBe(AREA);
});

test("an area that is on the page from the start, as one of a shared link, is listed", () => {
  areaStore.set(AREA);
  const { features } = start();
  expect(listed()?.properties[1]).toEqual({ name: "West", value: "-71.2°" });
  expect(features()).toHaveLength(1);
});

test("the description is put again only for another area, which keeps the place and the display", () => {
  start();
  act(() => areaStore.set(AREA));
  act(putProducts);
  act(() => setShapeDisplay(AREA_LAYER_ID, { opacity: 0.5 }));
  const first = listed();
  act(() => toolStore.set("area-rectangle"));
  act(() => toolStore.set(null));
  expect(listed()).toBe(first);
  act(() => areaStore.set(OTHER_AREA));
  expect(listed()).not.toBe(first);
  expect(listed()?.properties.map(({ value }) => value)).toEqual(["Rectangle", "22.35°", "36.4°", "22.6°", "36.9°"]);
  expect(layerOrderStore.get()).toEqual([AREA_LAYER_ID, "products"]);
  expect(shapeDisplayOf(AREA_LAYER_ID)).toEqual({ visible: true, opacity: 0.5 });
});

test("removing the layer clears the area, as the button Clear does", () => {
  const { features } = start();
  act(() => areaStore.set(AREA));
  act(() => listed()?.remove());
  expect(areaStore.get()).toBeNull();
  expect(shapeLayersStore.get()).toEqual([]);
  expect(features()).toHaveLength(0);
  expect(screen.getByRole("status").textContent).toBe("No area is set.");
});

test("the layer is hidden, shown and made transparent as its display says", () => {
  const { layer } = start();
  act(() => areaStore.set(AREA));
  expect(layer?.getVisible()).toBe(true);
  expect(layer?.getOpacity()).toBe(1);
  act(() => setShapeDisplay(AREA_LAYER_ID, { visible: false }));
  expect(layer?.getVisible()).toBe(false);
  act(() => setShapeDisplay(AREA_LAYER_ID, { visible: true, opacity: 0.4 }));
  expect(layer?.getVisible()).toBe(true);
  expect(layer?.getOpacity()).toBe(0.4);
  // A cleared area takes its display with it, so the next area is shown and opaque.
  act(() => setShapeDisplay(AREA_LAYER_ID, { visible: false }));
  act(() => areaStore.set(null));
  act(() => areaStore.set(OTHER_AREA));
  expect(layer?.getVisible()).toBe(true);
  expect(layer?.getOpacity()).toBe(1);
});

test("at rest the layer is drawn at its place of the drawing order", () => {
  addToMap(testLayer("a", "A"));
  addToMap(testLayer("b", "B"));
  const { layer } = start();
  expect(layer?.getZIndex()).toBeUndefined();
  act(() => areaStore.set(AREA));
  expect(layerOrderStore.get()).toEqual(["a", "b", AREA_LAYER_ID]);
  expect(layer?.getZIndex()).toBe(FIRST_Z_INDEX + 2);
  act(() => setLayerOrder([AREA_LAYER_ID, "a", "b"]));
  expect(layer?.getZIndex()).toBe(FIRST_Z_INDEX);
  act(putProducts);
  expect(layer?.getZIndex()).toBe(FIRST_Z_INDEX);
  act(() => setLayerOrder(["a", "b", "products", AREA_LAYER_ID]));
  expect(layer?.getZIndex()).toBe(FIRST_Z_INDEX + 3);
});

test("while the Rectangle tool is in use the layer is drawn above every layer, and then returns to its place", () => {
  addToMap(testLayer("a", "A"));
  const { layer } = start();
  act(() => areaStore.set(AREA));
  act(putProducts);
  expect(layer?.getZIndex()).toBe(FIRST_Z_INDEX + 1);
  act(() => toolStore.set("area-rectangle"));
  expect(layer?.getZIndex()).toBe(AREA_EDIT_Z_INDEX);
  // A change of the drawing order waits for the end of the tool.
  act(() => setLayerOrder([AREA_LAYER_ID, "a", "products"]));
  expect(layer?.getZIndex()).toBe(AREA_EDIT_Z_INDEX);
  act(() => areaStore.set(OTHER_AREA));
  expect(layer?.getZIndex()).toBe(AREA_EDIT_Z_INDEX);
  act(() => toolStore.set(null));
  expect(layer?.getZIndex()).toBe(FIRST_Z_INDEX);
});

test("a rectangle that the tool draws where there is no area is drawn above every layer", () => {
  addToMap(testLayer("a", "A"));
  const { layer } = start();
  act(() => toolStore.set("area-rectangle"));
  expect(layer?.getZIndex()).toBe(AREA_EDIT_Z_INDEX);
  act(() => toolKeysStore.get()?.point(fromLonLat([-71.2, 42.6])));
  act(() => toolKeysStore.get()?.point(fromLonLat([-70.75, 42.95])));
  expect(layerOrderStore.get()).toEqual(["a", AREA_LAYER_ID]);
  expect(layer?.getZIndex()).toBe(AREA_EDIT_Z_INDEX);
  act(() => toolStore.set(null));
  expect(layer?.getZIndex()).toBe(FIRST_Z_INDEX + 1);
});

test("a hidden layer is shown again when the area is set anew", () => {
  const { layer } = start();
  act(() => areaStore.set(AREA));
  act(() => setShapeDisplay(AREA_LAYER_ID, { visible: false, opacity: 0.5 }));
  act(() => areaStore.set(OTHER_AREA));
  expect(shapeDisplayOf(AREA_LAYER_ID)).toEqual({ visible: true, opacity: 0.5 });
  expect(layer?.getVisible()).toBe(true);
  // The same sides set once more, as From view does on a map that has not moved, also show the layer.
  act(() => setShapeDisplay(AREA_LAYER_ID, { visible: false }));
  act(() => areaStore.set({ ...OTHER_AREA }));
  expect(layer?.getVisible()).toBe(true);
});

test("a hidden layer is shown again when the Rectangle tool starts, and not when it ends", () => {
  const { layer, features } = start();
  act(() => areaStore.set(AREA));
  act(() => setShapeDisplay(AREA_LAYER_ID, { visible: false }));
  act(() => toolStore.set("area-rectangle"));
  expect(shapeDisplayOf(AREA_LAYER_ID).visible).toBe(true);
  expect(layer?.getVisible()).toBe(true);
  expect(features()).toHaveLength(9);
  // The layer can be hidden while the tool is in use. A rectangle that the tool then sets shows it again.
  act(() => setShapeDisplay(AREA_LAYER_ID, { visible: false }));
  expect(layer?.getVisible()).toBe(false);
  act(() => toolKeysStore.get()?.point(fromLonLat([22.35, 36.4])));
  act(() => toolKeysStore.get()?.point(fromLonLat([22.6, 36.9])));
  expect(areaStore.get()).toEqual(OTHER_AREA);
  expect(layer?.getVisible()).toBe(true);
  act(() => setShapeDisplay(AREA_LAYER_ID, { visible: false }));
  act(() => toolStore.set(null));
  expect(shapeDisplayOf(AREA_LAYER_ID).visible).toBe(false);
  expect(layer?.getVisible()).toBe(false);
  expect(features()).toHaveLength(1);
});

test("the tool that starts without an area stores no display for a layer that is not listed", () => {
  start();
  act(() => toolStore.set("area-rectangle"));
  expect(shapeDisplayStore.get()).toEqual({});
  expect(shapeLayersStore.get()).toEqual([]);
});

test("a hidden area keeps its sentence, and Zoom to area still shows the whole of it", () => {
  const { map } = start();
  map.setSize([800, 600]);
  act(() => areaStore.set(OTHER_AREA));
  act(() => setShapeDisplay(AREA_LAYER_ID, { visible: false }));
  expect(screen.getByRole("status").textContent).toBe(
    "The area is west 22.35, south 36.4, east 22.6, north 36.9 degrees.",
  );
  act(() => zoomToArea(map, 0));
  const view = map.getView();
  const shown = view.calculateExtent(map.getSize());
  const [west = 0, south = 0, east = 0, north = 0] = extentOfArea(OTHER_AREA, view.getProjection());
  expect(shown[0]).toBeLessThan(west);
  expect(shown[1]).toBeLessThan(south);
  expect(shown[2]).toBeGreaterThan(east);
  expect(shown[3]).toBeGreaterThan(north);
  expect(messagesStore.get()).toEqual([]);
  expect(shapeDisplayOf(AREA_LAYER_ID).visible).toBe(false);
});
