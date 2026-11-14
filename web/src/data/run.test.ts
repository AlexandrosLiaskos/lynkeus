import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { messagesStore } from "../shared/messages/messages";
import { panesStore, resetPanes, setPaneOpen } from "../shared/panes";
import { canLoadMore, findStack, loadMore, MOST_LISTED, runSearch, sortProducts, stackSearch, stopSearch } from "./run";
import { firstDraft, searchOfDraft, type ProductSearch } from "./search";
import { clearProducts, productsStore, searchDraftStore, searchingStore, selectedProductStore } from "./state";
import { realProduct, serverWith, someProducts } from "./testProducts";

const BOX = { kind: "rectangle", west: "-71.2", south: "42.6", east: "-70.75", north: "42.95" } as const;
const TODAY = new Date("2026-11-14T12:00:00Z");

function search(): ProductSearch {
  const made = searchOfDraft(firstDraft(BOX, TODAY));
  if (typeof made === "string") {
    throw new Error(made);
  }
  return made;
}

function messages(): [string, string][] {
  return messagesStore.get().map(({ kind, text }) => [kind, text]);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: TODAY });
  clearProducts();
  searchDraftStore.set(null);
  messagesStore.set([]);
  resetPanes();
  stopSearch();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("a search fills the list, opens the Catalog pane and states the number found", async () => {
  const { fetch, asked } = serverWith({ found: 2, products: someProducts(2) });
  vi.stubGlobal("fetch", fetch);
  setPaneOpen("catalog", false);
  selectedProductStore.set("old");
  const running = runSearch(search());
  expect(searchingStore.get()).toBe("first");
  expect(await running).toEqual({ state: "success", text: "2 products were found." });
  expect(searchingStore.get()).toBe("no");
  expect(asked).toHaveLength(1);
  expect(productsStore.get()).toMatchObject({ search: search(), found: 2 });
  expect(productsStore.get()?.products.map(({ id }) => id)).toEqual(["G0-ASF", "G1-ASF"]);
  expect(selectedProductStore.get()).toBeNull();
  expect(panesStore.get().catalog.open).toBe(true);
  expect(messages()).toEqual([]);
});

test("a search states one product, no product, and more products than one answer holds", async () => {
  const { fetch } = serverWith(
    { found: 1, products: someProducts(1) },
    { found: 0, products: [] },
    { found: 13172, products: someProducts(200) },
  );
  vi.stubGlobal("fetch", fetch);
  expect(await runSearch(search())).toEqual({ state: "success", text: "1 product was found." });
  setPaneOpen("catalog", false);
  expect(await runSearch(search())).toEqual({ state: "warning", text: "No product was found for these choices." });
  // A search without a product leaves the Catalog pane as it is, and empties the list.
  expect(panesStore.get().catalog.open).toBe(false);
  expect(productsStore.get()?.products).toEqual([]);
  expect(await runSearch(search())).toEqual({
    state: "success",
    text: "13,172 products were found, and the first 200 are listed. The Catalog pane loads more.",
  });
});

test("a failed search keeps the earlier list and gives the words of the server", async () => {
  const { fetch } = serverWith(
    { found: 1, products: someProducts(1) },
    { status: 504, detail: "NASA's catalogue did not answer in time." },
  );
  vi.stubGlobal("fetch", fetch);
  await runSearch(search());
  await expect(runSearch(search())).rejects.toThrow("NASA's catalogue did not answer in time.");
  expect(productsStore.get()?.products).toHaveLength(1);
  expect(searchingStore.get()).toBe("no");
});

test("the list loads the next products of its search and leaves out a product that it already holds", async () => {
  const { fetch, asked } = serverWith(
    { found: 450, products: someProducts(200) },
    { found: 450, products: someProducts(200, 199) },
    { found: 450, products: someProducts(51, 399) },
  );
  vi.stubGlobal("fetch", fetch);
  await runSearch(search());
  expect(canLoadMore()).toBe(true);
  await loadMore();
  expect(asked[1]).toMatch(/&offset=200$/);
  // The second answer repeats the last product of the first.
  expect(productsStore.get()?.products).toHaveLength(399);
  await loadMore();
  expect(asked[2]).toMatch(/&offset=399$/);
  expect(productsStore.get()?.products).toHaveLength(450);
  expect(new Set(productsStore.get()?.products.map(({ id }) => id)).size).toBe(450);
  expect(canLoadMore()).toBe(false);
  await loadMore();
  expect(asked).toHaveLength(3);
});

test("the list stops at the largest number of products that it takes", async () => {
  const { fetch } = serverWith({ found: 50000, products: someProducts(200) });
  vi.stubGlobal("fetch", fetch);
  await runSearch(search());
  const results = productsStore.get();
  if (!results) {
    throw new Error("the search of the test found nothing");
  }
  productsStore.set({ ...results, products: someProducts(MOST_LISTED - 100) });
  vi.stubGlobal("fetch", serverWith({ found: 50000, products: someProducts(200, MOST_LISTED - 100) }).fetch);
  await loadMore();
  expect(productsStore.get()?.products).toHaveLength(MOST_LISTED);
  expect(canLoadMore()).toBe(false);
});

test("a failure to load more products is reported and the list stays", async () => {
  const { fetch } = serverWith(
    { found: 450, products: someProducts(200) },
    { status: 502, detail: "NASA's catalogue did not answer, or its answer could not be read." },
  );
  vi.stubGlobal("fetch", fetch);
  await runSearch(search());
  messagesStore.set([]);
  await loadMore();
  expect(productsStore.get()?.products).toHaveLength(200);
  expect(messages()).toEqual([["error", "NASA's catalogue did not answer, or its answer could not be read."]]);
  expect(searchingStore.get()).toBe("no");
});

test("products that arrive after the list was cleared are not added", async () => {
  const { fetch } = serverWith({ found: 450, products: someProducts(200) });
  vi.stubGlobal("fetch", fetch);
  await runSearch(search());
  const loading = loadMore();
  clearProducts();
  await loading;
  expect(productsStore.get()).toBeNull();
});

test("another order searches again from the first product", async () => {
  const { fetch, asked } = serverWith({ found: 450, products: someProducts(200) });
  vi.stubGlobal("fetch", fetch);
  await runSearch(search());
  sortProducts("newest");
  expect(asked).toHaveLength(1);
  sortProducts("oldest");
  await vi.waitFor(() => expect(productsStore.get()?.search.sort).toBe("oldest"));
  expect(asked[1]).toMatch(/&sort=oldest$/);
  // The pane states the count, so a search that it starts and that finds products leaves no message.
  await vi.waitFor(() => expect(searchingStore.get()).toBe("no"));
  expect(messages()).toEqual([]);
});

test("the stack of a product is every product of its track, frame and direction over the whole mission", () => {
  expect(stackSearch(realProduct(), ["Validated", "Beta"], TODAY)).toMatchObject({
    product: "GCOV",
    maturity: ["Validated", "Beta"],
    area: null,
    start: "2025-10-01",
    end: "2026-11-14",
    track: [141, 141],
    frame: [67, 67],
    direction: "descending",
    channels: [],
    sort: "newest",
  });
});

test("finding the stack searches at the levels of validation of the list and puts the choices in the search pane", async () => {
  const { fetch, asked } = serverWith(
    { found: 2, products: someProducts(2) },
    { found: 11, products: someProducts(11) },
  );
  vi.stubGlobal("fetch", fetch);
  await runSearch({ ...search(), maturity: ["Provisional", "Beta"] });
  searchDraftStore.set({ ...firstDraft(BOX, TODAY), channels: ["HH"], cycle: "33" });
  findStack(realProduct());
  await vi.waitFor(() => expect(productsStore.get()?.found).toBe(11));
  expect(decodeURIComponent(asked[1] ?? "")).toBe(
    "/api/products?product=GCOV&maturity=Provisional&maturity=Beta&start=2025-10-01&end=2026-11-14&track=141&frame=67&direction=descending",
  );
  expect(searchDraftStore.get()).toMatchObject({
    product: "GCOV",
    maturity: ["Provisional", "Beta"],
    limited: false,
    period: "mission",
    start: "2025-10-01",
    end: "2026-11-14",
    track: "141",
    frame: "67",
    direction: "descending",
    channels: [],
    cycle: "",
  });
});

test("without a list the stack is searched at the level of validation of the product", async () => {
  const { fetch, asked } = serverWith({ found: 11, products: someProducts(11) });
  vi.stubGlobal("fetch", fetch);
  findStack(realProduct());
  await vi.waitFor(() => expect(productsStore.get()?.found).toBe(11));
  expect(asked[0]).toMatch(/^\/api\/products\?product=GCOV&maturity=Validated&start=/);
});

test("a search from the Catalog pane that finds nothing is reported as a message", async () => {
  vi.stubGlobal("fetch", serverWith({ found: 0, products: [] }).fetch);
  findStack(realProduct());
  await vi.waitFor(() => expect(messages()).toEqual([["warning", "No product was found for these choices."]]));
});

test("a failed search from the Catalog pane is reported as a message", async () => {
  vi.stubGlobal("fetch", serverWith({ status: 504, detail: "NASA's catalogue did not answer in time." }).fetch);
  findStack(realProduct());
  await vi.waitFor(() => expect(messages()).toEqual([["error", "NASA's catalogue did not answer in time."]]));
});
