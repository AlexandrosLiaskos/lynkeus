// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat, toLonLat } from "ol/proj";
import { beforeEach, expect, test } from "vitest";
import { baseMapStore } from "../map/baseMaps";
import { imageryStore } from "../map/imagery";
import { areaStore } from "../shared/area";
import {
  faultMessage,
  mapLink,
  mapState,
  normalRotation,
  openLink,
  readLink,
  withoutLink,
  writeLink,
  type MapState,
} from "./link";

const LIMITS = { minZoom: 0, maxZoom: 28 };

// The area of the sample files: the lower Merrimack River, Massachusetts.
const MERRIMACK = { west: -71.2, south: 42.6, east: -70.75, north: 42.95 };

const STATE: MapState = {
  zoom: 10.5,
  latitude: 42.775,
  longitude: -70.975,
  rotation: 30,
  baseMap: "openstreetmap",
  imagery: null,
  area: MERRIMACK,
};
const TODAY = "2026-11-14";
const IMAGE = { layer: "VIIRS_NOAA20_CorrectedReflectance_TrueColor", date: "2026-11-13" } as const;

function createMap(): OlMap {
  const map = new OlMap({ view: new View({ center: fromLonLat([0, 20]), zoom: 2 }) });
  map.setSize([800, 600]);
  return map;
}

beforeEach(() => {
  baseMapStore.set("blue-marble");
  areaStore.set(null);
});

test("a state is written as a fragment with the view in the form of OpenStreetMap", () => {
  expect(writeLink(STATE)).toBe(
    "#map=10.5/42.775/-70.975&rotation=30&basemap=openstreetmap&area=-71.2,42.6,-70.75,42.95",
  );
});

test("the rotation is left out when north is up, and the area when none is set", () => {
  expect(writeLink({ ...STATE, rotation: 0, area: null })).toBe("#map=10.5/42.775/-70.975&basemap=openstreetmap");
  expect(writeLink({ ...STATE, rotation: 360, area: null })).toBe("#map=10.5/42.775/-70.975&basemap=openstreetmap");
});

test("the zoom level is written with two decimals and the centre with five", () => {
  const link = writeLink({ ...STATE, zoom: 9.123456, latitude: 42.123456789, longitude: -70.987654321, area: null });
  expect(link).toBe("#map=9.12/42.12346/-70.98765&rotation=30&basemap=openstreetmap");
});

test("a fragment that was written is read back as the same state", () => {
  // A link without an image of a date says nothing about it.
  expect(readLink(writeLink(STATE), LIMITS)).toEqual({ state: { ...STATE, imagery: undefined }, faults: [] });
});

test("an empty fragment gives nothing and no fault", () => {
  expect(readLink("", LIMITS)).toEqual({ state: {}, faults: [] });
  expect(readLink("#", LIMITS)).toEqual({ state: {}, faults: [] });
});

test("a part with an unknown name is ignored", () => {
  expect(readLink("#other=1&map=3/10/20", LIMITS)).toEqual({
    state: { zoom: 3, latitude: 10, longitude: 20 },
    faults: [],
  });
});

test.each([
  ["a part is missing", "#map=3/10"],
  ["a part is not a number", "#map=3/north/20"],
  ["a number has an exponent", "#map=3/1e1/20"],
  ["a number is Infinity", "#map=Infinity/10/20"],
  ["a number is empty", "#map=3//20"],
  ["the zoom level is below the limits", "#map=-1/10/20"],
  ["the zoom level is above the limits", "#map=29/10/20"],
  ["the latitude is beyond Web Mercator", "#map=3/85.06/20"],
  ["the longitude is beyond 180 degrees", "#map=3/10/180.5"],
])("the view is refused when %s", (_reason, fragment) => {
  expect(readLink(fragment, LIMITS)).toEqual({ state: {}, faults: ["map"] });
});

test("the centre may lie on the highest latitude of Web Mercator, 85.0511 degrees", () => {
  expect(readLink("#map=3/85.0511/20", LIMITS).faults).toEqual([]);
  expect(readLink("#map=3/-85.0511/-180", LIMITS).faults).toEqual([]);
});

test.each([["#rotation=east"], ["#rotation=361"], ["#rotation="], ["#rotation=1e2"]])(
  "the rotation of %j is refused",
  (fragment) => {
    expect(readLink(fragment, LIMITS)).toEqual({ state: {}, faults: ["rotation"] });
  },
);

test.each([
  [0, 0],
  [180, 180],
  [-180, 180],
  [190, -170],
  [-190, 170],
  [360, 0],
  [-90, -90],
])("a rotation of %d degrees is the same as one of %d degrees", (degrees, normal) => {
  expect(normalRotation(degrees)).toBe(normal);
});

test("a background map that Lynkeus does not offer is refused", () => {
  expect(readLink("#basemap=satellite", LIMITS)).toEqual({ state: {}, faults: ["basemap"] });
  expect(readLink("#basemap=", LIMITS)).toEqual({ state: {}, faults: ["basemap"] });
  expect(readLink("#basemap=blue-marble", LIMITS)).toEqual({ state: { baseMap: "blue-marble" }, faults: [] });
});

test.each([
  ["a side is missing", "#area=-71.2,42.6,-70.75"],
  ["a side is not a number", "#area=-71.2,42.6,east,42.95"],
  ["west is not smaller than east", "#area=-70.75,42.6,-71.2,42.95"],
  ["a latitude is beyond 90 degrees", "#area=-71.2,42.6,-70.75,91"],
])("the area is refused when %s", (_reason, fragment) => {
  expect(readLink(fragment, LIMITS)).toEqual({ state: {}, faults: ["area"] });
});

test("the valid parts are returned beside the names of the wrong ones", () => {
  expect(readLink("#map=3/10/20&rotation=east&basemap=moon&area=1,2,3", LIMITS)).toEqual({
    state: { zoom: 3, latitude: 10, longitude: 20 },
    faults: ["rotation", "basemap", "area"],
  });
});

test("the state of the map is read from its view and from the stores", () => {
  const map = createMap();
  map.getView().setCenter(fromLonLat([-70.975, 42.775]));
  map.getView().setZoom(10.5);
  map.getView().setRotation(Math.PI / 6);
  baseMapStore.set("openstreetmap");
  areaStore.set(MERRIMACK);
  const state = mapState(map);
  expect(state?.zoom).toBe(10.5);
  expect(state?.latitude).toBeCloseTo(42.775, 9);
  expect(state?.longitude).toBeCloseTo(-70.975, 9);
  expect(state?.rotation).toBeCloseTo(30, 9);
  expect(state?.baseMap).toBe("openstreetmap");
  expect(state?.area).toEqual(MERRIMACK);
});

test("the address of the map is the address of the page with the state as its fragment", () => {
  const map = createMap();
  expect(mapLink(map, "https://lynkeus.nkua.cloud/#map=1/1/1")).toBe(
    "https://lynkeus.nkua.cloud/#map=2/20/0&basemap=blue-marble",
  );
});

test("opening a link brings the view, the background map and the area to its state", () => {
  const map = createMap();
  const faults = openLink(map, writeLink(STATE));
  expect(faults).toEqual([]);
  const view = map.getView();
  const [longitude, latitude] = toLonLat(view.getCenter() ?? [0, 0]);
  expect(longitude).toBeCloseTo(-70.975, 9);
  expect(latitude).toBeCloseTo(42.775, 9);
  expect(view.getZoom()).toBeCloseTo(10.5, 9);
  expect(view.getRotation()).toBeCloseTo(Math.PI / 6, 9);
  expect(baseMapStore.get()).toBe("openstreetmap");
  expect(areaStore.get()).toEqual(MERRIMACK);
  // The address written from the map again is the one that was opened.
  expect(mapLink(map, "https://lynkeus.nkua.cloud/")).toBe(`https://lynkeus.nkua.cloud/${writeLink(STATE)}`);
});

test("a wrong part changes nothing, and the other parts are applied", () => {
  const map = createMap();
  areaStore.set(MERRIMACK);
  const faults = openLink(map, "#map=99/10/20&basemap=openstreetmap&area=5,5,1,1");
  expect(faults).toEqual(["map", "area"]);
  expect(map.getView().getZoom()).toBe(2);
  expect(baseMapStore.get()).toBe("openstreetmap");
  expect(areaStore.get()).toEqual(MERRIMACK);
});

test("an address without a rotation turns the map north up", () => {
  const map = createMap();
  map.getView().setRotation(1);
  openLink(map, "#map=3/10/20");
  expect(map.getView().getRotation()).toBe(0);
});

test("the parts of a link are taken out of a fragment, and a part of another function stays", () => {
  expect(withoutLink(writeLink(STATE))).toBe("");
  expect(withoutLink("#other=1&map=3/10/20&imagery=a,b&area=1,2,3,4")).toBe("#other=1");
  expect(withoutLink("")).toBe("");
});

test("the message names the parts that could not be read", () => {
  expect(faultMessage(["map"])).toBe(
    "The address of the page gives a view that Lynkeus cannot read. This part was ignored.",
  );
  expect(faultMessage(["map", "basemap", "area"])).toBe(
    "The address of the page gives a view, a basemap and an area that Lynkeus cannot read. These parts were ignored.",
  );
});

test("the imagery of a date is written with the name of its layer and its day, and read back", () => {
  const state: MapState = { ...STATE, baseMap: "imagery", imagery: IMAGE, area: null };
  const link = writeLink(state);
  expect(link).toBe(
    "#map=10.5/42.775/-70.975&rotation=30&basemap=imagery&imagery=VIIRS_NOAA20_CorrectedReflectance_TrueColor,2026-11-13",
  );
  expect(readLink(link, LIMITS, TODAY)).toEqual({
    state: { zoom: 10.5, latitude: 42.775, longitude: -70.975, rotation: 30, baseMap: "imagery", imagery: IMAGE },
    faults: [],
  });
});

test.each([
  ["the layer is not one of NASA GIBS", "#imagery=Landsat,2026-11-13"],
  ["the day is missing", "#imagery=VIIRS_NOAA20_CorrectedReflectance_TrueColor"],
  ["the day is not a day", "#imagery=VIIRS_NOAA20_CorrectedReflectance_TrueColor,2026-02-30"],
  ["the day lies after the present day", "#imagery=VIIRS_NOAA20_CorrectedReflectance_TrueColor,2026-11-15"],
  ["the day lies before the first image", "#imagery=VIIRS_NOAA20_CorrectedReflectance_TrueColor,2017-12-31"],
  ["a third value follows", "#imagery=VIIRS_NOAA20_CorrectedReflectance_TrueColor,2026-11-13,1"],
])("the image of a date is refused when %s", (_reason, fragment) => {
  expect(readLink(fragment, LIMITS, TODAY)).toEqual({ state: {}, faults: ["imagery"] });
});

test("a map without a background map is written and read as the word none", () => {
  expect(writeLink({ ...STATE, baseMap: null, rotation: 0, area: null })).toBe("#map=10.5/42.775/-70.975&basemap=none");
  expect(readLink("#basemap=none", LIMITS)).toEqual({ state: { baseMap: null }, faults: [] });
});

test("opening a link with the imagery of a date shows that image as the background map", () => {
  const map = createMap();
  imageryStore.set({ layer: "MODIS_Terra_CorrectedReflectance_TrueColor", date: "2026-01-01" });
  const faults = openLink(map, `#basemap=imagery&imagery=${IMAGE.layer},2026-11-01`);
  expect(faults).toEqual([]);
  expect(baseMapStore.get()).toBe("imagery");
  expect(imageryStore.get()).toEqual({ layer: IMAGE.layer, date: "2026-11-01" });
  expect(mapState(map)?.imagery).toEqual({ layer: IMAGE.layer, date: "2026-11-01" });
  baseMapStore.set("blue-marble");
  expect(mapState(map)?.imagery).toBeNull();
});

test("opening a link without a background map hides the background map, and the map writes that link again", () => {
  const map = createMap();
  expect(openLink(map, "#map=3/10/20&basemap=none")).toEqual([]);
  expect(baseMapStore.get()).toBeNull();
  expect(mapState(map)?.baseMap).toBeNull();
  expect(mapLink(map, "https://lynkeus.nkua.cloud/")).toBe("https://lynkeus.nkua.cloud/#map=3/10/20&basemap=none");
});
