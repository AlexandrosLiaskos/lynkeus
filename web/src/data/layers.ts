// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { isLayerDescription, type LayerDescription } from "../shared/layer";
import { addToMap, mapLayersStore, removeFromMap } from "../shared/mapLayers";
import { isServerName, PROJECT_SERVER_WORDS, type ServerName } from "../shared/servers";
import { createStore } from "../shared/store";
import { isMoment } from "./jobs";
import { call, Refusal, UNREADABLE, wordsOf } from "./service";
import { accountOf } from "./session";

/**
 * The request that made a layer (`source` of `GET /api/layers`, `docs/Storage.md`): the name of the process and
 * the inputs with which its job was started. The same request, sent again, makes the layer again.
 */
export interface LayerSource {
  process: string;
  inputs: Record<string, unknown>;
}

/** A layer of the account: its description, with what the server records about its files. */
export interface LayerEntry {
  layer: LayerDescription;
  /** Total size of the files of the layer in bytes, or null when the server does not state it. */
  size: number | null;
  /** When the layer was made, as a date-time of RFC 3339, or null when the server does not state it. */
  created: string | null;
  /** The own server of the visitor that keeps the files of the layer, or null for the project server. */
  server: ServerName | null;
  /** The request that made the layer. The entry has none when the server does not state it. */
  source?: LayerSource | null;
}

/** The orders of the list of layers, with the words that name them. */
export const LAYER_SORTS = {
  newest: "Received, latest first",
  name: "Name",
  date: "Date of the data, latest first",
  size: "Size, largest first",
} as const;
export type LayerSort = keyof typeof LAYER_SORTS;

/** The ways in which the list of layers can be grouped, with the words that name them. */
export const LAYER_GROUPINGS = {
  none: "No groups",
  kind: "Received or computed",
  quantity: "Quantity",
  date: "Date of the data",
  server: "Server",
} as const;
export type LayerGrouping = keyof typeof LAYER_GROUPINGS;

/** The words that name the two kinds of layer. */
export const KIND_WORDS: Record<LayerDescription["kind"], string> = {
  layer: "Received from NASA",
  result: "Result of an analysis tool",
};

/** A group of the list: its heading and its layers, in the order of the list. */
export interface LayerGroup {
  title: string;
  layers: LayerEntry[];
}

const LAYERS = "/api/layers";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Tell whether a value is the request that made a layer: the name of a process and its inputs. */
export function isLayerSource(value: unknown): value is LayerSource {
  return isRecord(value) && typeof value.process === "string" && value.process !== "" && isRecord(value.inputs);
}

/**
 * Return a layer of the list of the server as an entry, or null when it does not have the form of one. The
 * server sends the description with the size and the time of the layer beside it, with the own server that
 * keeps the layer and with the request that made it; a description alone is an entry without them, of the
 * project server.
 */
export function layerEntry(value: unknown): LayerEntry | null {
  if (isLayerDescription(value)) {
    return { layer: value, size: null, created: null, server: null };
  }
  if (!isRecord(value) || !isLayerDescription(value.layer)) {
    return null;
  }
  const { size, created, server, source } = value;
  const sizeIsValid = size === undefined || size === null || (typeof size === "number" && size >= 0);
  const createdIsValid = created === undefined || created === null || isMoment(created);
  const serverIsValid = server === undefined || server === null || isServerName(server);
  const sourceIsValid = source === undefined || source === null || isLayerSource(source);
  if (!sizeIsValid || !createdIsValid || !serverIsValid || !sourceIsValid) {
    return null;
  }
  return {
    layer: value.layer,
    size: typeof size === "number" ? size : null,
    created: isMoment(created) ? created : null,
    server: isServerName(server) ? server : null,
    ...(isLayerSource(source) ? { source } : {}),
  };
}

function entryOf(content: unknown): LayerEntry {
  const entry = layerEntry(content);
  if (!entry) {
    throw new Error(UNREADABLE);
  }
  return entry;
}

/** The layers of the account, received and computed, in the order of the server: the newest first. */
export const layersStore = createStore<readonly LayerEntry[]>([]);

/**
 * For whom the list of `layersStore` was read: the Earthdata account of the sign-in at that reading, or null in
 * `account` for a visitor who was not signed in. The store holds null before the first answer of the server and
 * after the sign-in has changed, while the list of the new account is on its way. The Contents pane tells a layer
 * that the server removed from one that it has not listed yet with it.
 */
export const layersReadStore = createStore<{ account: string | null } | null>(null);

/** Why the last reading of the layers failed, in a sentence for the visitor, or null when it succeeded. */
export const layersFaultStore = createStore<string | null>(null);

// The number of changes that this page has made to the list. The answer to a reading that started before a
// change is dropped, so that a slow answer cannot bring back a layer that was removed.
let changes = 0;
let reading: Promise<void> | null = null;

async function readLayers(): Promise<void> {
  const turn = changes;
  const account = accountOf();
  try {
    const answer = await call(LAYERS, { failure: "The layers could not be read" });
    if (!isRecord(answer) || !Array.isArray(answer.layers)) {
      throw new Error(UNREADABLE);
    }
    const entries = (answer.layers as unknown[]).map(entryOf);
    // A list that was asked for under another sign-in is the list of nobody who is here now.
    if (turn === changes && account === accountOf()) {
      layersFaultStore.set(null);
      if (JSON.stringify(layersStore.get()) !== JSON.stringify(entries)) {
        layersStore.set(entries);
      }
      if (layersReadStore.get()?.account !== account) {
        layersReadStore.set({ account });
      }
    }
  } catch (error) {
    if (turn === changes) {
      layersFaultStore.set(wordsOf(error, "The layers could not be read."));
    }
  }
}

/**
 * Read the layers of the session from the server and keep them in the store. A call during a reading that is
 * still on its way joins that reading. The promise is never rejected: a failure is stated in `layersFaultStore`.
 */
export function loadLayers(): Promise<void> {
  reading ??= readLayers().finally(() => {
    reading = null;
  });
  return reading;
}

/**
 * Remove a layer of the session: the server removes its files, and the layer leaves the list and the map. A
 * layer that the server no longer holds leaves them as well.
 */
export async function removeLayer(id: string): Promise<void> {
  try {
    await call(`${LAYERS}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      failure: "The layer could not be removed",
    });
  } catch (error) {
    if (!(error instanceof Refusal && error.status === 404)) {
      throw error;
    }
  }
  changes += 1;
  layersStore.set(layersStore.get().filter((entry) => entry.layer.id !== id));
  removeFromMap(id);
}

/** Give a layer another name, in the list and, when the layer is on the map, on the map. */
export async function renameLayer(id: string, title: string): Promise<LayerEntry> {
  const renamed = entryOf(
    await call(`${LAYERS}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      content: { title },
      failure: "The layer could not be renamed",
    }),
  );
  changes += 1;
  layersStore.set(layersStore.get().map((entry) => (entry.layer.id === id ? renamed : entry)));
  if (mapLayersStore.get().some((layer) => layer.id === id)) {
    addToMap(renamed.layer);
  }
  return renamed;
}

/**
 * Read the extent of a layer from its STAC record: the west, south, east and north side of its bounding box, in
 * degrees of longitude and latitude.
 */
export async function layerExtent(layer: LayerDescription): Promise<[number, number, number, number]> {
  const record = await call(layer.record, { failure: "The record of the layer could not be read" });
  const box: unknown = isRecord(record) ? record.bbox : null;
  if (!Array.isArray(box) || (box.length !== 4 && box.length !== 6)) {
    throw new Error(UNREADABLE);
  }
  // A bounding box with heights has six numbers: the sides stand at the places 0, 1, 3 and 4.
  const sides: unknown[] = box.length === 4 ? box : [box[0], box[1], box[3], box[4]];
  const [west, south, east, north] = sides;
  if (
    typeof west !== "number" ||
    typeof south !== "number" ||
    typeof east !== "number" ||
    typeof north !== "number" ||
    ![west, south, east, north].every(Number.isFinite) ||
    south > north
  ) {
    throw new Error(UNREADABLE);
  }
  return [west, south, east, north];
}

function latestDate({ layer }: LayerEntry): string {
  return layer.dates.reduce((latest, date) => (date > latest ? date : latest));
}

/** Return the layers in the order asked. Layers that are equal in that order keep the order of the list. */
export function sortLayers(entries: readonly LayerEntry[], sort: LayerSort): LayerEntry[] {
  const sorted = [...entries];
  switch (sort) {
    case "newest":
      return sorted.sort((a, b) => Date.parse(b.created ?? "") - Date.parse(a.created ?? "") || 0);
    case "name":
      return sorted.sort((a, b) => a.layer.title.localeCompare(b.layer.title, "en"));
    case "date":
      return sorted.sort((a, b) => latestDate(b).localeCompare(latestDate(a)));
    case "size":
      return sorted.sort((a, b) => (b.size ?? -1) - (a.size ?? -1));
  }
}

/**
 * Divide the layers into groups. The groups stand in the order in which their first layers stand in the list,
 * and the layers of a group keep the order of the list.
 */
export function groupLayers(
  entries: readonly LayerEntry[],
  grouping: LayerGrouping,
  formatDay: (day: string) => string,
): LayerGroup[] {
  if (grouping === "none") {
    return [{ title: "", layers: [...entries] }];
  }
  const groups = new Map<string, LayerEntry[]>();
  for (const entry of entries) {
    const { kind, quantity, dates } = entry.layer;
    const title =
      grouping === "kind"
        ? KIND_WORDS[kind]
        : grouping === "quantity"
          ? quantity
          : grouping === "server"
            ? (entry.server?.name ?? PROJECT_SERVER_WORDS)
            : dates.map(formatDay).join(" and ");
    const group = groups.get(title);
    if (group) {
      group.push(entry);
    } else {
      groups.set(title, [entry]);
    }
  }
  return [...groups].map(([title, layers]) => ({ title, layers }));
}

/** Write the unit of a layer for reading. The unit "1" marks a quantity without a unit. */
export function unitWords(unit: string): string {
  return unit === "1" ? "no unit" : unit;
}

/**
 * Forget the layers and the readings on their way. The page calls this when the sign-in changes to another
 * account or ends, because the list belongs to an account, and reads the list again. The tests start from this
 * state.
 */
export function resetLayers(): void {
  changes += 1;
  reading = null;
  layersStore.set([]);
  layersFaultStore.set(null);
  layersReadStore.set(null);
}
