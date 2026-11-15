// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { utcDay } from "../shared/days";

/** Write a day given as year-month-day in the form "21 Oct 2026". */
export function formatDate(day: string): string {
  return utcDay(new Date(`${day}T00:00:00Z`));
}
