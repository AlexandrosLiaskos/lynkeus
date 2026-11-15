import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat, toLonLat } from "ol/proj";
import { afterEach, beforeEach, expect, test } from "vitest";
import { resetStorage, setPartKept, storageStore, type KeptPart } from "../shared/storage/storage";
import { baseMapStore } from "./baseMaps";
import { imageryStore } from "./imagery";
import { graticuleStore } from "./state";
import { keepMapView, storedView, VIEW_KEY, viewOf, type StoredView } from "./storedView";

const IMAGE = { layer: "MODIS_Terra_CorrectedReflectance_TrueColor", date: "2024-05-01" } as const;
const FIRST_IMAGE = imageryStore.get();
const LIMITS = { minZoom: 0, maxZoom: 28 };
const TODAY = "2026-11-15";

const VIEW: StoredView = {
  center: [23.7, 37.9],
  zoom: 8.5,
  rotation: 0.5,
  baseMap: "openstreetmap",
  imagery: null,
  graticule: true,
};

let parts: KeptPart<StoredView>[] = [];

function start(longitude = 0, latitude = 20, zoom = 2): OlMap {
  return new OlMap({ view: new View({ center: fromLonLat([longitude, latitude]), zoom }) });
}

function keep(map: OlMap): KeptPart<StoredView> {
  const part = keepMapView(map);
  parts.push(part);
  return part;
}

function stored(): unknown {
  const text = window.localStorage.getItem(VIEW_KEY);
  return text === null ? null : JSON.parse(text);
}

function centre(map: OlMap): number[] {
  return toLonLat(map.getView().getCenter() ?? [0, 0]).map((value) => Math.round(value * 1e6) / 1e6);
}

beforeEach(() => {
  baseMapStore.set("blue-marble");
  graticuleStore.set(false);
  imageryStore.set(FIRST_IMAGE);
  window.localStorage.clear();
  resetStorage();
});

afterEach(() => {
  parts.forEach((part) => part.leave());
  parts = [];
});

test("the view is stored at the end of a move of the map, and not while the map moves", () => {
  const map = start();
  keep(map);
  expect(storageStore.get().parts.find(({ key }) => key === VIEW_KEY)).toMatchObject({ title: "Map view" });
  map.getView().setCenter(fromLonLat([23.7, 37.9]));
  map.getView().setZoom(8.5);
  map.getView().setRotation(0.5);
  expect(stored()).toBeNull();
  map.dispatchEvent("moveend");
  expect(stored()).toMatchObject({
    v: 1,
    value: { zoom: 8.5, rotation: 0.5, baseMap: "blue-marble", imagery: null, graticule: false },
  });
  const { center } = (stored() as { value: StoredView }).value;
  expect(center[0]).toBeCloseTo(23.7, 9);
  expect(center[1]).toBeCloseTo(37.9, 9);
});

test("a change of the basemap, of the image of a date or of the graticule is stored at once", () => {
  keep(start());
  baseMapStore.set("openstreetmap");
  expect(stored()).toMatchObject({ value: { baseMap: "openstreetmap", imagery: null } });
  graticuleStore.set(true);
  expect(stored()).toMatchObject({ value: { graticule: true } });
  baseMapStore.set(null);
  expect(stored()).toMatchObject({ value: { baseMap: null } });
  // The image of a date is stored only while it is the basemap, as a link writes it.
  imageryStore.set(IMAGE);
  expect(stored()).toMatchObject({ value: { baseMap: null, imagery: null } });
  baseMapStore.set("imagery");
  expect(stored()).toMatchObject({ value: { baseMap: "imagery", imagery: IMAGE } });
});

test("the stored view returns when the map is created: its place, the basemap and the graticule", () => {
  window.localStorage.setItem(VIEW_KEY, JSON.stringify({ v: 1, value: VIEW }));
  const map = start();
  keep(map);
  expect(centre(map)).toEqual([23.7, 37.9]);
  expect(map.getView().getZoom()).toBeCloseTo(8.5, 9);
  expect(map.getView().getRotation()).toBe(0.5);
  expect(baseMapStore.get()).toBe("openstreetmap");
  expect(graticuleStore.get()).toBe(true);
  expect(imageryStore.get()).toBe(FIRST_IMAGE);
});

test("the stored image of a date returns with its basemap", () => {
  window.localStorage.setItem(
    VIEW_KEY,
    JSON.stringify({ v: 1, value: { ...VIEW, baseMap: "imagery", imagery: IMAGE } }),
  );
  keep(start());
  expect(baseMapStore.get()).toBe("imagery");
  expect(imageryStore.get()).toEqual(IMAGE);
});

test("a view whose switch is off is not restored and not stored", () => {
  setPartKept(VIEW_KEY, false);
  window.localStorage.setItem(VIEW_KEY, JSON.stringify({ v: 1, value: VIEW }));
  const map = start();
  keep(map);
  expect(centre(map)).toEqual([0, 20]);
  expect(stored()).toBeNull();
  map.dispatchEvent("moveend");
  expect(stored()).toBeNull();
});

test("a rotation of more than half a turn is stored as the same direction inside one turn", () => {
  const map = start();
  map.getView().setRotation(2 * Math.PI + 0.25);
  expect(viewOf(map)?.rotation).toBeCloseTo(0.25, 9);
  map.getView().setRotation(-Math.PI - 0.25);
  expect(viewOf(map)?.rotation).toBeCloseTo(Math.PI - 0.25, 9);
});

test("a map that is created again takes the place of the earlier one", () => {
  const first = start();
  const second = start(10, 10, 5);
  keep(first);
  keep(second);
  first.dispatchEvent("moveend");
  expect(stored()).toBeNull();
  second.dispatchEvent("moveend");
  expect(stored()).toMatchObject({ value: { zoom: 5 } });
});

test("a valid stored view is accepted with its own fields only", () => {
  expect(storedView({ ...VIEW, other: 1 }, LIMITS, TODAY)).toEqual(VIEW);
  expect(storedView({ ...VIEW, baseMap: null }, LIMITS, TODAY)).toEqual({ ...VIEW, baseMap: null });
  expect(storedView({ ...VIEW, baseMap: "imagery", imagery: IMAGE }, LIMITS, TODAY)).toEqual({
    ...VIEW,
    baseMap: "imagery",
    imagery: IMAGE,
  });
});

test.each([
  ["the value is not a record", "view"],
  ["the value is null", null],
  ["the centre has one number", { ...VIEW, center: [23.7] }],
  ["the centre is a text", { ...VIEW, center: "23.7,37.9" }],
  ["a number of the centre is a text", { ...VIEW, center: ["23.7", 37.9] }],
  ["the longitude is outside the limits", { ...VIEW, center: [181, 37.9] }],
  ["the latitude is outside Web Mercator", { ...VIEW, center: [23.7, 89] }],
  ["the zoom level is a text", { ...VIEW, zoom: "8" }],
  ["the zoom level is below the limits of the map", { ...VIEW, zoom: -1 }],
  ["the zoom level is above the limits of the map", { ...VIEW, zoom: 29 }],
  ["the rotation is more than half a turn", { ...VIEW, rotation: 4 }],
  ["the rotation is missing", { ...VIEW, rotation: undefined }],
  ["the basemap is not one of Lynkeus", { ...VIEW, baseMap: "moon" }],
  ["the basemap is missing", { ...VIEW, baseMap: undefined }],
  ["the image is not one of NASA GIBS", { ...VIEW, imagery: { layer: "Moon", date: "2024-05-01" } }],
  ["the day of the image lies after today", { ...VIEW, imagery: { ...IMAGE, date: "2026-11-16" } }],
  ["the day of the image is not a day", { ...VIEW, imagery: { ...IMAGE, date: "1 May 2024" } }],
  ["the image is a text", { ...VIEW, imagery: "MODIS" }],
  ["the image is missing", { ...VIEW, imagery: undefined }],
  ["the graticule is a number", { ...VIEW, graticule: 1 }],
])("a stored view is refused when %s", (_reason, value) => {
  expect(storedView(value, LIMITS, TODAY)).toBeUndefined();
});

test("a stored view that is refused is removed, and the map keeps its first view", () => {
  window.localStorage.setItem(VIEW_KEY, JSON.stringify({ v: 1, value: { ...VIEW, zoom: 99 } }));
  const map = start();
  keep(map);
  expect(centre(map)).toEqual([0, 20]);
  expect(baseMapStore.get()).toBe("blue-marble");
  expect(stored()).toBeNull();
});
