import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mapLayersStore } from "../shared/mapLayers";
import { messagesStore } from "../shared/messages/messages";
import { addWhenReadyStore, announce, followSession } from "./follow";
import { jobsStore, POLL_TIME, resetJobs } from "./jobs";
import { layersStore, resetLayers } from "./layers";
import { job, layer, showPage, standIn } from "./testSession";

beforeEach(() => {
  resetJobs();
  resetLayers();
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
