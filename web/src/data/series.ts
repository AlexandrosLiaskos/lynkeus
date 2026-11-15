// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { openToolPane } from "../shared/dock/dock";
import { isSeriesDescription, type SeriesDescription } from "../shared/series";
import { createStore } from "../shared/store";
import { isMoment } from "./jobs";
import { call, checked, Refusal, wordsOf } from "./service";

/** A series of the session: its description, and when it was made, as a date-time of RFC 3339. */
export interface SeriesItem {
  series: SeriesDescription;
  created: string;
}

const SERIES = "/api/series";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Tell whether a value is an entry of the list of series of the server: a series description and its time. */
export function isSeriesItem(value: unknown): value is SeriesItem {
  return isRecord(value) && isSeriesDescription(value.series) && isMoment(value.created);
}

function isSeriesList(value: unknown): value is { series: SeriesItem[] } {
  return isRecord(value) && Array.isArray(value.series) && value.series.every(isSeriesItem);
}

/** The series of the session, in the order of the server: the newest first. */
export const seriesStore = createStore<readonly SeriesItem[]>([]);

/** Why the last reading of the series failed, in a sentence for the visitor, or null when it succeeded. */
export const seriesFaultStore = createStore<string | null>(null);

/** The name of the pane that shows one series as a chart and as a table. */
export const SERIES_PANE = "series";

/** The id of the series that the pane Series shows, or null. */
export const shownSeriesStore = createStore<string | null>(null);

/** Show a series in the pane Series, and bring that pane to the front of its side. */
export function showSeries(id: string): void {
  shownSeriesStore.set(id);
  openToolPane(SERIES_PANE);
}

// The number of changes that this page has made to the list. The answer to a reading that started before a
// change is dropped, so that a slow answer cannot bring back a series that was removed.
let changes = 0;
let reading: Promise<void> | null = null;

async function readSeries(): Promise<void> {
  const turn = changes;
  try {
    const { series } = checked(await call(SERIES, { failure: "The series could not be read" }), isSeriesList);
    if (turn === changes) {
      seriesFaultStore.set(null);
      if (JSON.stringify(seriesStore.get()) !== JSON.stringify(series)) {
        seriesStore.set(series);
      }
    }
  } catch (error) {
    if (turn === changes) {
      seriesFaultStore.set(wordsOf(error, "The series could not be read."));
    }
  }
}

/**
 * Read the series of the session from the server and keep them in the store. A call during a reading that is
 * still on its way joins that reading. The promise is never rejected: a failure is stated in `seriesFaultStore`.
 */
export function loadSeries(): Promise<void> {
  reading ??= readSeries().finally(() => {
    reading = null;
  });
  return reading;
}

/** Ask the server for the series description that a successful job of a Series tool produced. */
export async function seriesResult(job: string): Promise<SeriesDescription> {
  const answer = await call(`/api/jobs/${encodeURIComponent(job)}/results`, {
    failure: "The result of the job could not be read",
  });
  return checked(answer, isSeriesDescription);
}

/** Remove a series of the session. A series that the server no longer holds leaves the list as well. */
export async function removeSeries(id: string): Promise<void> {
  try {
    await call(`${SERIES}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      failure: "The series could not be removed",
    });
  } catch (error) {
    if (!(error instanceof Refusal && error.status === 404)) {
      throw error;
    }
  }
  changes += 1;
  seriesStore.set(seriesStore.get().filter((item) => item.series.id !== id));
}

/** Give a series another name, and return it as the server holds it afterwards. */
export async function renameSeries(id: string, title: string): Promise<SeriesItem> {
  const renamed = checked(
    await call(`${SERIES}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      content: { title },
      failure: "The series could not be renamed",
    }),
    isSeriesItem,
  );
  changes += 1;
  seriesStore.set(seriesStore.get().map((item) => (item.series.id === id ? renamed : item)));
  return renamed;
}

/** Forget the series and the readings on their way. The tests start from this state. */
export function resetSeries(): void {
  changes += 1;
  reading = null;
  seriesStore.set([]);
  seriesFaultStore.set(null);
  shownSeriesStore.set(null);
}
