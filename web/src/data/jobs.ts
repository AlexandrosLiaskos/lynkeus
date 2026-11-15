// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { utcDay } from "../shared/days";
import { isLayerDescription, type LayerDescription } from "../shared/layer";
import { isServerName, type ServerName } from "../shared/servers";
import { createStore } from "../shared/store";
import { call, checked, Refusal, wordsOf } from "./service";

/** The states of a job, as OGC API - Processes, Part 1: Core (OGC 18-062r2) names them. */
export const JOB_STATUSES = ["accepted", "running", "successful", "failed", "dismissed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/**
 * A job of the session, as the server describes it: the status information of OGC API - Processes, with the
 * name of the job for the visitor, the inputs of the job and the layer that it produced.
 */
export interface Job {
  jobID: string;
  /** Name of the process that the job runs: `get-layer`, or the name of an analysis tool. */
  processID: string;
  type: "process";
  /** Name of the job for the visitor. */
  title: string;
  status: JobStatus;
  /** One sentence of the server about the state of the job. */
  message: string;
  /** When the job was requested, as a date-time of RFC 3339. */
  created: string;
  /** When the work started and when it ended. A job that waits has neither. */
  started?: string | null;
  finished?: string | null;
  /** When the state last changed. */
  updated: string;
  /** Share of the work that is done, in percent. */
  progress: number;
  /** The inputs with which the job was started. */
  inputs?: Record<string, unknown> | null;
  /** The id of the layer that a successful job produced. */
  layer?: string | null;
  /** The id of the series that a successful job of a Series tool produced, in the place of `layer`. */
  series?: string | null;
  /** The own server of the visitor on which the job runs, or null or absent for the project server. */
  server?: ServerName | null;
}

/** The words that name each state in the interface. */
export const STATUS_WORDS: Record<JobStatus, string> = {
  accepted: "Waiting",
  running: "Running",
  successful: "Finished",
  failed: "Failed",
  dismissed: "Cancelled",
};

/** The orders of the list of jobs, with the words that name them. */
export const JOB_SORTS = {
  newest: "Start, latest first",
  oldest: "Start, earliest first",
  status: "Status",
  name: "Name",
} as const;
export type JobSort = keyof typeof JOB_SORTS;

/** The parts of the list of jobs that can be shown alone, with the words that name them. */
export const JOB_FILTERS = {
  all: "All jobs",
  unfinished: "Waiting and running",
  successful: "Finished",
  failed: "Failed",
} as const;
export type JobFilter = keyof typeof JOB_FILTERS;

/**
 * The time between two readings of the jobs while a job waits or runs, in milliseconds. One reading is one
 * request, so the page sends 20 requests a minute, and the web server accepts 120 a minute from one address.
 */
export const POLL_TIME = 3000;

/** The longest time between two readings after the server has not answered, in milliseconds. */
export const LONGEST_PAUSE = 30_000;

/** The largest number of pages of the list of jobs that one reading follows. */
const MOST_PAGES = 20;

const JOBS = "/api/jobs";
const MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const STATUS_ORDER: readonly JobStatus[] = ["running", "accepted", "failed", "successful", "dismissed"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/** Tell whether a value is a date-time of RFC 3339. */
export function isMoment(value: unknown): value is string {
  return typeof value === "string" && MOMENT.test(value) && !Number.isNaN(Date.parse(value));
}

function isAbsent(value: unknown): value is null | undefined {
  return value === undefined || value === null;
}

/** Tell whether a value that the server sent is the state of a job. */
export function isJob(value: unknown): value is Job {
  if (!isRecord(value)) {
    return false;
  }
  const { progress, inputs, layer, series, server } = value;
  return (
    [value.jobID, value.processID, value.title].every(isText) &&
    value.type === "process" &&
    JOB_STATUSES.some((status) => status === value.status) &&
    typeof value.message === "string" &&
    [value.created, value.updated].every(isMoment) &&
    [value.started, value.finished].every((moment) => isAbsent(moment) || isMoment(moment)) &&
    typeof progress === "number" &&
    Number.isInteger(progress) &&
    progress >= 0 &&
    progress <= 100 &&
    (isAbsent(inputs) || isRecord(inputs)) &&
    (isAbsent(layer) || isText(layer)) &&
    (isAbsent(series) || isText(series)) &&
    (isAbsent(server) || isServerName(server))
  );
}

interface JobList {
  jobs: Job[];
  links?: unknown;
}

function isJobList(value: unknown): value is JobList {
  return isRecord(value) && Array.isArray(value.jobs) && value.jobs.every(isJob);
}

/** Return the address of the next page of the list of jobs, or null when the answer names none on this site. */
export function nextPage(links: unknown): string | null {
  if (!Array.isArray(links)) {
    return null;
  }
  for (const link of links as unknown[]) {
    if (isRecord(link) && link.rel === "next" && typeof link.href === "string" && link.href.startsWith(`${JOBS}?`)) {
      return link.href;
    }
  }
  return null;
}

/** Tell whether a job waits or runs. */
export function isUnfinished(job: Job): boolean {
  return job.status === "accepted" || job.status === "running";
}

/**
 * Return the time for which a job has worked, in seconds, or null for a job that has not started. For a job
 * that runs, the time ends at the last change that the server recorded.
 */
export function runTime(job: Job): number | null {
  if (!job.started) {
    return null;
  }
  const end = job.finished ?? job.updated;
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(job.started)) / 1000));
}

/** Write a time in seconds in the form "45 s", "2 min 5 s" or "1 h 3 min". */
export function formatRunTime(seconds: number): string {
  if (seconds < 60) {
    return `${String(seconds)} s`;
  }
  if (seconds < 3600) {
    return `${String(Math.floor(seconds / 60))} min ${String(seconds % 60)} s`;
  }
  return `${String(Math.floor(seconds / 3600))} h ${String(Math.floor((seconds % 3600) / 60))} min`;
}

const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

/** Write a date-time in Coordinated Universal Time, in the form "14 Nov 2026, 16:20:05 UTC". */
export function formatMoment(moment: string): string {
  const date = new Date(moment);
  return `${utcDay(date)}, ${TIME_FORMAT.format(date)} UTC`;
}

/** Return the jobs in the order asked. Jobs that are equal in that order keep the order of the list. */
export function sortJobs(jobs: readonly Job[], sort: JobSort): Job[] {
  const sorted = [...jobs];
  switch (sort) {
    case "newest":
      return sorted.sort((a, b) => Date.parse(b.created) - Date.parse(a.created));
    case "oldest":
      return sorted.sort((a, b) => Date.parse(a.created) - Date.parse(b.created));
    case "status":
      return sorted.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
    case "name":
      return sorted.sort((a, b) => a.title.localeCompare(b.title, "en"));
  }
}

/** Return the jobs of one part of the list. */
export function filterJobs(jobs: readonly Job[], filter: JobFilter): Job[] {
  switch (filter) {
    case "all":
      return [...jobs];
    case "unfinished":
      return jobs.filter(isUnfinished);
    case "successful":
      return jobs.filter((job) => job.status === "successful");
    case "failed":
      return jobs.filter((job) => job.status === "failed");
  }
}

/** The jobs of the session, in the order of the server: the newest first. */
export const jobsStore = createStore<readonly Job[]>([]);

/** Why the last reading of the jobs failed, in a sentence for the visitor, or null when it succeeded. */
export const jobsFaultStore = createStore<string | null>(null);

const listeners = new Set<(job: Job) => void>();

/**
 * Call the listener with each job that the page sees end: a job that waited or ran at one reading and has
 * succeeded or failed at the next. The function returned ends the subscription.
 */
export function onJobFinished(listener: (job: Job) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// The number of changes that this page has made to the list. The answer to a reading is dropped when the number
// has changed since the reading started, so that a slow answer cannot bring back a job that was removed.
let changes = 0;
let reading: Promise<void> | null = null;
let failures = 0;
let watching = false;
let timer: number | undefined;

function keep(jobs: readonly Job[]): void {
  const before = jobsStore.get();
  const listed = jobs.filter((job) => job.status !== "dismissed");
  // A list that has not changed keeps its place in the store, and the elements that show it are not drawn again.
  if (JSON.stringify(before) !== JSON.stringify(listed)) {
    jobsStore.set(listed);
  }
  for (const job of listed) {
    const earlier = before.find((other) => other.jobID === job.jobID);
    if (earlier && isUnfinished(earlier) && !isUnfinished(job)) {
      listeners.forEach((listener) => listener(job));
    }
  }
}

async function readJobs(): Promise<void> {
  const turn = changes;
  try {
    const jobs: Job[] = [];
    let address: string | null = JOBS;
    for (let page = 0; address !== null && page < MOST_PAGES; page += 1) {
      const answer = checked(await call(address, { failure: "The jobs could not be read" }), isJobList);
      jobs.push(...answer.jobs);
      address = nextPage(answer.links);
    }
    failures = 0;
    if (turn === changes) {
      jobsFaultStore.set(null);
      keep(jobs);
    }
  } catch (error) {
    failures += 1;
    if (turn === changes) {
      jobsFaultStore.set(wordsOf(error, "The jobs could not be read."));
    }
  }
}

/**
 * Read the jobs of the session from the server and keep them in the store. A call during a reading that is
 * still on its way joins that reading. The promise is never rejected: a failure is stated in `jobsFaultStore`.
 */
export function loadJobs(): Promise<void> {
  reading ??= readJobs().finally(() => {
    reading = null;
  });
  return reading;
}

// The next reading is planned only while the page is watched and shown and a job waits or runs. After a reading
// without an answer the pause doubles, up to the longest pause.
function plan(): void {
  window.clearTimeout(timer);
  timer = undefined;
  if (watching && document.visibilityState === "visible" && jobsStore.get().some(isUnfinished)) {
    timer = window.setTimeout(refresh, Math.min(LONGEST_PAUSE, POLL_TIME * 2 ** failures));
  }
}

function refresh(): void {
  void loadJobs().then(plan);
}

function onVisibility(): void {
  if (document.visibilityState === "visible") {
    refresh();
  } else {
    plan();
  }
}

/**
 * Read the jobs of the session, and read them again every three seconds while a job waits or runs and the page
 * is shown. A page that is shown again reads them at once. The page calls this once, when it loads. The function
 * returned ends the readings.
 */
export function watchJobs(): () => void {
  watching = true;
  document.addEventListener("visibilitychange", onVisibility);
  refresh();
  return () => {
    watching = false;
    document.removeEventListener("visibilitychange", onVisibility);
    plan();
  };
}

/**
 * Start a job that runs a process with the given inputs, and return it. `server` is the parameter `server` of
 * the execution: the name of an own server of the visitor, or the word `project` for the project server.
 * Without it the project server chooses: the connected own server with the fewest unfinished jobs that keeps
 * every input layer, or itself when there is none.
 *
 * The promise is rejected with an error whose message can be shown to the visitor: the sentence of the server
 * when a limit does not allow the job (`Refusal`, with the status 429, 503 or 507), when the visitor is not
 * signed in to Earthdata (401), or when the input layers are not kept on the server of the job (422).
 */
export async function startJob(process: string, inputs: Record<string, unknown>, server?: string): Promise<Job> {
  const choice = server === undefined ? "" : `?server=${encodeURIComponent(server)}`;
  const job = checked(
    await call(`/api/processes/${encodeURIComponent(process)}/execution${choice}`, {
      method: "POST",
      content: { inputs },
      failure: "The job could not be started",
    }),
    isJob,
  );
  changes += 1;
  jobsStore.set([job, ...jobsStore.get().filter((other) => other.jobID !== job.jobID)]);
  plan();
  return job;
}

/**
 * Dismiss a job: the server ends a job that waits or runs, and removes the record of a finished job. The layer
 * of a successful job stays. A job that the server no longer holds is taken off the list as well.
 */
export async function dismissJob(id: string): Promise<void> {
  try {
    await call(`${JOBS}/${encodeURIComponent(id)}`, { method: "DELETE", failure: "The job could not be removed" });
  } catch (error) {
    if (!(error instanceof Refusal && (error.status === 404 || error.status === 410))) {
      throw error;
    }
  }
  changes += 1;
  jobsStore.set(jobsStore.get().filter((job) => job.jobID !== id));
}

/** Remove the records of all finished jobs, one after the other, and return their number. */
export async function removeFinishedJobs(): Promise<number> {
  let removed = 0;
  for (const job of jobsStore.get().filter((listed) => !isUnfinished(listed))) {
    await dismissJob(job.jobID);
    removed += 1;
  }
  return removed;
}

/** Ask the server for the description of the layer that a successful job produced. */
export async function jobResult(id: string): Promise<LayerDescription> {
  const answer = await call(`${JOBS}/${encodeURIComponent(id)}/results`, {
    failure: "The result of the job could not be read",
  });
  return checked(answer, isLayerDescription);
}

/** Forget the jobs, the listeners and the readings on their way. The tests start from this state. */
export function resetJobs(): void {
  window.clearTimeout(timer);
  document.removeEventListener("visibilitychange", onVisibility);
  timer = undefined;
  watching = false;
  changes += 1;
  reading = null;
  failures = 0;
  listeners.clear();
  jobsStore.set([]);
  jobsFaultStore.set(null);
}
