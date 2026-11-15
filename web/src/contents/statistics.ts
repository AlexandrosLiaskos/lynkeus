// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type { Cog } from "./cog";
import type { Stretch } from "./state";

/** The values of the most reduced copy of a file, which stand for the values of the layer in its statistics. */
export interface Sample {
  /** The values of the cells that hold data, from the lowest to the highest. */
  values: Float32Array;
  /** Columns and rows of the image that was read. */
  size: readonly [number, number];
  /** Whether the image is the full resolution, because the file has no reduced copy. */
  full: boolean;
}

/** The lowest and the highest value, the mean and the standard deviation of a set of values. */
export interface Summary {
  minimum: number;
  maximum: number;
  mean: number;
  deviation: number;
}

/** Read the values of the most reduced copy of a file, and put those of the cells that hold data in order. */
export async function readSample(cog: Cog): Promise<Sample> {
  const [level] = cog.levels;
  if (!level) {
    throw new Error("The file holds no image.");
  }
  const rasters = await level.image.readRasters({ samples: [0], interleave: false });
  const all = rasters[0] as ArrayLike<number>;
  const values = Float32Array.from(all).filter((value) => !Number.isNaN(value) && value !== cog.noData);
  values.sort();
  return { values, size: level.size, full: cog.levels.length === 1 };
}

/**
 * Return the value below which a percent of the values lie. The values are in order, and between two of them
 * the result follows a straight line, as the percentile of NumPy does.
 */
export function percentile(values: ArrayLike<number>, percent: number): number {
  if (values.length === 0) {
    return Number.NaN;
  }
  const place = (Math.min(Math.max(percent, 0), 100) / 100) * (values.length - 1);
  const below = Math.floor(place);
  const lower = values[below] ?? Number.NaN;
  const upper = values[Math.min(below + 1, values.length - 1)] ?? Number.NaN;
  return lower + (upper - lower) * (place - below);
}

/** Return the lowest and the highest value, the mean and the standard deviation of values that are in order. */
export function summarise(values: ArrayLike<number>): Summary | null {
  const count = values.length;
  if (count === 0) {
    return null;
  }
  let sum = 0;
  for (let index = 0; index < count; index += 1) {
    sum += values[index] ?? 0;
  }
  const mean = sum / count;
  let squares = 0;
  for (let index = 0; index < count; index += 1) {
    squares += ((values[index] ?? 0) - mean) ** 2;
  }
  return {
    minimum: values[0] ?? Number.NaN,
    maximum: values[count - 1] ?? Number.NaN,
    mean,
    deviation: Math.sqrt(squares / count),
  };
}

/**
 * Count the values in classes of equal width between a lowest and a highest value. A value at the highest value
 * falls in the last class, and a value outside the two is not counted.
 */
export function histogram(values: ArrayLike<number>, lowest: number, highest: number, classes: number): number[] {
  const counts = new Array<number>(classes).fill(0);
  const width = (highest - lowest) / classes;
  if (!(width > 0)) {
    return counts;
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? Number.NaN;
    if (value >= lowest && value <= highest) {
      const place = Math.min(Math.floor((value - lowest) / width), classes - 1);
      counts[place] = (counts[place] ?? 0) + 1;
    }
  }
  return counts;
}

/**
 * Return the range that a stretch gives for values that are in order, or null when it gives none. The range of
 * a number of standard deviations stays inside the lowest and the highest value.
 *
 * @param stretch The rule.
 * @param values The values, from the lowest to the highest.
 * @param summary Their lowest and highest value, mean and standard deviation.
 */
export function stretchRange(
  stretch: Stretch,
  values: ArrayLike<number>,
  summary: Summary,
): readonly [number, number] | null {
  let range: readonly [number, number];
  switch (stretch.kind) {
    case "extremes":
      range = [summary.minimum, summary.maximum];
      break;
    case "percent":
      range = [percentile(values, stretch.percent), percentile(values, 100 - stretch.percent)];
      break;
    case "deviations":
      range = [
        Math.max(summary.minimum, summary.mean - stretch.count * summary.deviation),
        Math.min(summary.maximum, summary.mean + stretch.count * summary.deviation),
      ];
      break;
    case "typed":
      return null;
  }
  return range[0] < range[1] ? range : null;
}
