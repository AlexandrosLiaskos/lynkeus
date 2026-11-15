// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import GeoJSON from "ol/format/GeoJSON";
import { expect, test } from "vitest";
import type { Area } from "../shared/area";
import { areaFile, areaGeoJson } from "./areaFile";

// The area of the sample files: the lower Merrimack River, Massachusetts.
const MERRIMACK: Area = { west: -71.2, south: 42.6, east: -70.75, north: 42.95 };

/** Twice the area that a ring encloses, in square degrees. It is positive for a counterclockwise ring. */
function twiceSignedArea(ring: readonly (readonly [number, number])[]): number {
  return ring.reduce((sum, [x, y], index) => {
    const [nextX, nextY] = ring[(index + 1) % ring.length] ?? [0, 0];
    return sum + (x * nextY - nextX * y);
  }, 0);
}

test("the area becomes a feature collection with one polygon, as RFC 7946 defines them", () => {
  const collection = areaGeoJson(MERRIMACK);
  // Section 3.3: a feature collection has the member "features", an array of features.
  expect(collection.type).toBe("FeatureCollection");
  expect(collection.features).toHaveLength(1);
  // Section 3.2: a feature has the members "geometry" and "properties".
  const [feature] = collection.features;
  expect(feature.type).toBe("Feature");
  expect(feature.properties).toEqual({ name: "Area" });
  expect(feature.geometry.type).toBe("Polygon");
  // Section 4: no member names a coordinate reference system.
  expect(JSON.stringify(collection)).not.toContain("crs");
});

test("the ring of the polygon is closed, has four corners and runs counterclockwise", () => {
  const [ring] = areaGeoJson(MERRIMACK).features[0].geometry.coordinates;
  // Section 3.1.6: a linear ring has four or more positions, and the first and the last are the same.
  expect(ring).toEqual([
    [-71.2, 42.6],
    [-70.75, 42.6],
    [-70.75, 42.95],
    [-71.2, 42.95],
    [-71.2, 42.6],
  ]);
  expect(ring.at(-1)).toEqual(ring[0]);
  // Section 3.1.6: an exterior ring is counterclockwise. The rectangle is 0.45 by 0.35 degrees.
  expect(twiceSignedArea(ring.slice(0, -1))).toBeCloseTo(2 * 0.45 * 0.35, 9);
});

test("every position is a longitude and a latitude inside the limits of WGS 84", () => {
  const world: Area = { west: -180, south: -90, east: 180, north: 90 };
  for (const area of [MERRIMACK, world]) {
    for (const position of areaGeoJson(area).features[0].geometry.coordinates[0]) {
      expect(position).toHaveLength(2);
      expect(Math.abs(position[0])).toBeLessThanOrEqual(180);
      expect(Math.abs(position[1])).toBeLessThanOrEqual(90);
    }
  }
});

test("the bounding box gives west, south, east and north, in the order of section 5", () => {
  expect(areaGeoJson(MERRIMACK).bbox).toEqual([-71.2, 42.6, -70.75, 42.95]);
});

test("the file is GeoJSON text that OpenLayers reads back as the same rectangle", async () => {
  const file = areaFile(MERRIMACK);
  expect(file.type).toBe("application/geo+json");
  const text = await file.text();
  expect(text.endsWith("}\n")).toBe(true);
  const features = new GeoJSON().readFeatures(JSON.parse(text));
  expect(features).toHaveLength(1);
  expect(features[0]?.getGeometry()?.getType()).toBe("Polygon");
  expect(features[0]?.getGeometry()?.getExtent()).toEqual([-71.2, 42.6, -70.75, 42.95]);
  expect(features[0]?.get("name")).toBe("Area");
});

test("a coordinate keeps every decimal that the area holds", async () => {
  const area: Area = { west: 22.123456789, south: 36.4, east: 22.6, north: 36.987654321 };
  const text = await areaFile(area).text();
  expect(text).toContain("22.123456789");
  expect(text).toContain("36.987654321");
});
