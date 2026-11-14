import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { messagesStore } from "../shared/messages/messages";
import {
  isSessionAnswer,
  isSignedIn,
  loadSession,
  resetSession,
  signInEnded,
  sessionStore,
  signIn,
  signOut,
  signOutWithMessage,
  type Session,
} from "./session";

// A text in the form of a token. It belongs to no account.
const TOKEN = "eyJ0eXAiOiJKV1QifQ.c2FtcGxlLXRva2VuLW9mLW5vLWFjY291bnQ.c2lnbmF0dXJl";

type Fetch = ReturnType<typeof vi.fn<typeof fetch>>;

function answerWith(status: number, content?: unknown): Fetch {
  return vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(content === undefined ? null : JSON.stringify(content), { status })),
  );
}

function noAnswer(): Fetch {
  return vi.fn<typeof fetch>(() => Promise.reject(new TypeError("Failed to fetch")));
}

function messages(): [string, string][] {
  return messagesStore.get().map(({ kind, text }) => [kind, text]);
}

beforeEach(() => {
  resetSession();
  messagesStore.set([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("the answers of the contract are accepted", () => {
  expect(isSessionAnswer({ earthdata: null })).toBe(true);
  expect(isSessionAnswer({ earthdata: { user: "a_user" } })).toBe(true);
});

test.each([
  ["it is not an object", "signed in"],
  ["it is null", null],
  ["it has no field earthdata", {}],
  ["the field earthdata is a text", { earthdata: "a_user" }],
  ["the field earthdata is false", { earthdata: false }],
  ["the user name is missing", { earthdata: {} }],
  ["the user name is empty", { earthdata: { user: "" } }],
  ["the user name is a number", { earthdata: { user: 7 } }],
])("an answer about the session is rejected when %s", (_reason, value) => {
  expect(isSessionAnswer(value)).toBe(false);
});

test("the state is not known before the server has been asked", () => {
  expect(sessionStore.get()).toEqual({ state: "unknown" });
  expect(isSignedIn()).toBe(false);
});

test("the page learns from the server that the visitor is not signed in", async () => {
  const fetch = answerWith(200, { earthdata: null });
  vi.stubGlobal("fetch", fetch);
  await loadSession();
  expect(sessionStore.get()).toEqual({ state: "signed-out" });
  expect(fetch).toHaveBeenCalledWith(
    "/api/session",
    expect.objectContaining({ method: "GET", credentials: "same-origin", cache: "no-store", body: undefined }),
  );
});

test("the page learns from the server who is signed in", async () => {
  vi.stubGlobal("fetch", answerWith(200, { earthdata: { user: "a_user" } }));
  await loadSession();
  expect(sessionStore.get()).toEqual({ state: "signed-in", user: "a_user" });
  expect(isSignedIn()).toBe(true);
});

test.each([
  ["does not answer", noAnswer()],
  ["answers with an error", answerWith(502, { detail: "Bad gateway." })],
  ["answers in another shape", answerWith(200, { user: "a_user" })],
  ["answers with a text that is not JSON", vi.fn<typeof fetch>(() => Promise.resolve(new Response("<html>")))],
])("the service is marked as not reachable when it %s", async (_reason, fetch) => {
  vi.stubGlobal("fetch", fetch);
  await loadSession();
  expect(sessionStore.get()).toEqual({ state: "unreachable" });
  expect(messages()).toEqual([]);
});

test("two calls at the same time ask the server once", async () => {
  const fetch = answerWith(200, { earthdata: null });
  vi.stubGlobal("fetch", fetch);
  await Promise.all([loadSession(), loadSession()]);
  expect(fetch).toHaveBeenCalledTimes(1);
  await loadSession();
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("a sign-in sends the token once, in the content of the request, and gives the user name", async () => {
  const fetch = answerWith(200, { earthdata: { user: "a_user" } });
  vi.stubGlobal("fetch", fetch);
  await expect(signIn(TOKEN)).resolves.toBe("a_user");
  expect(sessionStore.get()).toEqual({ state: "signed-in", user: "a_user" });
  expect(fetch).toHaveBeenCalledTimes(1);
  const [address, request] = fetch.mock.calls[0] ?? [];
  expect(address).toBe("/api/session/earthdata");
  expect(request?.method).toBe("POST");
  expect(request?.credentials).toBe("same-origin");
  expect(request?.headers).toEqual({ Accept: "application/json", "Content-Type": "application/json" });
  expect(request?.body).toBe(JSON.stringify({ token: TOKEN }));
});

test("a token that Earthdata Login does not accept is refused in the words of the server", async () => {
  vi.stubGlobal(
    "fetch",
    answerWith(401, {
      detail: "Earthdata Login does not accept this token. Check that the whole token was copied and has not expired.",
    }),
  );
  sessionStore.set({ state: "signed-out" });
  await expect(signIn(TOKEN)).rejects.toThrow(
    "Earthdata Login does not accept this token. Check that the whole token was copied and has not expired.",
  );
  expect(sessionStore.get()).toEqual({ state: "signed-out" });
});

test.each([
  [401, undefined, "Earthdata Login does not accept this token."],
  [401, { detail: "" }, "Earthdata Login does not accept this token."],
  [422, { detail: [{ msg: "Field required" }] }, "The sign-in failed (the server answered 422)."],
  [503, "Service Unavailable", "The sign-in failed (the server answered 503)."],
])("a refusal %i of a sign-in without a sentence is reported in plain words", async (status, content, message) => {
  vi.stubGlobal("fetch", answerWith(status, content));
  await expect(signIn(TOKEN)).rejects.toThrow(message);
  expect(isSignedIn()).toBe(false);
});

test.each([
  ["names nobody", { earthdata: null }],
  ["has another shape", { user: "a_user" }],
  ["is empty", undefined],
])("a sign-in is not trusted when the answer %s", async (_reason, content) => {
  vi.stubGlobal("fetch", answerWith(200, content));
  await expect(signIn(TOKEN)).rejects.toThrow("The answer of the server could not be read.");
  expect(isSignedIn()).toBe(false);
});

test("a sign-in to a server that does not answer is reported in plain words", async () => {
  vi.stubGlobal("fetch", noAnswer());
  await expect(signIn(TOKEN)).rejects.toThrow("The server of Lynkeus did not answer.");
  expect(isSignedIn()).toBe(false);
});

test("no error of a sign-in carries the token", async () => {
  for (const fetch of [noAnswer(), answerWith(401), answerWith(500, "x"), answerWith(200, { earthdata: null })]) {
    vi.stubGlobal("fetch", fetch);
    const error: unknown = await signIn(TOKEN).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect(JSON.stringify([error, (error as Error).message, (error as Error).cause])).not.toContain(TOKEN);
  }
});

test("a sign-out asks the server to forget the token", async () => {
  const fetch = answerWith(204);
  vi.stubGlobal("fetch", fetch);
  sessionStore.set({ state: "signed-in", user: "a_user" });
  await signOut();
  expect(sessionStore.get()).toEqual({ state: "signed-out" });
  expect(fetch).toHaveBeenCalledWith(
    "/api/session/earthdata",
    expect.objectContaining({ method: "DELETE", credentials: "same-origin", body: undefined }),
  );
});

test("a sign-out that fails leaves the visitor signed in", async () => {
  sessionStore.set({ state: "signed-in", user: "a_user" });
  vi.stubGlobal("fetch", answerWith(500, { detail: "The session could not be ended." }));
  await expect(signOut()).rejects.toThrow("The session could not be ended.");
  vi.stubGlobal("fetch", answerWith(500, "x"));
  await expect(signOut()).rejects.toThrow("The sign-out failed (the server answered 500).");
  vi.stubGlobal("fetch", noAnswer());
  await expect(signOut()).rejects.toThrow("The server of Lynkeus did not answer.");
  expect(sessionStore.get()).toEqual({ state: "signed-in", user: "a_user" });
});

test("a reading that finds the sign-in gone tells the visitor once", async () => {
  sessionStore.set({ state: "signed-in", user: "a_user" });
  vi.stubGlobal("fetch", answerWith(200, { earthdata: null }));
  await loadSession();
  await loadSession();
  expect(sessionStore.get()).toEqual({ state: "signed-out" });
  expect(messages()).toEqual([["warning", "Your sign-in to Earthdata has ended. Sign in again to continue."]]);
});

test.each<Session>([{ state: "signed-in", user: "a_user" }, { state: "signed-out" }])(
  "a reading without an answer keeps what an earlier answer said (%j)",
  async (known) => {
    sessionStore.set(known);
    vi.stubGlobal("fetch", noAnswer());
    await loadSession();
    expect(sessionStore.get()).toEqual(known);
    expect(messages()).toEqual([]);
  },
);

test("a slow answer about the session does not replace a later sign-in", async () => {
  let answerReading: (response: Response) => void = () => undefined;
  const server: Fetch = vi.fn<typeof fetch>((_address, request) =>
    request?.method === "GET"
      ? new Promise<Response>((resolve) => {
          answerReading = resolve;
        })
      : Promise.resolve(new Response(JSON.stringify({ earthdata: { user: "a_user" } }), { status: 200 })),
  );
  vi.stubGlobal("fetch", server);
  const reading = loadSession();
  await signIn(TOKEN);
  answerReading(new Response(JSON.stringify({ earthdata: null }), { status: 200 }));
  await reading;
  expect(sessionStore.get()).toEqual({ state: "signed-in", user: "a_user" });
});

test("the sign-out with a message reports the sign-out", async () => {
  vi.stubGlobal("fetch", answerWith(204));
  sessionStore.set({ state: "signed-in", user: "a_user" });
  await signOutWithMessage();
  expect(sessionStore.get()).toEqual({ state: "signed-out" });
  expect(messages()).toEqual([["success", "You are signed out of Earthdata. Jobs that were already started go on."]]);
});

test("the sign-out with a message reports a failure with the words of the server", async () => {
  vi.stubGlobal("fetch", answerWith(500, { detail: "The session could not be ended." }));
  sessionStore.set({ state: "signed-in", user: "a_user" });
  await signOutWithMessage();
  expect(isSignedIn()).toBe(true);
  expect(messages()).toEqual([["error", "The session could not be ended."]]);
});

test("the sign-out of a visitor who is not signed in sends nothing and says so", async () => {
  const fetch = answerWith(204);
  vi.stubGlobal("fetch", fetch);
  sessionStore.set({ state: "signed-out" });
  await signOutWithMessage();
  expect(fetch).not.toHaveBeenCalled();
  expect(messages()).toEqual([["info", "You are not signed in to Earthdata."]]);
});

test("two sign-outs at the same time send one request and one message", async () => {
  const fetch = answerWith(204);
  vi.stubGlobal("fetch", fetch);
  sessionStore.set({ state: "signed-in", user: "a_user" });
  await Promise.all([signOutWithMessage(), signOutWithMessage()]);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(messages()).toHaveLength(1);
});

test("the end of the session is recorded, and the visitor is told once", () => {
  sessionStore.set({ state: "signed-in", user: "a_user" });
  signInEnded();
  signInEnded();
  signInEnded();
  expect(sessionStore.get()).toEqual({ state: "signed-out" });
  expect(messages()).toEqual([["warning", "Your sign-in to Earthdata has ended. Sign in again to continue."]]);
});

test("a refusal that reaches a visitor who was not signed in adds no message", () => {
  signInEnded();
  expect(sessionStore.get()).toEqual({ state: "signed-out" });
  expect(messages()).toEqual([]);
});
