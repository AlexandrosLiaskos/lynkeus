import { createStore } from "../shared/store";
import type { ProductSearch, ProductsFound } from "./products";

/** Whether the dialog of the search is open. */
export const searchDialogStore = createStore(false);

/** The last search with its answer, or null before the first search and after the list is cleared. */
export const productsStore = createStore<{ search: ProductSearch; answer: ProductsFound } | null>(null);

/** The identifier of the product that is selected in the list, or null. Its outline is drawn stronger on the map. */
export const selectedProductStore = createStore<string | null>(null);

/** Remove the products found from the Catalog pane and from the map. */
export function clearProducts(): void {
  selectedProductStore.set(null);
  productsStore.set(null);
}
