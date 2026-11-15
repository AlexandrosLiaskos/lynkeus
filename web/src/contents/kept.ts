// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { againStore } from "../data/again";
import { jobsReadStore, jobsStore } from "../data/jobs";
import { layersFaultStore, layersReadStore, layersStore, loadLayers, type LayerSource } from "../data/layers";
import { accountOf, loadSession, sessionStore, type Session } from "../data/session";
import type { LayerDescription } from "../shared/layer";
import { mapLayersStore } from "../shared/mapLayers";
import { serverOfAddress, serversStore } from "../shared/servers";
import { createStore } from "../shared/store";
import { displayStore, type LayerDisplay } from "./state";

/**
 * The states of a layer that the browser has stored for the map (`docs/Storage.md`, States of a stored layer).
 * Only a layer that is ready is drawn. Every other state has one sentence and one action in the Contents pane,
 * and none is shown as an error of the map.
 */
export const LAYER_STATES = ["ready", "waits", "removed", "not-connected", "no-answer"] as const;
export type LayerState = (typeof LAYER_STATES)[number];

/** The names of the states, as the table of `docs/Storage.md` gives them. */
export const STATE_NAMES: Record<LayerState, string> = {
  ready: "Ready",
  waits: "Waits for the sign-in",
  removed: "Removed from the server",
  "not-connected": "Server not connected",
  "no-answer": "No answer",
};

/** A layer that the browser keeps for the map: one that is on the map, or one that is set aside. */
export interface KeptLayer {
  layer: LayerDescription;
  /** The Earthdata account that owns the layer, or null for a layer that was stored before the owner was recorded. */
  account: string | null;
  /** The request that made the layer, or null when it is not known. */
  source: LayerSource | null;
  /**
   * Whether the layer is set aside: the browser keeps it with its place, and it is not in `mapLayersStore`, so no
   * part of the page draws it or offers it. A layer whose state is not known yet stays as it was.
   */
  aside: boolean;
  /** The display that a layer that is set aside had on the map, when it had one. It returns with the layer. */
  display?: LayerDisplay;
}

/** What the states of the kept layers follow from: the sign-in, the list of the server and the servers of the visitor. */
export interface World {
  session: Session;
  /** The ids of the layers of the list of the server, or null while the list of the account of the sign-in is not known. */
  listed: ReadonlySet<string> | null;
  /** Whether the last reading of the list failed. */
  failed: boolean;
  /** The ids of the servers of the visitor that are not connected. */
  away: ReadonlySet<string>;
}

/**
 * Return the state of a kept layer, or null while it is not known: before the first answer about the sign-in,
 * and while the list of the account is on its way. The rows are those of the table States of a stored layer.
 *
 * - Not signed in, or signed in to another account than the one of the layer: the layer waits for the sign-in.
 * - Signed in to the account, and the list of the server does not hold the layer: removed from the server.
 * - The list holds the layer, and a server of the visitor that is not connected keeps it: server not connected.
 * - The list holds the layer: ready.
 * - The project server did not answer about the sign-in or about the list: no answer.
 *
 * A layer whose account was not recorded counts as a layer of the account of the sign-in.
 */
export function stateOf(
  { layer, account }: Pick<KeptLayer, "layer" | "account">,
  { session, listed, failed, away }: World,
): LayerState | null {
  switch (session.state) {
    case "unknown":
      return null;
    case "unreachable":
      return "no-answer";
    case "signed-out":
      return "waits";
    case "signed-in": {
      if (account !== null && account !== session.user) {
        return "waits";
      }
      if (listed === null) {
        return failed ? "no-answer" : null;
      }
      if (!listed.has(layer.id)) {
        return "removed";
      }
      const server = serverOfAddress(layer.url);
      return server !== null && away.has(server) ? "not-connected" : "ready";
    }
  }
}

/** Tell whether a layer in a state is put on the map. A layer of a server that is not connected stays there, with the sentence of its file. */
export function isOnMap(state: LayerState): boolean {
  return state === "ready" || state === "not-connected";
}

/** The layers that the browser keeps for the map, in drawing order: the first one is drawn at the bottom. */
export const keptStore = createStore<readonly KeptLayer[]>([]);

/** The state of each kept layer whose state is known, by the id of the layer. */
export const statesStore = createStore<Readonly<Record<string, LayerState>>>({});

/** The time between two readings of the list of layers while the page is shown and the map holds a layer, in milliseconds. */
export const LIST_TIME = 300_000;

/** The time before the page asks again after the project server did not answer, and the longest such time, in milliseconds. */
export const RETRY_TIME = 5000;
export const LONGEST_RETRY_TIME = 60_000;

function worldNow(): World {
  const session = sessionStore.get();
  const read = layersReadStore.get();
  const known = read !== null && read.account === accountOf(session);
  return {
    session,
    listed: known ? new Set(layersStore.get().map((entry) => entry.layer.id)) : null,
    failed: layersFaultStore.get() !== null,
    away: new Set((serversStore.get()?.servers ?? []).filter((server) => !server.connected).map(({ id }) => id)),
  };
}

function sameList<Item>(one: readonly Item[], other: readonly Item[]): boolean {
  return one.length === other.length && one.every((item, index) => item === other[index]);
}

function without<Value>(record: Readonly<Record<string, Value>>, key: string): Record<string, Value> {
  return Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));
}

// The jobs of layers requested again whose layer the list did not hold when they ended: the list is read once
// more for each, and a job whose layer is still missing afterwards is given up.
const asked = new Set<string>();
const settled = new Set<string>();

/**
 * Put the layer of each finished job of Get again in the place of the layer that the server had removed, with
 * the display of that layer. A job that failed, was cancelled or has left the list of the account is forgotten,
 * and the removed layer offers Get again once more.
 */
function replaced(kept: readonly KeptLayer[], { session, listed }: World): readonly KeptLayer[] {
  const again = againStore.get();
  let marks = again;
  let next = kept;
  const read = jobsReadStore.get();
  const jobsKnown = read !== null && read.account === accountOf(session);
  for (const [old, id] of Object.entries(again)) {
    const entry = next.find((other) => other.layer.id === old);
    const job = jobsStore.get().find((other) => other.jobID === id);
    if (!entry || (!job && jobsKnown) || job?.status === "failed" || job?.status === "dismissed") {
      marks = without(marks, old);
      continue;
    }
    if (!job || job.status !== "successful" || !job.layer || listed === null) {
      continue;
    }
    const made = layersStore.get().find((other) => other.layer.id === job.layer);
    if (!made) {
      if (!asked.has(id)) {
        asked.add(id);
        void loadLayers().then(() => {
          settled.add(id);
          reconcile();
        });
      } else if (settled.has(id)) {
        marks = without(marks, old);
      }
      continue;
    }
    const taken: KeptLayer = {
      layer: made.layer,
      account: accountOf(session) ?? entry.account,
      source: made.source ?? entry.source,
      aside: true,
      ...(entry.display ? { display: entry.display } : {}),
    };
    next = next
      .filter((other) => other.layer.id !== made.layer.id)
      .map((other) => (other.layer.id === old ? taken : other));
    marks = without(marks, old);
  }
  if (marks !== again) {
    againStore.set(marks);
  }
  return next;
}

let working = false;
let watching = false;
let retry: number | undefined;
let pause = RETRY_TIME;

/** Ask the project server again, later, while a layer of the map has no answer and the page is shown. */
function planRetry(states: Readonly<Record<string, LayerState>>): void {
  const waits = Object.values(states).includes("no-answer");
  if (!waits) {
    window.clearTimeout(retry);
    retry = undefined;
    pause = RETRY_TIME;
    return;
  }
  if (retry === undefined && watching && document.visibilityState === "visible") {
    retry = window.setTimeout(() => {
      retry = undefined;
      pause = Math.min(pause * 2, LONGEST_RETRY_TIME);
      void loadSession()
        .then(() => loadLayers())
        .then(() => planRetry(statesStore.get()));
    }, pause);
  }
}

function step(): void {
  const world = worldNow();
  const user = accountOf(world.session);
  const states: Record<string, LayerState> = {};
  let displays = displayStore.get();
  const next = replaced(keptStore.get(), world).map((entry): KeptLayer => {
    const { layer } = entry;
    const state = stateOf(entry, world);
    if (state !== null) {
      states[layer.id] = state;
    }
    // A layer of the list of the account is a layer of that account, and the list states the request that made it.
    const held = state !== null && isOnMap(state);
    const account = entry.account ?? (held ? user : null);
    const source =
      entry.source ?? (held ? (layersStore.get().find((other) => other.layer.id === layer.id)?.source ?? null) : null);
    const draw = state === null ? !entry.aside : isOnMap(state);
    if (draw && entry.aside) {
      if (entry.display) {
        displays = { ...displays, [layer.id]: entry.display };
      }
      return { layer, account, source, aside: false };
    }
    if (!draw && !entry.aside) {
      const display = displays[layer.id];
      return { layer, account, source, aside: true, ...(display ? { display } : {}) };
    }
    return account === entry.account && source === entry.source ? entry : { ...entry, account, source };
  });
  if (displays !== displayStore.get()) {
    displayStore.set(displays);
  }
  if (!sameList(next, keptStore.get())) {
    keptStore.set(next);
  }
  const drawn = next.filter((entry) => !entry.aside).map((entry) => entry.layer);
  if (!sameList(drawn, mapLayersStore.get())) {
    mapLayersStore.set(drawn);
  }
  if (JSON.stringify(states) !== JSON.stringify(statesStore.get())) {
    statesStore.set(states);
  }
  planRetry(states);
}

/**
 * Bring the kept layers in line with the sign-in, the list of the server and the servers of the visitor: each
 * layer takes its state, a layer that is ready returns to the map at its place with its display, and every other
 * layer is set aside with its display. It runs after every change of those, and changes nothing when nothing
 * differs.
 */
export function reconcile(): void {
  if (working) {
    return;
  }
  working = true;
  try {
    step();
  } finally {
    working = false;
  }
}

/**
 * Take the layers of the map into the kept layers after another part of the page has changed the map: a layer
 * that was added is kept for the account of the sign-in with the request that made it, a layer that was taken off
 * leaves, and the layers of the map take their new order. The layers that are set aside keep their places among
 * them.
 */
function followMap(): void {
  if (working) {
    return;
  }
  const drawn = mapLayersStore.get();
  const kept = keptStore.get();
  const onMap = new Set(drawn.map(({ id }) => id));
  const known = new Map(kept.map((entry) => [entry.layer.id, entry]));
  let displays = displayStore.get();
  const entryOf = (layer: LayerDescription): KeptLayer => {
    const entry = known.get(layer.id);
    if (!entry) {
      const source = layersStore.get().find((other) => other.layer.id === layer.id)?.source ?? null;
      return { layer, account: accountOf(), source, aside: false };
    }
    if (entry.aside && entry.display && !(layer.id in displays)) {
      displays = { ...displays, [layer.id]: entry.display };
    }
    return entry.layer === layer && !entry.aside
      ? entry
      : { layer, account: entry.account, source: entry.source, aside: false };
  };
  const next: KeptLayer[] = [];
  let place = 0;
  for (const entry of kept) {
    if (entry.aside && !onMap.has(entry.layer.id)) {
      next.push(entry);
      continue;
    }
    const layer = drawn[place];
    if (layer) {
      next.push(entryOf(layer));
      place += 1;
    }
  }
  next.push(...drawn.slice(place).map(entryOf));
  working = true;
  try {
    if (displays !== displayStore.get()) {
      displayStore.set(displays);
    }
    if (!sameList(next, kept)) {
      keptStore.set(next);
    }
  } finally {
    working = false;
  }
  reconcile();
}

/**
 * Bring layers that the browser has stored into the page, in their order: at the opening of the page, and when
 * another window of the browser has stored another map. A layer starts set aside, and `reconcile` then puts on
 * the map those that are ready. A layer that is on the map stays on it, so that it is not drawn anew. The layers
 * that the page held and the stored map does not hold leave the page.
 */
export function restoreKept(layers: readonly Omit<KeptLayer, "aside">[]): void {
  working = true;
  try {
    const before = new Map(keptStore.get().map((entry) => [entry.layer.id, entry]));
    let displays = displayStore.get();
    const next = layers.map((entry): KeptLayer => {
      const { layer, account, source, display } = entry;
      if (before.get(layer.id)?.aside !== false) {
        return { ...entry, aside: true };
      }
      displays = display ? { ...displays, [layer.id]: display } : without(displays, layer.id);
      return { layer, account, source, aside: false };
    });
    if (JSON.stringify(displays) !== JSON.stringify(displayStore.get())) {
      displayStore.set(displays);
    }
    keptStore.set(next);
    const drawn = next.filter((entry) => !entry.aside).map((entry) => entry.layer);
    if (JSON.stringify(drawn) !== JSON.stringify(mapLayersStore.get())) {
      mapLayersStore.set(drawn);
    }
  } finally {
    working = false;
  }
  reconcile();
}

/**
 * Take kept layers that are set aside out of the browser: they leave the list of the Contents pane and the
 * stored map. A layer that is on the map is taken off with `removeLayer` of the Contents pane instead.
 *
 * @param ids The ids of the layers, or nothing for every kept layer, also those on the map.
 */
export function forgetKept(ids?: readonly string[]): void {
  const gone = ids === undefined ? null : new Set(ids);
  const next = gone === null ? [] : keptStore.get().filter((entry) => !gone.has(entry.layer.id) || !entry.aside);
  working = true;
  try {
    keptStore.set(next);
    const marks = Object.fromEntries(
      Object.entries(againStore.get()).filter(([id]) => next.some((entry) => entry.layer.id === id)),
    );
    if (Object.keys(marks).length !== Object.keys(againStore.get()).length) {
      againStore.set(marks);
    }
    if (gone === null && mapLayersStore.get().length > 0) {
      mapLayersStore.set([]);
    }
  } finally {
    working = false;
  }
  reconcile();
}

/**
 * Tell whether the server has removed a layer whose file answered that it does not exist. The list of the server
 * is read again; when it no longer holds the layer, the layer has left the map for the state "removed from the
 * server", and the map states no error.
 */
export async function fileGone(id: string): Promise<boolean> {
  await loadLayers();
  reconcile();
  return statesStore.get()[id] === "removed";
}

function onVisibility(): void {
  if (document.visibilityState === "visible" && keptStore.get().length > 0) {
    void loadLayers();
  }
  planRetry(statesStore.get());
}

/**
 * Keep the states of the kept layers up to date while the page is open: the list of the server is read again
 * when the page is shown again and every five minutes while it is shown and the browser keeps a layer, so that a
 * layer whose date passes leaves the map for the state "removed from the server"; and the project server is asked
 * again by itself while it does not answer. The Contents pane calls this once. The function returned ends it.
 */
export function watchKept(): () => void {
  watching = true;
  document.addEventListener("visibilitychange", onVisibility);
  const timer = window.setInterval(() => {
    if (document.visibilityState === "visible" && keptStore.get().length > 0) {
      void loadLayers();
    }
  }, LIST_TIME);
  reconcile();
  return () => {
    watching = false;
    document.removeEventListener("visibilitychange", onVisibility);
    window.clearInterval(timer);
    window.clearTimeout(retry);
    retry = undefined;
  };
}

mapLayersStore.subscribe(followMap);
for (const store of [
  sessionStore,
  layersStore,
  layersReadStore,
  layersFaultStore,
  serversStore,
  jobsStore,
  jobsReadStore,
  againStore,
]) {
  store.subscribe(reconcile);
}
followMap();

/** Forget the kept layers and their states. The tests start from this state. */
export function resetKept(): void {
  window.clearTimeout(retry);
  retry = undefined;
  pause = RETRY_TIME;
  asked.clear();
  settled.clear();
  working = true;
  try {
    keptStore.set([]);
    statesStore.set({});
  } finally {
    working = false;
  }
}
