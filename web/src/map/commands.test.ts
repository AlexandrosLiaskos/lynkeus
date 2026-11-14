import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat, toLonLat } from "ol/proj";
import { beforeEach, expect, test, vi } from "vitest";
import { selectedLayerStore } from "../contents/state";
import { areaStore, isArea } from "../shared/area";
import { messagesStore } from "../shared/messages/messages";
import { AREA_FAULTS } from "./area";
import { NOTICES, setAreaFromView, showNextView, showPreviousView, zoomToArea, zoomToLayer } from "./commands";

vi.mock("../contents/display", async () => {
  const { transformExtent } = await import("ol/proj");
  // The simulated browser reads no file, so the extent of a layer is given here: the box of the sample files.
  const box = transformExtent([-71.2, 42.6, -70.75, 42.95], "EPSG:4326", "EPSG:3857");
  return { extentOf: (_map: unknown, id: string) => Promise.resolve(id === "sample" ? box : null) };
});

function start(longitude: number, latitude: number, zoom: number) {
  const map = new OlMap({ view: new View({ center: fromLonLat([longitude, latitude]), zoom }) });
  map.setSize([800, 600]);
  return map;
}

function messages() {
  return messagesStore.get().map(({ kind, text }) => [kind, text]);
}

beforeEach(() => {
  selectedLayerStore.set(null);
  areaStore.set(null);
  messagesStore.set([]);
});

test("the area is set to what the map shows", () => {
  setAreaFromView(start(-70.9, 42.8, 10));
  const area = areaStore.get();
  expect(isArea(area)).toBe(true);
  // At zoom level 10 one pixel of Web Mercator is 152.87 metres at the equator, so 800 pixels are 1.0986 degrees.
  expect((area?.east ?? 0) - (area?.west ?? 0)).toBeCloseTo(1.0986, 3);
  expect(((area?.east ?? 0) + (area?.west ?? 0)) / 2).toBeCloseTo(-70.9, 4);
  expect(messages()).toEqual([]);
});

test("a view across the meridian of 180 degrees is refused in a sentence and the area stays", () => {
  const before = { west: 0, south: 0, east: 1, north: 1 };
  areaStore.set(before);
  setAreaFromView(start(179.9, 0, 10));
  expect(areaStore.get()).toBe(before);
  expect(messages()).toEqual([["error", AREA_FAULTS.meridian]]);
});

test("the map moves to the whole of the area", () => {
  const map = start(0, 0, 3);
  areaStore.set({ west: -71.2, south: 42.6, east: -70.75, north: 42.95 });
  zoomToArea(map, 0);
  const [longitude = 0, latitude = 0] = toLonLat(map.getView().getCenter() ?? [0, 0]);
  expect(longitude).toBeCloseTo(-70.975, 6);
  expect(latitude).toBeCloseTo(42.775, 1);
  expect(map.getView().getZoom()).toBeGreaterThan(9);
});

test("without an area, or without another view, a notice says so", () => {
  const map = start(0, 0, 3);
  zoomToArea(map, 0);
  showPreviousView(map);
  showNextView(map);
  expect(messages()).toEqual([
    ["info", NOTICES.noArea],
    ["info", NOTICES.noEarlierView],
    ["info", NOTICES.noLaterView],
  ]);
});

test("the map moves to the whole of the selected layer", async () => {
  const map = start(0, 0, 3);
  selectedLayerStore.set("sample");
  await zoomToLayer(map, 0);
  const [longitude = 0, latitude = 0] = toLonLat(map.getView().getCenter() ?? [0, 0]);
  expect(longitude).toBeCloseTo(-70.975, 6);
  expect(latitude).toBeCloseTo(42.775, 2);
  expect(map.getView().getZoom()).toBeGreaterThan(9);
  expect(messages()).toEqual([]);
});

test("without a selected layer, or without its extent, a sentence says so", async () => {
  const map = start(0, 0, 3);
  await zoomToLayer(map, 0);
  selectedLayerStore.set("unread");
  await zoomToLayer(map, 0);
  expect(messages()).toEqual([
    ["info", NOTICES.noLayer],
    ["error", NOTICES.noExtent],
  ]);
  expect(map.getView().getZoom()).toBe(3);
});
