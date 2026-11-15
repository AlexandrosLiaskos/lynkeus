// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { MONTHS, utcDay } from "./days";

test("the short names of the months are those with which the server writes the titles of the layers", () => {
  const server = readFileSync("../api/src/lynkeus/harmony.py", "utf8");
  expect(server).toContain(`_MONTHS = (${MONTHS.map((month) => `"${month}"`).join(", ")})`);
  expect(MONTHS).toHaveLength(12);
  expect(MONTHS[8]).toBe("Sep");
});

test("a day is written in Coordinated Universal Time with the short name of its month", () => {
  expect(utcDay(new Date("2026-09-27T00:00:00Z"))).toBe("27 Sep 2026");
  expect(utcDay(new Date("2026-01-05T23:59:59Z"))).toBe("5 Jan 2026");
  expect(utcDay(new Date("2026-11-14T20:00:00-08:00"))).toBe("15 Nov 2026");
});
