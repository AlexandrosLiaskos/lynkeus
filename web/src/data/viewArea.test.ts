import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat } from "ol/proj";
import { expect, test } from "vitest";
import { isArea } from "../shared/area";
import { viewArea } from "./viewArea";

test("the view of the map is returned as an area around its centre", () => {
  const map = new OlMap({ view: new View({ center: fromLonLat([-70.9, 42.8]), zoom: 10 }) });
  map.setSize([800, 600]);
  const area = viewArea(map);
  expect(isArea(area)).toBe(true);
  expect((area.west + area.east) / 2).toBeCloseTo(-70.9, 3);
  expect(area.west).toBeLessThan(-70.9);
  expect(area.south).toBeLessThan(42.8);
  expect(area.north).toBeGreaterThan(42.8);
  // At zoom level 10 one pixel of Web Mercator is 152.87 metres at the equator, so 800 pixels are 1.0986 degrees.
  expect(area.east - area.west).toBeCloseTo(1.0986, 3);
});

test("a view wider than the Earth is cut at the limits of longitude and latitude", () => {
  const map = new OlMap({ view: new View({ center: fromLonLat([0, 0]), zoom: 0 }) });
  map.setSize([2000, 2000]);
  const area = viewArea(map);
  expect(isArea(area)).toBe(true);
  expect([area.west, area.east]).toEqual([-180, 180]);
  // Web Mercator ends at 85.0511 degrees of latitude, and the view reaches past it.
  expect(area.south).toBeLessThanOrEqual(-85.0511);
  expect(area.north).toBeGreaterThanOrEqual(85.0511);
});
