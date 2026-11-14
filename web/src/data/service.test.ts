import { afterEach, expect, test, vi } from "vitest";
import { call, checked, onSignInEnded, Refusal, UNREADABLE, wordsOf } from "./service";

function answerWith(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(body === null ? null : JSON.stringify(body), { status, headers })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  onSignInEnded(() => undefined);
});

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

test("the answer 401 is passed to the function that records the end of the sign-in", async () => {
  const ended = vi.fn();
  onSignInEnded(ended);
  vi.stubGlobal("fetch", answerWith(401, { detail: "Sign in to Earthdata to start this job." }));
  await expect(call("/api/processes/get-layer/execution", { method: "POST", content: {} })).rejects.toThrow(
    "Sign in to Earthdata to start this job.",
  );
  expect(ended).toHaveBeenCalledTimes(1);
  vi.stubGlobal("fetch", answerWith(404, { detail: "Your session has no job of this name." }));
  await expect(call("/api/jobs/a")).rejects.toThrow("no job of this name");
  expect(ended).toHaveBeenCalledTimes(1);
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
