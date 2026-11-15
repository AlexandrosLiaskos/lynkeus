// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { report } from "../shared/messages/messages";
import { createStore, useStore } from "../shared/store";

/**
 * What the page knows about the visitor's sign-in to Earthdata (`docs/Storage.md`, Sign-in states). A cookie
 * names the session, which links this browser to the account. The web service holds the token of the sign-in in
 * its memory, for a limited time. The page holds only this state, and never the token.
 */
export type Session =
  /** The server has not been asked yet. */
  | { state: "unknown" }
  | { state: "signed-out" }
  /**
   * `user` is the user name of the Earthdata account. `token` tells whether the web service holds the token now:
   * only `false` says that it does not, as in the answer of the server, where an absent `token` counts as held.
   * Without the token the visitor stays signed in, and only a request to NASA asks for the token again.
   */
  | { state: "signed-in"; user: string; token?: boolean }
  /** The server did not answer, or its answer could not be read. */
  | { state: "unreachable" };

/**
 * What the server answers about the session: the Earthdata user name and whether the token is held, or null when
 * the visitor is not signed in. An answer of the older server has no `token`; the token then counts as held.
 */
export interface SessionAnswer {
  earthdata: { user: string; token?: boolean } | null;
}

/** A request that the server refused because it needs the token, and that waits for the sign-in. */
export interface SignInRequest {
  /** The sentence with which the server refused the request. */
  sentence: string;
}

const UNKNOWN: Session = { state: "unknown" };
const SIGNED_OUT: Session = { state: "signed-out" };
const UNREACHABLE: Session = { state: "unreachable" };

const SESSION = "/api/session";
const EARTHDATA = "/api/session/earthdata";

const NO_ANSWER = "The server of Lynkeus did not answer. Check the connection and try again.";
const UNREADABLE = "The answer of the server could not be read.";
const ENDED = "Your sign-in to Earthdata has ended. Sign in again to continue.";

/** The state of the visitor's sign-in to Earthdata. */
export const sessionStore = createStore<Session>(UNKNOWN);

/** Read the state of the sign-in in a component. */
export function useSession(): Session {
  return useStore(sessionStore);
}

/** Tell whether the visitor is signed in to Earthdata, with or without the token. */
export function isSignedIn(): boolean {
  return sessionStore.get().state === "signed-in";
}

/** Return the user name of the Earthdata account of a session, or null when nobody is signed in. */
export function accountOf(session: Session = sessionStore.get()): string | null {
  return session.state === "signed-in" ? session.user : null;
}

/** Tell whether the visitor is signed in and the web service holds the token, so that a request to NASA can start. */
export function holdsToken(session: Session = sessionStore.get()): boolean {
  return session.state === "signed-in" && session.token !== false;
}

/**
 * The request that waits for the sign-in, or null. While it is not null, the pane of the sign-in is open with
 * the sentence of the server, and the request is sent again after the sign-in.
 */
export const signInRequestStore = createStore<SignInRequest | null>(null);

/** Whether the dialog of Sign out is open. */
export const signOutDialogStore = createStore(false);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Tell whether a value that the server sent is its answer about the session. */
export function isSessionAnswer(value: unknown): value is SessionAnswer {
  if (!isRecord(value) || !("earthdata" in value)) {
    return false;
  }
  const { earthdata } = value;
  return (
    earthdata === null ||
    (isRecord(earthdata) &&
      typeof earthdata.user === "string" &&
      earthdata.user !== "" &&
      (earthdata.token === undefined || typeof earthdata.token === "boolean"))
  );
}

/** Return the state of the page for an answer of the server about the session. */
export function sessionOf({ earthdata }: SessionAnswer): Session {
  return earthdata ? { state: "signed-in", user: earthdata.user, token: earthdata.token !== false } : SIGNED_OUT;
}

function sameSession(one: Session, other: Session): boolean {
  return (
    one.state === other.state &&
    (one.state !== "signed-in" ||
      other.state !== "signed-in" ||
      (one.user === other.user && holdsToken(one) === holdsToken(other)))
  );
}

/** Keep a state in the store. A state that says the same as the one before leaves the store as it is. */
function keep(next: Session): void {
  if (!sameSession(sessionStore.get(), next)) {
    sessionStore.set(next);
  }
}

interface Answer {
  ok: boolean;
  status: number;
  /** The content of the answer, or null when the answer has none or it is not JSON. */
  content: unknown;
}

/** Send a request about the session. The cookie that names the session travels with it, to this site only. */
async function ask(address: string, method: "GET" | "POST" | "DELETE", content?: unknown): Promise<Answer> {
  let response: Response;
  try {
    response = await fetch(address, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers:
        content === undefined
          ? { Accept: "application/json" }
          : { Accept: "application/json", "Content-Type": "application/json" },
      body: content === undefined ? undefined : JSON.stringify(content),
    });
  } catch {
    throw new Error(NO_ANSWER);
  }
  return { ok: response.ok, status: response.status, content: await response.json().catch(() => null) };
}

/** Return the sentence with which the server explains a refusal, or null when it sent none. */
function detailOf(content: unknown): string | null {
  return isRecord(content) && typeof content.detail === "string" && content.detail !== "" ? content.detail : null;
}

function messageOf(error: unknown, otherwise: string): string {
  return error instanceof Error ? error.message : otherwise;
}

// The number of changes of the session that the page has started or seen. The answer to a reading of the session
// is dropped when the number has changed since the reading started, so that a slow answer cannot replace the
// outcome of a later sign-in or sign-out.
let changes = 0;
let reading: Promise<void> | null = null;
let leaving: Promise<boolean> | null = null;

// The requests that wait for the sign-in. Each one is told true after the sign-in and false when the visitor
// leaves the sign-in.
let waiting: ((signedIn: boolean) => void)[] = [];

function settle(signedIn: boolean): void {
  const told = waiting;
  waiting = [];
  signInRequestStore.set(null);
  told.forEach((tell) => tell(signedIn));
}

async function readSession(): Promise<void> {
  changes += 1;
  const turn = changes;
  let next: Session = UNREACHABLE;
  try {
    const { ok, content } = await ask(SESSION, "GET");
    if (ok && isSessionAnswer(content)) {
      next = sessionOf(content);
    }
  } catch {
    // The state "unreachable" tells the visitor that the server did not answer.
  }
  if (turn !== changes) {
    return;
  }
  const before = sessionStore.get().state;
  if (next === UNREACHABLE && (before === "signed-in" || before === "signed-out")) {
    // One reading without an answer does not replace what an earlier answer of the server said.
    return;
  }
  keep(next);
  if (before === "signed-in" && next.state === "signed-out") {
    // The session ends after the keeping time without use, or at a sign-out in another window. A reading that
    // finds it gone tells the visitor. A token that the server no longer holds ends no session and is not reported.
    report("warning", ENDED);
  }
}

/**
 * Ask the server whether the visitor is signed in, and keep the answer in the store. The page calls this when it
 * loads and when the visitor returns to it. A call during a request that is still running joins that request.
 */
export function loadSession(): Promise<void> {
  reading ??= readSession().finally(() => {
    reading = null;
  });
  return reading;
}

/**
 * Sign in to Earthdata with a user token of Earthdata Login. The server checks the signature and the expiry of
 * the token and keeps the token in its memory. The token is sent once and is kept nowhere on the page. The
 * requests that waited for the sign-in are then sent again.
 *
 * The promise gives the user name of the account. It is rejected with an error whose message can be shown to the
 * visitor: the sentence of the server where it sent one.
 */
export async function signIn(token: string): Promise<string> {
  const { ok, status, content } = await ask(EARTHDATA, "POST", { token });
  if (!ok) {
    throw new Error(
      detailOf(content) ??
        (status === 401
          ? "Earthdata Login does not accept this token."
          : `The sign-in failed (the server answered ${String(status)}).`),
    );
  }
  if (!isSessionAnswer(content) || content.earthdata === null) {
    throw new Error(UNREADABLE);
  }
  const { user } = content.earthdata;
  changes += 1;
  keep({ state: "signed-in", user, token: content.earthdata.token !== false });
  settle(true);
  return user;
}

/**
 * Sign out of Earthdata: the server forgets the token, ends the session and removes its cookie. What the account
 * keeps on the project server stays until its date. A request that waited for the sign-in is given up. The promise
 * is rejected with an error whose message can be shown to the visitor.
 */
export async function signOut(): Promise<void> {
  const { ok, status, content } = await ask(EARTHDATA, "DELETE");
  if (!ok) {
    throw new Error(detailOf(content) ?? `The sign-out failed (the server answered ${String(status)}).`);
  }
  changes += 1;
  keep(SIGNED_OUT);
  settle(false);
}

async function leave(): Promise<boolean> {
  try {
    await signOut();
    report("success", "You are signed out of Earthdata. Jobs that were already started go on.");
    return true;
  } catch (error) {
    report("error", messageOf(error, "The sign-out failed."));
    return false;
  }
}

/**
 * Sign out of Earthdata and tell the visitor the outcome in a message. The dialog of Sign out calls this. When
 * the visitor is known not to be signed in, nothing is sent and a notice says so. The promise tells whether the
 * visitor is signed out now.
 */
export function signOutWithMessage(): Promise<boolean> {
  if (sessionStore.get().state === "signed-out") {
    report("info", "You are not signed in to Earthdata.");
    return Promise.resolve(true);
  }
  leaving ??= leave().finally(() => {
    leaving = null;
  });
  return leaving;
}

/**
 * Open the dialog of Sign out, which says what stays where before anything is sent. The button Sign out of the
 * ribbon, the one of the title bar and the one of the pane of the sign-in call this. When the visitor is known
 * not to be signed in, a notice says so and no dialog opens.
 */
export function askSignOut(): void {
  if (sessionStore.get().state === "signed-out") {
    report("info", "You are not signed in to Earthdata.");
    return;
  }
  signOutDialogStore.set(true);
}

/**
 * Record that the server refused a request with the answer 401: it needs the token, which it does not hold, or
 * the session has ended. The state of the sign-in is read again, so that the page shows which of the two it is.
 *
 * With `waits`, the request waits for the sign-in: the pane of the sign-in opens with the sentence of the server,
 * and the promise gives true after the sign-in, when the request is to be sent again, and false when the visitor
 * closed the pane or signed out. Without `waits` the promise gives false at once; the page repeats such a
 * reading itself when the sign-in changes.
 */
export function signInNeeded(sentence: string, waits: boolean): Promise<boolean> {
  void loadSession();
  if (!waits) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    waiting.push(resolve);
    // The first refusal names the reason. A later one joins it and changes no word of the pane.
    if (signInRequestStore.get() === null) {
      signInRequestStore.set({ sentence });
    }
  });
}

/** Give up the requests that wait for the sign-in. The visitor has closed the pane of the sign-in. */
export function cancelSignInRequest(): void {
  if (waiting.length > 0 || signInRequestStore.get() !== null) {
    settle(false);
  }
}

/** Forget the state of the sign-in and the requests on their way. The tests start from this state. */
export function resetSession(): void {
  changes += 1;
  reading = null;
  leaving = null;
  settle(false);
  signOutDialogStore.set(false);
  sessionStore.set(UNKNOWN);
}
