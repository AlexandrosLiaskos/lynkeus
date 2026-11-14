import { productsStore } from "../data/state";
import { Pane } from "../shared/pane/Pane";
import { useStore } from "../shared/store";
import { ProductsSection } from "./ProductsSection";

/**
 * The Catalog pane, on the right of the map. Its sections stand one under the other, and a section without
 * content is not shown. At present it has the section of the products that the last search found, and the
 * pane appears with the first search.
 */
export function CatalogPane() {
  const results = useStore(productsStore);

  if (!results) {
    return null;
  }

  return (
    <Pane id="catalog" title="Catalog">
      <div className="catalog">
        <ProductsSection results={results} />
      </div>
    </Pane>
  );
}
