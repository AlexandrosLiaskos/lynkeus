// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useEffect } from "react";
import { createStore, useStore } from "../../shared/store";

/**
 * The answer of the web service about its version, its resources and its limits (`GET /api/limits`). Its format is
 * `ServiceLimits` in `api/src/lynkeus/limits.py`, and `docs/Storage.md` names the fields about what the project
 * server keeps. The notice about the version, the pane Storage and the Catalog pane are written from this answer,
 * so that no number of a limit and no duration is typed in the interface.
 */

/** What the web service may use of its machine. A value that the server could not read is null. */
export interface Resources {
  /** Number of processors. */
  processors: number | null;
  /** Memory, in bytes. */
  memory: number | null;
  /** Free space of the disk that holds the layers of the project server, in bytes. */
  free_space: number | null;
}

/** The limits of the web service. Sizes are in bytes and times in seconds. */
export interface Limits {
  /** Largest number of cells of one layer. */
  layer_cells: number;
  /** What happens to an area whose layer would hold more cells. */
  larger_layer: "refused" | "coarser";
  /** Largest size of the files of one layer. */
  layer_size: number;
  /** Largest number of jobs that run at once. */
  running_jobs: number;
  /** Largest number of jobs of all sessions that wait. */
  waiting_jobs: number;
  /** Longest time that a job may run. */
  job_time: number;
  /** Largest number of jobs of one account that wait or run. */
  account_unfinished_jobs: number;
  /** Largest number of layers of one account on the project server. */
  account_layers: number;
  /** Largest number of series of one account on the project server. */
  account_series: number;
  /** Largest total size of the layers of one account on the project server. */
  account_size: number;
  /** Largest total size of the layers of all accounts. */
  total_size: number;
  /** Largest number of products in one answer of a search. */
  search_products: number;
  /**
   * The keeping time: a layer or a series is kept for this time after it was made or last extended, and a session
   * ends after this time without use.
   */
  keep_time: number;
  /** The free space that the web service leaves on its disk: a job that would leave less is refused. It may be zero. */
  free_space_reserve: number;
  /** Time without use after which the web service forgets the Earthdata user token. */
  earthdata_idle_time: number;
  /** Longest time for which the web service holds the Earthdata user token. */
  earthdata_time: number;
}

/** The answer of the server. */
export interface ServiceLimits {
  /** Version of Lynkeus that the server runs. */
  version: string;
  resources: Resources;
  limits: Limits;
}

const ADDRESS = "/api/limits";

/** The sentence for a request that received no answer. */
export const NO_ANSWER = "The server of Lynkeus did not answer.";

/** The sentence for an answer that does not have the expected form. */
export const UNREADABLE = "The answer of the server could not be read.";

/** The names of the limits that are amounts: numbers greater than zero. The tests compare them with the server. */
export const AMOUNTS = [
  "layer_cells",
  "layer_size",
  "running_jobs",
  "waiting_jobs",
  "job_time",
  "account_unfinished_jobs",
  "account_layers",
  "account_series",
  "account_size",
  "total_size",
  "search_products",
  "keep_time",
  "earthdata_idle_time",
  "earthdata_time",
] as const satisfies readonly (keyof Limits)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Tell whether a value is a space of a disk: a number of bytes, which may be zero. */
function isSpace(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Tell whether a value that the server sent is its answer about the version, the resources and the limits. */
export function isServiceLimits(value: unknown): value is ServiceLimits {
  if (!isRecord(value) || typeof value.version !== "string" || value.version === "") {
    return false;
  }
  const { resources, limits } = value;
  if (!isRecord(resources) || !isRecord(limits)) {
    return false;
  }
  return (
    (resources.processors === null || isAmount(resources.processors)) &&
    (resources.memory === null || isAmount(resources.memory)) &&
    (resources.free_space === null || isSpace(resources.free_space)) &&
    (limits.larger_layer === "refused" || limits.larger_layer === "coarser") &&
    isSpace(limits.free_space_reserve) &&
    AMOUNTS.every((name) => isAmount(limits[name]))
  );
}

/**
 * The last answer of the server about its version, its resources and its limits, or null before the first one.
 * A text that states a limit or a duration reads it from here.
 */
export const limitsStore = createStore<ServiceLimits | null>(null);

/**
 * Ask the server for its version, its resources and its limits, and keep the answer in `limitsStore`. The
 * promise is rejected with an error whose message is a sentence for the visitor. The request carries no cookie,
 * because the answer is the same for every visitor.
 */
export async function loadLimits(): Promise<ServiceLimits> {
  let response: Response;
  try {
    response = await fetch(ADDRESS, {
      credentials: "omit",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw new Error(NO_ANSWER, { cause: error });
  }
  if (!response.ok) {
    throw new Error(`The server of Lynkeus answered with the error ${String(response.status)}.`);
  }
  const answer: unknown = await response.json().catch(() => null);
  if (!isServiceLimits(answer)) {
    throw new Error(UNREADABLE);
  }
  if (JSON.stringify(limitsStore.get()) !== JSON.stringify(answer)) {
    limitsStore.set(answer);
  }
  return answer;
}

let asking: Promise<void> | null = null;

/**
 * Read the limits of the server into `limitsStore`. A call during a request that is still on its way joins that
 * request. The promise is never rejected: after a failure the store keeps what it held.
 */
export function readLimits(): Promise<void> {
  asking ??= loadLimits()
    .then(
      () => undefined,
      () => undefined,
    )
    .finally(() => {
      asking = null;
    });
  return asking;
}

/**
 * Read the limits of the server in a component: the last answer, or null before the first one. The server is
 * asked once, when a component that needs the limits is drawn while none is known. A component that gives
 * `needed` as false asks nothing.
 */
export function useLimits(needed = true): ServiceLimits | null {
  const limits = useStore(limitsStore);
  useEffect(() => {
    if (needed && limitsStore.get() === null) {
      void readLimits();
    }
  }, [needed]);
  return limits;
}

/** Forget the limits and the request on its way. The tests start from this state. */
export function resetLimits(): void {
  asking = null;
  limitsStore.set(null);
}
