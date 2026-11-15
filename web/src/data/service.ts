// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
/**
 * The requests of the Data tab to the web service of Lynkeus about the jobs and the layers of the session. The
 * cookie that names the session travels with each request, to this site only.
 */

const NO_ANSWER = "The server of Lynkeus did not answer. Check the connection and try again.";

/** The sentence for an answer of the server that does not have the expected form. */
export const UNREADABLE = "The answer of the server could not be read.";

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

// The function that is called when the server answers 401: the visitor is not signed in to Earthdata, or the
// sign-in has ended.
let signInEnded: () => void = () => undefined;

/** Name the function that records the end of the sign-in to Earthdata. The server reports the end with the answer 401. */
export function onSignInEnded(handler: () => void): void {
  signInEnded = handler;
}

/**
 * Send a request to the web service and return the content of its answer, or null when the answer has none. The
 * promise is rejected with an error whose message can be shown to the visitor: a `Refusal` with the sentence of
 * the server when the server refused the request.
 */
export async function call(
  address: string,
  { method = "GET", content, failure = "The request failed" }: Call = {},
): Promise<unknown> {
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
  } catch (error) {
    throw new Error(NO_ANSWER, { cause: error });
  }
  const answer: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) {
      signInEnded();
    }
    const detail = isRecord(answer) && typeof answer.detail === "string" && answer.detail !== "" ? answer.detail : null;
    const seconds = Number(response.headers.get("Retry-After") ?? "");
    throw new Refusal(
      detail ?? `${failure} (the server answered ${String(response.status)}).`,
      response.status,
      Number.isInteger(seconds) && seconds > 0 ? seconds : null,
    );
  }
  return answer;
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
