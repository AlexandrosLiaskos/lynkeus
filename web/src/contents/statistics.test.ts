// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { expect, test } from "vitest";
import { histogram, percentile, readSample, stretchRange, summarise } from "./statistics";
import { openTestFile } from "./testdata/files";

/** The values of the reduced copy of testdata/backscatter.json that hold data, as rasterio and NumPy give them. */
const BACKSCATTER = {
  count: 2910,
  minimum: 0.019710689783096313,
  maximum: 6.696006774902344,
  mean: 0.3577506277774208,
  deviation: 0.2722766011751385,
  percent2: 0.07272271990776062,
  percent98: 0.8852454948425295,
};

test("the sample of a file is its most reduced copy, with the cells without data left out", async () => {
  const sample = await readSample(await openTestFile("backscatter"));
  expect(sample.size).toEqual([64, 48]);
  expect(sample.full).toBe(false);
  expect(sample.values).toHaveLength(BACKSCATTER.count);
  expect(sample.values[0]).toBe(Math.fround(BACKSCATTER.minimum));
  expect(sample.values.at(-1)).toBe(Math.fround(BACKSCATTER.maximum));
  const summary = summarise(sample.values);
  expect(summary?.mean).toBeCloseTo(BACKSCATTER.mean, 6);
  expect(summary?.deviation).toBeCloseTo(BACKSCATTER.deviation, 6);
  expect(percentile(sample.values, 2)).toBeCloseTo(BACKSCATTER.percent2, 6);
  expect(percentile(sample.values, 98)).toBeCloseTo(BACKSCATTER.percent98, 6);
});

test("a percentile follows a straight line between two values", () => {
  const values = [1, 2, 3, 4, 5];
  expect(percentile(values, 0)).toBe(1);
  expect(percentile(values, 50)).toBe(3);
  expect(percentile(values, 100)).toBe(5);
  expect(percentile(values, 10)).toBeCloseTo(1.4, 12);
  expect(percentile([], 50)).toBeNaN();
});

test("the summary of values gives their ends, their mean and their standard deviation", () => {
  expect(summarise([2, 4, 4, 4, 5, 5, 7, 9])).toEqual({ minimum: 2, maximum: 9, mean: 5, deviation: 2 });
  expect(summarise([])).toBeNull();
});

test("a histogram counts the values in classes of equal width", () => {
  expect(histogram([0, 0.1, 0.5, 0.9, 1, 2], 0, 1, 2)).toEqual([2, 3]);
  expect(histogram([1, 2, 3], 5, 5, 4)).toEqual([0, 0, 0, 0]);
});

test("each stretch gives its range", () => {
  const values = Array.from({ length: 101 }, (_, index) => index);
  const summary = summarise(values);
  if (!summary) {
    throw new Error("no summary");
  }
  expect(stretchRange({ kind: "extremes" }, values, summary)).toEqual([0, 100]);
  expect(stretchRange({ kind: "percent", percent: 2 }, values, summary)).toEqual([2, 98]);
  const [lowest, highest] = stretchRange({ kind: "deviations", count: 1 }, values, summary) ?? [];
  // The standard deviation of the whole numbers from 0 to 100 is the square root of 850.
  expect(lowest).toBeCloseTo(50 - Math.sqrt(850), 10);
  expect(highest).toBeCloseTo(50 + Math.sqrt(850), 10);
  expect(stretchRange({ kind: "deviations", count: 3 }, values, summary)).toEqual([0, 100]);
  expect(stretchRange({ kind: "typed" }, values, summary)).toBeNull();
  expect(stretchRange({ kind: "percent", percent: 50 }, values, summary)).toBeNull();
});
