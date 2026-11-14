import type { ScaleKind } from "./colours";

/** The largest number of steps into which the marks of a legend divide its range. */
const MOST_STEPS = 5;

/** The share of the range that stays free of marks beside each end, so that two labels do not overlap. */
const FREE_BESIDE_AN_END = 0.12;

const SUPERSCRIPTS: Readonly<Record<string, string>> = {
  "-": "\u207b",
  "0": "\u2070",
  "1": "\u00b9",
  "2": "\u00b2",
  "3": "\u00b3",
  "4": "\u2074",
  "5": "\u2075",
  "6": "\u2076",
  "7": "\u2077",
  "8": "\u2078",
  "9": "\u2079",
};

/**
 * Write a number with three significant digits, or as a whole number from one thousand on, without zeros at its
 * end. A number below one ten-thousandth or from one million on is written with a power of ten.
 */
export function formatNumber(value: number): string {
  if (value === 0 || !Number.isFinite(value)) {
    return String(value);
  }
  const size = Math.abs(value);
  if (size < 1e-4 || size >= 1e6) {
    return value
      .toExponential(2)
      .replace(/\.?0+e/, "e")
      .replace("e+", "e");
  }
  const decimals = Math.max(0, 2 - Math.floor(Math.log10(size)));
  return String(Number(value.toFixed(decimals)));
}

/**
 * Write a unit for the reader. The descriptions give units as the CF conventions write them: a power follows its
 * unit as a whole number, and the unit of a quantity without dimension is 1, for which nothing is written.
 */
export function formatUnit(unit: string): string {
  if (unit === "1") {
    return "";
  }
  return unit.replace(/([A-Za-z])(-?\d+)/g, (_, letter: string, power: string) => {
    return letter + power.replace(/[-\d]/g, (character) => SUPERSCRIPTS[character] ?? character);
  });
}

/** A value that a legend marks, with its text. */
export interface Tick {
  value: number;
  label: string;
}

/**
 * Return the values that a legend marks between its two ends: the multiples of a step that lie inside the range,
 * written with the decimals of the step. The step is the smallest of 1, 2 or 5 times a power of ten that divides
 * the range into at most five parts.
 */
export function legendTicks(lowest: number, highest: number): Tick[] {
  const span = highest - lowest;
  if (!(span > 0) || !Number.isFinite(span)) {
    return [];
  }
  const power = 10 ** Math.floor(Math.log10(span / MOST_STEPS));
  const step = power * ([1, 2, 5, 10].find((factor) => factor * power >= span / MOST_STEPS) ?? 10);
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const ticks: Tick[] = [];
  for (let count = Math.ceil(lowest / step); count * step < highest; count += 1) {
    const value = Number((count * step).toFixed(decimals));
    if (value - lowest >= FREE_BESIDE_AN_END * span && highest - value >= FREE_BESIDE_AN_END * span) {
      ticks.push({ value, label: value.toFixed(decimals) });
    }
  }
  return ticks;
}

/**
 * Return the CSS image of a colour scale that runs from the bottom, for the lowest value, to the top. A scale of
 * classes is drawn as bands of one colour each.
 */
export function rampImage(colours: readonly string[], kind: ScaleKind): string {
  if (kind !== "classes") {
    return `linear-gradient(to top, ${colours.join(", ")})`;
  }
  const share = 100 / colours.length;
  const bands = colours.map((colour, index) => {
    return `${colour} ${String(index * share)}% ${String((index + 1) * share)}%`;
  });
  return `linear-gradient(to top, ${bands.join(", ")})`;
}
