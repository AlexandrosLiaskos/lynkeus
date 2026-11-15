import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mapLayersStore } from "../shared/mapLayers";
import { messagesStore } from "../shared/messages/messages";
import { addWhenReadyStore, announce, followSession } from "./follow";
import { jobsStore, POLL_TIME, resetJobs } from "./jobs";
import { layersStore, resetLayers } from "./layers";
import { resetSeries, seriesStore } from "./series";
import { series, seriesItem } from "./testSeries";
import { job, layer, showPage, standIn } from "./testSession";

beforeEach(() => {
  resetJobs();
  resetLayers();
  resetSeries();
  showPage(true);
  mapLayersStore.set([]);
  messagesStore.set([]);
  addWhenReadyStore.set(true);
});

afterEach(() => {
  resetJobs();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const messages = () => messagesStore.get().map(({ kind, text }) => [kind, text]);

test("a successful job puts its layer in the list and on the map, and the visitor is told", async () => {
  const server = standIn();
  server.layers = [{ layer: layer({ id: "made" }), size: 1000 }];
  await announce(job({ status: "successful", layer: "made" }));
  expect(layersStore.get().map((entry) => entry.layer.id)).toEqual(["made"]);
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["made"]);
  expect(messages()).toEqual([
    ["success", 'The layer "Backscatter HH, 21 Oct 2026" is ready and was added to the map.'],
  ]);
});

test("the layer stays off the map when the visitor asked for that", async () => {
  const server = standIn();
  server.layers = [{ layer: layer({ id: "made" }) }];
  addWhenReadyStore.set(false);
  await announce(job({ status: "successful", layer: "made" }));
  expect(mapLayersStore.get()).toEqual([]);
  expect(messages()).toEqual([
    ["success", 'The layer "Backscatter HH, 21 Oct 2026" is ready. The Catalog pane lists it.'],
  ]);
});

test("a job that does not name its layer is asked for its result", async () => {
  const server = standIn();
  const made = job({ jobID: "a", status: "successful", layer: "made" });
  server.layers = [{ layer: layer({ id: "made" }) }];
  server.jobs = [made];
  await announce({ ...made, layer: undefined });
  expect(server.sent("GET", "/api/jobs/a/results")).toHaveLength(1);
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["made"]);
});

test("a successful job whose layer cannot be read is reported as a warning", async () => {
  standIn();
  await announce(job({ jobID: "gone", status: "successful", layer: "made" }));
  expect(mapLayersStore.get()).toEqual([]);
  expect(messages()).toEqual([
    [
      "warning",
      'The job "Backscatter HH, 21 Oct 2026" has finished, but its layer could not be read. Your session has no job of this name.',
    ],
  ]);
});

test("a failed job is reported with the sentence of the server", async () => {
  standIn();
  await announce(job({ status: "failed", message: "The area lies outside the product." }));
  expect(messages()).toEqual([
    ["error", 'The job "Backscatter HH, 21 Oct 2026" failed. The area lies outside the product.'],
  ]);
});

test("the page reads the jobs and the layers when it loads, and announces a job that ends while it watches", async () => {
  vi.useFakeTimers();
  const server = standIn();
  server.layers = [{ layer: layer({ id: "old", title: "Old layer" }) }];
  server.jobs = [job({ jobID: "a" }), job({ jobID: "z", status: "successful", layer: "old" })];
  const stop = followSession();
  await vi.advanceTimersByTimeAsync(0);
  expect(jobsStore.get()).toHaveLength(2);
  expect(layersStore.get()).toHaveLength(1);
  expect(messages()).toEqual([]);
  server.layers = [{ layer: layer({ id: "made" }) }, ...server.layers];
  server.change("a", { status: "successful", progress: 100, layer: "made" });
  await vi.advanceTimersByTimeAsync(POLL_TIME);
  await vi.advanceTimersByTimeAsync(0);
  expect(messages()).toEqual([
    ["success", 'The layer "Backscatter HH, 21 Oct 2026" is ready and was added to the map.'],
  ]);
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["made"]);
  stop();
  server.jobs = [job({ jobID: "b" }), ...server.jobs];
  await vi.advanceTimersByTimeAsync(10 * POLL_TIME);
  expect(jobsStore.get()).toHaveLength(2);
});

test("a successful job of a Series tool puts its series in the list, and the visitor is told without a warning", async () => {
  const server = standIn();
  server.series = [seriesItem()];
  await announce(job({ processID: "backscatter-series", status: "successful", series: series().id }));
  expect(seriesStore.get().map((item) => item.series.id)).toEqual([series().id]);
  expect(layersStore.get()).toEqual([]);
  expect(mapLayersStore.get()).toEqual([]);
  expect(server.sent("GET", "/api/layers")).toEqual([]);
  expect(messages()).toEqual([
    ["success", 'The series "Backscatter HH, mean of the area" is ready. The Catalog pane lists it.'],
  ]);
});

test("a series that the list does not hold yet is asked for as the result of its job", async () => {
  const server = standIn();
  const made = job({ jobID: "a", processID: "backscatter-series", status: "successful", series: series().id });
  server.jobs = [made];
  server.series = [seriesItem()];
  server.refuse("GET", "/api/series", 503, "The server is busy.");
  await announce(made);
  expect(server.sent("GET", "/api/jobs/a/results")).toHaveLength(1);
  expect(messages()).toEqual([
    ["success", 'The series "Backscatter HH, mean of the area" is ready. The Catalog pane lists it.'],
  ]);
});

test("a successful job whose series cannot be read is reported as a warning about the series", async () => {
  standIn();
  await announce(job({ jobID: "gone", title: "Series of backscatter", status: "successful", series: "s-1" }));
  expect(messages()).toEqual([
    [
      "warning",
      'The job "Series of backscatter" has finished, but its series could not be read. Your session has no job of this name.',
    ],
  ]);
});

test("the page reads the series when it loads, and announces a series job that ends while it watches", async () => {
  vi.useFakeTimers();
  const server = standIn();
  server.series = [seriesItem(series({ id: "old", title: "Old series" }))];
  server.jobs = [job({ jobID: "a", processID: "backscatter-series", title: "Series of backscatter" })];
  const stop = followSession();
  await vi.advanceTimersByTimeAsync(0);
  expect(seriesStore.get().map((item) => item.series.id)).toEqual(["old"]);
  server.series = [seriesItem(), ...server.series];
  server.change("a", { status: "successful", progress: 100, series: series().id });
  await vi.advanceTimersByTimeAsync(POLL_TIME);
  await vi.advanceTimersByTimeAsync(0);
  expect(messages()).toEqual([
    ["success", 'The series "Backscatter HH, mean of the area" is ready. The Catalog pane lists it.'],
  ]);
  expect(seriesStore.get().map((item) => item.series.id)).toEqual([series().id, "old"]);
  stop();
});
