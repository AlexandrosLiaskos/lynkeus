// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import Feature from "ol/Feature";
import LineString from "ol/geom/LineString";
import Point from "ol/geom/Point";
import Polygon from "ol/geom/Polygon";
import { fromLonLat, get as getProjection } from "ol/proj";
import { beforeEach, expect, test } from "vitest";
import { measureUnitsStore } from "./measure";
import { measureStyle } from "./measureLayer";

const projection = getProjection("EPSG:3857");
if (!projection) {
  throw new Error("the projection of the map is not known");
}
const style = measureStyle(projection);

function labels(feature: Feature): string[] {
  return style(feature, 1000)
    .map((part) => part.getText()?.getText())
    .filter((text) => typeof text === "string");
}

beforeEach(() => {
  measureUnitsStore.set({ distance: "km", area: "km2" });
});

test("a line carries the length of each segment and, at its end, the whole length", () => {
  const line = new Feature(new LineString([fromLonLat([0, 0]), fromLonLat([1, 0]), fromLonLat([1, 2])]));
  // One degree of a great circle on the sphere of OpenLayers is 111.195 km.
  expect(labels(line)).toEqual(["111.195 km", "222.390 km", "333.585 km"]);
  measureUnitsStore.set({ distance: "m", area: "km2" });
  expect(labels(line)).toEqual(["111,195.1 m", "222,390.2 m", "333,585.2 m"]);
});

test("a line of one segment carries its length once", () => {
  expect(labels(new Feature(new LineString([fromLonLat([0, 0]), fromLonLat([1, 0])])))).toEqual(["111.195 km"]);
});

test("a polygon carries the length of each side and its area", () => {
  const ring = [
    [0, -0.5],
    [1, -0.5],
    [1, 0.5],
    [0, 0.5],
    [0, -0.5],
  ].map((place) => fromLonLat(place));
  const found = labels(new Feature(new Polygon([ring])));
  expect(found).toHaveLength(5);
  expect(found.slice(0, 4).every((text) => text.endsWith(" km"))).toBe(true);
  expect(found[4]).toMatch(/^12,36\d\.\d{3} km²$/);
  measureUnitsStore.set({ distance: "km", area: "ha" });
  expect(labels(new Feature(new Polygon([ring])))[4]).toMatch(/^1,236,\d{3}\.\d{2} ha$/);
});

test("the point that follows the pointer and a line of one point carry no label", () => {
  expect(labels(new Feature(new Point([0, 0])))).toEqual([]);
  expect(style(new Feature(new LineString([[0, 0]])), 1000)).toEqual([]);
});
