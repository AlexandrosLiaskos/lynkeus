// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { expect, test } from "vitest";
import { isWgs84, readShapefile } from "./shapefile";
import { shpOf, UTM_PRJ, WGS84_PRJ } from "./testFiles";

// A square whose points run clockwise, as the outer ring of a polygon does in a shapefile.
const OUTER: [number, number][] = [
  [0, 0],
  [0, 2],
  [2, 2],
  [2, 0],
  [0, 0],
];
// A hole runs counter-clockwise.
const HOLE: [number, number][] = [
  [0.5, 0.5],
  [1.5, 0.5],
  [1.5, 1.5],
  [0.5, 1.5],
  [0.5, 0.5],
];

test("the outer rings of the polygons of a shapefile are read, without their holes", () => {
  const island: [number, number][] = OUTER.map(([x, y]) => [x + 10, y + 10]);
  const { rings, others, box } = readShapefile(shpOf([{ rings: [OUTER, HOLE, island] }, { rings: [island] }]).buffer);
  expect(rings).toEqual([OUTER, island, island]);
  expect(others).toBe(0);
  expect(box).toEqual([0, 0, 12, 12]);
});

test("the first ring of a polygon counts as outer even when it runs counter-clockwise", () => {
  const { rings } = readShapefile(shpOf([{ rings: [HOLE] }]).buffer);
  expect(rings).toEqual([HOLE]);
});

test("the shapes that are not polygons are counted", () => {
  const { rings, others, box } = readShapefile(shpOf([{ point: [5, 6] }, { point: [7, 8] }]).buffer);
  expect(rings).toEqual([]);
  expect(others).toBe(2);
  expect(box).toEqual([5, 6, 7, 8]);
});

test("a file that is not the main file of a shapefile is refused", () => {
  expect(() => readShapefile(new ArrayBuffer(100))).toThrow("cannot be read");
  expect(() => readShapefile(new ArrayBuffer(10))).toThrow("cannot be read");
});

test("a shapefile that ends inside a record is refused", () => {
  const file = shpOf([{ rings: [OUTER] }]);
  expect(() => readShapefile(file.slice(0, file.length - 8).buffer)).toThrow("is damaged");
});

test("the projection file tells geographic coordinates on WGS 84 from other systems", () => {
  expect(isWgs84(WGS84_PRJ)).toBe(true);
  expect(isWgs84('GEOGCRS["WGS 84",ENSEMBLE["World Geodetic System 1984 ensemble"]]')).toBe(true);
  expect(isWgs84(UTM_PRJ)).toBe(false);
  expect(isWgs84('GEOGCS["GCS_GGRS_1987",DATUM["D_GGRS_1987"]]')).toBe(false);
  expect(isWgs84("")).toBe(false);
});
