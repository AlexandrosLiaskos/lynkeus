// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
/**
 * The earliest first day that the records of the NISAR collections of NASA's catalogue state: 1 October 2025 in
 * the beta collections, and 28 October 2025 in the provisional and the validated ones. A search of the whole
 * mission starts on this day.
 */
export const MISSION_START = "2025-10-01";

/** The periods that the form offers, by the number of days before today. NISAR repeats its orbit every 12 days. */
export const PERIODS = [
  { id: "12-days", label: "Last 12 days (one cycle of the orbit)", days: 12 },
  { id: "30-days", label: "Last 30 days", days: 30 },
  { id: "90-days", label: "Last 90 days", days: 90 },
  { id: "365-days", label: "Last 365 days", days: 365 },
  { id: "mission", label: "Whole mission", days: null },
  { id: "custom", label: "Custom", days: undefined },
] as const;
export type PeriodId = (typeof PERIODS)[number]["id"];

const DAY = 24 * 60 * 60 * 1000;

/** Write a moment as its day in Coordinated Universal Time, in the form year-month-day. */
export function dayOf(moment: Date): string {
  return moment.toISOString().slice(0, 10);
}

/** Return the first and the last day of an offered period, or null for the custom period. */
export function periodDays(id: PeriodId, today = new Date()): { start: string; end: string } | null {
  const period = PERIODS.find((offered) => offered.id === id);
  if (!period || period.days === undefined) {
    return null;
  }
  const start = period.days === null ? MISSION_START : dayOf(new Date(today.getTime() - period.days * DAY));
  return { start, end: dayOf(today) };
}

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** The number of days of each month in a year that is not a leap year. */
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** A day of a season: the month, from 1 to 12, and the day of the month. */
export interface SeasonDay {
  month: number;
  day: number;
}

/** Return the number of days of a month, from 1 to 12, in a year that is not a leap year. */
export function daysOfMonth(month: number): number {
  return MONTH_DAYS[month - 1] ?? 31;
}

/**
 * Return the number of a day in the year, from 1 to 365, or null when the month has no such day. The catalogue
 * counts the days of every year from 1 January, so in a leap year a day after February falls one day earlier.
 */
export function dayOfYear({ month, day }: SeasonDay): number | null {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1) {
    return null;
  }
  if (day > daysOfMonth(month)) {
    return null;
  }
  return MONTH_DAYS.slice(0, month - 1).reduce((sum, days) => sum + days, 0) + day;
}

/** Return the month and the day of the number of a day in a year that is not a leap year. */
export function seasonDay(dayNumber: number): SeasonDay {
  let rest = Math.min(365, Math.max(1, Math.round(dayNumber)));
  let month = 1;
  while (rest > daysOfMonth(month)) {
    rest -= daysOfMonth(month);
    month += 1;
  }
  return { month, day: rest };
}

/** Write a day of a season in the form "1 June". */
export function formatSeasonDay({ month, day }: SeasonDay): string {
  return `${String(day)} ${MONTHS[month - 1] ?? ""}`;
}
