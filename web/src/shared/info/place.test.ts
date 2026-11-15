// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { expect, test } from "vitest";
import { placeBubble, WINDOW_MARGIN } from "./place";

const WINDOW = { width: 1440, height: 900 };
const BUBBLE = { width: 256, height: 80 };

test("the bubble stands under its element and starts at its left edge", () => {
  expect(placeBubble({ left: 1000, top: 200, bottom: 224 }, BUBBLE, WINDOW)).toEqual({
    left: 1000,
    top: 224,
    above: false,
  });
});

test("the bubble moves to the left when it would cross the right edge of the window", () => {
  const place = placeBubble({ left: 1400, top: 200, bottom: 224 }, BUBBLE, WINDOW);
  expect(place.left).toBe(1440 - 256 - WINDOW_MARGIN);
  expect(place.top).toBe(224);
});

test("the bubble stands above its element when it would cross the lower edge of the window", () => {
  expect(placeBubble({ left: 1000, top: 840, bottom: 864 }, BUBBLE, WINDOW)).toEqual({
    left: 1000,
    top: 760,
    above: true,
  });
});

test("the bubble that just fits under its element stays under it", () => {
  const bottom = WINDOW.height - BUBBLE.height - WINDOW_MARGIN;
  expect(placeBubble({ left: 100, top: bottom - 24, bottom }, BUBBLE, WINDOW).above).toBe(false);
  expect(placeBubble({ left: 100, top: bottom - 23, bottom: bottom + 1 }, BUBBLE, WINDOW).above).toBe(true);
});

test("the bubble stays under its element when it has no room above either", () => {
  const place = placeBubble(
    { left: 100, top: 40, bottom: 64 },
    { width: 256, height: 400 },
    { width: 390, height: 300 },
  );
  expect(place).toEqual({ left: 100, top: 64, above: false });
});

test("the bubble keeps its distance from the left edge of a window that is narrower than the bubble", () => {
  expect(placeBubble({ left: 60, top: 100, bottom: 124 }, BUBBLE, { width: 200, height: 800 }).left).toBe(
    WINDOW_MARGIN,
  );
});

test("the place is given in whole pixels", () => {
  expect(placeBubble({ left: 100.4, top: 200.2, bottom: 224.6 }, BUBBLE, WINDOW)).toEqual({
    left: 100,
    top: 225,
    above: false,
  });
});
