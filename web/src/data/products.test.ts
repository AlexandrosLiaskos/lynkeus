import { afterEach, expect, test, vi } from "vitest";
// The product that the server reads from the record of a real product file. The tests of the server check the
// same file, so the interface and the server cannot drift apart.
import product from "../../../api/tests/data/product-gcov.json";
import {
  findProducts,
  formatDay,
  formatSize,
  isProduct,
  isProductsFound,
  searchAddress,
  searchFault,
  type ProductSearch,
} from "./products";

const SEARCH: ProductSearch = {
  product: "GCOV",
  area: { west: -71.2, south: 42.6, east: -70.75, north: 42.95 },
  start: "2026-10-01",
  end: "2026-11-14",
};

function answerWith(status: number, body: unknown): typeof fetch {
  return vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("the product that the server sends for a real record is accepted", () => {
  expect(isProduct(product)).toBe(true);
  expect(isProductsFound({ found: 1, products: [product] })).toBe(true);
});

test.each([
  ["the identifier is empty", { id: "" }],
  ["the product type is unknown", { product: "RSLC" }],
  ["the maturity is unknown", { maturity: "Beta" }],
  ["there are three dates", { dates: ["2026-10-09", "2026-10-21", "2026-11-02"] }],
  ["a date is not year-month-day", { dates: ["21 Oct 2026"] }],
  ["the track is not a whole number", { track: 141.5 }],
  ["the direction is unknown", { direction: "DESCENDING" }],
  ["the size is negative", { size: -1 }],
  ["a point of the outline has one number", { footprint: [[[1]]] }],
])("a product is rejected when %s", (_reason, change) => {
  expect(isProduct({ ...product, ...change })).toBe(false);
});

test("a product without a stated size is accepted", () => {
  expect(isProduct({ ...product, size: null })).toBe(true);
});

test("the choices of a search are checked before they are sent", () => {
  expect(searchFault(SEARCH)).toBeNull();
  expect(searchFault({ ...SEARCH, area: { ...SEARCH.area, west: Number.NaN } })).toMatch(/as numbers/);
  expect(searchFault({ ...SEARCH, area: { ...SEARCH.area, west: -70 } })).toMatch(/not valid/);
  expect(searchFault({ ...SEARCH, area: { ...SEARCH.area, north: 91 } })).toMatch(/not valid/);
  expect(searchFault({ ...SEARCH, end: "" })).toMatch(/first and the last day/);
  expect(searchFault({ ...SEARCH, start: "2026-11-15" })).toMatch(/after the last/);
});

test("the address of a search carries every choice", () => {
  expect(searchAddress(SEARCH)).toBe(
    "/api/products?product=GCOV&west=-71.2&south=42.6&east=-70.75&north=42.95&start=2026-10-01&end=2026-11-14",
  );
});

test("the products of the server are returned", async () => {
  const fetch = answerWith(200, { found: 1, products: [product] });
  vi.stubGlobal("fetch", fetch);
  const answer = await findProducts(SEARCH);
  expect(answer.found).toBe(1);
  expect(answer.products[0]?.id).toBe("G4405194348-ASF");
  expect(fetch).toHaveBeenCalledWith(
    searchAddress(SEARCH),
    expect.objectContaining({ headers: { Accept: "application/json" } }),
  );
});

test("a refusal of the server is reported with its words", async () => {
  vi.stubGlobal(
    "fetch",
    answerWith(502, { detail: "NASA's catalogue did not answer, or its answer could not be read." }),
  );
  await expect(findProducts(SEARCH)).rejects.toThrow(
    "NASA's catalogue did not answer, or its answer could not be read.",
  );
});

test("a refusal without words is reported with its number", async () => {
  vi.stubGlobal("fetch", answerWith(500, "Internal Server Error"));
  await expect(findProducts(SEARCH)).rejects.toThrow("The search failed (the server answered 500).");
});

test("an answer that is not a list of products is refused", async () => {
  vi.stubGlobal("fetch", answerWith(200, { found: 1, products: [{ id: "x" }] }));
  await expect(findProducts(SEARCH)).rejects.toThrow("could not be read");
});

test("a server that cannot be reached is reported in plain words", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
  );
  await expect(findProducts(SEARCH)).rejects.toThrow("The server of Lynkeus did not answer.");
});

test("a day and a size are written for reading", () => {
  expect(formatDay("2026-10-21")).toBe("21 Oct 2026");
  expect(formatDay("2026-01-05")).toBe("5 Jan 2026");
  expect(formatSize(5758779392)).toBe("5.8 GB");
  expect(formatSize(96468992)).toBe("96 MB");
});
