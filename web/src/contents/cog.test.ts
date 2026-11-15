// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { expect, test } from "vitest";
import { NO_DECIBELS, composeTile, decibels } from "./cog";
import { openTestFile } from "./testdata/files";

test("the header of a file as NASA Harmony writes it is read", async () => {
  const cog = await openTestFile("backscatter");
  expect(cog.projection).toBe("EPSG:32619");
  // The limits and the cell sizes, as rasterio reads them from the same file.
  expect(cog.extent).toEqual([322080, 4756650, 323360, 4757610]);
  expect(cog.levels.map(({ size, cell, tile }) => ({ size, cell, tile }))).toEqual([
    { size: [64, 48], cell: [20, 20], tile: [64, 64] },
    { size: [128, 96], cell: [10, 10], tile: [64, 64] },
  ]);
  expect(cog.noData).toBeNaN();
  expect(cog.statistics).toBeNull();
});

test("the statistics of a file as Lynkeus writes it are read", async () => {
  const cog = await openTestFile("coherence");
  expect(cog.extent).toEqual([337520, 4737680, 340080, 4739600]);
  expect(cog.statistics).toEqual({
    minimum: 0.06078687310218811,
    maximum: 0.9887221455574036,
    mean: 0.5370310499019979,
    deviation: 0.13365778278179116,
  });
});

test("ten times the logarithm gives the decibels of a power", () => {
  expect(decibels(1)).toBe(0);
  expect(decibels(0.1)).toBeCloseTo(-10, 12);
  expect(decibels(0.5)).toBeCloseTo(-3.0102999566, 9);
});

test("a tile holds each value and a 1, and a half where a cell of the file has no data", () => {
  const tile = composeTile([0.5, Number.NaN, -9999, 2], [2, 2], [2, 2], -9999, false);
  expect([...tile]).toEqual([0.5, 1, 0, 0.5, 0, 0.5, 2, 1]);
});

test("the cells of a tile beyond the edge of the image end with 0", () => {
  // The tile has three columns and two rows, of which two columns and one row lie inside the image.
  const tile = composeTile([1, 2, 3, 4, 5, 6], [3, 2], [2, 1], null, false);
  expect([...tile]).toEqual([1, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
});

test("with decibels a cell holds the decibels, the value of the file and a 1", () => {
  const tile = composeTile([0.1, 0, -0.5, Number.NaN], [2, 2], [2, 2], null, true);
  expect(tile[0]).toBeCloseTo(-10, 5);
  expect(tile[1]).toBeCloseTo(0.1, 7);
  expect(tile[2]).toBe(1);
  // A power of zero or below has no logarithm. The cell holds data, and its colour is the first of the scale.
  expect([...tile.slice(3, 9)]).toEqual([NO_DECIBELS, 0, 1, NO_DECIBELS, -0.5, 1].map(Math.fround));
  expect([...tile.slice(9)]).toEqual([0, 0, 0.5]);
});
