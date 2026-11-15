// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { afterEach, expect, test, vi } from "vitest";
// What the server reads from the record of a real product file. The tests of the server check the same files,
// so the interface and the server cannot drift apart.
import detail from "../../../api/tests/data/detail-gcov.json";
import product from "../../../api/tests/data/product-gcov.json";
import {
  ask,
  browseAddress,
  findProduct,
  formatCount,
  formatDay,
  formatMoment,
  formatSize,
  isProduct,
  isProductDetail,
  isProductsFound,
  pairDays,
} from "./products";

function answerWith(status: number, body: unknown): typeof fetch {
  return vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("the product that the server sends for a real record is accepted", () => {
  expect(isProduct(product)).toBe(true);
  expect(product.layers[0]).toEqual({ name: "HHHH", title: "Backscatter HH", spacing: 10 });
  expect(product.layers).toHaveLength(5);
  expect(isProductsFound({ found: 1, products: [product] })).toBe(true);
});

test.each([
  ["the identifier is empty", { id: "" }],
  ["the product type is unknown", { product: "RSLC" }],
  ["the maturity is unknown", { maturity: "Final" }],
  ["there are three dates", { dates: ["2026-10-09", "2026-10-21", "2026-11-02"] }],
  ["a date is not year-month-day", { dates: ["21 Oct 2026"] }],
  ["the start is not a moment", { start: "2026-10-21" }],
  ["the track is not a whole number", { track: 141.5 }],
  ["the direction is unknown", { direction: "DESCENDING" }],
  ["the cycle is text", { cycle: "33" }],
  ["the channels are not a list", { channels: "HH" }],
  ["the coverage is unknown", { coverage: "half" }],
  ["the joint observation is text", { joint: "TRUE" }],
  ["the size is negative", { size: -1 }],
  ["a point of the outline has one number", { footprint: [[[1]]] }],
  ["the layers are missing", { layers: undefined }],
  ["a layer has no title", { layers: [{ name: "HHHH", spacing: 10 }] }],
  ["the cell size of a layer is zero", { layers: [{ name: "HHHH", title: "Backscatter HH", spacing: 0 }] }],
])("a product is rejected when %s", (_reason, change) => {
  expect(isProduct({ ...product, ...change })).toBe(false);
});

test("a product of a beta collection, and one whose record leaves fields out, are accepted", () => {
  expect(isProduct({ ...product, maturity: "Beta", layers: [] })).toBe(true);
  const bare = { cycle: null, orbit: null, bandwidth: null, side_bandwidth: null, coverage: null, joint: null };
  expect(isProduct({ ...product, ...bare, version: null, size: null, channels: [], bands: [] })).toBe(true);
});

test("the details that the server sends for a real record are accepted", () => {
  expect(isProductDetail(detail)).toBe(true);
  expect(isProductDetail({ ...detail, thumbnail: "yes" })).toBe(false);
  expect(isProductDetail({ ...detail, files: [{ name: "a", kind: "other", url: "b" }] })).toBe(false);
  expect(isProductDetail({ ...detail, attributes: [{ name: "", values: [] }] })).toBe(false);
  expect(isProductDetail({ ...detail, product: { ...product, id: "" } })).toBe(false);
  expect(isProductDetail(null)).toBe(false);
});

test("the details of one product are asked from the server by its identifier", async () => {
  const fetch = answerWith(200, detail);
  vi.stubGlobal("fetch", fetch);
  const answer = await findProduct("G4405194348-ASF");
  expect(answer.files).toHaveLength(23);
  expect(fetch).toHaveBeenCalledWith(
    "/api/products/G4405194348-ASF",
    expect.objectContaining({ headers: { Accept: "application/json" } }),
  );
  expect(browseAddress("G4405194348-ASF")).toBe("/api/products/G4405194348-ASF/browse");
});

test("a refusal of the server is reported with its words", async () => {
  vi.stubGlobal(
    "fetch",
    answerWith(502, { detail: "NASA's catalogue did not answer, or its answer could not be read." }),
  );
  await expect(ask("/api/products", isProductsFound)).rejects.toThrow(
    "NASA's catalogue did not answer, or its answer could not be read.",
  );
});

test("a refusal without words is reported with its number", async () => {
  vi.stubGlobal("fetch", answerWith(500, "Internal Server Error"));
  await expect(ask("/api/products", isProductsFound)).rejects.toThrow("The search failed (the server answered 500).");
});

test("an answer of another form is refused", async () => {
  vi.stubGlobal("fetch", answerWith(200, { found: 1, products: [{ id: "x" }] }));
  await expect(ask("/api/products", isProductsFound)).rejects.toThrow("could not be read");
});

test("a server that cannot be reached is reported in plain words", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
  );
  await expect(ask("/api/products", isProductsFound)).rejects.toThrow("The server of Lynkeus did not answer.");
});

test("a request that the page abandons is not reported as a failure of the server", async () => {
  const controller = new AbortController();
  controller.abort();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new DOMException("Aborted", "AbortError"))),
  );
  await expect(ask("/api/products", isProductsFound, controller.signal)).rejects.toThrow("Aborted");
});

test("the days between the two dates of a pair are counted", () => {
  if (!isProduct(product)) {
    throw new Error("the product of the test is not valid");
  }
  expect(pairDays(product)).toBeNull();
  expect(pairDays({ ...product, dates: ["2026-10-09", "2026-10-21"] })).toBe(12);
  expect(pairDays({ ...product, dates: ["2026-07-17", "2026-08-10"] })).toBe(24);
});

test("a day, a moment, a size and a count are written for reading", () => {
  expect(formatDay("2026-10-21")).toBe("21 Oct 2026");
  expect(formatDay("2026-01-05")).toBe("5 Jan 2026");
  expect(formatDay("2026-09-27")).toBe("27 Sep 2026");
  expect(formatMoment("2026-10-21T23:43:30Z")).toBe("21 Oct 2026, 23:43:30 UTC");
  expect(formatMoment("2026-11-08T02:47:46.417000Z")).toBe("8 Nov 2026, 02:47:46 UTC");
  expect(formatMoment("2026-09-27T23:43:30Z")).toBe("27 Sep 2026, 23:43:30 UTC");
  expect(formatSize(5758779392)).toBe("5.8 GB");
  expect(formatSize(96468992)).toBe("96 MB");
  expect(formatSize(113240)).toBe("113 kB");
  expect(formatSize(12)).toBe("1 kB");
  expect(formatCount(13172)).toBe("13,172");
  expect(formatCount(12)).toBe("12");
});
