import { useEffect, useId, useRef, useState } from "react";
import { exportName, productsCsv, productsGeoJson, saveFile } from "../data/export";
import { zoomToProducts } from "../data/Footprints";
import { formatCount, formatDay, formatSize, pairDays, SORTS, type Product, type Sort } from "../data/products";
import { canLoadMore, loadMore, MOST_LISTED, sortProducts } from "../data/run";
import { describeSearch, PAGE } from "../data/search";
import {
  clearProducts,
  hoveredProductStore,
  outlinesStore,
  searchingStore,
  selectedProductStore,
  type Results,
} from "../data/state";
import { useMap } from "../shared/map";
import { useStore } from "../shared/store";
import { GROUPINGS, groupProducts, type Grouping } from "./groups";
import { ProductDetails } from "./ProductDetails";

interface ProductItemProps {
  product: Product;
  selected: boolean;
  hovered: boolean;
}

/**
 * One product of the list. A click selects it, and a second click ends the selection. While the pointer or the
 * keyboard focus rests on it, its outline is drawn stronger on the map.
 */
function ProductItem({ product, selected, hovered }: ProductItemProps) {
  const { id, dates, track, frame, direction, channels, side_channels, size, maturity } = product;
  const item = useRef<HTMLButtonElement>(null);
  const days = pairDays(product);

  // A product that was selected on the map is brought into the visible part of the list.
  useEffect(() => {
    if (selected) {
      item.current?.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

  const rest = (resting: boolean) => {
    if (resting) {
      hoveredProductStore.set(id);
    } else if (hoveredProductStore.get() === id) {
      hoveredProductStore.set(null);
    }
  };

  return (
    <li>
      <button
        ref={item}
        type="button"
        className={hovered ? "catalog-item catalog-item--hovered" : "catalog-item"}
        aria-pressed={selected}
        onClick={() => selectedProductStore.set(selected ? null : id)}
        onPointerEnter={() => rest(true)}
        onPointerLeave={() => rest(false)}
        onFocus={() => rest(true)}
        onBlur={() => rest(false)}
      >
        <span className="catalog-item-title">
          {dates.map(formatDay).join(" and ")}
          {days === null ? null : <span className="catalog-item-days"> ({days} days)</span>}
        </span>
        <span>
          Track {track}, frame {frame}, {direction}
        </span>
        <span>
          {[
            channels.length > 0
              ? channels.join(", ")
              : side_channels.length > 0
                ? `B: ${side_channels.join(", ")}`
                : null,
            size === null ? null : formatSize(size),
            maturity,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </button>
    </li>
  );
}

/** State how many of the products found are listed. */
export function countSentence(listed: number, found: number): string {
  if (found > listed) {
    return `${formatCount(listed)} of ${formatCount(found)} products are listed.`;
  }
  return listed === 0 ? "No product was found." : listed === 1 ? "1 product." : `${formatCount(listed)} products.`;
}

/**
 * The section "Products found" of the Catalog pane: what was searched, the tools of the list, the products
 * and, under them, the details of the selected product.
 */
export function ProductsSection({ results }: { results: Results }) {
  const map = useMap();
  const id = useId();
  const selected = useStore(selectedProductStore);
  const hovered = useStore(hoveredProductStore);
  const outlines = useStore(outlinesStore);
  const searching = useStore(searchingStore);
  const [grouping, setGrouping] = useState<Grouping>("none");
  const { search, found, products } = results;
  const listed = products.length;
  const selectedProduct = products.find((product) => product.id === selected);
  const more = canLoadMore();

  const save = (ending: "csv" | "geojson") => {
    if (ending === "csv") {
      saveFile(exportName(products, ending), "text/csv", productsCsv(products));
    } else {
      saveFile(exportName(products, ending), "application/geo+json", productsGeoJson(products));
    }
  };

  return (
    <>
      <section className="catalog-section catalog-products" aria-labelledby={`${id}-heading`}>
        <div className="catalog-heading">
          <h3 id={`${id}-heading`}>Products found</h3>
          <button type="button" className="usa-button usa-button--unstyled" onClick={clearProducts}>
            Clear
          </button>
        </div>
        <p className="catalog-summary">
          {describeSearch(search).join(" ")} <strong>{countSentence(listed, found)}</strong>
        </p>

        <div className="catalog-choices">
          <label className="usa-label" htmlFor={`${id}-sort`}>
            Sort by
          </label>
          <select
            className="usa-select"
            id={`${id}-sort`}
            value={search.sort}
            disabled={searching !== "no"}
            onChange={(event) => sortProducts(event.target.value as Sort)}
          >
            {Object.entries(SORTS).map(([sort, label]) => (
              <option key={sort} value={sort}>
                {label}
              </option>
            ))}
          </select>
          <label className="usa-label" htmlFor={`${id}-group`}>
            Group by
          </label>
          <select
            className="usa-select"
            id={`${id}-group`}
            value={grouping}
            onChange={(event) => setGrouping(event.target.value as Grouping)}
          >
            {Object.entries(GROUPINGS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="catalog-tools" role="group" aria-label="Tools of the list">
          <button
            type="button"
            className="usa-button usa-button--unstyled"
            disabled={listed === 0}
            onClick={() => zoomToProducts(map)}
          >
            Zoom to all
          </button>
          <button
            type="button"
            className="usa-button usa-button--unstyled"
            disabled={listed === 0}
            onClick={() => save("csv")}
          >
            Save as CSV
          </button>
          <button
            type="button"
            className="usa-button usa-button--unstyled"
            disabled={listed === 0}
            onClick={() => save("geojson")}
          >
            Save as GeoJSON
          </button>
        </div>
        <div className="usa-checkbox catalog-outlines">
          <input
            className="usa-checkbox__input"
            type="checkbox"
            id={`${id}-outlines`}
            checked={outlines}
            onChange={(event) => outlinesStore.set(event.target.checked)}
          />
          <label className="usa-checkbox__label" htmlFor={`${id}-outlines`}>
            Outlines on the map
          </label>
        </div>

        <div className="catalog-scroll">
          {groupProducts(products, grouping).map(({ title, products: members }) => (
            <div key={title} className="catalog-group">
              {title === "" ? null : (
                <h4>
                  {title} <span className="catalog-group-count">({members.length})</span>
                </h4>
              )}
              <ul className="catalog-list">
                {members.map((product) => (
                  <ProductItem
                    key={product.id}
                    product={product}
                    selected={product.id === selected}
                    hovered={product.id === hovered}
                  />
                ))}
              </ul>
            </div>
          ))}
          {more ? (
            <p className="catalog-more-row">
              <button
                type="button"
                className="usa-button usa-button--outline"
                disabled={searching !== "no"}
                onClick={() => void loadMore()}
              >
                {searching === "more"
                  ? "Loading"
                  : `Load ${formatCount(Math.min(PAGE, found - listed, MOST_LISTED - listed))} more`}
              </button>
            </p>
          ) : found > listed ? (
            <p className="catalog-more-row">
              The list holds {formatCount(listed)} products, which is the most that it takes. Narrow the search to see
              the others.
            </p>
          ) : null}
        </div>
      </section>
      {selectedProduct ? <ProductDetails product={selectedProduct} /> : null}
    </>
  );
}
