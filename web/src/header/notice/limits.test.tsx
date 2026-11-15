// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  AMOUNTS,
  isServiceLimits,
  limitsStore,
  loadLimits,
  NO_ANSWER,
  readLimits,
  resetLimits,
  UNREADABLE,
  useLimits,
} from "./limits";
import { SAMPLE, sampleWith } from "./testLimits";

function answerWith(status: number, content: string) {
  return vi.fn<typeof fetch>(() => Promise.resolve(new Response(content, { status })));
}

beforeEach(resetLimits);

afterEach(() => {
  vi.unstubAllGlobals();
});

test("the answer of the server is accepted, with resources that are known or not", () => {
  expect(isServiceLimits(SAMPLE)).toBe(true);
  expect(isServiceLimits(sampleWith({ larger_layer: "coarser" }, { processors: 1.5 }))).toBe(true);
  expect(isServiceLimits(sampleWith({}, { processors: null, memory: null, free_space: null }))).toBe(true);
  // A full disk has no free space, and the answer says so with zero.
  expect(isServiceLimits(sampleWith({}, { free_space: 0 }))).toBe(true);
  // A server may leave no reserve of free space.
  expect(isServiceLimits(sampleWith({ free_space_reserve: 0 }))).toBe(true);
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
  ["the processors are a text", { ...SAMPLE, resources: { ...SAMPLE.resources, processors: "2" } }],
  ["the memory is absent", { ...SAMPLE, resources: { processors: 2, free_space: 18000000000 } }],
  ["the memory is negative", sampleWith({}, { memory: -1 })],
  ["the free space is absent", { ...SAMPLE, resources: { processors: 2, memory: 2147483648 } }],
  ["the free space is negative", sampleWith({}, { free_space: -1 })],
  ["the free space is a text", { ...SAMPLE, resources: { ...SAMPLE.resources, free_space: "18 GB" } }],
  ["a limit is absent", { ...SAMPLE, limits: { ...SAMPLE.limits, job_time: undefined } }],
  ["a limit is zero", sampleWith({ layer_cells: 0 })],
  ["a limit is a text", { ...SAMPLE, limits: { ...SAMPLE.limits, account_layers: "50" } }],
  ["the keeping time is absent", { ...SAMPLE, limits: { ...SAMPLE.limits, keep_time: undefined } }],
  ["the reserve of free space is negative", sampleWith({ free_space_reserve: -1 })],
  ["the reserve of free space is absent", { ...SAMPLE, limits: { ...SAMPLE.limits, free_space_reserve: undefined } }],
  [
    "the limits are those of a session and not of an account",
    {
      ...SAMPLE,
      limits: {
        ...SAMPLE.limits,
        account_layers: undefined,
        account_series: undefined,
        account_size: undefined,
        account_unfinished_jobs: undefined,
        session_layers: 50,
        session_size: 2000000000,
        session_unfinished_jobs: 4,
        session_idle_time: 1209600,
      },
    },
  ],
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

test("an answer is kept for every text that states a limit, and a failure keeps the last answer", async () => {
  expect(limitsStore.get()).toBeNull();
  vi.stubGlobal("fetch", answerWith(200, JSON.stringify(SAMPLE)));
  await loadLimits();
  expect(limitsStore.get()).toEqual(SAMPLE);
  const kept = limitsStore.get();
  // The same answer again leaves the store as it is, so no component is drawn again.
  await readLimits();
  expect(limitsStore.get()).toBe(kept);
  vi.stubGlobal("fetch", answerWith(502, ""));
  await expect(readLimits()).resolves.toBeUndefined();
  expect(limitsStore.get()).toBe(kept);
});

test("two readings at the same time send one request", async () => {
  const request = answerWith(200, JSON.stringify(SAMPLE));
  vi.stubGlobal("fetch", request);
  await Promise.all([readLimits(), readLimits()]);
  expect(request).toHaveBeenCalledTimes(1);
});

function Keeping({ needed }: { needed?: boolean }) {
  const limits = useLimits(needed);
  return <p>{limits === null ? "Not known" : String(limits.limits.keep_time)}</p>;
}

test("a component asks for the limits once while none is known, and not at all when it needs none", async () => {
  const request = answerWith(200, JSON.stringify(SAMPLE));
  vi.stubGlobal("fetch", request);
  const { unmount } = render(<Keeping needed={false} />);
  expect(screen.getByText("Not known")).toBeDefined();
  expect(request).not.toHaveBeenCalled();
  unmount();
  render(<Keeping />);
  expect(await screen.findByText("1209600")).toBeDefined();
  expect(request).toHaveBeenCalledTimes(1);
  // A second component reads the answer that is kept.
  await act(async () => {
    render(<Keeping />);
    await Promise.resolve();
  });
  expect(request).toHaveBeenCalledTimes(1);
});

test("the server names every limit that the interface reads, as docs/Storage.md lists them", () => {
  const server = readFileSync("../api/src/lynkeus/limits.py", "utf8");
  for (const name of [...AMOUNTS, "larger_layer", "free_space_reserve"]) {
    expect(server, name).toMatch(new RegExp(`^ {4}${name}: `, "m"));
  }
  expect(server).toMatch(/^ {4}free_space: /m);
  const document = readFileSync("../docs/Storage.md", "utf8").replace(/\s+/g, " ");
  expect(document).toContain(
    "`limits` names `account_layers`, `account_series`, `account_size` and `account_unfinished_jobs` in the place of the four `session_...` fields, and gains `keep_time` and `free_space_reserve`.",
  );
  expect(document).toContain("`resources` gains `free_space`.");
  expect(document).toContain("Every duration and limit that the interface states is read from `GET /api/limits`.");
});
