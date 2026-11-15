// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { fromLonLat } from "ol/proj";
import { expect, test } from "vitest";
import { scaleLatitude, scaleVaries, wrapText } from "./decorations";
import type { Picture } from "./picture";

/** A width of 10 pixels for every character, so that the breaks of a text can be counted. */
const widthOf = (text: string): number => text.length * 10;

function pictureAt(longitude: number, latitude: number, resolution: number): Picture {
  return {
    canvas: document.createElement("canvas"),
    view: {
      projection: "EPSG:3857",
      center: fromLonLat([longitude, latitude]),
      resolution,
      rotation: 0,
      size: [1000, 800],
    },
    credits: [],
  };
}

test("a text is broken between words into lines that fit the width", () => {
  expect(wrapText("one two three four", 90, widthOf)).toEqual(["one two", "three", "four"]);
  expect(wrapText("one two three four", 1000, widthOf)).toEqual(["one two three four"]);
});

test("a word wider than the width stands alone, and an empty text gives no line", () => {
  expect(wrapText("a extraordinarily b", 50, widthOf)).toEqual(["a", "extraordinarily", "b"]);
  expect(wrapText("   ", 50, widthOf)).toEqual([]);
});

test("the latitude of the scale bar is written with one decimal and its hemisphere", () => {
  expect(scaleLatitude(pictureAt(-70.975, 42.775, 100))).toBe("at latitude 42.8\u00b0 N");
  expect(scaleLatitude(pictureAt(18.5, -33.92, 100))).toBe("at latitude 33.9\u00b0 S");
  expect(scaleLatitude(pictureAt(0, 0, 100))).toBe("at latitude 0\u00b0");
});

test("the scale bar names a latitude only when the scale differs by more than 1 per cent inside the picture", () => {
  // At 76 metres per pixel the picture is 0.4 degrees high, and the scale differs by 0.3 per cent.
  expect(scaleVaries(pictureAt(-70.975, 42.775, 76.437))).toBe(false);
  // At 2446 metres per pixel the picture is 13 degrees high, and the scale differs by more than 10 per cent.
  expect(scaleVaries(pictureAt(-70.975, 42.775, 2445.98))).toBe(true);
});
