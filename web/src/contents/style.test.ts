// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { expect, test } from "vitest";
import { colourScale } from "./colours";
import { NO_MASK, colourParts, layerStyle } from "./style";

const PLAIN = { inverted: false, noDataColour: null };

/** The parts of the colour expression of a style: the conditions and the colours of its `case`. */
function parts(style: ReturnType<typeof layerStyle>): unknown[] {
  return Array.isArray(style.color) ? style.color : [];
}

test("a continuous scale spreads its 256 colours between the lowest and the highest value", () => {
  const style = layerStyle({ colours: "viridis", ...PLAIN }, 2);
  expect(style.variables).toEqual({ lowest: 0, highest: 1, maskLowest: NO_MASK[0], maskHighest: NO_MASK[1] });
  expect(parts(style).at(-1)).toEqual([
    "palette",
    [
      "*",
      ["clamp", ["/", ["-", ["band", 1], ["var", "lowest"]], ["-", ["var", "highest"], ["var", "lowest"]]], 0, 1],
      255,
    ],
    [...colourScale("viridis")],
  ]);
});

test("a cell beyond the file is transparent, and so is a cell without data until it has a colour", () => {
  const transparent = ["color", 0, 0, 0, 0];
  expect(parts(layerStyle({ colours: "grey", ...PLAIN }, 2)).slice(0, 5)).toEqual([
    "case",
    ["==", ["band", 2], 0],
    transparent,
    ["<", ["band", 2], 1],
    transparent,
  ]);
  const coloured = layerStyle({ colours: "grey", inverted: false, noDataColour: "#ff8800" }, 2);
  expect(parts(coloured)[4]).toEqual(["color", 255, 136, 0, 1]);
});

test("a value outside the mask is transparent, and the mask reads the value of the file", () => {
  const mask = (numbers: number) => parts(layerStyle({ colours: "grey", ...PLAIN }, numbers))[5];
  expect(mask(2)).toEqual([
    "any",
    ["<", ["band", 1], ["var", "maskLowest"]],
    [">", ["band", 1], ["var", "maskHighest"]],
  ]);
  // With decibels the first number is the decibels, the second the value of the file and the third the mark.
  expect(mask(3)).toEqual([
    "any",
    ["<", ["band", 2], ["var", "maskLowest"]],
    [">", ["band", 2], ["var", "maskHighest"]],
  ]);
  expect(parts(layerStyle({ colours: "grey", ...PLAIN }, 3))[1]).toEqual(["==", ["band", 3], 0]);
});

test("an inverted scale gives its colours in the opposite order", () => {
  const palette = (
    parts(layerStyle({ colours: "viridis", inverted: true, noDataColour: null }, 2)).at(-1) as unknown[]
  )[2];
  expect(palette).toEqual([...colourScale("viridis")].reverse());
});

test("a scale of classes gives each whole number one of its ten colours in turn", () => {
  const style = layerStyle({ colours: "tab10", inverted: true, noDataColour: null }, 2);
  expect(parts(style).at(-1)).toEqual(["palette", ["%", ["round", ["band", 1]], 10], [...colourScale("tab10")]]);
});

test("a colour of six hexadecimal digits is read, and another text is not", () => {
  expect(colourParts("#FF8800")).toEqual([255, 136, 0]);
  expect(colourParts("red")).toBeNull();
  expect(colourParts("#f80")).toBeNull();
});
