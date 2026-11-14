import { fromLonLat, toLonLat } from "ol/proj";
import { expect, test } from "vitest";
import { createMap, northUp, rotateBy, ROTATION_STEP, showBaseMap, showExtent, showWorld } from "./map";

function start() {
  const map = createMap();
  map.setSize([800, 600]);
  return map;
}

test("the map has one layer for each background map, under every other layer", () => {
  const layers = start().getLayers().getArray();
  expect(layers.map((layer): unknown => layer.get("id"))).toEqual(["blue-marble", "openstreetmap", "imagery"]);
  expect(layers.map((layer) => layer.getZIndex())).toEqual([0, 0, 0]);
});

test("one background map is shown at a time, or none", () => {
  const map = start();
  showBaseMap(map, "openstreetmap");
  expect(
    map
      .getLayers()
      .getArray()
      .map((layer) => layer.getVisible()),
  ).toEqual([false, true, false]);
  showBaseMap(map, null);
  expect(
    map
      .getLayers()
      .getArray()
      .some((layer) => layer.getVisible()),
  ).toBe(false);
});

test("the map turns clockwise by an angle in degrees and returns to north", () => {
  const map = start();
  rotateBy(map, ROTATION_STEP, 0);
  rotateBy(map, ROTATION_STEP, 0);
  expect(map.getView().getRotation()).toBeCloseTo(Math.PI / 6, 12);
  rotateBy(map, -45, 0);
  expect(map.getView().getRotation()).toBeCloseTo(-Math.PI / 12, 12);
  northUp(map, 0);
  expect(map.getView().getRotation()).toBe(0);
});

test("a rectangle is shown as a whole, with a margin around it", () => {
  const map = start();
  const [west = 0, south = 0] = fromLonLat([-71.2, 42.6]);
  const [east = 0, north = 0] = fromLonLat([-70.75, 42.95]);
  showExtent(map, [west, south, east, north], 0);
  const view = map.getView();
  const [longitude = 0, latitude = 0] = toLonLat(view.getCenter() ?? [0, 0]);
  expect(longitude).toBeCloseTo(-70.975, 6);
  expect(latitude).toBeGreaterThan(42.6);
  expect(latitude).toBeLessThan(42.95);
  // The rectangle and its margin of 40 pixels on each side fit in the 800 by 600 pixels of the map.
  const resolution = view.getResolution() ?? 0;
  expect((east - west) / resolution).toBeLessThanOrEqual(720 + 1e-6);
  expect((north - south) / resolution).toBeLessThanOrEqual(520 + 1e-6);
  expect(Math.max((east - west) / resolution / 720, (north - south) / resolution / 520)).toBeCloseTo(1, 6);
});

test("the view of the whole world is centred on the meridian of Greenwich", () => {
  const map = start();
  map.getView().setCenter(fromLonLat([100, 50]));
  map.getView().setZoom(9);
  showWorld(map, 0);
  expect(map.getView().getZoom()).toBe(2);
  expect(toLonLat(map.getView().getCenter() ?? [1, 1])[0]).toBeCloseTo(0, 9);
});
