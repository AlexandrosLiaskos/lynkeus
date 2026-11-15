// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
/**
 * The requests of the Data tab to the web service of Lynkeus about the jobs and the layers of the session. The
 * cookie that names the session travels with each request, to this site only.
 */

const NO_ANSWER = "The server of Lynkeus did not answer. Check the connection and try again.";

/** The sentence for an answer of the server that does not have the expected form. */
export const UNREADABLE = "The answer of the server could not be read.";

/** The status code of an answer that asks for the sign-in: the token is not held, or the session has ended. */
const SIGN_IN_ASKED = 401;

/** A request that the server refused. The message is the sentence of the server for the visitor. */
export class Refusal extends Error {
  /** Status code of the answer. */
  readonly status: number;
  /** The time after which the server accepts the request again, in seconds, or null when it named none. */
  readonly wait: number | null;

  constructor(message: string, status: number, wait: number | null) {
    super(message);
    this.name = "Refusal";
    this.status = status;
    this.wait = wait;
  }
}

/**
 * A request that the server refused because it needs the sign-in, after the visitor closed the pane of the
 * sign-in without signing in. The message is the sentence of the server. A form that started the request returns
 * to the state that it had before the request, and shows no error.
 */
export class SignInCancelled extends Refusal {
  constructor(message: string) {
    super(message, SIGN_IN_ASKED, null);
    this.name = "SignInCancelled";
  }
}

/** What a request sends. Without a method the request reads (GET). */
export interface Call {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  /** The content of the request, sent as JSON. */
  content?: unknown;
  /** The words that start the message of a refusal for which the server sent no sentence. */
  failure?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * What the page does when the server answers 401. `sentence` is the sentence of the refusal. With `waits`, the
 * request waits for the sign-in: the promise gives true when the visitor has signed in and the request is to be
 * sent again, and false when the visitor gave the sign-in up.
 */
export type SignInHandler = (sentence: string, waits: boolean) => Promise<boolean>;

// The function that is called when the server answers 401: the server does not hold the token that the request
// needs, or the visitor is not signed in to Earthdata. Until the page names one, no request waits.
let signInNeeded: SignInHandler | null = null;

/**
 * Name the function that is told about an answer 401 of the server (`signInNeeded` of the session). The page
 * names it once, when it loads. With null, no function is told and no request waits.
 */
export function onSignInNeeded(handler: SignInHandler | null): void {
  signInNeeded = handler;
}

async function send(address: string, method: string, content: unknown): Promise<Response> {
  try {
    return await fetch(address, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers:
        content === undefined
          ? { Accept: "application/json" }
          : { Accept: "application/json", "Content-Type": "application/json" },
      body: content === undefined ? undefined : JSON.stringify(content),
    });
  } catch (error) {
    throw new Error(NO_ANSWER, { cause: error });
  }
}

/**
 * Send a request to the web service and return the content of its answer, or null when the answer has none. The
 * promise is rejected with an error whose message can be shown to the visitor: a `Refusal` with the sentence of
 * the server when the server refused the request.
 *
 * A request that changes something (every method but GET) and is answered 401 waits for the sign-in
 * (`docs/Storage.md`, Sign-in states): the pane of the sign-in opens with the sentence of the server, and after
 * the sign-in the same request is sent again, once, with the same content. When the visitor closes the pane
 * without signing in, the promise is rejected with `SignInCancelled`. A reading (GET) that is answered 401 does
 * not wait: the page reads again when the sign-in changes.
 */
export async function call(
  address: string,
  { method = "GET", content, failure = "The request failed" }: Call = {},
): Promise<unknown> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await send(address, method, content);
    const answer: unknown = await response.json().catch(() => null);
    if (response.ok) {
      return answer;
    }
    const detail = isRecord(answer) && typeof answer.detail === "string" && answer.detail !== "" ? answer.detail : null;
    const sentence = detail ?? `${failure} (the server answered ${String(response.status)}).`;
    if (response.status === SIGN_IN_ASKED && signInNeeded) {
      // A request that is refused again after the sign-in does not wait a second time.
      const waits = method !== "GET" && attempt === 0;
      if (await signInNeeded(sentence, waits)) {
        continue;
      }
      if (waits) {
        throw new SignInCancelled(sentence);
      }
    }
    const seconds = Number(response.headers.get("Retry-After") ?? "");
    throw new Refusal(sentence, response.status, Number.isInteger(seconds) && seconds > 0 ? seconds : null);
  }
}

/** Return the content of an answer when the check accepts it. Otherwise the error says that it could not be read. */
export function checked<Answer>(content: unknown, isAnswer: (value: unknown) => value is Answer): Answer {
  if (!isAnswer(content)) {
    throw new Error(UNREADABLE);
  }
  return content;
}

/** Return the words of an error for the visitor. */
export function wordsOf(error: unknown, otherwise: string): string {
  return error instanceof Error && error.message !== "" ? error.message : otherwise;
}
