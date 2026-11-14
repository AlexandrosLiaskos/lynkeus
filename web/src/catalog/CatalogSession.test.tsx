import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { jobsStore, resetJobs } from "../data/jobs";
import { layersStore, resetLayers } from "../data/layers";
import { clearProducts, productsStore } from "../data/state";
import { realProduct, testMap } from "../data/testProducts";
import { job, layer, standIn } from "../data/testSession";
import { resetDock } from "../shared/dock/dock";
import { MapContext } from "../shared/map";
import { resetPanes, setPaneOpen } from "../shared/panes";
import { CatalogPane } from "./CatalogPane";

beforeEach(() => {
  resetJobs();
  resetLayers();
  clearProducts();
  resetDock();
  resetPanes();
  setPaneOpen("catalog", true);
  standIn();
});

afterEach(() => {
  resetJobs();
  vi.unstubAllGlobals();
});

function show() {
  render(
    <MapContext value={testMap()}>
      <CatalogPane />
    </MapContext>,
  );
}

const sections = () => screen.queryAllByRole("region").map((section) => section.getAttribute("aria-labelledby"));
const headings = () => screen.queryAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);

test("the pane is not shown without a search result, a job or a layer", () => {
  show();
  expect(screen.queryByRole("complementary")).toBeNull();
});

test("the pane appears with the first job, and holds the section Jobs alone", () => {
  show();
  act(() => jobsStore.set([job()]));
  expect(screen.getByRole("complementary", { name: "Catalog" })).toBeDefined();
  expect(headings()).toEqual(["Jobs"]);
  expect(sections()).toHaveLength(1);
});

test("the pane appears with the first layer, and holds the section Layers alone", () => {
  show();
  act(() => layersStore.set([{ layer: layer(), size: 1000, created: null }]));
  expect(headings()).toEqual(["Layers"]);
});

test("the sections stand in the order of the work: products found, jobs, layers", () => {
  show();
  act(() => {
    productsStore.set({
      search: { sort: "newest", by: "names", names: ["NISAR"], maturity: [] } as never,
      found: 1,
      products: [realProduct()],
    });
    jobsStore.set([job()]);
    layersStore.set([{ layer: layer(), size: 1000, created: null }]);
  });
  expect(headings()).toEqual(["Products found", "Jobs", "Layers"]);
  expect(document.querySelector(".catalog")?.classList.contains("catalog--session")).toBe(true);
});

test("the pane leaves with its last content", () => {
  show();
  act(() => jobsStore.set([job()]));
  act(() => jobsStore.set([]));
  expect(screen.queryByRole("complementary")).toBeNull();
});
