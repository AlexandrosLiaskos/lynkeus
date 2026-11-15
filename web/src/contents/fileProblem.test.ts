import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LABORATORY, SERVERS } from "../servers/testServers";
import { serversStore } from "../shared/servers";
import { fileProblem, problemOfAnswer } from "./fileProblem";

const SITE_FILE = "/files/fedcba9876543210fedcba9876543210/backscatter-hh.tif";
const OWN_FILE = `/api/servers/${LABORATORY.id}/files/fedcba9876543210fedcba9876543210/backscatter-hh.tif`;

/** Answer the next request with a status and, when given, the sentence of the server. */
function answer(status: number, detail?: string) {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    Promise.resolve(new Response(detail === undefined ? "not json" : JSON.stringify({ detail }), { status })),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => {
  serversStore.set(SERVERS);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("an answer that gives the file states no problem", () => {
  expect(problemOfAnswer(SITE_FILE, 200, null)).toBeNull();
  expect(problemOfAnswer(OWN_FILE, 206, null)).toBeNull();
});

test("an own server that is not connected is named in one sentence, and the layer can be tried again", () => {
  expect(problemOfAnswer(OWN_FILE, 503, null)).toEqual({
    text: 'Your server "Laboratory server", which keeps this layer, is not connected. Start Lynkeus Server on that computer and try again.',
    again: true,
  });
  serversStore.set(null);
  expect(problemOfAnswer(OWN_FILE, 503, null)?.text).toBe(
    "Your server, which keeps this layer, is not connected. Start Lynkeus Server on that computer and try again.",
  );
});

test("the sentence of the server is shown where the answer has one", () => {
  const sentence = 'The server "Laboratory server" is not connected.';
  expect(problemOfAnswer(OWN_FILE, 503, sentence)).toEqual({ text: sentence, again: true });
  expect(problemOfAnswer(OWN_FILE, 504, "The server did not send the part in time.")?.text).toBe(
    "The server did not send the part in time.",
  );
});

test("an own server that does not answer in time, and a visitor who is not signed in, are told apart", () => {
  expect(problemOfAnswer(OWN_FILE, 504, null)).toEqual({
    text: 'Your server "Laboratory server", which keeps this layer, did not answer in time. Check its connection and try again.',
    again: true,
  });
  expect(problemOfAnswer(OWN_FILE, 401, "Sign in to Earthdata.")).toEqual({
    text: 'Your server "Laboratory server" keeps this layer, and its files are read only while you are signed in to Earthdata. Sign in and try again.',
    again: true,
  });
});

test("a file that no longer exists cannot be tried again", () => {
  expect(problemOfAnswer(SITE_FILE, 404, null)).toEqual({
    text: "The file of the layer no longer exists.",
    again: false,
  });
  expect(problemOfAnswer(OWN_FILE, 404, "The server holds no such layer.")).toEqual({
    text: "The server holds no such layer.",
    again: false,
  });
});

test("any other answer names its status, or shows the sentence of the server", () => {
  expect(problemOfAnswer(SITE_FILE, 503, null)).toEqual({
    text: "The file of the layer could not be read. The server answered 503.",
    again: true,
  });
  expect(problemOfAnswer(SITE_FILE, 429, "Too many requests came from your address.")?.text).toBe(
    "Too many requests came from your address.",
  );
});

test("the site is asked for the first byte of the file, with the cookie of the session", async () => {
  const fetch = answer(503, 'The server "Laboratory server" is not connected.');
  expect(await fileProblem(OWN_FILE)).toEqual({
    text: 'The server "Laboratory server" is not connected.',
    again: true,
  });
  expect(fetch.mock.calls).toEqual([
    [OWN_FILE, { headers: { Range: "bytes=0-0" }, credentials: "same-origin", cache: "no-store" }],
  ]);
});

test("an answer without a sentence is worded by its status", async () => {
  answer(503);
  expect((await fileProblem(OWN_FILE))?.text).toMatch(
    /^Your server "Laboratory server", which keeps this layer, is not connected\./,
  );
});

test("a file that can be read after all states no problem", async () => {
  answer(206);
  expect(await fileProblem(SITE_FILE)).toBeNull();
});

test("a request without an answer says that the server of Lynkeus did not answer", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
  );
  expect(await fileProblem(SITE_FILE)).toEqual({
    text: "The server of Lynkeus did not answer, so the file of the layer could not be read.",
    again: true,
  });
});
