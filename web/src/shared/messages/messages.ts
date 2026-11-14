import { createStore } from "../store";

/** The kinds of message, as in the alert of the U.S. Web Design System. */
export type MessageKind = "success" | "info" | "warning" | "error";

export interface Message {
  id: number;
  kind: MessageKind;
  text: string;
}

/** The messages on the page, the oldest first. */
export const messagesStore = createStore<readonly Message[]>([]);

let lastId = 0;

/**
 * Show a message to the user, in plain words: a finished job ("success"), a failed job or an error ("error"),
 * a notice ("info") or a warning ("warning").
 */
export function report(kind: MessageKind, text: string): void {
  lastId += 1;
  messagesStore.set([...messagesStore.get(), { id: lastId, kind, text }]);
}

/** Remove a message from the page. */
export function dismiss(id: number): void {
  messagesStore.set(messagesStore.get().filter((message) => message.id !== id));
}
