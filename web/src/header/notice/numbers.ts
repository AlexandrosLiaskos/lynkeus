// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
/** The numbers of the notice, written as a person reads them. */

const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/** Write a count with at most one decimal place: "200", "2,000", "1.5 million", "25 million". */
export function countWords(count: number): string {
  if (count >= 1e9) {
    return `${NUMBER.format(count / 1e9)} billion`;
  }
  if (count >= 1e6) {
    return `${NUMBER.format(count / 1e6)} million`;
  }
  return NUMBER.format(count);
}

/** Write an amount with the name of what is counted: "1 job", "2 jobs", "1.5 processors". */
export function amount(count: number, one: string, several: string): string {
  return `${countWords(count)} ${count === 1 ? one : several}`;
}

const UNITS = ["kB", "MB", "GB", "TB"] as const;

function inUnits(bytes: number, step: number): string {
  if (bytes < step) {
    return amount(bytes, "byte", "bytes");
  }
  let value = bytes / step;
  let unit: (typeof UNITS)[number] = "kB";
  for (const next of UNITS.slice(1)) {
    if (value < step) {
      break;
    }
    value /= step;
    unit = next;
  }
  return `${NUMBER.format(value)} ${unit}`;
}

/** Write the size of files, in units of 1000, in which the limits of the server are set: "500 MB", "2 GB". */
export function sizeWords(bytes: number): string {
  return inUnits(bytes, 1000);
}

/**
 * Write an amount of memory, in units of 1024, in which the operating system and the container program state
 * it: 2,147,483,648 bytes are written "2 GB".
 */
export function memoryWords(bytes: number): string {
  return inUnits(bytes, 1024);
}

const TIMES = [
  [86400, "day", "days"],
  [3600, "hour", "hours"],
  [60, "minute", "minutes"],
] as const;

/** Write a time in the largest unit in which it is a whole number: "40 minutes", "8 hours", "7 days". */
export function timeWords(seconds: number): string {
  for (const [length, one, several] of TIMES) {
    if (seconds >= length && seconds % length === 0) {
      return amount(seconds / length, one, several);
    }
  }
  return amount(seconds, "second", "seconds");
}
