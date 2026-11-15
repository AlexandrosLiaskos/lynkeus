// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { loadJobs } from "../data/jobs";
import { loadLayers } from "../data/layers";
import { call, checked, Refusal, wordsOf } from "../data/service";
import { isSignedIn, sessionStore, type Session } from "../data/session";
import { dockStore, openToolPane } from "../shared/dock/dock";
import { mapLayersStore, removeFromMap } from "../shared/mapLayers";
import {
  isPairingView,
  isServer,
  isServers,
  serverOfAddress,
  serversStore,
  type PairingConfirmation,
  type PairingView,
  type Server,
  type ServerChange,
  type ServerLimits,
} from "../shared/servers";
import { createStore } from "../shared/store";
import { isServersOpen, returnStore, SERVERS_PANE } from "./state";

/**
 * The requests of the interface about the own servers of the visitor (`docs/Own_Servers.md`, Addresses for the
 * interface). Every address under `/api/servers` needs a sign-in to Earthdata, because an own server belongs to
 * an Earthdata user and not to a session.
 */

/**
 * The time between two readings of the servers while the visitor has one, in milliseconds. A server counts as
 * connected for 75 seconds after its last message, so the list is at most half a minute behind.
 */
export const POLL_TIME = 30_000;

/** The time between two readings of the servers while their pane is open, in milliseconds. */
export const OPEN_POLL_TIME = 10_000;

const SERVERS = "/api/servers";

/** Why the last reading of the servers failed, in a sentence for the visitor, or null when it succeeded. */
export const serversFaultStore = createStore<string | null>(null);

// The number of changes that this page has made to the list. The answer to a reading that started before a
// change is dropped, so that a slow answer cannot bring back a server that was removed.
let changes = 0;
let reading: Promise<void> | null = null;
let watching = false;
let timer: number | undefined;

function keep(servers: readonly Server[], limit: number): void {
  const next = { servers, limit };
  if (JSON.stringify(serversStore.get()) !== JSON.stringify(next)) {
    serversStore.set(next);
  }
}

async function readServers(): Promise<void> {
  const turn = changes;
  try {
    const answer = checked(await call(SERVERS, { failure: "Your servers could not be read" }), isServers);
    if (turn === changes) {
      serversFaultStore.set(null);
      keep(answer.servers, answer.limit);
    }
  } catch (error) {
    if (turn !== changes) {
      return;
    }
    if (error instanceof Refusal && error.status === 401) {
      // The sign-in has ended: the servers are those of nobody, and the page says that the visitor is signed out.
      serversStore.set(null);
      serversFaultStore.set(null);
    } else {
      serversFaultStore.set(wordsOf(error, "Your servers could not be read."));
    }
  }
}

/**
 * Read the own servers of the visitor from the project server and keep them in the store. Nothing is asked
 * while the visitor is not signed in to Earthdata. A call during a reading that is still on its way joins that
 * reading. The promise is never rejected: a failure is stated in `serversFaultStore`.
 */
export function loadServers(): Promise<void> {
  if (!isSignedIn()) {
    return Promise.resolve();
  }
  reading ??= readServers().finally(() => {
    reading = null;
  });
  return reading;
}

function replace(server: Server): void {
  const listed = serversStore.get();
  changes += 1;
  if (listed) {
    const known = listed.servers.some((other) => other.id === server.id);
    keep(
      known ? listed.servers.map((other) => (other.id === server.id ? server : other)) : [...listed.servers, server],
      listed.limit,
    );
  }
}

async function change(id: string, content: ServerChange, failure: string): Promise<Server> {
  const server = checked(
    await call(`${SERVERS}/${encodeURIComponent(id)}`, { method: "PATCH", content, failure }),
    isServer,
  );
  replace(server);
  return server;
}

/** Give a server another name. The promise is rejected with an error whose message can be shown to the visitor. */
export function renameServer(id: string, name: string): Promise<Server> {
  return change(id, { name }, "The server could not be renamed");
}

/**
 * Set the limits of a server: the project server passes them to the server, which applies them and keeps them.
 * The promise is rejected with an error whose message can be shown to the visitor.
 */
export function setServerLimits(id: string, limits: ServerLimits): Promise<Server> {
  return change(id, { limits }, "The limits of the server could not be set");
}

/**
 * Remove a server from the account of the visitor. The project server removes the records of its layers and
 * tells the program to forget the pairing; the files of the layers stay on that computer. The layers of the
 * server leave the map, and the lists of jobs and of layers are read again. A server that the project server no
 * longer holds leaves the list as well.
 */
export async function removeServer(id: string): Promise<void> {
  try {
    await call(`${SERVERS}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      failure: "The server could not be removed",
    });
  } catch (error) {
    if (!(error instanceof Refusal && error.status === 404)) {
      throw error;
    }
  }
  changes += 1;
  const listed = serversStore.get();
  if (listed) {
    keep(
      listed.servers.filter((server) => server.id !== id),
      listed.limit,
    );
  }
  for (const layer of mapLayersStore.get()) {
    if (serverOfAddress(layer.url) === id) {
      removeFromMap(layer.id);
    }
  }
  void loadLayers();
  void loadJobs();
}

/**
 * Ask which computer asked for the pairing of a code. The promise is rejected with a `Refusal`: with the status
 * 404 when the code is unknown or no longer valid, and 401 when the visitor is not signed in to Earthdata.
 */
export async function readPairing(code: string): Promise<PairingView> {
  const answer = await call(`${SERVERS}/pairings/${encodeURIComponent(code)}`, {
    failure: "The code could not be checked",
  });
  return checked(answer, isPairingView);
}

/**
 * Confirm the pairing of a code: the computer becomes a server of the Earthdata user who is signed in, and the
 * program on it receives its key. The promise is rejected with a `Refusal`: 401 when the visitor is not signed
 * in, 404 when the code is unknown or no longer valid, and 409 when the user has the most servers allowed.
 */
export async function confirmPairing(code: string): Promise<Server> {
  const content: PairingConfirmation = { user_code: code };
  const server = checked(
    await call(SERVERS, { method: "POST", content, failure: "The server could not be connected" }),
    isServer,
  );
  replace(server);
  plan();
  return server;
}

// The next reading is planned only while the page is watched and shown and the visitor is signed in, and then
// only while he has a server or the pane of the servers is open.
function plan(): void {
  window.clearTimeout(timer);
  timer = undefined;
  if (!watching || document.visibilityState !== "visible" || !isSignedIn()) {
    return;
  }
  const open = isServersOpen();
  if (open || (serversStore.get()?.servers.length ?? 0) > 0) {
    timer = window.setTimeout(refresh, open ? OPEN_POLL_TIME : POLL_TIME);
  }
}

function refresh(): void {
  void loadServers().then(plan);
}

function onVisibility(): void {
  if (document.visibilityState === "visible") {
    refresh();
  } else {
    plan();
  }
}

/**
 * Keep the servers of the visitor up to date, and follow his sign-in. The servers are read when the visitor is
 * signed in, when the page is shown again and when the pane of the servers opens, and then every half minute
 * while he has a server. When he signs in or out, the lists of jobs and of layers are read again, because the
 * layers of his own servers are listed only while he is signed in; after a sign-out the servers are forgotten.
 * A pane of the servers that the visitor left for the sign-in comes to the front again. The page calls this
 * once, when it loads. The function returned ends it.
 */
export function followServers(): () => void {
  watching = true;
  let before: Session["state"] = sessionStore.get().state;
  const onSession = () => {
    const { state } = sessionStore.get();
    if (state === before) {
      return;
    }
    const was = before;
    before = state;
    if (state === "signed-in") {
      refresh();
      if (returnStore.get()) {
        returnStore.set(false);
        openToolPane(SERVERS_PANE);
      }
    } else if (state === "signed-out") {
      changes += 1;
      serversStore.set(null);
      serversFaultStore.set(null);
      plan();
    }
    // The first answer about the session changes nothing in the lists that the page has just read.
    if ((was === "signed-in" && state === "signed-out") || (was === "signed-out" && state === "signed-in")) {
      void loadLayers();
      void loadJobs();
    }
  };
  const stopSession = sessionStore.subscribe(onSession);
  let wasOpen = isServersOpen();
  const stopPane = dockStore.subscribe(() => {
    const open = isServersOpen();
    if (open && !wasOpen) {
      refresh();
    } else if (!open && wasOpen) {
      plan();
    }
    wasOpen = open;
  });
  document.addEventListener("visibilitychange", onVisibility);
  refresh();
  return () => {
    watching = false;
    stopSession();
    stopPane();
    document.removeEventListener("visibilitychange", onVisibility);
    plan();
  };
}

/** Forget the servers and the readings on their way. The tests start from this state. */
export function resetServers(): void {
  window.clearTimeout(timer);
  document.removeEventListener("visibilitychange", onVisibility);
  timer = undefined;
  watching = false;
  changes += 1;
  reading = null;
  serversStore.set(null);
  serversFaultStore.set(null);
}
