// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { expect, test } from "vitest";
import { dayOf, dayOfYear, daysOfMonth, formatSeasonDay, MISSION_START, periodDays, seasonDay } from "./period";

const TODAY = new Date("2026-11-14T12:00:00Z");

test("an offered period ends today and starts the given number of days before", () => {
  expect(periodDays("12-days", TODAY)).toEqual({ start: "2026-11-02", end: "2026-11-14" });
  expect(periodDays("30-days", TODAY)).toEqual({ start: "2026-10-15", end: "2026-11-14" });
  expect(periodDays("365-days", TODAY)).toEqual({ start: "2025-11-14", end: "2026-11-14" });
});

test("the whole mission starts on the first day of the collections", () => {
  expect(periodDays("mission", TODAY)).toEqual({ start: MISSION_START, end: "2026-11-14" });
  expect(MISSION_START).toBe("2025-10-01");
});

test("the custom period has no days of its own", () => {
  expect(periodDays("custom", TODAY)).toBeNull();
});

test("a moment is written as its day in Coordinated Universal Time", () => {
  expect(dayOf(new Date("2026-11-14T23:59:59Z"))).toBe("2026-11-14");
});

test("a day of a month is counted from the first day of the year", () => {
  expect(dayOfYear({ month: 1, day: 1 })).toBe(1);
  expect(dayOfYear({ month: 2, day: 28 })).toBe(59);
  expect(dayOfYear({ month: 3, day: 1 })).toBe(60);
  expect(dayOfYear({ month: 6, day: 1 })).toBe(152);
  expect(dayOfYear({ month: 8, day: 31 })).toBe(243);
  expect(dayOfYear({ month: 12, day: 1 })).toBe(335);
  expect(dayOfYear({ month: 12, day: 31 })).toBe(365);
});

test("a day that its month does not have gives no number", () => {
  expect(dayOfYear({ month: 2, day: 30 })).toBeNull();
  expect(dayOfYear({ month: 4, day: 31 })).toBeNull();
  expect(dayOfYear({ month: 13, day: 1 })).toBeNull();
  expect(dayOfYear({ month: 1, day: 0 })).toBeNull();
  expect(dayOfYear({ month: 1.5, day: 1 })).toBeNull();
});

test("the number of a day gives back its month and day", () => {
  for (const day of [1, 31, 32, 59, 60, 152, 243, 335, 365]) {
    expect(dayOfYear(seasonDay(day))).toBe(day);
  }
  expect(seasonDay(152)).toEqual({ month: 6, day: 1 });
  expect(seasonDay(366)).toEqual({ month: 12, day: 31 });
  expect(seasonDay(0)).toEqual({ month: 1, day: 1 });
});

test("a month has its days and a day of a season its words", () => {
  expect([1, 2, 4, 12].map(daysOfMonth)).toEqual([31, 28, 30, 31]);
  expect(formatSeasonDay({ month: 6, day: 1 })).toBe("1 June");
});
