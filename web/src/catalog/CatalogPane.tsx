import { jobsStore } from "../data/jobs";
import { layersStore } from "../data/layers";
import { productsStore } from "../data/state";
import { Pane } from "../shared/pane/Pane";
import { useStore } from "../shared/store";
import { JobsSection } from "./JobsSection";
import { LayersSection } from "./LayersSection";
import { ProductsSection } from "./ProductsSection";

/**
 * The Catalog pane, on the right of the map. Its sections stand one under the other, and a section without
 * content is not shown: the products that the last search found, the jobs of the session and the layers of the
 * session. The pane appears with the first search, the first job or the first layer.
 */
export function CatalogPane() {
  const results = useStore(productsStore);
  const session = useStore(jobsStore).length + useStore(layersStore).length > 0;

  if (!results && !session) {
    return null;
  }

  return (
    <Pane id="catalog" title="Catalog">
      <div className={session ? "catalog catalog--session" : "catalog"}>
        {results ? <ProductsSection results={results} /> : null}
        <JobsSection />
        <LayersSection />
      </div>
    </Pane>
  );
}
