// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { METHODS } from "../analysis/methodSheets";
import { STATUS_WORDS, type Job } from "../data/jobs";
import type { LayerDescription } from "../shared/layer";
import type { KeptLayer, LayerState } from "./kept";

/**
 * The sentences and the commands of the states of a stored layer (`docs/Storage.md`, States of a stored layer).
 * Each state other than "ready" has one sentence and one action. The table of
 * `docs/research/storage-interface.md` lists them, and a test compares the two.
 */

/** The commands of the states, as their buttons name them. */
export const STATE_COMMANDS = {
  signIn: "Sign in",
  removeFromBrowser: "Remove from this browser",
  getAgain: "Get again",
  removeFromMap: "Remove from the map",
} as const;

/** What the row of a removed layer adds to the dates of the layer. */
export const REMOVED_MARK = "removed from the server";

/** The layers that wait for the sign-in to one account. */
export interface Waiting {
  /** The Earthdata account that owns the layers, or null for layers that were stored before the owner was recorded. */
  account: string | null;
  /** The ids of the layers. */
  ids: readonly string[];
}

/**
 * Return the layers that wait for the sign-in, one group for each account, in the order in which the accounts
 * first stand among the kept layers.
 */
export function waitingGroups(kept: readonly KeptLayer[], states: Readonly<Record<string, LayerState>>): Waiting[] {
  const groups = new Map<string | null, string[]>();
  for (const { layer, account } of kept) {
    if (states[layer.id] === "waits") {
      groups.set(account, [...(groups.get(account) ?? []), layer.id]);
    }
  }
  return [...groups].map(([account, ids]) => ({ account, ids }));
}

/** Return the ids of the kept layers that are in one state, in their order. */
export function idsIn(
  kept: readonly KeptLayer[],
  states: Readonly<Record<string, LayerState>>,
  state: LayerState,
): string[] {
  return kept.filter(({ layer }) => states[layer.id] === state).map(({ layer }) => layer.id);
}

function layersWords(count: number): string {
  return count === 1 ? "1 layer of this map" : `${String(count)} layers of this map`;
}

/**
 * Return the sentence of the notice for the layers that wait for the sign-in to one account.
 *
 * @param count The number of the layers.
 * @param account The account that owns them, or null when it was not recorded.
 * @param user The account of the sign-in now, or null for a visitor who is not signed in.
 */
export function waitsWords(count: number, account: string | null, user: string | null): string {
  const one = count === 1;
  if (account === null) {
    return `${layersWords(count)} ${one ? "was" : "were"} stored without the name of ${one ? "its" : "their"} Earthdata account and ${one ? "is" : "are"} not shown. Sign in to Earthdata to show ${one ? "it" : "them"} again.`;
  }
  if (user === null) {
    return `${layersWords(count)} ${one ? "belongs" : "belong"} to the Earthdata account ${account} and ${one ? "is" : "are"} not shown. Sign in to that account to show ${one ? "it" : "them"} again.`;
  }
  return `${layersWords(count)} ${one ? "belongs" : "belong"} to the Earthdata account ${account}, and you are signed in as ${user}. ${one ? "It is" : "They are"} shown again after a sign-in as ${account}.`;
}

/** Return the sentence of the notice for the layers about which the project server does not answer. */
export function noAnswerWords(count: number): string {
  return `The project server does not answer, so ${layersWords(count)} ${count === 1 ? "is" : "are"} not shown. The page asks again by itself.`;
}

function listWords(names: readonly string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}` : (names[0] ?? "");
}

/** Return the name of an analysis tool for the visitor: the title of its method sheet, or the name of its process. */
export function toolWords(process: string): string {
  return Object.entries(METHODS).find(([name]) => name === process)?.[1].title ?? process;
}

/**
 * Return the words that name the inputs of a result: the names of its input layers where the page knows every
 * one of them, and otherwise the product files that the description of the result states.
 *
 * @param known The layers that the page knows: those of the list of the server and those that the browser keeps.
 */
export function inputWords({ layer, source }: KeptLayer, known: readonly LayerDescription[]): string {
  const ids = Array.isArray(source?.inputs.inputs) ? (source.inputs.inputs as unknown[]) : [];
  const titles = ids.flatMap((id) => known.find((other) => other.id === id)?.title ?? []);
  if (ids.length > 0 && titles.length === ids.length) {
    return `${titles.length === 1 ? "the layer" : "the layers"} ${listWords(titles.map((title) => `"${title}"`))}`;
  }
  return `${layer.inputs.length === 1 ? "the product file" : "the product files"} ${listWords(layer.inputs)}`;
}

/** What the sentence of a removed layer is written from. */
export interface RemovedAbout {
  /** The name of the server of the visitor that kept the layer, an empty text when its name is not known, or null for the project server. */
  server: string | null;
  /** The job of Get again that makes the layer again, while it waits or runs, or null. */
  job: Job | null;
  /** The layers that the page knows, for the names of the inputs of a result. */
  known: readonly LayerDescription[];
}

/**
 * Return the sentences of the row of a layer that the server removed. The first one says that the server no
 * longer keeps it: the project server removes a layer after the keeping time, and a layer of either server may
 * have been removed elsewhere. The second one says how the layer is made again: a received layer by Get again,
 * which sends the request that made it, and a result by its tool, which is named with its inputs.
 */
export function removedWords(kept: KeptLayer, { server, job, known }: RemovedAbout): string {
  const { layer, source } = kept;
  const what = layer.kind === "result" ? "result" : "layer";
  if (job !== null) {
    return `This ${what} was requested again, and its job is ${STATUS_WORDS[job.status].toLowerCase()}. The new ${what} takes this place when the job ends.`;
  }
  const keeper = server === null ? "The project server" : server === "" ? "Your server" : `Your server "${server}"`;
  const reason =
    server === null
      ? `it removed the ${what} after the keeping time, or the ${what} was removed elsewhere`
      : `the ${what} was removed elsewhere`;
  const first = `${keeper} no longer keeps this ${what}: ${reason}.`;
  if (layer.kind === "result") {
    const tool = source === null ? "An analysis tool" : `The tool ${toolWords(source.process)}`;
    return `${first} ${tool} made it from ${inputWords(kept, known)}.`;
  }
  return source === null
    ? `${first} Request it again with Get layer, in the Data tab.`
    : `${first} Get again requests it from NASA with the same choices and gives it this place.`;
}

/** Return the command of the notice of a removed layer: Get again for a received layer whose request is known and no job makes again. */
export function removedCommand({ layer, source }: KeptLayer, job: Job | null): keyof typeof STATE_COMMANDS | null {
  if (job !== null) {
    return null;
  }
  return layer.kind === "layer" && source !== null ? "getAgain" : "removeFromMap";
}
