// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type { Limits, Resources, ServiceLimits } from "./limits";
import { amount, countWords, memoryWords, sizeWords, timeWords } from "./numbers";

/**
 * The sentences of the notice about the version. Every number comes from the answer of the server or from the
 * version of the page. Each limit stands with its reason, as the module of the server that applies the limit and
 * the research note of the Data part state it.
 */

/** What the notice says first, with the version of the page. */
export function versionSentence(version: string): string {
  return `This is version ${version} of Lynkeus. The application is under development, and its functions and its limits may change.`;
}

/** What the notice says when the server runs another version than the page, or null when the versions agree. */
export function serverVersionSentence(page: string, server: string): string | null {
  return server === page ? null : `The server runs version ${server}. Reload the page to receive the same version.`;
}

/** What the notice says while it waits for the answer of the server. */
export const ASKING = "Reading the resources and the limits of the server.";

/** What the notice adds to the sentence of a request that failed. */
export const NOT_SHOWN =
  "The resources and the limits of the server cannot be shown. Close this notice and open it again to ask once more.";

/** Where the full description of the application is. */
export const DESCRIPTION = "The full description of the application is under About, in the Help tab.";

/** Say what Lynkeus may use of its server. */
export function resourcesSentence({ processors, memory }: Resources): string {
  const processorWords = processors === null ? null : amount(processors, "processor", "processors");
  const memoryAmount = memory === null ? null : `${memoryWords(memory)} of memory`;
  if (processorWords !== null && memoryAmount !== null) {
    return `Lynkeus runs on a server where it may use ${processorWords} and ${memoryAmount}.`;
  }
  if (processorWords !== null) {
    return `Lynkeus runs on a server where it may use ${processorWords}. The memory that it may use could not be read.`;
  }
  if (memoryAmount !== null) {
    return `Lynkeus runs on a server where it may use ${memoryAmount}. The number of processors that it may use could not be read.`;
  }
  return "The processors and the memory that Lynkeus may use on its server could not be read.";
}

/**
 * What Lynkeus does with an area whose layer would hold more cells than the limit. The value `larger_layer` of
 * the answer chooses the sentence, so the notice changes with the server and not with the page.
 */
export const LARGER_LAYER: Record<Limits["larger_layer"], string> = {
  refused: "An area that needs more cells is refused.",
  coarser: "A larger area is received at a coarser cell size.",
};

/** Say for how long the web service holds the Earthdata user token: "30 minutes without use, and 8 hours at the latest". */
export function tokenTimeWords(limits: Limits): string {
  return `${timeWords(limits.earthdata_idle_time)} without use, and ${timeWords(limits.earthdata_time)} at the latest`;
}

/**
 * Say how much free space the web service leaves on its disk, and how much is free now where the server could
 * read it.
 */
export function freeSpaceSentence({ resources, limits }: Pick<ServiceLimits, "resources" | "limits">): string {
  const free = resources.free_space === null ? "" : ` At present ${sizeWords(resources.free_space)} are free.`;
  return `A job is refused when it would leave less than ${sizeWords(limits.free_space_reserve)} free on the disk of the server, so that the disk does not fill.${free}`;
}

/** Say each limit of the server with its reason, one limit or one group of limits in each entry. */
export function limitSentences({ resources, limits }: ServiceLimits): string[] {
  const jobs = amount(limits.running_jobs, "job", "jobs");
  const memory =
    resources.memory === null
      ? `because the memory of Lynkeus is limited and it runs ${jobs} at once`
      : `because Lynkeus has ${memoryWords(resources.memory)} of memory and runs ${jobs} at once`;
  const running = limits.running_jobs === 1 ? "1 job runs" : `${countWords(limits.running_jobs)} jobs run`;
  const processors =
    resources.processors === null
      ? ""
      : `, because Lynkeus has ${amount(resources.processors, "processor", "processors")}`;
  const keep = timeWords(limits.keep_time);
  return [
    `A layer may hold at most ${countWords(limits.layer_cells)} cells, ${memory}. ${LARGER_LAYER[limits.larger_layer]}`,
    `At most ${running} at once${processors}. A job may run for at most ${timeWords(limits.job_time)}, which covers the wait for NASA Harmony and the writing of the layer.`,
    `An Earthdata account may have at most ${amount(limits.account_unfinished_jobs, "job", "jobs")} waiting or running, so that one visitor does not fill the queue, which holds at most ${amount(limits.waiting_jobs, "job", "jobs")} of all accounts.`,
    `An Earthdata account may keep at most ${amount(limits.account_layers, "layer", "layers")}, ${amount(limits.account_series, "series", "series")} and ${sizeWords(limits.account_size)} of files on the project server, and the files of one layer may take at most ${sizeWords(limits.layer_size)}, because the layers of all accounts share ${sizeWords(limits.total_size)} of the disk of the server.`,
    `The project server keeps a layer or a series for ${keep} after it was made or last extended, and then removes it, which frees its storage. A file that you download is the permanent copy.`,
    freeSpaceSentence({ resources, limits }),
    `A search lists at most ${amount(limits.search_products, "product", "products")} at a time. The Catalog pane loads the next ones on request.`,
    `A browser stays signed in to an Earthdata account for ${keep} without use, the time for which a layer is kept.`,
    `The web service holds the Earthdata user token in its memory for ${tokenTimeWords(limits)}. Afterwards the visitor stays signed in, and the token is asked again when a request to NASA needs it.`,
  ];
}
