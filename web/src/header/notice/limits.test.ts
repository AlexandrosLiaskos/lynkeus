// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { afterEach, expect, test, vi } from "vitest";
import { isServiceLimits, loadLimits, NO_ANSWER, UNREADABLE } from "./limits";
import { SAMPLE, sampleWith } from "./testLimits";

function answerWith(status: number, content: string) {
  return vi.fn<typeof fetch>(() => Promise.resolve(new Response(content, { status })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("the answer of the server is accepted, with resources that are known or not", () => {
  expect(isServiceLimits(SAMPLE)).toBe(true);
  expect(isServiceLimits(sampleWith({ larger_layer: "coarser" }, { processors: 1.5 }))).toBe(true);
  expect(isServiceLimits(sampleWith({}, { processors: null, memory: null }))).toBe(true);
});

test.each([
  ["it is not an object", "0.1.0"],
  ["it is a list", [SAMPLE]],
  ["it is null", null],
  ["it has no version", { ...SAMPLE, version: undefined }],
  ["its version is empty", { ...SAMPLE, version: "" }],
  ["its version is a number", { ...SAMPLE, version: 1 }],
  ["it has no resources", { ...SAMPLE, resources: undefined }],
  ["it has no limits", { ...SAMPLE, limits: undefined }],
  ["its limits are a list", { ...SAMPLE, limits: [] }],
  ["the processors are zero", sampleWith({}, { processors: 0 })],
  ["the processors are a text", { ...SAMPLE, resources: { processors: "2", memory: 2147483648 } }],
  ["the memory is absent", { ...SAMPLE, resources: { processors: 2 } }],
  ["the memory is negative", sampleWith({}, { memory: -1 })],
  ["a limit is absent", { ...SAMPLE, limits: { ...SAMPLE.limits, job_time: undefined } }],
  ["a limit is zero", sampleWith({ layer_cells: 0 })],
  ["a limit is a text", { ...SAMPLE, limits: { ...SAMPLE.limits, session_layers: "50" } }],
  ["a limit is not a finite number", sampleWith({ total_size: Number.POSITIVE_INFINITY })],
  ["the choice for a larger layer is unknown", { ...SAMPLE, limits: { ...SAMPLE.limits, larger_layer: "smaller" } }],
])("an answer is refused when %s", (_, value) => {
  expect(isServiceLimits(value)).toBe(false);
});

test("the request reads the address of the limits, without a cookie and without a stored copy", async () => {
  const request = answerWith(200, JSON.stringify(SAMPLE));
  vi.stubGlobal("fetch", request);
  await expect(loadLimits()).resolves.toEqual(SAMPLE);
  expect(request).toHaveBeenCalledExactlyOnceWith("/api/limits", {
    credentials: "omit",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
});

test("a request without an answer fails with the sentence for it", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(() => Promise.reject(new TypeError("Failed to fetch"))),
  );
  await expect(loadLimits()).rejects.toThrow(NO_ANSWER);
});

test("an answer with an error fails with a sentence that names the error", async () => {
  vi.stubGlobal("fetch", answerWith(502, "<html>Bad Gateway</html>"));
  await expect(loadLimits()).rejects.toThrow("The server of Lynkeus answered with the error 502.");
});

test.each([
  ["is not JSON", "<html></html>"],
  ["has another form", JSON.stringify({ status: "ok", version: "0.1.0" })],
])("an answer that %s fails with the sentence for it", async (_, content) => {
  vi.stubGlobal("fetch", answerWith(200, content));
  await expect(loadLimits()).rejects.toThrow(UNREADABLE);
});
