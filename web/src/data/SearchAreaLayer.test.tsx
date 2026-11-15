import { act, render } from "@testing-library/react";
import Polygon from "ol/geom/Polygon";
import Draw from "ol/interaction/Draw";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type { Style } from "ol/style";
import { beforeEach, expect, test } from "vitest";
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
import { firstDraft, type SearchDraft } from "./search";
import {
  areaOfDraft,
  SEARCH_AREA_LAYER_ID,
  SEARCH_AREA_SYMBOL,
  SearchAreaLayer,
  takeDrawnShape,
} from "./SearchAreaLayer";
import { drawingStore, GET_LAYER_PANE, SEARCH_PANE, searchDraftStore } from "./state";
import { testMap } from "./testProducts";

const BOX = { kind: "rectangle", west: "-71.2", south: "42.6", east: "-70.75", north: "42.95" } as const;
const DRAFT: SearchDraft = firstDraft(BOX, new Date("2026-11-14T12:00:00Z"));

function square(west: number, south: number, east: number, north: number): Polygon {
  return new Polygon([
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
  ]);
}

const TRIANGLE = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 0],
] as const;

beforeEach(() => {
  searchDraftStore.set(DRAFT);
  shapeLayersStore.set([]);
  shapeDisplayStore.set({});
  resetDock();
  drawingStore.set(null);
});

function show() {
  const map = testMap();
  const page = render(
    <MapContext value={map}>
      <SearchAreaLayer />
    </MapContext>,
  );
  const layer = map
    .getLayers()
    .getArray()
    .find((candidate) => candidate.get("id") === "search-area") as VectorLayer<VectorSource> | undefined;
  if (!layer) {
    throw new Error("the map has no layer of the area of the search");
  }
  return { map, layer, page, shapes: () => layer.getSource()?.getFeatures().length };
}

/** The description of the area among the shape layers, as the Contents pane reads it. */
function listed(): ShapeLayer | undefined {
  return shapeLayersStore.get().find(({ id }) => id === "search-area");
}

test("the area of the form is one that the map can show only when its sides make a rectangle", () => {
  expect(areaOfDraft(DRAFT)).toEqual({ kind: "rectangle", west: -71.2, south: 42.6, east: -70.75, north: 42.95 });
  expect(areaOfDraft({ ...DRAFT, area: { ...BOX, west: "" } })).toBeNull();
  expect(areaOfDraft({ ...DRAFT, area: { ...BOX, west: "-" } })).toBeNull();
  expect(areaOfDraft({ ...DRAFT, area: { ...BOX, north: "95" } })).toBeNull();
  expect(areaOfDraft({ ...DRAFT, area: { ...BOX, south: "43" } })).toBeNull();
  expect(areaOfDraft({ ...DRAFT, limited: false })).toBeNull();
  expect(areaOfDraft({ ...DRAFT, by: "names" })).toBeNull();
  expect(areaOfDraft(null)).toBeNull();
  const polygons = {
    kind: "polygons",
    rings: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    ],
  } as const;
  expect(areaOfDraft({ ...DRAFT, area: polygons })).toEqual(polygons);
  expect(areaOfDraft({ ...DRAFT, area: { kind: "polygons", rings: [] } })).toBeNull();
});

test("a drawn rectangle becomes the four sides of the area", () => {
  searchDraftStore.set({ ...DRAFT, limited: false });
  expect(takeDrawnShape(square(10, 45, 11.123456, 46), "rectangle", "EPSG:4326")).toBeNull();
  expect(searchDraftStore.get()).toMatchObject({
    limited: true,
    area: { kind: "rectangle", west: "10", south: "45", east: "11.1235", north: "46" },
  });
});

test("a rectangle drawn across the meridian of 180 degrees has a west larger than its east", () => {
  expect(takeDrawnShape(square(170, -20, 190, -10), "rectangle", "EPSG:4326")).toBeNull();
  expect(searchDraftStore.get()?.area).toEqual({
    kind: "rectangle",
    west: "170",
    south: "-20",
    east: "-170",
    north: "-10",
  });
});

test("a rectangle without area is refused and the form keeps its area", () => {
  expect(takeDrawnShape(square(10, 45, 10, 45), "rectangle", "EPSG:4326")).toMatch(/has no area/);
  expect(searchDraftStore.get()?.area).toEqual(BOX);
});

test("a drawn polygon becomes the polygon of the area, with points along its long sides", () => {
  expect(takeDrawnShape(square(0, 60, 6, 61), "polygon", "EPSG:4326")).toBeNull();
  const area = searchDraftStore.get()?.area;
  expect(area?.kind).toBe("polygons");
  expect(area?.kind === "polygons" ? area.rings[0]?.slice(0, 4) : null).toEqual([
    [0, 60],
    [2, 60],
    [4, 60],
    [6, 60],
  ]);
});

test("the area of the form is the layer Area of the search, with its legend and its properties", () => {
  const { layer, shapes } = show();
  expect(SEARCH_AREA_LAYER_ID).toBe("search-area");
  expect(shapes()).toBe(1);
  expect(shapeLayersStore.get()).toHaveLength(1);
  expect(listed()).toMatchObject({ id: "search-area", title: "Area of the search", line: "Rectangle" });
  expect(listed()?.symbols).toEqual([{ label: "Area of the search", line: "#d83933", width: 2, dash: [6, 4] }]);
  expect(listed()?.properties).toEqual([
    { name: "Kind", value: "Rectangle" },
    { name: "West", value: "71.2° W" },
    { name: "South", value: "42.6° N" },
    { name: "East", value: "70.75° W" },
    { name: "North", value: "42.95° N" },
  ]);
  expect(listed()?.members).toBeUndefined();
  // The legend states the line with which the map draws the area.
  const stroke = (layer.getStyle() as Style).getStroke();
  expect([stroke?.getColor(), stroke?.getWidth(), stroke?.getLineDash()]).toEqual([
    SEARCH_AREA_SYMBOL.line,
    SEARCH_AREA_SYMBOL.width,
    SEARCH_AREA_SYMBOL.dash,
  ]);
});

test("an area of polygons is named by their number, with the rectangle around them and their points", () => {
  show();
  act(() => searchDraftStore.set({ ...DRAFT, area: { kind: "polygons", rings: [TRIANGLE] } }));
  expect(listed()).toMatchObject({ title: "Area of the search", line: "Polygon" });
  expect(listed()?.properties).toEqual([
    { name: "Kind", value: "Polygon" },
    { name: "West", value: "0° E" },
    { name: "South", value: "0° N" },
    { name: "East", value: "1° E" },
    { name: "North", value: "1° N" },
    { name: "Points", value: "3" },
  ]);
  const north = TRIANGLE.map(([longitude, latitude]) => [longitude - 3, latitude + 10] as const);
  act(() => searchDraftStore.set({ ...DRAFT, area: { kind: "polygons", rings: [TRIANGLE, north] } }));
  expect(listed()?.line).toBe("2 polygons");
  expect(listed()?.properties.map(({ value }) => value)).toEqual(["2 polygons", "3° W", "0° N", "1° E", "11° N", "6"]);
});

test("the area stays on the map as a layer while the panes of the search and of Get layer open and close", () => {
  const { layer, shapes } = show();
  const first = listed();
  for (const pane of [SEARCH_PANE, GET_LAYER_PANE]) {
    act(() => openToolPane(pane));
    expect([shapes(), layer.getVisible(), listed()]).toEqual([1, true, first]);
    act(() => closeToolPane(pane));
    expect([shapes(), layer.getVisible(), listed()]).toEqual([1, true, first]);
  }
});

test("the layer leaves the Contents pane when the form holds no area that can be drawn, and when it leaves the page", () => {
  const { page, shapes } = show();
  act(() => searchDraftStore.set({ ...DRAFT, limited: false }));
  expect([shapes(), shapeLayersStore.get()]).toEqual([0, []]);
  act(() => searchDraftStore.set(DRAFT));
  expect([shapes(), listed()?.line]).toEqual([1, "Rectangle"]);
  // A side that is not a number.
  act(() => searchDraftStore.set({ ...DRAFT, area: { ...BOX, west: "-" } }));
  expect([shapes(), shapeLayersStore.get()]).toEqual([0, []]);
  act(() => searchDraftStore.set(DRAFT));
  // A search by product names has no area.
  act(() => searchDraftStore.set({ ...DRAFT, by: "names" }));
  expect([shapes(), shapeLayersStore.get()]).toEqual([0, []]);
  act(() => searchDraftStore.set(null));
  expect(shapeLayersStore.get()).toEqual([]);
  act(() => searchDraftStore.set(DRAFT));
  expect(listed()).toBeDefined();
  page.unmount();
  expect(shapeLayersStore.get()).toEqual([]);
});

test("removing the layer takes the area out of the search, and the form keeps its sides", () => {
  const { shapes } = show();
  act(() => listed()?.remove());
  expect(searchDraftStore.get()).toEqual({ ...DRAFT, limited: false });
  expect([shapes(), shapeLayersStore.get()]).toEqual([0, []]);
  // The removal acts on the form as it is at that moment.
  act(() => searchDraftStore.set({ ...DRAFT, track: "141" }));
  act(() => listed()?.remove());
  expect(searchDraftStore.get()).toEqual({ ...DRAFT, track: "141", limited: false });
});

test("the description is put again only when the area has changed", () => {
  show();
  const first = listed();
  let puts = 0;
  const end = shapeLayersStore.subscribe(() => {
    puts += 1;
  });
  act(() => searchDraftStore.set({ ...DRAFT, track: "141" }));
  act(() => searchDraftStore.set({ ...DRAFT, track: "141", area: { ...BOX } }));
  act(() => setShapeDisplay("search-area", { opacity: 0.5 }));
  expect(puts).toBe(0);
  expect(listed()).toBe(first);
  act(() => searchDraftStore.set({ ...DRAFT, area: { ...BOX, north: "43" } }));
  expect(puts).toBe(1);
  expect(listed()?.properties[4]).toEqual({ name: "North", value: "43° N" });
  end();
});

test("the Contents pane hides the layer of the area, shows it and sets its opacity", () => {
  const { layer } = show();
  expect([layer.getVisible(), layer.getOpacity()]).toEqual([true, 1]);
  act(() => setShapeDisplay("search-area", { visible: false }));
  expect(layer.getVisible()).toBe(false);
  act(() => setShapeDisplay("search-area", { visible: true, opacity: 0.3 }));
  expect([layer.getVisible(), layer.getOpacity()]).toEqual([true, 0.3]);
});

test("an area that has just been set is shown, also when its layer was hidden", () => {
  const { layer } = show();
  act(() => setShapeDisplay("search-area", { visible: false, opacity: 0.6 }));
  // Another choice of the form leaves the layer hidden.
  act(() => searchDraftStore.set({ ...DRAFT, track: "141" }));
  expect(layer.getVisible()).toBe(false);
  // A side typed in a field.
  act(() => searchDraftStore.set({ ...DRAFT, area: { ...BOX, north: "43" } }));
  expect(shapeDisplayOf("search-area")).toEqual({ visible: true, opacity: 0.6 });
  expect(layer.getVisible()).toBe(true);
  // A shape drawn on the map.
  act(() => setShapeDisplay("search-area", { visible: false }));
  act(() => {
    takeDrawnShape(square(10, 45, 11, 46), "rectangle", "EPSG:4326");
  });
  expect(layer.getVisible()).toBe(true);
  expect(listed()?.properties[1]).toEqual({ name: "West", value: "10° E" });
  // An area of polygons, as a file or a drawn polygon gives it.
  act(() => setShapeDisplay("search-area", { visible: false }));
  act(() => searchDraftStore.set({ ...DRAFT, area: { kind: "polygons", rings: [TRIANGLE] } }));
  expect(layer.getVisible()).toBe(true);
});

test("the layer of the area is drawn at its place in the drawing order", () => {
  putShapeLayer({ id: "products", title: "Products found", symbols: [], properties: [], remove: () => undefined });
  const { layer } = show();
  expect(layerOrderStore.get()).toEqual(["products", "search-area"]);
  expect(layer.getZIndex()).toBe(FIRST_Z_INDEX + 1);
  act(() => setLayerOrder(["search-area", "products"]));
  expect(layer.getZIndex()).toBe(FIRST_Z_INDEX);
});

test("a drawing tool is on the map while the user draws, and the Escape key ends the drawing", () => {
  const { map } = show();
  const drawing = () =>
    map
      .getInteractions()
      .getArray()
      .some((interaction) => interaction instanceof Draw);
  expect(drawing()).toBe(false);
  act(() => drawingStore.set("polygon"));
  expect(drawing()).toBe(true);
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(drawingStore.get()).toBeNull();
  expect(drawing()).toBe(false);
});
