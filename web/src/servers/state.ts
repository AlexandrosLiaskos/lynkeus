import { PROJECT_SERVER, type Server } from "../shared/servers";
import { createStore } from "../shared/store";

/**
 * What the dialog of the servers shows: the list of the servers, or the steps that connect one. `code` is the
 * code of a pairing that the address of the page carried, an empty text for an address that carried the word
 * `connect` alone, and null when the visitor opened the dialog himself.
 */
export interface ServersDialogState {
  open: boolean;
  view: "list" | "add";
  code: string | null;
}

const CLOSED: ServersDialogState = { open: false, view: "list", code: null };

/** Whether the dialog of the servers is open, and what it shows. */
export const serversDialogStore = createStore<ServersDialogState>(CLOSED);

/**
 * What the dialog shows again once the visitor has signed in to Earthdata, or null. The dialog covers the page,
 * so it closes while the visitor signs in in the pane of the sign-in, and it opens again with the same code.
 */
export const returnStore = createStore<ServersDialogState | null>(null);

/** Open the dialog of the servers on the list of the servers. */
export function openServers(): void {
  returnStore.set(null);
  serversDialogStore.set({ open: true, view: "list", code: null });
}

/** Open the dialog of the servers on the steps that connect a server, with the code of a pairing when one is known. */
export function openAddServer(code: string | null = null): void {
  returnStore.set(null);
  serversDialogStore.set({ open: true, view: "add", code });
}

/** Close the dialog of the servers. */
export function closeServers(): void {
  serversDialogStore.set(CLOSED);
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

/** Return the dialog and the choice to their first state. The tests start from this state. */
export function resetServersState(): void {
  serversDialogStore.set(CLOSED);
  returnStore.set(null);
  serverChoiceStore.set(AUTOMATIC);
}
