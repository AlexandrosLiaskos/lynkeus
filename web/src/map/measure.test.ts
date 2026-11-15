// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import LineString from "ol/geom/LineString";
import Polygon from "ol/geom/Polygon";
import { fromLonLat, get as getProjection, toLonLat } from "ol/proj";
import { expect, test } from "vitest";
import { arcBetween, EARTH_RADIUS, formatArea, formatDistance, measureLine, measurePolygon } from "./measure";

const projection = getProjection("EPSG:3857");
if (!projection) {
  throw new Error("the projection of the map is not known");
}

function line(...places: [number, number][]) {
  return new LineString(places.map((place) => fromLonLat(place)));
}

function box(west: number, south: number, east: number, north: number) {
  return new Polygon([
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ].map((place) => fromLonLat(place)),
  ]);
}

test("OpenLayers measures on a sphere with the mean radius of the WGS 84 ellipsoid", () => {
  expect(EARTH_RADIUS).toBe(6371008.8);
  // One degree of a great circle on that sphere.
  const degree = (Math.PI * EARTH_RADIUS) / 180;
  expect(measureLine(line([0, 0], [1, 0]), projection).length).toBeCloseTo(degree, 6);
  expect(measureLine(line([30, 60], [30, 61]), projection).length).toBeCloseTo(degree, 6);
});

test("a line gives the length of each segment and their sum", () => {
  const { kind, segments, length, area } = measureLine(line([0, 0], [1, 0], [1, 2]), projection);
  const degree = (Math.PI * EARTH_RADIUS) / 180;
  expect(kind).toBe("distance");
  expect(area).toBeNull();
  expect(segments).toHaveLength(2);
  expect(segments[0]).toBeCloseTo(degree, 6);
  expect(segments[1]).toBeCloseTo(2 * degree, 6);
  expect(length).toBeCloseTo(3 * degree, 6);
});

test("a polygon gives its area, its sides and its perimeter", () => {
  const { kind, segments, length, area } = measurePolygon(box(0, -0.5, 1, 0.5), projection);
  const degree = (Math.PI * EARTH_RADIUS) / 180;
  expect(kind).toBe("area");
  expect(segments).toHaveLength(4);
  expect(length).toBeCloseTo(
    segments.reduce((sum, side) => sum + side, 0),
    6,
  );
  // A square of one degree on the equator is close to a plane square of that side.
  expect((area ?? 0) / (degree * degree)).toBeCloseTo(1, 4);
});

test("lengths and areas are written in the chosen unit", () => {
  expect(formatDistance(12345.678, "m")).toBe("12,345.7 m");
  expect(formatDistance(12345.678, "km")).toBe("12.346 km");
  expect(formatArea(1234567.8, "m2")).toBe("1,234,568 m²");
  expect(formatArea(1234567.8, "ha")).toBe("123.46 ha");
  expect(formatArea(1234567.8, "km2")).toBe("1.235 km²");
});

test("the great circle between two points is drawn through points on it", () => {
  // The great circle between two points of the parallel of 60 degrees north passes north of that parallel.
  const from = fromLonLat([-60, 60]);
  const to = fromLonLat([60, 60]);
  const arc = arcBetween(from, to, projection, 10000);
  expect(arc.length).toBeGreaterThan(10);
  expect(arc[0]?.[0]).toBeCloseTo(from[0] ?? 0, 3);
  expect(arc[0]?.[1]).toBeCloseTo(from[1] ?? 0, 3);
  expect(arc.at(-1)?.[0]).toBeCloseTo(to[0] ?? 0, 3);
  const middle = toLonLat(arc[Math.floor(arc.length / 2)] ?? [0, 0]);
  expect(middle[0]).toBeCloseTo(0, 6);
  // tan(latitude) = tan(60 degrees) / cos(60 degrees) at the highest point of that great circle.
  expect(middle[1]).toBeCloseTo((Math.atan(Math.tan(Math.PI / 3) / Math.cos(Math.PI / 3)) * 180) / Math.PI, 6);
});

test("a great circle across the meridian of 180 degrees continues into the repeated world", () => {
  const from = fromLonLat([170, 10]);
  const to = fromLonLat([-170, 20]);
  const started = performance.now();
  const arc = arcBetween(from, to, projection, 1000);
  expect(performance.now() - started).toBeLessThan(200);
  expect(arc.length).toBeLessThan(500);
  const xs = arc.map(([x = 0]) => x);
  expect(xs.every((x, index) => index === 0 || x > (xs[index - 1] ?? 0))).toBe(true);
  // The end lies 20 degrees of longitude east of the start: 20/360 of the width of the world.
  expect((xs.at(-1) ?? 0) - (xs[0] ?? 0)).toBeCloseTo((2 * Math.PI * 6378137 * 20) / 360, 3);
});

test("a short segment is a straight line between its two points", () => {
  const from = fromLonLat([-71.2, 42.6]);
  const to = fromLonLat([-71.19, 42.61]);
  expect(arcBetween(from, to, projection, 10)).toHaveLength(2);
});

test("the values that are compared with pyproj are printed", () => {
  const values = {
    d_low: measureLine(line([10, 1], [11, 2]), projection).length,
    d_sample: measureLine(line([-71.2, 42.6], [-70.75, 42.95]), projection).length,
    d_high: measureLine(line([20, 78], [25, 79]), projection).length,
    d_long: measureLine(line([-74, 40.7], [-3.7, 40.4]), projection).length,
    a_low: measurePolygon(box(10, 1, 11, 2), projection).area,
    a_sample: measurePolygon(box(-71.2, 42.6, -70.75, 42.95), projection).area,
    a_high: measurePolygon(box(20, 78, 25, 79), projection).area,
    p_sample: measurePolygon(box(-71.2, 42.6, -70.75, 42.95), projection).length,
  };
  console.log(`OL_VALUES ${JSON.stringify(values)}`);
  expect(Object.values(values).every((value) => typeof value === "number" && value > 0)).toBe(true);
});
