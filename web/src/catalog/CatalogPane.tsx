import { jobsFaultStore, jobsStore } from "../data/jobs";
import { layersFaultStore, layersStore } from "../data/layers";
import { productsStore, SEARCH_PANE } from "../data/state";
import { openToolPane } from "../shared/dock/dock";
import { EmptyState } from "../shared/empty/EmptyState";
import { Pane } from "../shared/pane/Pane";
import { useStore } from "../shared/store";
import { JobsSection } from "./JobsSection";
import { LayersSection } from "./LayersSection";
import { ProductsSection } from "./ProductsSection";

/**
 * The Catalog pane, on the right of the map. Before the first search, the first job and the first layer it
 * states what is missing and leads to the search. Afterwards it holds three sections, in the order of the work:
 * the products that the last search found, the jobs of the session and the layers of the session. The pane has
 * one body that scrolls, and the header of a section stays in view while the pane scrolls over the section.
 */
export function CatalogPane() {
  const results = useStore(productsStore);
  const jobs = useStore(jobsStore).length;
  const layers = useStore(layersStore).length;
  const jobsFault = useStore(jobsFaultStore);
  const layersFault = useStore(layersFaultStore);
  const empty = results === null && jobs === 0 && layers === 0 && jobsFault === null && layersFault === null;

  return (
    <Pane id="catalog" title="Catalog">
      {empty ? (
        <EmptyState
          title="No products yet"
          text="Search NASA's catalogue to list the products of an area and to get layers from them."
          action={{ label: "Search products", onClick: () => openToolPane(SEARCH_PANE) }}
        />
      ) : (
        <div className="catalog">
          <ProductsSection results={results} />
          <JobsSection />
          <LayersSection />
        </div>
      )}
    </Pane>
  );
}
