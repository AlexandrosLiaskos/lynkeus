/**
 * The answer of the web service about its version, its resources and its limits (`GET /api/limits`). Its format is
 * `ServiceLimits` in `api/src/lynkeus/limits.py`. The notice about the version is written from this answer, so that
 * no number of a limit is typed in the interface.
 */

/** What the web service may use of its machine. A value that the server could not read is null. */
export interface Resources {
  /** Number of processors. */
  processors: number | null;
  /** Memory, in bytes. */
  memory: number | null;
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
  /** Largest number of jobs of one session that wait or run. */
  session_unfinished_jobs: number;
  /** Largest number of layers of one session. */
  session_layers: number;
  /** Largest total size of the layers of one session. */
  session_size: number;
  /** Largest total size of the layers of all sessions. */
  total_size: number;
  /** Largest number of products in one answer of a search. */
  search_products: number;
  /** Time without use after which a session is removed. */
  session_idle_time: number;
  /** Time without use after which a sign-in to Earthdata ends. */
  earthdata_idle_time: number;
  /** Longest time of a sign-in to Earthdata. */
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

const AMOUNTS = [
  "layer_cells",
  "layer_size",
  "running_jobs",
  "waiting_jobs",
  "job_time",
  "session_unfinished_jobs",
  "session_layers",
  "session_size",
  "total_size",
  "search_products",
  "session_idle_time",
  "earthdata_idle_time",
  "earthdata_time",
] as const satisfies readonly (keyof Limits)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
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
    (limits.larger_layer === "refused" || limits.larger_layer === "coarser") &&
    AMOUNTS.every((name) => isAmount(limits[name]))
  );
}

/**
 * Ask the server for its version, its resources and its limits. The promise is rejected with an error whose
 * message is a sentence for the visitor. The request carries no cookie, because the answer is the same for
 * every visitor.
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
  return answer;
}
