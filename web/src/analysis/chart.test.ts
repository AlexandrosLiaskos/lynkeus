// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { expect, test } from "vitest";
import { pairSeries, series } from "../data/testSeries";
import type { SeriesEntry } from "../shared/series";
import { chartOf, dayNumber, dayWords, markWords, roundMarks, type Frame } from "./chart";

const FRAME: Frame = { width: 264, height: 200, left: 44, right: 24, top: 24, bottom: 44 };

/** An entry of the series of the tests. */
function entry(index: number): SeriesEntry {
  const found = series().entries[index];
  if (!found) {
    throw new Error("The series of the tests has no such entry.");
  }
  return found;
}

test("a date is counted in days, so that the time axis keeps the distances between the dates", () => {
  expect(dayNumber("1970-01-01")).toBe(0);
  expect(dayNumber("2026-10-09") - dayNumber("2026-09-27")).toBe(12);
  expect(dayNumber("2027-01-01") - dayNumber("2026-01-01")).toBe(365);
  expect(dayWords("2026-09-27")).toBe("27 Sep");
  expect(dayWords("2026-11-02")).toBe("2 Nov");
});

test("the marks of the value axis are round values that hold every value", () => {
  expect(roundMarks(0, 1)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  expect(roundMarks(-4.833044960998819, -4.315111978395169)).toEqual([-5, -4.8, -4.6, -4.4, -4.2]);
  expect(roundMarks(-21.7, -3.2)).toEqual([-25, -20, -15, -10, -5, 0]);
  expect(roundMarks(3, 3)).toEqual([1, 2, 3, 4, 5]);
  expect(roundMarks(0, 0)).toEqual([-1, -0.5, 0, 0.5, 1]);
  const marks = roundMarks(-4.833044960998819, -4.315111978395169);
  expect(marks.map((mark) => markWords(mark, marks))).toEqual(["−5.0", "−4.8", "−4.6", "−4.4", "−4.2"]);
  expect(markWords(0, [0, 5, 10])).toBe("0");
});

test("a series of dates is drawn as points on a line, the earliest first", () => {
  const chart = chartOf(series(), FRAME);
  expect(chart.values.map((mark) => mark.words)).toEqual(["−5.0", "−4.8", "−4.6", "−4.4", "−4.2"]);
  // The lowest mark stands at the foot of the plot and the highest at its top.
  expect(chart.values[0]?.at).toBe(156);
  expect(chart.values.at(-1)?.at).toBe(24);
  expect(chart.time).toBe("Date (2026)");
  expect(chart.days.map((mark) => mark.words)).toEqual(["27 Sep", "21 Oct", "2 Nov"]);
  expect(chart.days[0]?.at).toBe(44);
  expect(chart.days.at(-1)?.at).toBe(240);
  expect(chart.drawn).toHaveLength(4);
  expect(chart.drawn.every((point) => point.x1 === point.x2)).toBe(true);
  // 12 days of 36 are a third of the width of the plot, which is 196 px.
  expect(chart.drawn[1]?.x1).toBeCloseTo(44 + 196 / 3, 6);
  // The value −4.315 lies above the value −4.833 on the drawing.
  expect(chart.drawn[0]?.y).toBeLessThan(chart.drawn[2]?.y ?? 0);
  expect(chart.line.split(" ")).toHaveLength(4);
  expect(chart.line.startsWith("44.0,")).toBe(true);
});

test("a date without a value is left out of the line", () => {
  const gap = series({
    entries: [entry(0), { dates: ["2026-10-09"], value: null, cells: 0 }, entry(2), entry(3)],
  });
  const chart = chartOf(gap, FRAME);
  expect(chart.drawn.map((point) => point.entry.dates[0])).toEqual(["2026-09-27", "2026-10-21", "2026-11-02"]);
  expect(chart.line.split(" ")).toHaveLength(3);
  // The date itself stays on the time axis.
  expect(chartOf(gap, { ...FRAME, width: 400 }).days.map((mark) => mark.words)).toContain("9 Oct");
});

test("a series of pairs is drawn as horizontal segments from the first to the second date, without a line", () => {
  const chart = chartOf(pairSeries(), FRAME);
  expect(chart.values.map((mark) => mark.words)).toEqual(["0.0", "0.2", "0.4", "0.6", "0.8", "1.0"]);
  expect(chart.line).toBe("");
  expect(chart.drawn).toHaveLength(3);
  const [first, second, third] = chart.drawn;
  expect(first?.x1).toBe(44);
  expect(first?.x2).toBeCloseTo(44 + 196 / 3, 6);
  expect(second?.x1).toBeCloseTo(first?.x2 ?? 0, 6);
  expect(third?.x2).toBe(240);
  // A coherence of 0.648 lies above one of 0.322.
  expect(third?.y).toBeLessThan(second?.y ?? 0);
  expect(chart.days.map((mark) => mark.words)).toEqual(["15 Sep", "9 Oct", "21 Oct"]);
});

test("a wider chart has more marks of time, and a series over two years names both", () => {
  expect(chartOf(series(), { ...FRAME, width: 400 }).days.map((mark) => mark.words)).toEqual([
    "27 Sep",
    "9 Oct",
    "21 Oct",
    "2 Nov",
  ]);
  const long = series({
    entries: [entry(0), { dates: ["2027-01-13"], value: -5.1, cells: 3 }],
    inputs: series().inputs.slice(0, 2),
  });
  expect(chartOf(long, FRAME).time).toBe("Date (2026 to 2027)");
});

test("a series of one value and a series without any value are still laid out", () => {
  const one = chartOf(series({ entries: [entry(0)], inputs: series().inputs.slice(0, 1) }), FRAME);
  expect(one.drawn).toHaveLength(1);
  expect(one.drawn[0]?.x1).toBe(44 + 196 / 2);
  expect(one.line).toBe("");
  const none = chartOf(
    series({ entries: [{ dates: ["2026-09-27"], value: null, cells: 0 }], inputs: series().inputs.slice(0, 1) }),
    FRAME,
  );
  expect(none.drawn).toEqual([]);
  expect(none.values.map((mark) => mark.words)).toEqual(["0", "1"]);
});
