// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { report } from "../shared/messages/messages";
import { setPaneOpen } from "../shared/panes";
import { showOutlines } from "./Footprints";
import { MISSION_START, dayOf } from "./period";
import { formatCount, type Maturity, type Product, type Sort } from "./products";
import { findProducts, type ProductSearch } from "./search";
import {
  hoveredProductStore,
  productsStore,
  searchDraftStore,
  searchingStore,
  selectedProductStore,
  showEveryProduct,
} from "./state";

/** The largest number of products that the list holds. A longer list makes the page slow. */
export const MOST_LISTED = 2000;

let request: AbortController | null = null;

/** Abandon the search that is running, if there is one. */
export function stopSearch(): void {
  request?.abort();
  request = null;
  searchingStore.set("no");
}

function failure(error: unknown): string {
  return error instanceof Error ? error.message : "The search failed.";
}

/** How a search ended: with products, or with none, and the sentence that says so and where the products are listed. */
export interface SearchOutcome {
  state: "success" | "warning";
  text: string;
}

/**
 * Search the catalogue and show the first products found in the Catalog pane and on the map: the outlines are
 * put on the map again if their layer was removed, the layer is shown and no product is hidden. The promise
 * gives the sentence that states the outcome. It is rejected with an error whose message can be shown to the
 * user, and the earlier list and its outlines then stay as they are.
 */
export async function runSearch(search: ProductSearch): Promise<SearchOutcome> {
  stopSearch();
  const controller = new AbortController();
  request = controller;
  searchingStore.set("first");
  try {
    const answer = await findProducts(search, 0, controller.signal);
    selectedProductStore.set(null);
    hoveredProductStore.set(null);
    showEveryProduct();
    showOutlines();
    productsStore.set({ search, found: answer.found, products: answer.products });
    const listed = answer.products.length;
    if (answer.found === 0) {
      return { state: "warning", text: "No product was found for these choices." };
    }
    // The pane of the results comes to the front of its side.
    setPaneOpen("catalog", true);
    if (answer.found > listed) {
      const text = `${formatCount(answer.found)} products were found. The Catalog pane lists the first ${formatCount(listed)} and loads more.`;
      return { state: "success", text };
    }
    return {
      state: "success",
      text:
        listed === 1
          ? "1 product was found. The Catalog pane lists it."
          : `${formatCount(listed)} products were found. The Catalog pane lists them.`,
    };
  } finally {
    if (request === controller) {
      request = null;
      searchingStore.set("no");
    }
  }
}

/** Tell whether the list can receive more products of its search. */
export function canLoadMore(): boolean {
  const results = productsStore.get();
  return results !== null && results.products.length < Math.min(results.found, MOST_LISTED);
}

/** Add the next products of the last search to the list. A failure is reported as a message. */
export async function loadMore(): Promise<void> {
  const results = productsStore.get();
  if (!results || !canLoadMore() || searchingStore.get() !== "no") {
    return;
  }
  const controller = new AbortController();
  request = controller;
  searchingStore.set("more");
  try {
    const answer = await findProducts(results.search, results.products.length, controller.signal);
    // The list may have been cleared or replaced while the server answered.
    if (!controller.signal.aborted && productsStore.get() === results) {
      const known = new Set(results.products.map(({ id }) => id));
      const added = answer.products.filter(({ id }) => !known.has(id));
      productsStore.set({
        ...results,
        found: answer.found,
        products: [...results.products, ...added].slice(0, MOST_LISTED),
      });
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      report("error", failure(error));
    }
  } finally {
    if (request === controller) {
      request = null;
      searchingStore.set("no");
    }
  }
}

/**
 * Run a search that a control of the Catalog pane starts. The pane itself states how many products were found,
 * so only a search that finds nothing and a failure are reported as a message.
 */
function runFromPane(search: ProductSearch): void {
  runSearch(search).then(
    ({ state, text }) => {
      if (state !== "success") {
        report(state, text);
      }
    },
    (error: unknown) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        report("error", failure(error));
      }
    },
  );
}

/** Search again in another order. */
export function sortProducts(sort: Sort): void {
  const results = productsStore.get();
  if (results && results.search.sort !== sort) {
    runFromPane({ ...results.search, sort });
  }
}

/**
 * Return the search of the stack of a product: every product of the same type on the same track and frame and
 * in the same direction, over the whole mission, at the given levels of validation.
 */
export function stackSearch(
  { product, track, frame, direction }: Product,
  maturity: readonly Maturity[],
  today = new Date(),
): ProductSearch {
  return {
    product,
    maturity,
    area: null,
    start: MISSION_START,
    end: dayOf(today),
    season: null,
    pairInside: false,
    track: [track, track],
    frame: [frame, frame],
    orbit: null,
    direction,
    channels: [],
    sideChannels: [],
    bands: [],
    bandwidth: null,
    coverage: null,
    joint: null,
    cycle: null,
    names: [],
    sort: "newest",
  };
}

/**
 * Find the stack of a product at the levels of validation of the list, and put its choices in the search pane so
 * that the pane shows what was searched.
 */
export function findStack(product: Product): void {
  const maturity = productsStore.get()?.search.maturity ?? [product.maturity];
  const search = stackSearch(product, maturity);
  const draft = searchDraftStore.get();
  if (draft) {
    searchDraftStore.set({
      ...draft,
      by: "properties",
      product: product.product,
      maturity,
      limited: false,
      period: "mission",
      start: search.start ?? "",
      end: search.end ?? "",
      season: null,
      pairInside: false,
      track: String(product.track),
      frame: String(product.frame),
      orbit: "",
      cycle: "",
      direction: product.direction,
      channels: [],
      sideChannels: [],
      bands: [],
      bandwidth: "",
      coverage: "",
      joint: "",
    });
  }
  runFromPane(search);
}
