import { expect, test } from "vitest";
import { formatNumber, formatUnit, legendTicks, rampImage } from "./legendValues";

test("a number is written with three significant digits, and as a whole number from one thousand on", () => {
  expect(formatNumber(0)).toBe("0");
  expect(formatNumber(1)).toBe("1");
  expect(formatNumber(0.012345)).toBe("0.0123");
  expect(formatNumber(0.39961)).toBe("0.4");
  expect(formatNumber(-3.14159)).toBe("-3.14");
  expect(formatNumber(12.3456)).toBe("12.3");
  expect(formatNumber(1234.4)).toBe("1234");
});

test("a very small or very large number is written with a power of ten", () => {
  expect(formatNumber(0.000012345)).toBe("1.23e-5");
  expect(formatNumber(2000000)).toBe("2e6");
});

test("a unit of the CF conventions is written with raised powers, and the unit 1 is not written", () => {
  expect(formatUnit("1")).toBe("");
  expect(formatUnit("rad")).toBe("rad");
  expect(formatUnit("m3 m-3")).toBe("m\u00b3 m\u207b\u00b3");
  expect(formatUnit("m s-1")).toBe("m s\u207b\u00b9");
});

test("the marks of a legend are round values inside the range", () => {
  expect(legendTicks(0, 1).map((tick) => tick.label)).toEqual(["0.2", "0.4", "0.6", "0.8"]);
  expect(legendTicks(-10, 10).map((tick) => tick.label)).toEqual(["-5", "0", "5"]);
  expect(legendTicks(-3.2, 3.2).map((tick) => tick.label)).toEqual(["-2", "0", "2"]);
  expect(legendTicks(-25, -5).map((tick) => tick.value)).toEqual([-20, -15, -10]);
});

test("a mark does not stand close to an end of the range", () => {
  // The step is 0.2, and 0.6 lies at 1.9 percent of the range from its highest value.
  expect(legendTicks(0.07, 0.61).map((tick) => tick.label)).toEqual(["0.2", "0.4"]);
  // The step is 0.1, and 0.1 lies at 11 percent of the range from its lowest value.
  expect(legendTicks(0.05, 0.5).map((tick) => tick.label)).toEqual(["0.2", "0.3", "0.4"]);
});

test("a range without width has no marks", () => {
  expect(legendTicks(1, 1)).toEqual([]);
  expect(legendTicks(2, 1)).toEqual([]);
});

test("a continuous scale is drawn from the bottom to the top", () => {
  expect(rampImage(["#000000", "#808080", "#ffffff"], "sequential")).toBe(
    "linear-gradient(to top, #000000, #808080, #ffffff)",
  );
});

test("a scale of classes is drawn as bands", () => {
  expect(rampImage(["#1f77b4", "#ff7f0e"], "classes")).toBe(
    "linear-gradient(to top, #1f77b4 0% 50%, #ff7f0e 50% 100%)",
  );
});
