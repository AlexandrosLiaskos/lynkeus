// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { asArray } from "ol/color";
import Graticule from "ol/layer/Graticule";
import { expect, test } from "vitest";
import {
  createGraticule,
  GRATICULE_LAYER_ID,
  label,
  LABEL_GAP,
  LATITUDE_LABEL,
  LINE,
  LINE_EDGE,
  LONGITUDE_LABEL,
} from "./graticule";

/**
 * Return the relative luminance of a colour, as the Web Content Accessibility Guidelines 2.2 define it: 0 for
 * black and 1 for white.
 */
function luminance(colour: unknown): number {
  if (typeof colour !== "string" && !Array.isArray(colour)) {
    throw new Error("The colour is not a text or a list of numbers.");
  }
  const [red = 0, green = 0, blue = 0] = asArray(colour as string | number[]).map((channel) => {
    const share = channel / 255;
    return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Return the contrast ratio of two relative luminances, from 1 to 21. */
function contrast(first: number, second: number): number {
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test("the lines of latitude and longitude start hidden and are drawn above the layers of the map", () => {
  const graticule = createGraticule();
  expect(graticule.get("id")).toBe(GRATICULE_LAYER_ID);
  expect(graticule.getVisible()).toBe(false);
  const layers = graticule.getLayers().getArray();
  expect(layers.every((layer) => layer instanceof Graticule)).toBe(true);
  expect(layers.map((layer) => layer.getZIndex())).toEqual([1000, 1001]);
});

test("the white edge is half a pixel wide on each side of a line and 1 pixel wide around the text of a value", () => {
  expect(LINE.getWidth()).toBe(1);
  expect(((LINE_EDGE.getWidth() ?? 0) - (LINE.getWidth() ?? 0)) / 2).toBe(0.5);
  // The edge of a text is drawn along the outline of the letters, and the letters cover its inner half.
  expect((label({}).getStroke()?.getWidth() ?? 0) / 2).toBe(1);
});

test("the lines and the values have the same dark colour and the same white edge", () => {
  const text = label({});
  expect(text.getFill()?.getColor()).toBe(LINE.getColor());
  expect(text.getStroke()?.getColor()).toBe(LINE_EDGE.getColor());
});

test("the dark colour has a contrast of 17.2 to 1 with its white edge", () => {
  expect(contrast(luminance(LINE.getColor()), luminance(LINE_EDGE.getColor()))).toBeCloseTo(17.22, 2);
});

test("on a background of any grey, the dark colour or the white edge has a contrast of more than 4.1 to 1 with it", () => {
  const dark = luminance(LINE.getColor());
  const white = luminance(LINE_EDGE.getColor());
  let weakest = Infinity;
  for (let grey = 0; grey <= 255; grey += 1) {
    const background = luminance([grey, grey, grey, 1]);
    weakest = Math.min(weakest, Math.max(contrast(dark, background), contrast(white, background)));
  }
  expect(weakest).toBeGreaterThan(4.1);
  expect(weakest).toBeLessThan(4.2);
});

test("a value stands beside its line and clear of both white edges, not on the line", () => {
  // Half the white line of a graticule line plus the white edge of the text, which reaches 1 pixel outside it.
  const covered = (LINE_EDGE.getWidth() ?? 0) / 2 + (LONGITUDE_LABEL.getStroke()?.getWidth() ?? 0) / 2;
  expect(LABEL_GAP).toBeGreaterThan(covered);
  // A value of longitude starts to the right of its vertical line.
  expect(LONGITUDE_LABEL.getTextAlign()).toBe("start");
  expect(LONGITUDE_LABEL.getOffsetX()).toBe(LABEL_GAP);
  // A value of latitude stands with its base line above its horizontal line.
  expect(LATITUDE_LABEL.getTextBaseline()).toBe("alphabetic");
  expect(LATITUDE_LABEL.getOffsetY()).toBe(-LABEL_GAP);
});
