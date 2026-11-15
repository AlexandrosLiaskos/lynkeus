// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { vi } from "vitest";
import { onSignInNeeded } from "./service";

// A text in the form of a token. It belongs to no account.
export const TOKEN = "eyJ0eXAiOiJKV1QifQ.c2FtcGxlLXRva2VuLW9mLW5vLWFjY291bnQ.c2lnbmF0dXJl";

/** The sentence with which the server refuses a token (`api/src/lynkeus/routes.py`). */
export const REFUSAL =
  "Earthdata Login does not accept this token. Check that the whole token was copied and has not expired.";

/** What the stand-in answers: a status code and the content. */
export interface Reply {
  status: number;
  content?: unknown;
}

/** One request that the stand-in received. */
export interface Received {
  method: string;
  address: string;
  content: unknown;
}

/**
 * A stand-in for the three addresses of the session at the web service. It takes the place of `fetch`. A sign-in
 * is accepted for the user `accepts`, unless `refusal` holds the answer to give in its place.
 */
export class Earthdata {
  /** The user who is signed in, or null. */
  user: string | null;
  /** The user for whom a sign-in is accepted. */
  accepts = "a_user";
  /**
   * Whether the server holds the token of the user who is signed in, as the answer about the session states it.
   * With undefined the answer has no `token`, as the answer of the older server.
   */
  token: boolean | undefined = undefined;
  /** The answer to the next requests in the place of the usual one, by method. */
  refusal: Partial<Record<string, Reply>> = {};
  /** Whether the server is out of reach, so that every request fails without an answer. */
  down = false;
  /** While true, the answers wait until `release` is called. */
  slow = false;
  /** The requests received, in their order. */
  readonly received: Received[] = [];

  private waiting: (() => void)[] = [];

  constructor(user: string | null = null) {
    this.user = user;
  }

  /** Give the answers that wait. */
  release(): void {
    this.slow = false;
    this.waiting.splice(0).forEach((give) => give());
  }

  /** The requests of one method. */
  sent(method: string): Received[] {
    return this.received.filter((request) => request.method === method);
  }

  readonly fetch = vi.fn<typeof fetch>((input, init) => {
    const address = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const content: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    this.received.push({ method, address, content });
    const answer = () => {
      if (this.down) {
        throw new TypeError("Failed to fetch");
      }
      const { status, content: sent } = this.reply(method, address);
      return new Response(sent === undefined ? null : JSON.stringify(sent), { status });
    };
    if (!this.slow) {
      return Promise.resolve().then(answer);
    }
    return new Promise<Response>((resolve) => {
      this.waiting.push(() => resolve(Promise.resolve().then(answer)));
    });
  });

  private reply(method: string, address: string): Reply {
    const refusal = this.refusal[method];
    if (refusal) {
      return refusal;
    }
    const state = () => ({
      earthdata:
        this.user === null
          ? null
          : this.token === undefined
            ? { user: this.user }
            : { user: this.user, token: this.token },
    });
    if (method === "GET" && address === "/api/session") {
      return { status: 200, content: state() };
    }
    if (method === "POST" && address === "/api/session/earthdata") {
      this.user = this.accepts;
      // A sign-in gives the token to a server that states whether it holds one.
      this.token = this.token === undefined ? undefined : true;
      return { status: 200, content: state() };
    }
    if (method === "DELETE" && address === "/api/session/earthdata") {
      this.user = null;
      return { status: 204 };
    }
    return { status: 404, content: { detail: "Not found." } };
  }
}

/** Put a stand-in for the addresses of the session in the place of `fetch`, and return it. */
export function earthdata(user: string | null = null): Earthdata {
  const server = new Earthdata(user);
  vi.stubGlobal("fetch", server.fetch);
  return server;
}

/** The sign-in for which requests wait in a test, and the two ways in which the visitor ends the wait. */
export interface WaitingSignIn {
  /** The sentences of the server with which the waiting requests were refused, in their order. */
  readonly sentences: string[];
  /** The visitor signs in: every waiting request is sent again. */
  signIn: () => void;
  /** The visitor closes the pane of the sign-in: every waiting request is given up. */
  giveUp: () => void;
}

/**
 * Put a stand-in in the place of the function that the page names for an answer 401 (`signInNeeded` of the
 * session): a request that changes something waits until the test signs in or gives the sign-in up, and a
 * reading does not wait. A test ends it with `onSignInNeeded(null)`.
 */
export function waitingSignIn(): WaitingSignIn {
  const sentences: string[] = [];
  let waiting: ((signedIn: boolean) => void)[] = [];
  const end = (signedIn: boolean) => {
    const told = waiting;
    waiting = [];
    told.forEach((tell) => tell(signedIn));
  };
  onSignInNeeded((sentence, waits) => {
    if (!waits) {
      return Promise.resolve(false);
    }
    sentences.push(sentence);
    return new Promise((resolve) => {
      waiting.push(resolve);
    });
  });
  return { sentences, signIn: () => end(true), giveUp: () => end(false) };
}
