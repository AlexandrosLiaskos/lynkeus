// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
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

test("a map wider than the world at its first zoom level shows one world, and the scale is that of its resolution", () => {
  // The first view of the page: zoom level 2 at latitude 20 degrees, on a map 1440 pixels wide. At zoom level 2
  // the world is 1024 pixels wide, so the map shows one world over its width: 40,075,016.686 m over 1440 pixels.
  // On the page the map gives the size of its element to the view; the test gives it in the same way.
  const map = new OlMap({ view: new View({ center: fromLonLat([0, 20]), zoom: 2 }) });
  const view = map.getView();
  view.setViewportSize([1440, 718]);
  expect(view.getResolution()).toBeCloseTo(27829.872698318395, 6);
  expect(view.getZoom()).toBeCloseTo(2.4919, 4);
  // 27,829.8727 m times cos(20 degrees), over 0.28 mm.
  expect(scaleAt(view.getProjection(), view.getResolution() ?? NaN, view.getCenter() ?? [])).toBeCloseTo(
    93398307.19,
    1,
  );
  expect(formatScale(scaleAt(view.getProjection(), view.getResolution() ?? NaN, view.getCenter() ?? []))).toBe(
    "1:93,398,307",
  );
  // On a map 390 pixels wide the same view keeps zoom level 2: 39,135.7585 m times cos(20 degrees), over 0.28 mm.
  view.setViewportSize([390, 560]);
  view.setZoom(2);
  expect(view.getResolution()).toBeCloseTo(39135.75848201024, 6);
  expect(formatScale(scaleAt(view.getProjection(), view.getResolution() ?? NaN, view.getCenter() ?? []))).toBe(
    "1:131,341,369",
  );
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
