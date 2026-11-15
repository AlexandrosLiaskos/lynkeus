// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { expect, test } from "vitest";
import { isArea } from "./area";

test("a rectangle inside the limits of longitude and latitude is an area", () => {
  expect(isArea({ west: -180, south: -90, east: 180, north: 90 })).toBe(true);
  expect(isArea({ west: 22.2, south: 36.4, east: 22.6, north: 36.9 })).toBe(true);
});

test.each([
  ["west is not smaller than east", { west: 10, south: 0, east: 10, north: 1 }],
  ["south is not smaller than north", { west: 0, south: 5, east: 1, north: 4 }],
  ["a longitude is outside the limits", { west: -181, south: 0, east: 1, north: 1 }],
  ["a latitude is outside the limits", { west: 0, south: 0, east: 1, north: 91 }],
  ["a side is missing", { west: 0, south: 0, east: 1 }],
  ["a side is not a number", { west: "0", south: 0, east: 1, north: 1 }],
  ["a side is not finite", { west: Number.NaN, south: 0, east: 1, north: 1 }],
  ["the value is null", null],
])("a value is not an area when %s", (_reason, value) => {
  expect(isArea(value)).toBe(false);
});
