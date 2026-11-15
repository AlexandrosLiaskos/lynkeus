// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { refreshLayers, layersStore } from "../data/layers";
import { loadJobs } from "../data/jobs";
import { refreshSeries } from "../data/series";
import { call } from "../data/service";
import { removeFromMap } from "../shared/mapLayers";

const STORAGE = "/api/storage";

/**
 * Remove everything that the account has on the project server (`DELETE /api/storage` of `docs/Storage.md`):
 * the server ends the jobs of the account and removes its layers, its series and the records of its jobs. The
 * servers of the account and their layers are not touched. The layers that the project server kept leave the
 * map, and the lists of jobs, layers and series are read again. The promise is rejected with an error whose
 * message can be shown to the visitor.
 */
export async function removeEverything(): Promise<void> {
  const kept = layersStore.get().filter((entry) => entry.server === null);
  await call(STORAGE, { method: "DELETE", failure: "Your layers, series and jobs could not be removed" });
  for (const { layer } of kept) {
    removeFromMap(layer.id);
  }
  await Promise.all([refreshLayers(), refreshSeries(), loadJobs()]);
}
