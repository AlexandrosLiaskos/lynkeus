import { act, render } from "@testing-library/react";
import Polygon from "ol/geom/Polygon";
import Draw from "ol/interaction/Draw";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import { beforeEach, expect, test } from "vitest";
import { closeToolPane, openToolPane, resetDock } from "../shared/dock/dock";
import { MapContext } from "../shared/map";
import { firstDraft, type SearchDraft } from "./search";
import { areaOfDraft, SearchAreaLayer, takeDrawnShape } from "./SearchAreaLayer";
import { drawingStore, SEARCH_PANE, searchDraftStore } from "./state";
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

beforeEach(() => {
  searchDraftStore.set(DRAFT);
  resetDock();
  drawingStore.set(null);
});

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

test("the area is on the map while the search pane is open, and a drawing tool is on the map while the user draws", () => {
  const map = testMap();
  render(
    <MapContext value={map}>
      <SearchAreaLayer />
    </MapContext>,
  );
  // The layer of the area is drawn above the outlines of the products, which have the number 1000.
  const layer = map
    .getLayers()
    .getArray()
    .find((candidate) => candidate.getZIndex() === 1001) as VectorLayer<VectorSource> | undefined;
  const shapes = () => layer?.getSource()?.getFeatures().length;
  const drawing = () =>
    map
      .getInteractions()
      .getArray()
      .some((interaction) => interaction instanceof Draw);
  expect(shapes()).toBe(0);
  act(() => openToolPane(SEARCH_PANE));
  expect(shapes()).toBe(1);
  act(() => searchDraftStore.set({ ...DRAFT, limited: false }));
  expect(shapes()).toBe(0);
  act(() => closeToolPane(SEARCH_PANE));
  expect(drawing()).toBe(false);
  act(() => drawingStore.set("polygon"));
  expect(drawing()).toBe(true);
  // The Escape key ends the drawing.
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(drawingStore.get()).toBeNull();
  expect(drawing()).toBe(false);
});
