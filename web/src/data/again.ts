// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { PROJECT_SERVER, serverOfAddress, serversStore } from "../shared/servers";
import { createStore } from "../shared/store";
import { startJob, type Job } from "./jobs";
import type { LayerSource } from "./layers";

/**
 * The layers of the map that were requested again after the server had removed them (`docs/Storage.md`, States
 * of a stored layer): by the id of the removed layer, the id of the job that makes the layer again. The browser
 * keeps them with the layers of the map, so that the new layer takes the place of the old one also when its job
 * ends after the page was loaded again.
 */
export const againStore = createStore<Readonly<Record<string, string>>>({});

/** Tell whether a job makes again a layer of the map that the server had removed. Its layer goes on the map when it is ready. */
export function isAgainJob(job: string): boolean {
  return Object.values(againStore.get()).includes(job);
}

/**
 * Return the parameter `server` of the job that makes a layer again: the server of the visitor that kept the
 * layer, while the list of his servers names it, and otherwise the project server. A visitor without a server
 * names none, as the forms of the tools do.
 *
 * @param address The address of the file of the removed layer.
 */
export function serverOfLayer(address: string): string | undefined {
  const servers = serversStore.get()?.servers ?? [];
  const keeper = serverOfAddress(address);
  if (keeper !== null && servers.some((server) => server.id === keeper)) {
    return keeper;
  }
  return servers.length > 0 ? PROJECT_SERVER : undefined;
}

/**
 * Request again a layer that the server removed: its `source`, the request that made it, is sent once more as
 * every job is started. The job is recorded for the removed layer, and the new layer takes its place on the map
 * when the job ends. When the server needs the token, the request waits for the sign-in as every start of a job.
 *
 * @param id The id of the removed layer.
 * @param source The request that made the layer.
 * @param address The address of the file of the removed layer, which tells the server that kept it.
 */
export async function getAgain(id: string, source: LayerSource, address: string): Promise<Job> {
  const job = await startJob(source.process, source.inputs, serverOfLayer(address));
  againStore.set({ ...againStore.get(), [id]: job.jobID });
  return job;
}

/** Forget the layers that were requested again. The tests start from this state. */
export function resetAgain(): void {
  againStore.set({});
}
