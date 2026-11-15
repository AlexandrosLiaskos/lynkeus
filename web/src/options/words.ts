// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { formatMoment, type Job } from "../data/jobs";
import type { LayerEntry } from "../data/layers";
import type { SeriesItem } from "../data/series";
import { amount, countWords, sizeWords, timeWords } from "../header/notice/numbers";
import type { Limits } from "../header/notice/limits";
import { systemOfServer, type System } from "../servers/downloads";

/** What the pane Storage writes about the project server and about the servers of the visitor. */

/** Write an amount beside its limit, as "12 of at most 50", or the amount alone while the limit is not known. */
export function ofMost(value: string, most: string | null): string {
  return most === null ? value : `${value} of at most ${most}`;
}

/** Return the layers that the project server keeps, among the layers of the list. */
export function projectLayers(entries: readonly LayerEntry[]): LayerEntry[] {
  return entries.filter((entry) => entry.server === null);
}

/** Return the jobs of the project server, among the jobs of the list. */
export function projectJobs(jobs: readonly Job[]): Job[] {
  return jobs.filter((job) => !job.server);
}

/** Tell whether a job waits or runs. */
export function isUnfinished(job: Job): boolean {
  return job.status === "accepted" || job.status === "running";
}

/**
 * Return the total size of the files of some layers in bytes, and whether the server stated the size of each
 * one. Where it did not, the total is the least that the layers take.
 */
export function filesSize(entries: readonly LayerEntry[]): { bytes: number; complete: boolean } {
  return {
    bytes: entries.reduce((sum, entry) => sum + (entry.size ?? 0), 0),
    complete: entries.every((entry) => entry.size !== null),
  };
}

/** Write the number of layers or series that the account keeps, beside the limit of the account. */
export function countLine(count: number, most: number | null): string {
  return ofMost(countWords(count), most === null ? null : countWords(most));
}

/** Write the size of the files of the layers that the account keeps, beside the limit of the account. */
export function sizeLine({ bytes, complete }: { bytes: number; complete: boolean }, most: number | null): string {
  const size = `${complete ? "" : "At least "}${sizeWords(bytes)}`;
  return ofMost(size, most === null ? null : sizeWords(most));
}

/** Write the number of records of jobs, and how many of the jobs wait or run beside the limit of the account. */
export function jobsLine(jobs: readonly Job[], most: number | null): string {
  const unfinished = countLine(jobs.filter(isUnfinished).length, most);
  return `${amount(jobs.length, "record", "records")}, ${unfinished} waiting or running`;
}

/** State when the record of a job leaves the project server. `keep` is the keeping time in seconds, or null. */
export function jobsUntilWords(keep: number | null): string {
  const time = keep === null ? "the keeping time" : timeWords(keep);
  return `Until its layer or series is removed; a failed or cancelled job for ${time}`;
}

/** What the project server removes next: the moment, and the layer or the series in words. */
export interface NextRemoval {
  until: string;
  what: string;
}

/**
 * Return what the project server removes next among the layers and the series that state until when they are
 * kept, or null when none states it. Of two that share the moment, the first of the lists is named.
 */
export function nextRemoval(layers: readonly LayerEntry[], series: readonly SeriesItem[]): NextRemoval | null {
  const dated: NextRemoval[] = [
    ...projectLayers(layers).flatMap(({ layer, keptUntil }) =>
      keptUntil === undefined ? [] : [{ until: keptUntil, what: `the layer "${layer.title}"` }],
    ),
    ...series.flatMap(({ series: described, kept_until: until }) =>
      typeof until === "string" ? [{ until, what: `the series "${described.title}"` }] : [],
    ),
  ];
  return dated.reduce<NextRemoval | null>(
    (first, next) => (first === null || Date.parse(next.until) < Date.parse(first.until) ? next : first),
    null,
  );
}

/** Write the next removal of the project server, or that nothing waits for one. */
export function nextRemovalWords(next: NextRemoval | null): string {
  return next === null ? "No layer or series states a date" : `${formatMoment(next.until)}: ${next.what}`;
}

/** What the confirmation of the command "Remove everything of mine" counts. */
export interface Everything {
  /** Jobs of the project server that wait or run. */
  unfinished: number;
  layers: number;
  series: number;
}

/**
 * State what the command "Remove everything of mine" removes from the project server and what stays, as the
 * two paragraphs of its confirmation (`DELETE /api/storage` of `docs/Storage.md`).
 */
export function everythingWords({ unfinished, layers, series }: Everything): [string, string] {
  const ends =
    unfinished === 0 ? "" : `ends your ${amount(unfinished, "waiting or running job", "waiting or running jobs")} and `;
  return [
    `The project server ${ends}removes your ${amount(layers, "layer", "layers")} with ${layers === 1 ? "its" : "their"} files, your ${amount(series, "series", "series")} and the records of your jobs. This cannot be undone.`,
    "Your servers and their layers, the files that you downloaded and what this browser keeps stay as they are, and you stay signed in.",
  ];
}

/**
 * The folder in which Lynkeus Server keeps its layers, its record, its settings and its log on each system,
 * unless the program was started with another data folder (`data_folder` in `api/src/lynkeus/computer.py` and
 * the table of `docs/Own_Servers.md`).
 */
export const DATA_FOLDERS: Record<System, string> = {
  windows: "%LOCALAPPDATA%\\Lynkeus",
  macos: "~/Library/Application Support/Lynkeus",
  linux: "~/.local/share/lynkeus",
};

/** The folder of Lynkeus Server on Linux where the variable XDG_DATA_HOME is set. */
export const LINUX_SET_FOLDER = "$XDG_DATA_HOME/lynkeus";

/** The explanation of the row that names the folder of Lynkeus Server on a computer. */
export function folderInfo(system: System | null): string {
  const start =
    "The folder in which Lynkeus Server keeps its layers, its record, its settings and its log, unless the program was started with another data folder.";
  return system === "linux"
    ? `${start} Where the variable XDG_DATA_HOME is set, the folder is ${LINUX_SET_FOLDER}.`
    : start;
}

/**
 * Return the folder of Lynkeus Server on the computer of a server, from the name of the system that the
 * server reports, or null when the server names none of the three systems.
 */
export function folderOf(system: string): { system: System; folder: string } | null {
  const known = systemOfServer(system);
  return known === null ? null : { system: known, folder: DATA_FOLDERS[known] };
}

/** Return the limits of the account that the pane shows beside what the account keeps, or nulls while unknown. */
export function accountLimits(limits: Limits | null): {
  layers: number | null;
  series: number | null;
  size: number | null;
  unfinished: number | null;
  keep: number | null;
} {
  return {
    layers: limits?.account_layers ?? null,
    series: limits?.account_series ?? null,
    size: limits?.account_size ?? null,
    unfinished: limits?.account_unfinished_jobs ?? null,
    keep: limits?.keep_time ?? null,
  };
}
