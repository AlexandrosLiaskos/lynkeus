// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { againStore } from "../data/again";
import { isLayerSource, type LayerSource } from "../data/layers";
import { isLayerDescription, type LayerDescription } from "../shared/layer";
import { keepInBrowser } from "../shared/storage/storage";
import { keptStore, restoreKept } from "./kept";
import { displayStore, type LayerDisplay, type Stretch } from "./state";

/** The name under which the layers of the map are kept in the local storage of the browser. */
export const LAYERS_KEY = "lynkeus.layers";

/**
 * The layers of the map as the browser keeps them (`docs/Storage.md`, States of a stored layer). The layers
 * that wait for the sign-in and those that the server removed are kept with the others, at their places.
 */
export interface StoredLayers {
  /** The descriptions of the layers, in drawing order: the first one is drawn at the bottom. */
  layers: readonly LayerDescription[];
  /** The display of each layer that has one, by the id of the layer. */
  displays: Readonly<Record<string, LayerDisplay>>;
  /**
   * The Earthdata account that owns each layer, by the id of the layer. A map that was stored before the owner
   * was recorded has no such field, and a layer without an entry has no known owner.
   */
  accounts?: Readonly<Record<string, string>>;
  /** The request that made each layer whose request is known, by the id of the layer. */
  sources?: Readonly<Record<string, LayerSource>>;
  /** For each removed layer that was requested again, by its id: the id of the job that makes it again. */
  again?: Readonly<Record<string, string>>;
}

/**
 * The largest number of layers of a stored map, the largest number of characters of the name of a scale, and
 * the largest number of characters of the name of an account or of a job.
 */
const MOST_LAYERS = 500;
const NAME_LENGTH = 64;
const TEXT_LENGTH = 256;

const COLOUR = /^#[0-9a-f]{6}$/i;

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Return a value as a range, a lowest and a higher highest number, or undefined when it is not one. */
function rangeOf(value: unknown): readonly [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2) {
    return undefined;
  }
  const [lowest, highest] = value as unknown[];
  return isNumber(lowest) && isNumber(highest) && lowest < highest ? [lowest, highest] : undefined;
}

/** Return a value as the rule of a range, or undefined when it is not one. */
function stretchOf(value: unknown): Stretch | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const { kind, percent, count } = value as Record<string, unknown>;
  switch (kind) {
    case "extremes":
    case "typed":
      return { kind };
    case "percent":
      return isNumber(percent) && percent >= 0 && percent < 50 ? { kind, percent } : undefined;
    case "deviations":
      return isNumber(count) && count > 0 ? { kind, count } : undefined;
    default:
      return undefined;
  }
}

/**
 * Check the display of a layer that was read from the storage: the layer is visible or not, its opacity lies
 * from 0 to 1, its range and its mask are a lowest and a higher highest number, its colour scale has a name, the
 * colour of the cells without data is written as # and six hexadecimal digits, and the rule of the range is one
 * of the Symbology pane. The display returned holds these fields only; a field that is wrong refuses the whole.
 */
export function storedDisplay(stored: unknown): LayerDisplay | undefined {
  if (typeof stored !== "object" || stored === null) {
    return undefined;
  }
  const { visible, opacity, colours, decibels, inverted, noDataColour } = stored as Record<string, unknown>;
  const fields = stored as Record<string, unknown>;
  const range = rangeOf(fields.range);
  const mask = fields.mask === undefined ? undefined : rangeOf(fields.mask);
  const stretch = fields.stretch === undefined ? undefined : stretchOf(fields.stretch);
  if (
    typeof visible !== "boolean" ||
    !isNumber(opacity) ||
    opacity < 0 ||
    opacity > 1 ||
    !range ||
    typeof colours !== "string" ||
    colours === "" ||
    colours.length > NAME_LENGTH ||
    (decibels !== undefined && typeof decibels !== "boolean") ||
    (inverted !== undefined && typeof inverted !== "boolean") ||
    (noDataColour !== undefined && (typeof noDataColour !== "string" || !COLOUR.test(noDataColour))) ||
    (fields.mask !== undefined && !mask) ||
    (fields.stretch !== undefined && !stretch)
  ) {
    return undefined;
  }
  return {
    visible,
    opacity,
    range,
    colours,
    ...(decibels === undefined ? {} : { decibels }),
    ...(inverted === undefined ? {} : { inverted }),
    ...(noDataColour === undefined ? {} : { noDataColour }),
    ...(mask ? { mask } : {}),
    ...(stretch ? { stretch } : {}),
  };
}

/** Tell whether a text is the address of a file of this site: a path that names no other server. */
function isSitePath(address: string): boolean {
  return address.startsWith("/") && !address.startsWith("//") && !address.includes("\\");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isName(value: unknown): value is string {
  return typeof value === "string" && value !== "" && value.length <= TEXT_LENGTH;
}

/**
 * Check a field that holds one value for some of the layers, by the id of the layer. An absent field is an
 * empty one. Return undefined when the field is not such a record, names a layer that is not stored, or holds a
 * value that the check refuses.
 */
function byLayer<Value>(
  field: unknown,
  ids: ReadonlySet<string>,
  isValue: (value: unknown) => value is Value,
): Record<string, Value> | undefined {
  if (field === undefined) {
    return {};
  }
  if (!isRecord(field)) {
    return undefined;
  }
  const checked: Record<string, Value> = {};
  for (const [id, value] of Object.entries(field)) {
    if (!ids.has(id) || !isValue(value)) {
      return undefined;
    }
    checked[id] = value;
  }
  return checked;
}

/**
 * Check the layers that were read from the storage. Each layer is a layer description whose file is a file of
 * this site, no two layers have one id, and each display is the valid display of one of the layers. The account
 * of a layer is a name, the request that made it names a process and its inputs, and a job of Get again is
 * named for a stored layer. A map of the older form, without accounts, is read as it is. A layer, a display or
 * another field that is wrong refuses the whole, so that the map never shows half of what was stored.
 */
export function storedLayers(stored: unknown): StoredLayers | undefined {
  if (typeof stored !== "object" || stored === null) {
    return undefined;
  }
  const { layers, displays } = stored as Record<string, unknown>;
  if (
    !Array.isArray(layers) ||
    layers.length > MOST_LAYERS ||
    !layers.every((layer): layer is LayerDescription => isLayerDescription(layer) && isSitePath(layer.url)) ||
    new Set(layers.map(({ id }) => id)).size !== layers.length ||
    typeof displays !== "object" ||
    displays === null ||
    Array.isArray(displays)
  ) {
    return undefined;
  }
  const checked: Record<string, LayerDisplay> = {};
  for (const [id, display] of Object.entries(displays)) {
    const valid = storedDisplay(display);
    if (!valid || !layers.some((layer) => layer.id === id)) {
      return undefined;
    }
    checked[id] = valid;
  }
  const ids = new Set(layers.map(({ id }) => id));
  const fields = stored as Record<string, unknown>;
  const accounts = byLayer(fields.accounts, ids, isName);
  const sources = byLayer(fields.sources, ids, isLayerSource);
  const again = byLayer(fields.again, ids, isName);
  if (!accounts || !sources || !again) {
    return undefined;
  }
  return { layers, displays: checked, accounts, sources, again };
}

/** Return the layers of the map as the browser stores them now: those on the map and those that are set aside. */
export function layersToStore(): StoredLayers {
  const kept = keptStore.get();
  const shown = displayStore.get();
  const displays: Record<string, LayerDisplay> = {};
  const accounts: Record<string, string> = {};
  const sources: Record<string, LayerSource> = {};
  for (const { layer, account, source, aside, display } of kept) {
    const drawn = aside ? display : shown[layer.id];
    if (drawn) {
      displays[layer.id] = drawn;
    }
    if (account !== null) {
      accounts[layer.id] = account;
    }
    if (source !== null) {
      sources[layer.id] = source;
    }
  }
  return { layers: kept.map(({ layer }) => layer), displays, accounts, sources, again: againStore.get() };
}

// The layers of the map are a part of the work that the browser keeps: those on the map, and those that wait for
// the sign-in or that the server removed, each with its account, the request that made it and its display. They
// return when the page opens, and each one then takes its state (`kept.ts`). The windows of one browser share
// this map: a change that one window stores reaches the others.
keepInBrowser<StoredLayers>({
  key: LAYERS_KEY,
  title: "Layers of the map",
  description: "The layers on the map, in their order, with the display, the account and the request of each.",
  shared: true,
  read: layersToStore,
  check: storedLayers,
  restore: ({ layers, displays, accounts = {}, sources = {}, again = {} }) => {
    restoreKept(
      layers.map((layer) => {
        const display = displays[layer.id];
        return {
          layer,
          account: accounts[layer.id] ?? null,
          source: sources[layer.id] ?? null,
          ...(display ? { display } : {}),
        };
      }),
    );
    // The jobs of Get again are named for layers that the page now holds.
    againStore.set(again);
  },
  subscribe: (listener) => {
    const ends = [keptStore.subscribe(listener), displayStore.subscribe(listener), againStore.subscribe(listener)];
    return () => ends.forEach((end) => end());
  },
});
