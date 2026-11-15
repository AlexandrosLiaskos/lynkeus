// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { afterEach, expect, test, vi } from "vitest";
import { call, checked, onSignInNeeded, Refusal, SignInCancelled, UNREADABLE, wordsOf } from "./service";

function answerWith(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(body === null ? null : JSON.stringify(body), { status, headers })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  onSignInNeeded(null);
});

/** A stand-in that answers the first requests with the given answers, in their order, and the later ones with the last. */
function answersWith(...answers: [number, unknown][]) {
  let turn = 0;
  return vi.fn<typeof fetch>(() => {
    const [status, body] = answers[Math.min(turn, answers.length - 1)] ?? [500, null];
    turn += 1;
    return Promise.resolve(new Response(body === null ? null : JSON.stringify(body), { status }));
  });
}

const NEEDS_TOKEN = "The job needs your Earthdata token, which the server no longer holds. Sign in again.";

test("a reading asks for JSON, sends the cookie to this site only and uses no stored answer", async () => {
  const fetch = answerWith(200, { jobs: [] });
  vi.stubGlobal("fetch", fetch);
  await expect(call("/api/jobs")).resolves.toEqual({ jobs: [] });
  expect(fetch).toHaveBeenCalledWith("/api/jobs", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
    body: undefined,
  });
});

test("a request with content sends it as JSON", async () => {
  const fetch = answerWith(201, { jobID: "a" });
  vi.stubGlobal("fetch", fetch);
  await call("/api/processes/get-layer/execution", { method: "POST", content: { inputs: { layer: "HHHH" } } });
  const [, request] = fetch.mock.calls[0] ?? [];
  expect(request?.method).toBe("POST");
  expect(request?.headers).toEqual({ Accept: "application/json", "Content-Type": "application/json" });
  expect(request?.body).toBe('{"inputs":{"layer":"HHHH"}}');
});

test("an answer without content gives null", async () => {
  vi.stubGlobal("fetch", answerWith(204, null));
  await expect(call("/api/layers/a", { method: "DELETE" })).resolves.toBeNull();
});

test("a refusal carries the sentence of the server, its status and the time to wait", async () => {
  vi.stubGlobal(
    "fetch",
    answerWith(503, { detail: "Too many jobs wait at present. Try again in a few minutes." }, { "Retry-After": "120" }),
  );
  const refusal = await call("/api/processes/get-layer/execution", { method: "POST", content: {} }).catch(
    (error: unknown) => error,
  );
  expect(refusal).toBeInstanceOf(Refusal);
  expect(refusal).toMatchObject({
    message: "Too many jobs wait at present. Try again in a few minutes.",
    status: 503,
    wait: 120,
  });
});

test("a refusal without a sentence is reported with its number, and without a time to wait", async () => {
  vi.stubGlobal("fetch", answerWith(500, "Internal Server Error"));
  const refusal = await call("/api/jobs", { failure: "The jobs could not be read" }).catch((error: unknown) => error);
  expect(refusal).toMatchObject({
    message: "The jobs could not be read (the server answered 500).",
    status: 500,
    wait: null,
  });
});

test("without a function for the sign-in, the answer 401 is a refusal as any other", async () => {
  vi.stubGlobal("fetch", answerWith(401, { detail: "Sign in to Earthdata to start this job." }));
  const refusal = await call("/api/processes/get-layer/execution", { method: "POST", content: {} }).catch(
    (error: unknown) => error,
  );
  expect(refusal).toBeInstanceOf(Refusal);
  expect(refusal).not.toBeInstanceOf(SignInCancelled);
  expect(refusal).toMatchObject({ message: "Sign in to Earthdata to start this job.", status: 401 });
});

test("a request answered 401 waits for the sign-in and is then sent again with the same content", async () => {
  const needed = vi.fn((_sentence: string, _waits: boolean) => Promise.resolve(true));
  onSignInNeeded(needed);
  const fetch = answersWith([401, { detail: NEEDS_TOKEN }], [201, { jobID: "a" }]);
  vi.stubGlobal("fetch", fetch);
  const content = { inputs: { product: "GCOV", layer: "HHHH" } };
  await expect(call("/api/processes/get-layer/execution?server=project", { method: "POST", content })).resolves.toEqual(
    { jobID: "a" },
  );
  expect(needed).toHaveBeenCalledExactlyOnceWith(NEEDS_TOKEN, true);
  expect(fetch).toHaveBeenCalledTimes(2);
  const [first, second] = fetch.mock.calls;
  expect(second).toEqual(first);
  expect(second?.[0]).toBe("/api/processes/get-layer/execution?server=project");
  expect(second?.[1]?.body).toBe(JSON.stringify(content));
});

test.each(["POST", "PATCH", "DELETE"] as const)("a %s request answered 401 waits for the sign-in", async (method) => {
  const needed = vi.fn(() => Promise.resolve(true));
  onSignInNeeded(needed);
  vi.stubGlobal("fetch", answersWith([401, { detail: NEEDS_TOKEN }], [200, { done: true }]));
  await expect(call("/api/layers/a", { method, content: { title: "A" } })).resolves.toEqual({ done: true });
  expect(needed).toHaveBeenCalledExactlyOnceWith(NEEDS_TOKEN, true);
});

test("a sign-in that the visitor gives up rejects the request with the sentence of the server", async () => {
  onSignInNeeded(() => Promise.resolve(false));
  const fetch = answerWith(401, { detail: NEEDS_TOKEN });
  vi.stubGlobal("fetch", fetch);
  const refusal = await call("/api/processes/get-layer/execution", { method: "POST", content: {} }).catch(
    (error: unknown) => error,
  );
  expect(refusal).toBeInstanceOf(SignInCancelled);
  expect(refusal).toBeInstanceOf(Refusal);
  expect(refusal).toMatchObject({ message: NEEDS_TOKEN, status: 401, wait: null });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("a request that is answered 401 again after the sign-in does not wait a second time", async () => {
  const needed = vi.fn((_sentence: string, waits: boolean) => Promise.resolve(waits));
  onSignInNeeded(needed);
  const fetch = answerWith(401, { detail: NEEDS_TOKEN });
  vi.stubGlobal("fetch", fetch);
  const refusal = await call("/api/processes/get-layer/execution", { method: "POST", content: {} }).catch(
    (error: unknown) => error,
  );
  expect(refusal).toBeInstanceOf(Refusal);
  expect(refusal).not.toBeInstanceOf(SignInCancelled);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(needed.mock.calls).toEqual([
    [NEEDS_TOKEN, true],
    [NEEDS_TOKEN, false],
  ]);
});

test("a reading answered 401 tells the function for the sign-in and does not wait", async () => {
  const needed = vi.fn((_sentence: string, _waits: boolean) => Promise.resolve(false));
  onSignInNeeded(needed);
  const fetch = answerWith(401, { detail: "Sign in to Earthdata to see your servers." });
  vi.stubGlobal("fetch", fetch);
  const refusal = await call("/api/servers").catch((error: unknown) => error);
  expect(refusal).toBeInstanceOf(Refusal);
  expect(refusal).not.toBeInstanceOf(SignInCancelled);
  expect(needed).toHaveBeenCalledExactlyOnceWith("Sign in to Earthdata to see your servers.", false);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("an answer other than 401 does not reach the function for the sign-in", async () => {
  const needed = vi.fn(() => Promise.resolve(true));
  onSignInNeeded(needed);
  vi.stubGlobal("fetch", answerWith(404, { detail: "Your session has no job of this name." }));
  await expect(call("/api/jobs/a", { method: "DELETE" })).rejects.toThrow("no job of this name");
  vi.stubGlobal("fetch", answerWith(507, { detail: "The server has too little free space for this job." }));
  await expect(call("/api/processes/get-layer/execution", { method: "POST", content: {} })).rejects.toThrow(
    "too little free space",
  );
  expect(needed).not.toHaveBeenCalled();
});

test("a server that cannot be reached is reported in plain words", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
  );
  const error = await call("/api/jobs").catch((caught: unknown) => caught);
  expect(error).not.toBeInstanceOf(Refusal);
  expect(error).toMatchObject({ message: "The server of Lynkeus did not answer. Check the connection and try again." });
});

test("an answer is returned when the check accepts it and refused otherwise", () => {
  const isNumber = (value: unknown): value is number => typeof value === "number";
  expect(checked(3, isNumber)).toBe(3);
  expect(() => checked("3", isNumber)).toThrow(UNREADABLE);
});

test("the words of an error are its message, or the given words for a value that is no error", () => {
  expect(wordsOf(new Error("The job failed."), "Other")).toBe("The job failed.");
  expect(wordsOf("text", "The request failed.")).toBe("The request failed.");
});
