// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { dockStore, openToolPane } from "../shared/dock/dock";
import { PROJECT_SERVER, type Server } from "../shared/servers";
import { createStore } from "../shared/store";

/** The name of the pane of the servers: the name of the ribbon button that opens it. */
export const SERVERS_PANE = "servers";

/**
 * What the pane of the servers shows: the list of the servers, or the steps that connect one. `code` is the
 * code of a pairing that the address of the page carried, an empty text for an address that carried the word
 * `connect` alone, and null when the visitor opened the pane himself.
 */
export interface ServersView {
  view: "list" | "add";
  code: string | null;
}

const LIST: ServersView = { view: "list", code: null };

/** What the pane of the servers shows. Whether the pane is open is the matter of the panes beside the map. */
export const serversViewStore = createStore<ServersView>(LIST);

/**
 * Whether the pane of the servers comes to the front again once the visitor has signed in to Earthdata. The
 * button Sign in of the pane sets it: the pane of the sign-in then stands in front, and the pane of the servers
 * waits behind it with the view and the code that it had.
 */
export const returnStore = createStore(false);

/** Tell whether the pane of the servers is open. */
export function isServersOpen(): boolean {
  return dockStore.get().tools.includes(SERVERS_PANE);
}

/** Open the pane of the servers on the list of the servers. */
export function openServers(): void {
  returnStore.set(false);
  serversViewStore.set(LIST);
  openToolPane(SERVERS_PANE);
}

/** Open the pane of the servers on the steps that connect a server, with the code of a pairing when one is known. */
export function openAddServer(code: string | null = null): void {
  returnStore.set(false);
  serversViewStore.set({ view: "add", code });
  openToolPane(SERVERS_PANE);
}

/** Show the list of the servers in the pane, which stays open or closed as it is. */
export function showServerList(): void {
  serversViewStore.set(LIST);
}

/** The choice of the field Server of a tool that lets Lynkeus choose the server of a job. */
export const AUTOMATIC = "automatic";

/**
 * The server that the visitor chose for the jobs that he starts: `AUTOMATIC`, `PROJECT_SERVER` or the name of an
 * own server. Every form that starts a job shows and changes the same choice.
 */
export const serverChoiceStore = createStore<string>(AUTOMATIC);

/**
 * Return the choice that holds among the servers listed: the choice of the visitor, or `AUTOMATIC` when the
 * server that he chose is no longer one of his.
 */
export function validChoice(choice: string, servers: readonly Server[]): string {
  return choice === AUTOMATIC || choice === PROJECT_SERVER || servers.some((server) => server.id === choice)
    ? choice
    : AUTOMATIC;
}

/**
 * Return the parameter `server` of an execution for a choice: the name of an own server, the word `project`,
 * or undefined for the automatic choice, which sends no parameter.
 */
export function serverParameter(choice: string): string | undefined {
  return choice === AUTOMATIC ? undefined : choice;
}

/**
 * Return the view of the pane and the choice to their first state. The tests start from this state; `resetDock`
 * closes the pane.
 */
export function resetServersState(): void {
  serversViewStore.set(LIST);
  returnStore.set(false);
  serverChoiceStore.set(AUTOMATIC);
}
