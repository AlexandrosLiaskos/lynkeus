import { useId } from "react";
import { formatDay, formatSize, PRODUCT_NAMES, type Product } from "../data/products";
import { clearProducts, productsStore, selectedProductStore } from "../data/state";
import { Pane } from "../shared/pane/Pane";
import { useStore } from "../shared/store";

/** One product of the list. A click selects it, and a second click ends the selection. */
function ProductItem({ product, selected }: { product: Product; selected: boolean }) {
  const { id, dates, track, frame, direction, channels, size, maturity } = product;
  return (
    <li>
      <button
        type="button"
        className="catalog-item"
        aria-pressed={selected}
        onClick={() => selectedProductStore.set(selected ? null : id)}
      >
        <span className="catalog-item-title">{dates.map(formatDay).join(" and ")}</span>
        <span>
          Track {track}, frame {frame}, {direction}
        </span>
        <span>
          {[channels.join(", "), size === null ? null : formatSize(size), maturity].filter(Boolean).join(" · ")}
        </span>
      </button>
    </li>
  );
}

/**
 * The Catalog pane, on the right of the map. It lists the products that the last search found. The pane appears
 * with the first search.
 */
export function CatalogPane() {
  const found = useStore(productsStore);
  const selected = useStore(selectedProductStore);
  const headingId = useId();

  if (!found) {
    return null;
  }
  const { search, answer } = found;
  const listed = answer.products.length;

  return (
    <Pane id="catalog" title="Catalog">
      <section className="catalog-section" aria-labelledby={headingId}>
        <div className="catalog-heading">
          <h3 id={headingId}>Products found</h3>
          <button type="button" className="usa-button usa-button--unstyled" onClick={clearProducts}>
            Clear
          </button>
        </div>
        <p className="catalog-summary">
          {search.product} ({PRODUCT_NAMES[search.product]}), {formatDay(search.start)} to {formatDay(search.end)}.{" "}
          {answer.found > listed
            ? `The latest ${String(listed)} of ${String(answer.found)} products are listed.`
            : listed === 0
              ? "No product was found."
              : listed === 1
                ? "1 product."
                : `${String(listed)} products.`}
        </p>
        <ul className="catalog-list">
          {answer.products.map((product) => (
            <ProductItem key={product.id} product={product} selected={product.id === selected} />
          ))}
        </ul>
      </section>
    </Pane>
  );
}
