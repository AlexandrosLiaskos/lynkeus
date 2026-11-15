// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { expect, test } from "vitest";
import { formatAngle, parseAngle } from "./coordinates";

test.each([
  ["42.8", "latitude", 42.8],
  ["-70.9", "longitude", -70.9],
  ["+70.9", "longitude", 70.9],
  ["70.9 W", "longitude", -70.9],
  ["70.9w", "longitude", -70.9],
  ["S 43.77", "latitude", -43.77],
  ["170.13E", "longitude", 170.13],
  ["42.8° N", "latitude", 42.8],
  ["90", "latitude", 90],
  ["180 W", "longitude", -180],
] as const)("decimal degrees %s are read", (text, axis, value) => {
  expect(parseAngle(text, axis)).toBeCloseTo(value, 12);
});

test.each([
  // 42 + 48/60 + 30/3600 = 42.808333...
  ["42° 48′ 30″ N", "latitude", 42 + 48 / 60 + 30 / 3600],
  ["42°48'30\"N", "latitude", 42 + 48 / 60 + 30 / 3600],
  ["42 48 30", "latitude", 42 + 48 / 60 + 30 / 3600],
  ["118°50'45.0\"W", "longitude", -(118 + 50 / 60 + 45 / 3600)],
  ["33°38'1.05\"N", "latitude", 33 + 38 / 60 + 1.05 / 3600],
  ["-70 54", "longitude", -70.9],
  ["42 48.5 N", "latitude", 42 + 48.5 / 60],
] as const)("degrees, minutes and seconds %s are read", (text, axis, value) => {
  expect(parseAngle(text, axis)).toBeCloseTo(value, 12);
});

test.each([
  ["", "latitude"],
  ["north", "latitude"],
  ["42.8 E", "latitude"],
  ["70.9 N", "longitude"],
  ["-42.8 S", "latitude"],
  ["90.1", "latitude"],
  ["180.5", "longitude"],
  ["42 60 0", "latitude"],
  ["42 10 60", "latitude"],
  ["42.5 30", "latitude"],
  ["42 30.5 10", "latitude"],
  ["1 2 3 4", "latitude"],
  ["4e1", "latitude"],
  ["42,8", "latitude"],
] as const)("the text %s is not an angle", (text, axis) => {
  expect(parseAngle(text, axis)).toBeNull();
});

test("an angle is written with five decimals and the letter of its hemisphere", () => {
  expect(formatAngle(42.8, "latitude")).toBe("42.80000° N");
  expect(formatAngle(-70.9, "longitude")).toBe("70.90000° W");
  expect(formatAngle(0, "longitude")).toBe("0.00000° E");
});
