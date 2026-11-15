import { useState } from "react";
import { SEARCH_PANE, selectedProductStore, type Results } from "../data/state";
import { openToolPane } from "../shared/dock/dock";
import { Section } from "../shared/section/Section";
import { useStore } from "../shared/store";
import type { Grouping } from "./groups";
import { ProductDetails } from "./ProductDetails";
import { ProductList } from "./ProductList";
import { SECTIONS } from "./state";

/** The explanation of the section. It shows from the "i" beside its title. */
export const ABOUT_PRODUCTS =
  "The products that the last search found in NASA's catalogue. A product is selected with a click, in this list or on its outline on the map. The selected product shows the commands that get a layer from it, show its details and zoom to it.";

/**
 * The section "Products" of the Catalog pane. It shows the list of the products found or, in its place, the
 * details of the selected product. The details close when the selection ends or passes to another product, in
 * the pane or on the map. Before the first search the section says how it fills.
 */
export function ProductsSection({ results }: { results: Results | null }) {
  const selected = useStore(selectedProductStore);
  const [grouping, setGrouping] = useState<Grouping>("none");
  // The product whose details are shown, and whether the list has returned from the details of a product.
  const [detailed, setDetailed] = useState<string | null>(null);
  const [returned, setReturned] = useState(false);

  // The details belong to the selection: they are forgotten when it ends or passes to another product.
  if (detailed !== null && detailed !== selected) {
    setDetailed(null);
  }

  if (!results) {
    return (
      <Section id={SECTIONS.products} title="Products" info={ABOUT_PRODUCTS}>
        <p className="catalog-note">
          Products are listed after a search.{" "}
          <button type="button" className="usa-button usa-button--unstyled" onClick={() => openToolPane(SEARCH_PANE)}>
            Search products
          </button>
        </p>
      </Section>
    );
  }

  const product = results.products.find(({ id }) => id === selected && id === detailed);

  return (
    <Section id={SECTIONS.products} title="Products" count={results.products.length} info={ABOUT_PRODUCTS}>
      {product ? (
        <ProductDetails
          product={product}
          onBack={() => {
            setDetailed(null);
            setReturned(true);
          }}
        />
      ) : (
        <ProductList
          results={results}
          grouping={grouping}
          onGrouping={setGrouping}
          onDetails={(id) => {
            setDetailed(id);
            setReturned(false);
          }}
          // The list that returns from the details takes the focus on its selected product, once.
          focusSelected={returned}
        />
      )}
    </Section>
  );
}
