// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { dockStore, resetDock } from "../shared/dock/dock";
import {
  extendSeries,
  isSeriesItem,
  loadSeries,
  refreshSeries,
  removeSeries,
  renameSeries,
  resetSeries,
  SERIES_PANE,
  seriesFaultStore,
  seriesResult,
  seriesStore,
  showSeries,
  shownSeriesStore,
} from "./series";
import { UNREADABLE } from "./service";
import { pairSeries, series, seriesItem } from "./testSeries";
import { job, standIn, type StandIn } from "./testSession";
import { keeper, keptSeries } from "./testStorage";

let server: StandIn;

beforeEach(() => {
  resetDock();
  resetSeries();
  server = standIn();
});

afterEach(() => {
  resetSeries();
  vi.unstubAllGlobals();
});

test("an entry of the list of series is a series description with its time", () => {
  expect(isSeriesItem(seriesItem())).toBe(true);
  expect(isSeriesItem({ series: series() })).toBe(false);
  expect(isSeriesItem({ series: series(), created: "15 Nov 2026" })).toBe(false);
  expect(isSeriesItem({ series: { ...series(), kind: "layer" }, created: "2026-11-15T13:02:11Z" })).toBe(false);
  expect(isSeriesItem(series())).toBe(false);
});

test("the series of the session are read from the address of the server", async () => {
  server.series = [seriesItem(pairSeries()), seriesItem()];
  await loadSeries();
  expect(server.sent("GET", "/api/series")).toHaveLength(1);
  expect(seriesStore.get().map((item) => item.series.id)).toEqual([pairSeries().id, series().id]);
  expect(seriesFaultStore.get()).toBeNull();
});

test("a list that holds something else than a series is not kept, and the fault is stated", async () => {
  server.series = [seriesItem()];
  await loadSeries();
  server.series = [{ series: { ...series(), entries: [] }, created: "2026-11-15T13:02:11Z" }];
  await loadSeries();
  expect(seriesFaultStore.get()).toBe(UNREADABLE);
  expect(seriesStore.get()).toHaveLength(1);
  server.refuse("GET", "/api/series", 503, "The server is busy. Try again in a few minutes.");
  await loadSeries();
  expect(seriesFaultStore.get()).toBe("The server is busy. Try again in a few minutes.");
});

test("the result of a job of a Series tool is read as a series description", async () => {
  server.series = [seriesItem()];
  server.jobs = [job({ jobID: "job-1", processID: "backscatter-series", status: "successful", series: series().id })];
  await expect(seriesResult("job-1")).resolves.toEqual(series());
  server.jobs = [job({ jobID: "job-2", status: "successful", layer: "no-series" })];
  await expect(seriesResult("job-2")).rejects.toThrow(UNREADABLE);
});

test("a series is renamed through the server and keeps its place in the list", async () => {
  server.series = [seriesItem(pairSeries()), seriesItem()];
  await loadSeries();
  const renamed = await renameSeries(series().id, "Backscatter of the estuary");
  expect(server.sent("PATCH", `/api/series/${series().id}`)[0]?.content).toEqual({
    title: "Backscatter of the estuary",
  });
  expect(renamed.series.title).toBe("Backscatter of the estuary");
  expect(seriesStore.get().map((item) => item.series.title)).toEqual([
    "Coherence HH at p1",
    "Backscatter of the estuary",
  ]);
  server.refuse("PATCH", "/api/series/", 404, "Your session has no series of this name.");
  await expect(renameSeries("gone", "A name")).rejects.toThrow("Your session has no series of this name.");
});

test("a series is removed through the server, and one that the server no longer holds leaves the list as well", async () => {
  server.series = [seriesItem(pairSeries()), seriesItem()];
  await loadSeries();
  await removeSeries(series().id);
  expect(server.sent("DELETE", `/api/series/${series().id}`)).toHaveLength(1);
  expect(seriesStore.get().map((item) => item.series.id)).toEqual([pairSeries().id]);
  server.series = [];
  await removeSeries(pairSeries().id);
  expect(seriesStore.get()).toEqual([]);
  server.refuse("DELETE", "/api/series/", 503, "The server is busy.");
  await expect(removeSeries("other")).rejects.toThrow("The server is busy.");
});

test("a slow answer does not bring back a series that was removed meanwhile", async () => {
  server.series = [seriesItem()];
  await loadSeries();
  const reading = loadSeries();
  await removeSeries(series().id);
  await reading;
  expect(seriesStore.get()).toEqual([]);
});

test("showing a series names it for the pane Series and opens that pane", () => {
  showSeries("series-1");
  expect(shownSeriesStore.get()).toBe("series-1");
  expect(dockStore.get().tools).toContain(SERIES_PANE);
});

test("an entry may state until when the series is kept, as a date-time or as null", () => {
  expect(isSeriesItem(keptSeries(seriesItem(), "2026-11-28T16:25:00Z"))).toBe(true);
  expect(isSeriesItem(keptSeries(seriesItem(), null))).toBe(true);
  expect(isSeriesItem({ ...seriesItem(), kept_until: "in 14 days" })).toBe(false);
  expect(isSeriesItem({ ...seriesItem(), kept_until: 1794735612 })).toBe(false);
});

test("a series is kept for the keeping time from now, and the list takes the entry that the server answers", async () => {
  const stand = keeper();
  stand.server.series = [keptSeries(seriesItem(), "2026-11-17T09:00:00Z"), keptSeries(seriesItem(pairSeries()), null)];
  await loadSeries();
  const extended = await extendSeries(series().id);
  expect(stand.server.sent("POST")).toEqual([
    { method: "POST", address: `/api/series/${series().id}/extension`, content: undefined },
  ]);
  expect(extended.kept_until).toBe(stand.until);
  expect(seriesStore.get().map((item) => item.kept_until)).toEqual([stand.until, null]);
  stand.refuse("POST", "/api/series/", 500, null);
  await expect(extendSeries(pairSeries().id)).rejects.toThrow(
    "The series could not be kept longer (the server answered 500).",
  );
});

test("a new reading of the series after a change of the server drops the answer of the reading that was on its way", async () => {
  server.series = [seriesItem()];
  const first = loadSeries();
  server.series = [];
  await refreshSeries();
  await first;
  expect(server.sent("GET", "/api/series")).toHaveLength(2);
  expect(seriesStore.get()).toEqual([]);
});
