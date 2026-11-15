import { useEffect, useId, useRef } from "react";
import { exportName, productsCsv, productsGeoJson, saveFile } from "../data/export";
import { showOutlines, zoomToProducts } from "../data/Footprints";
import { PRODUCTS_LAYER_ID } from "../data/footprints";
import { formatCount, formatDay, formatSize, pairDays, SORTS, type Product, type Sort } from "../data/products";
import { canLoadMore, loadMore, MOST_LISTED, sortProducts } from "../data/run";
import { describeSearch, PAGE, type ProductSearch } from "../data/search";
import {
  clearProducts,
  GET_LAYER_PANE,
  hoveredProductStore,
  outlinesStore,
  SEARCH_PANE,
  searchingStore,
  selectedProductStore,
  type Results,
} from "../data/state";
import { openToolPane } from "../shared/dock/dock";
import { EmptyState } from "../shared/empty/EmptyState";
import { Info } from "../shared/info/Info";
import { useMap } from "../shared/map";
import { MenuButton } from "../shared/menu/MenuButton";
import { FIRST_SHAPE_DISPLAY, setShapeDisplay, shapeDisplayStore } from "../shared/shapeLayers";
import { useStore } from "../shared/store";
import { IconButton } from "../shared/toolbar/IconButton";
import { Toolbar } from "../shared/toolbar/Toolbar";
import { GROUPINGS, groupProducts, type Grouping } from "./groups";
import { keepFocus, SECTIONS, titleOf } from "./state";

/** The orders of the list in the few words that the button of the order shows. */
const SORT_WORDS: Record<Sort, string> = {
  newest: "latest first",
  oldest: "earliest first",
  name: "product name",
  largest: "largest first",
  smallest: "smallest first",
  recorded: "latest record first",
};

/** Name a search in a few words: the product type, the period and the kind of area, or the number of names. */
export function searchWords(search: ProductSearch): string {
  if (search.names.length > 0) {
    return search.names.length === 1 ? "1 product name" : `${String(search.names.length)} product names`;
  }
  const { area } = search;
  return [
    search.product ?? "Every type",
    search.start && search.end ? `${formatDay(search.start)} to ${formatDay(search.end)}` : "every date",
    !area
      ? "whole Earth"
      : area.kind === "rectangle"
        ? "rectangle"
        : area.rings.length === 1
          ? "polygon"
          : `${String(area.rings.length)} polygons`,
  ].join(" · ");
}

/** State how many of the products found are listed. */
export function countSentence(listed: number, found: number): string {
  if (found > listed) {
    return `${formatCount(listed)} of ${formatCount(found)} products are listed.`;
  }
  return listed === 0 ? "No product was found." : listed === 1 ? "1 product." : `${formatCount(listed)} products.`;
}

interface ProductItemProps {
  product: Product;
  selected: boolean;
  hovered: boolean;
  onDetails: () => void;
}

/**
 * One product of the list: its date, its orbit, and its channels, size and level of validation. A click selects
 * it, and a second click ends the selection. The selected product shows its commands. While the pointer or the
 * keyboard focus rests on the product, its outline is drawn stronger on the map.
 */
function ProductItem({ product, selected, hovered, onDetails }: ProductItemProps) {
  const map = useMap();
  const { id, dates, track, frame, direction, channels, side_channels, size, maturity } = product;
  const item = useRef<HTMLLIElement>(null);
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
    <li
      ref={item}
      className={["item", "catalog-product", selected && "item--selected", hovered && "catalog-product--hovered"]
        .filter(Boolean)
        .join(" ")}
      onPointerEnter={() => rest(true)}
      onPointerLeave={() => rest(false)}
      onFocus={() => rest(true)}
      onBlur={() => rest(false)}
    >
      <div className="item-main">
        <button
          type="button"
          className="catalog-pick"
          aria-pressed={selected}
          onClick={() => selectedProductStore.set(selected ? null : id)}
        >
          <span className="item-title">
            {dates.map(formatDay).join(" and ")}
            {days === null ? null : <span className="catalog-days"> ({days} days)</span>}
          </span>
          <span className="item-line">
            Track {track}, frame {frame}, {direction}
          </span>
          <span className="item-line">
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
        {selected ? (
          <div className="catalog-commands" role="group" aria-label="Commands of the product">
            <button type="button" className="usa-button" onClick={() => openToolPane(GET_LAYER_PANE)}>
              Get layer
            </button>
            <button type="button" className="usa-button usa-button--unstyled" onClick={onDetails}>
              Details
            </button>
            <button type="button" className="usa-button usa-button--unstyled" onClick={() => zoomToProducts(map, id)}>
              Zoom to
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

interface ProductListProps {
  results: Results;
  grouping: Grouping;
  onGrouping: (grouping: Grouping) => void;
  /** Called with the identifier of the product whose details are asked for. */
  onDetails: (id: string) => void;
  /** Whether the list gives the keyboard focus to its selected product when it appears. */
  focusSelected: boolean;
}

/**
 * The list of the products found: one line that names the search, the toolbar of the list, the products in
 * their groups and, at the foot, the button that loads more products. The full statement of the search stands
 * behind the "i" beside its line. The button "Outlines on the map" is pressed while the layer of the outlines
 * is on the map and shown: a press hides the layer, and another press shows it, after putting the outlines
 * back on the map when the layer was removed in the Contents pane.
 */
export function ProductList({ results, grouping, onGrouping, onDetails, focusSelected }: ProductListProps) {
  const map = useMap();
  const id = useId();
  const list = useRef<HTMLDivElement>(null);
  const selected = useStore(selectedProductStore);
  const hovered = useStore(hoveredProductStore);
  const onMap = useStore(outlinesStore);
  const shown = (useStore(shapeDisplayStore)[PRODUCTS_LAYER_ID] ?? FIRST_SHAPE_DISPLAY).visible;
  const outlines = onMap && shown;
  const searching = useStore(searchingStore);
  const { search, found, products } = results;
  const listed = products.length;
  const none = listed === 0;
  const idle = searching === "no";

  // The keyboard focus returns to the product whose details were shown.
  useEffect(() => {
    if (focusSelected) {
      list.current?.querySelector<HTMLElement>('.catalog-pick[aria-pressed="true"]')?.focus();
    }
  }, [focusSelected]);

  const save = (ending: "csv" | "geojson") => {
    if (ending === "csv") {
      saveFile(exportName(products, ending), "text/csv", productsCsv(products));
    } else {
      saveFile(exportName(products, ending), "application/geo+json", productsGeoJson(products));
    }
  };

  const clear = () => {
    clearProducts();
    keepFocus(() => titleOf(SECTIONS.products));
  };

  return (
    <>
      <div className="catalog-search">
        <p className="catalog-search-words">{searchWords(search)}</p>
        <Info id={`${id}-search`} about="the search">
          {describeSearch(search).join(" ")}
        </Info>
        <button type="button" className="usa-button usa-button--unstyled" onClick={() => openToolPane(SEARCH_PANE)}>
          Edit search
        </button>
      </div>

      <div className="catalog-toolbar">
        <Toolbar label="Commands of the list of products">
          <MenuButton
            label={`Sort: ${SORT_WORDS[search.sort]}`}
            items={Object.entries(SORTS).map(([sort, label]) => ({
              label,
              checked: sort === search.sort,
              disabled: !idle,
              onSelect: () => sortProducts(sort as Sort),
            }))}
          />
          <MenuButton
            icon="folder"
            label="Group by"
            items={Object.entries(GROUPINGS).map(([value, label]) => ({
              label,
              checked: value === grouping,
              onSelect: () => onGrouping(value as Grouping),
            }))}
          />
          <IconButton
            icon="zoom_out_map"
            label="Zoom to all"
            disabled={none}
            reason="The list holds no product."
            onClick={() => zoomToProducts(map)}
          />
          <IconButton
            icon="visibility"
            label="Outlines on the map"
            pressed={outlines}
            onClick={() => (outlines ? setShapeDisplay(PRODUCTS_LAYER_ID, { visible: false }) : showOutlines())}
          />
          <MenuButton
            icon="file_download"
            label="Save as"
            items={[
              { label: "CSV", disabled: none, onSelect: () => save("csv") },
              { label: "GeoJSON", disabled: none, onSelect: () => save("geojson") },
            ]}
          />
          <IconButton icon="highlight_off" label="Clear the list" onClick={clear} />
        </Toolbar>
      </div>

      {none ? (
        <EmptyState
          title="No products found"
          text="Edit the search, for example with a longer period or a larger area, and run it again."
        />
      ) : (
        <div ref={list}>
          {groupProducts(products, grouping).map(({ title, products: members }) => (
            <div key={title} className="catalog-group">
              {title === "" ? null : (
                <h4 className="catalog-group-title pane-bleed">
                  {title} <span className="catalog-group-count">({members.length})</span>
                </h4>
              )}
              <ul className="item-list item-list--selectable pane-bleed">
                {members.map((product) => (
                  <ProductItem
                    key={product.id}
                    product={product}
                    selected={product.id === selected}
                    hovered={product.id === hovered}
                    onDetails={() => onDetails(product.id)}
                  />
                ))}
              </ul>
            </div>
          ))}
          {canLoadMore() ? (
            <div className="catalog-foot">
              <p className="catalog-note">{countSentence(listed, found)}</p>
              <button
                type="button"
                className="usa-button usa-button--outline"
                aria-disabled={idle ? undefined : true}
                onClick={() => void loadMore()}
              >
                {searching === "more"
                  ? "Loading"
                  : `Load ${formatCount(Math.min(PAGE, found - listed, MOST_LISTED - listed))} more`}
              </button>
            </div>
          ) : found > listed ? (
            <p className="catalog-note catalog-foot">
              The list holds {formatCount(listed)} products, which is the most that it takes. Narrow the search to see
              the others.
            </p>
          ) : null}
        </div>
      )}
    </>
  );
}
