import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat } from "ol/proj";
import { expect, test } from "vitest";
import { formatScale, parseScale, PIXEL_SIZE, resolutionForScale, scaleAt, SCALES, showScale } from "./scale";

// The size of one pixel of Web Mercator at zoom level 0, in metres: the equator of WGS 84 over 256 pixels.
const LEVEL_0 = (2 * Math.PI * 6378137) / 256;

test("at the equator the scale is the size of a pixel on the ground over its size on the screen", () => {
  // 156,543.0339 metres over 0.28 millimetres.
  expect(scaleAt("EPSG:3857", LEVEL_0, [0, 0])).toBeCloseTo(559082264.0287178, 3);
  expect(scaleAt("EPSG:3857", LEVEL_0 / 2 ** 10, [0, 0])).toBeCloseTo(545978.7734655447, 6);
});

test("at latitude 60 degrees the same pixel is half as long on the ground, and the scale is twice as large", () => {
  const northing = 8399737.889818355;
  expect(fromLonLat([0, 60])[1]).toBeCloseTo(northing, 6);
  expect(scaleAt("EPSG:3857", LEVEL_0 / 2 ** 10, [0, northing])).toBeCloseTo(545978.7734655447 / 2, 6);
});

test("the resolution for a scale gives that scale back", () => {
  const point = fromLonLat([-70.975, 42.775]);
  const resolution = resolutionForScale("EPSG:3857", 25_000, point, 100);
  // 25,000 times 0.28 millimetres is 7 metres on the ground, which the projection stretches by 1 / cos(latitude).
  expect(resolution).toBeCloseTo(7 / Math.cos((42.775 * Math.PI) / 180), 9);
  expect(scaleAt("EPSG:3857", resolution, point)).toBeCloseTo(25_000, 6);
});

test("the map is set to a scale at its centre", () => {
  const map = new OlMap({ view: new View({ center: fromLonLat([-70.975, 42.775]), zoom: 10 }) });
  const view = map.getView();
  expect(showScale(map, 25_000)).toBe(true);
  expect(scaleAt(view.getProjection(), view.getResolution() ?? NaN, view.getCenter() ?? [])).toBeCloseTo(25_000, 6);
});

test("a scale that the map cannot show gives the nearest one and is reported", () => {
  const map = new OlMap({ view: new View({ center: fromLonLat([-70.975, 42.775]), zoom: 10 }) });
  const view = map.getView();
  expect(showScale(map, 1)).toBe(false);
  expect(view.getResolution()).toBeCloseTo(view.getMinResolution(), 12);
});

test("a scale is written with its thousands apart", () => {
  expect(formatScale(25_000)).toBe("1:25,000");
  expect(formatScale(400_762.7554)).toBe("1:400,763");
  expect(formatScale(559_082_264.03)).toBe("1:559,082,264");
});

test("a typed scale is read with or without its first part and its separators", () => {
  expect(parseScale("1:25,000")).toBe(25_000);
  expect(parseScale(" 1 : 25 000 ")).toBe(25_000);
  expect(parseScale("1/25000")).toBe(25_000);
  expect(parseScale("25000")).toBe(25_000);
  expect(parseScale("2500.5")).toBe(2500.5);
  expect(parseScale("1")).toBe(1);
});

test("a text that is not a scale is refused", () => {
  for (const text of ["", "abc", "1:", "1:0", "0", "-25000", "1:25,000 m", "2:25000", "1e5"]) {
    expect(parseScale(text)).toBeNull();
  }
});

test("the list of scales runs from the smallest scale to the largest", () => {
  expect(SCALES.length).toBe(17);
  expect([...SCALES].sort((a, b) => b - a)).toEqual(SCALES);
  expect(PIXEL_SIZE).toBe(0.00028);
});
