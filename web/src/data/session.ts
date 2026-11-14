import { report } from "../shared/messages/messages";
import { createStore, useStore } from "../shared/store";

/**
 * What the page knows about the visitor's sign-in to Earthdata. The server holds the token of the sign-in, in the
 * session that a cookie names. The page holds only this state, and never the token.
 */
export type Session =
  /** The server has not been asked yet. */
  | { state: "unknown" }
  | { state: "signed-out" }
  /** `user` is the user name of the Earthdata Login account. */
  | { state: "signed-in"; user: string }
  /** The server did not answer, or its answer could not be read. */
  | { state: "unreachable" };

/** What the server answers about the session: the Earthdata user name, or null when the visitor is not signed in. */
export interface SessionAnswer {
  earthdata: { user: string } | null;
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

/** Tell whether the visitor is signed in to Earthdata. A tool that requests data asks this before it starts. */
export function isSignedIn(): boolean {
  return sessionStore.get().state === "signed-in";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Tell whether a value that the server sent is its answer about the session. */
export function isSessionAnswer(value: unknown): value is SessionAnswer {
  if (!isRecord(value) || !("earthdata" in value)) {
    return false;
  }
  const { earthdata } = value;
  return earthdata === null || (isRecord(earthdata) && typeof earthdata.user === "string" && earthdata.user !== "");
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
let leaving: Promise<void> | null = null;

async function readSession(): Promise<void> {
  changes += 1;
  const turn = changes;
  let next: Session = UNREACHABLE;
  try {
    const { ok, content } = await ask(SESSION, "GET");
    if (ok && isSessionAnswer(content)) {
      next = content.earthdata ? { state: "signed-in", user: content.earthdata.user } : SIGNED_OUT;
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
  sessionStore.set(next);
  if (before === "signed-in" && next.state === "signed-out") {
    // The server forgets a sign-in after some time. A reading that finds it gone tells the visitor.
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
 * the token and keeps the token in its memory. The token is sent once and is kept nowhere on the page.
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
  sessionStore.set({ state: "signed-in", user });
  return user;
}

/**
 * Sign out of Earthdata: the server forgets the token. The session of the visitor goes on, with its jobs and its
 * layers. The promise is rejected with an error whose message can be shown to the visitor.
 */
export async function signOut(): Promise<void> {
  const { ok, status, content } = await ask(EARTHDATA, "DELETE");
  if (!ok) {
    throw new Error(detailOf(content) ?? `The sign-out failed (the server answered ${String(status)}).`);
  }
  changes += 1;
  sessionStore.set(SIGNED_OUT);
}

async function leave(): Promise<void> {
  try {
    await signOut();
    report("success", "You are signed out of Earthdata. Jobs that were already started go on.");
  } catch (error) {
    report("error", messageOf(error, "The sign-out failed."));
  }
}

/**
 * Sign out of Earthdata and tell the visitor the outcome in a message. The button Sign out of the ribbon and the
 * one of the form call this. When the visitor is known not to be signed in, nothing is sent and a notice says so.
 */
export function signOutWithMessage(): Promise<void> {
  if (sessionStore.get().state === "signed-out") {
    report("info", "You are not signed in to Earthdata.");
    return Promise.resolve();
  }
  leaving ??= leave().finally(() => {
    leaving = null;
  });
  return leaving;
}

/**
 * Record that the sign-in has ended. A tool calls this when the server answers 401 to a request that needs the
 * sign-in. The state becomes "not signed in", and the visitor is told once, however many requests were refused.
 * A visitor who was not signed in is told nothing here: the tool shows the sentence of the server.
 */
export function signInEnded(): void {
  const wasSignedIn = isSignedIn();
  changes += 1;
  sessionStore.set(SIGNED_OUT);
  if (wasSignedIn) {
    report("warning", ENDED);
  }
}

/** Forget the state of the sign-in and the requests on their way. The tests start from this state. */
export function resetSession(): void {
  changes += 1;
  reading = null;
  leaving = null;
  sessionStore.set(UNKNOWN);
}
