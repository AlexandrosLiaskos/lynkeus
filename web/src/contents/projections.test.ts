// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { transform } from "ol/proj";
import { expect, test } from "vitest";
import { projectionOf } from "./projections";

/**
 * Points in degrees of longitude and latitude with their coordinates in a projection, in metres, as PROJ 9.8.1
 * computes them (through pyproj 3.7.2).
 */
const POINTS: readonly (readonly [string, readonly [number, number], readonly [number, number]])[] = [
  ["EPSG:32619", [-71.0, 42.8], [336452.9617, 4740545.358]],
  ["EPSG:32619", [-70.75, 42.95], [357243.1535, 4756748.0993]],
  ["EPSG:32734", [23.7, -33.9], [749666.1349, 6245649.2734]],
  ["EPSG:6933", [-71.0, 42.8], [-6850525.8978, 4976576.2218]],
  ["EPSG:6933", [23.7, 38.0], [2286724.8419, 4507752.6993]],
  ["EPSG:6933", [120.5, -33.25], [11626596.7702, -4013087.3315]],
  ["EPSG:3413", [-45.0, 75.0], [0.0, -1633879.4975]],
  ["EPSG:3413", [-30.0, 82.5], [210567.434, -785848.362]],
  ["EPSG:3413", [10.0, 65.0], [2252871.0013, -1577477.2577]],
  ["EPSG:3031", [0.0, -75.0], [0.0, 1638783.2384]],
  ["EPSG:3031", [140.0, -67.5], [1591104.544, -1896204.5565]],
  ["EPSG:3031", [-60.0, -80.0], [-943257.0779, 544589.7278]],
];

test("the projections of NISAR products are known", () => {
  for (const code of ["EPSG:32619", "EPSG:32734", "EPSG:6933", "EPSG:3413", "EPSG:3031", "EPSG:4326", "EPSG:3857"]) {
    expect(projectionOf(code)?.getCode(), code).toBe(code);
  }
  expect(projectionOf("EPSG:2100")).toBeNull();
});

test("coordinates in each projection agree with PROJ within one millimetre", () => {
  for (const [code, degrees, metres] of POINTS) {
    projectionOf(code);
    const [x = Number.NaN, y = Number.NaN] = transform([...degrees], "EPSG:4326", code);
    expect(Math.hypot(x - metres[0], y - metres[1]), `${code} at ${String(degrees)}`).toBeLessThan(0.001);
  }
});

test("coordinates return from each projection to the same degrees", () => {
  for (const [code, degrees, metres] of POINTS) {
    projectionOf(code);
    const [longitude = Number.NaN, latitude = Number.NaN] = transform([...metres], code, "EPSG:4326");
    // One hundred-millionth of a degree is about one millimetre on the ground.
    expect(Math.abs(longitude - degrees[0]), `${code} at ${String(degrees)}`).toBeLessThan(1e-8);
    expect(Math.abs(latitude - degrees[1]), `${code} at ${String(degrees)}`).toBeLessThan(1e-8);
  }
});

test("the corners of the test file fall where PROJ puts them on the Web Mercator map", () => {
  projectionOf("EPSG:32619");
  // The upper left and the lower right corner of testdata/backscatter.json, in EPSG:32619 and in EPSG:3857.
  const corners: readonly (readonly [readonly [number, number], readonly [number, number]])[] = [
    [
      [322080, 4757610],
      [-7923838.2577, 5304418.7254],
    ],
    [
      [323360, 4756650],
      [-7922059.0465, 5303150.2564],
    ],
  ];
  for (const [projected, mercator] of corners) {
    const [x = Number.NaN, y = Number.NaN] = transform([...projected], "EPSG:32619", "EPSG:3857");
    expect(Math.hypot(x - mercator[0], y - mercator[1])).toBeLessThan(0.001);
  }
});
