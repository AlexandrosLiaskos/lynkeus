// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { jobsStore, loadJobs, resetJobs } from "../data/jobs";
import { layersStore, loadLayers, resetLayers } from "../data/layers";
import { loadSeries, resetSeries, seriesStore } from "../data/series";
import { Refusal } from "../data/service";
import { seriesItem } from "../data/testSeries";
import { job, layer } from "../data/testSession";
import { keeper, keptLayer, type Keeper } from "../data/testStorage";
import { OFFICE, OFFICE_NAME } from "../servers/testServers";
import { addToMap, mapLayersStore } from "../shared/mapLayers";
import { removeEverything } from "./account";

let stand: Keeper;

const KEPT_LAYER = keptLayer({ layer: layer({ id: "kept" }), size: 1000 }, "2026-11-28T16:25:00Z");
const OWN = {
  layer: layer({ id: "own", url: `/api/servers/${OFFICE.id}/files/own/vv.tif` }),
  size: 1000,
  server: OFFICE_NAME,
};

beforeEach(async () => {
  resetJobs();
  resetLayers();
  resetSeries();
  mapLayersStore.set([]);
  stand = keeper();
  stand.server.layers = [KEPT_LAYER, OWN];
  stand.server.series = [seriesItem()];
  stand.server.jobs = [job({ jobID: "one" }), job({ jobID: "away", server: OFFICE_NAME })];
  await Promise.all([loadLayers(), loadSeries(), loadJobs()]);
  addToMap(KEPT_LAYER.layer);
  addToMap(OWN.layer);
});

afterEach(() => {
  resetJobs();
  vi.unstubAllGlobals();
});

test("everything of the account leaves the project server, the lists and the map, and the servers of the account are not touched", async () => {
  await removeEverything();
  expect(stand.server.sent("DELETE", "/api/storage")).toHaveLength(1);
  expect(layersStore.get().map((entry) => entry.layer.id)).toEqual(["own"]);
  expect(seriesStore.get()).toEqual([]);
  expect(jobsStore.get().map((listed) => listed.jobID)).toEqual(["away"]);
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["own"]);
});

test("a removal that the server refuses changes nothing and gives the sentence of the server", async () => {
  stand.refuse("DELETE", "/api/storage", 401, "Sign in to Earthdata to remove what your account keeps.");
  await expect(removeEverything()).rejects.toThrow("Sign in to Earthdata to remove what your account keeps.");
  await expect(removeEverything()).rejects.toBeInstanceOf(Refusal);
  expect(layersStore.get()).toHaveLength(2);
  expect(mapLayersStore.get()).toHaveLength(2);
  stand.accept();
  stand.refuse("DELETE", "/api/storage", 500, null);
  await expect(removeEverything()).rejects.toThrow(
    "Your layers, series and jobs could not be removed (the server answered 500).",
  );
});
