// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useEffect, useState } from "react";
import { refreshLayers, type LayerEntry } from "../data/layers";
import { refreshSeries, type SeriesItem } from "../data/series";
import { call } from "../data/service";
import { amount, timeWords } from "../header/notice/numbers";
import type { ServiceLimits } from "../header/notice/limits";
import { utcDay } from "../shared/days";

/**
 * What the Catalog pane says about the time for which the project server keeps a layer or a series
 * (`docs/Storage.md`, "Further rules of the interface"). The keeping time is read from the limits of the server
 * and is never typed here.
 */

/**
 * The number of days before its removal from which a layer or a series carries a warning. It is a rule of the
 * interface in `docs/Storage.md` and no limit of the server; a test compares it with that document.
 */
export const WARNING_DAYS = 3;

const DAY = 86_400_000;
const MINUTE = 60_000;
const EXTENSION = "/api/storage/extension";

/** Write the day of a moment, in Coordinated Universal Time, in the form "29 Nov 2026". */
export function dayWords(moment: string): string {
  return utcDay(new Date(moment));
}

/** Tell whether something that is kept until a moment is removed within the days of the warning. */
export function isNear(until: string | null | undefined, now: number): boolean {
  return typeof until === "string" && Date.parse(until) - now <= WARNING_DAYS * DAY;
}

/** The words of the warning of a row whose layer or series is removed within the days of the warning. */
export const NEAR_WORDS = `which is within ${String(WARNING_DAYS)} days`;

/**
 * Return until when a layer is kept, in the words of its row, or null where the server does not state it: a
 * layer of the project server until its date, and a layer of a server of the visitor until he removes it.
 */
export function untilWords(entry: LayerEntry): string | null {
  if (entry.server) {
    return "Kept until you remove it";
  }
  return entry.keptUntil === undefined ? null : `Kept until ${dayWords(entry.keptUntil)}`;
}

/** Return until when a series is kept, in the words of its row, or null where the server does not state it. */
export function seriesUntilWords(item: SeriesItem): string | null {
  return typeof item.kept_until === "string" ? `Kept until ${dayWords(item.kept_until)}` : null;
}

/**
 * Return the name of the command that keeps a layer or a series for the keeping time from now, as "Keep 14 more
 * days". The time is the keeping time of the limits; while the limits are not known the command names no time.
 */
export function keepLabel(limits: ServiceLimits | null): string {
  if (limits === null) {
    return "Keep longer";
  }
  const [count = "", ...unit] = timeWords(limits.limits.keep_time).split(" ");
  return `Keep ${count} more ${unit.join(" ")}`;
}

/** State until when a layer or a series is kept after the command that keeps it longer. */
export function extendedWords(kind: "layer" | "series", title: string, until: string | null | undefined): string {
  return typeof until === "string"
    ? `The ${kind} "${title}" is kept until ${dayWords(until)}.`
    : `The ${kind} "${title}" is kept longer.`;
}

/**
 * State that every layer and series of the account is kept longer, after the command Keep all, with the keeping
 * time of the limits where they are known.
 */
export function keptAllWords(limits: ServiceLimits | null): string {
  return limits === null
    ? "Every layer and series of your account is kept longer."
    : `Every layer and series of your account is kept for ${timeWords(limits.limits.keep_time)} from now.`;
}

/** How many layers and series of the project server are removed within the days of the warning. */
export interface Removals {
  layers: number;
  series: number;
}

/** Count the layers and the series of the project server that are removed within the days of the warning. */
export function removalsOf(layers: readonly LayerEntry[], series: readonly SeriesItem[], now: number): Removals {
  return {
    layers: layers.filter((entry) => entry.server === null && isNear(entry.keptUntil, now)).length,
    series: series.filter((item) => isNear(item.kept_until, now)).length,
  };
}

/**
 * State how many layers and series are removed within the days of the warning, with the reminder that a
 * downloaded file is the permanent copy, or return null when nothing is removed within those days.
 */
export function removalSentence({ layers, series }: Removals): string | null {
  const parts = [
    layers > 0 ? amount(layers, "layer", "layers") : null,
    series > 0 ? amount(series, "series", "series") : null,
  ].filter((part) => part !== null);
  if (parts.length === 0) {
    return null;
  }
  const verb = layers + series === 1 ? "is" : "are";
  return `${parts.join(" and ")} ${verb} removed from the project server within ${String(WARNING_DAYS)} days. A file that you download is the permanent copy.`;
}

/**
 * Keep every layer and series of the account for the keeping time from now, and read the two lists again, so
 * that each row states its new date. The promise is rejected with an error whose message can be shown to the
 * visitor.
 */
export async function extendAll(): Promise<void> {
  await call(EXTENSION, { method: "POST", failure: "The layers and the series could not be kept longer" });
  await Promise.all([refreshLayers(), refreshSeries()]);
}

/**
 * Read the present moment in a component, in milliseconds since 1 January 1970 (UTC). It is read again every
 * minute, so that a warning that depends on the time appears while the page stays open.
 */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), MINUTE);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
