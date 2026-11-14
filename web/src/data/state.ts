import { createStore } from "../shared/store";
import type { Product } from "./products";
import type { ProductSearch, SearchDraft } from "./search";

/** The name of the pane of the search, which is also the name of the ribbon button that opens it. */
export const SEARCH_PANE = "search-products";

/** The choices of the search pane, or null before the pane is first opened. They stay when the pane closes. */
export const searchDraftStore = createStore<SearchDraft | null>(null);

/** The shape that the user is drawing on the map as the area of the search, or null. */
export const drawingStore = createStore<"rectangle" | "polygon" | null>(null);

/** The products that a search found, with the search and the number of products that the catalogue holds for it. */
export interface Results {
  search: ProductSearch;
  /** Number of products in the catalogue that match the search. */
  found: number;
  /** The products received so far, in the order of the search. */
  products: readonly Product[];
}

/** The last search with its products, or null before the first search and after the list is cleared. */
export const productsStore = createStore<Results | null>(null);

/** What the search is doing: nothing, asking for the first products of a search, or asking for more of them. */
export const searchingStore = createStore<"no" | "first" | "more">("no");

/** The identifier of the product that is selected, or null. Its outline is drawn strongest on the map. */
export const selectedProductStore = createStore<string | null>(null);

/** The identifier of the product on which the pointer rests, in the list or on the map, or null. */
export const hoveredProductStore = createStore<string | null>(null);

/** Whether the outlines of the products found are drawn on the map. */
export const outlinesStore = createStore(true);

/** Remove the products found from the Catalog pane and from the map. */
export function clearProducts(): void {
  selectedProductStore.set(null);
  hoveredProductStore.set(null);
  productsStore.set(null);
}
