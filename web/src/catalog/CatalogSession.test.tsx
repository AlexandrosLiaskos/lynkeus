// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { jobsStore, resetJobs } from "../data/jobs";
import { layersStore, resetLayers } from "../data/layers";
import { resetSeries, seriesStore } from "../data/series";
import { clearProducts, productsStore, SEARCH_PANE } from "../data/state";
import { realProduct, testMap } from "../data/testProducts";
import { seriesItem } from "../data/testSeries";
import { job, layer, standIn } from "../data/testSession";
import { dockStore, resetDock } from "../shared/dock/dock";
import { MapContext } from "../shared/map";
import { resetPanes, setPaneOpen } from "../shared/panes";
import { CatalogPane } from "./CatalogPane";
import { layersOpenStore, markedLayerStore } from "./state";

beforeEach(() => {
  resetJobs();
  resetLayers();
  resetSeries();
  clearProducts();
  resetDock();
  resetPanes();
  setPaneOpen("catalog", true);
  markedLayerStore.set(null);
  layersOpenStore.set(true);
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

const headings = () => screen.queryAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);

test("without a search result, a job or a layer the pane holds no section", () => {
  show();
  expect(screen.getByRole("complementary", { name: "Catalog" })).toBeDefined();
  expect(screen.getByText("No products yet")).toBeDefined();
  expect(headings()).toEqual([]);
});

test("with the first job the pane holds its three sections, and each empty one says how it fills", async () => {
  show();
  act(() => jobsStore.set([job()]));
  expect(headings()).toEqual(["Products", "Jobs (1)", "Layers (0)", "Series (0)"]);
  expect(screen.getByText(/^Products are listed after a search\./)).toBeDefined();
  expect(screen.getByText("A layer is listed when the job that gets or computes it has finished.")).toBeDefined();
  await userEvent.click(screen.getByRole("button", { name: "Search products" }));
  expect(dockStore.get().tools).toEqual([SEARCH_PANE]);
});

test("with the first layer the pane holds its three sections", () => {
  show();
  act(() => layersStore.set([{ layer: layer(), size: 1000, created: null, server: null }]));
  expect(headings()).toEqual(["Products", "Jobs (0)", "Layers (1)", "Series (0)"]);
  expect(screen.getByText("A job starts when a layer is requested or an analysis tool is run.")).toBeDefined();
});

test("the sections stand in the order of the work: products, jobs, layers, series", () => {
  show();
  act(() => {
    productsStore.set({
      search: { sort: "newest", by: "names", names: ["NISAR"], maturity: [] } as never,
      found: 1,
      products: [realProduct()],
    });
    jobsStore.set([job()]);
    layersStore.set([{ layer: layer(), size: 1000, created: null, server: null }]);
  });
  expect(headings()).toEqual(["Products (1)", "Jobs (1)", "Layers (1)", "Series (0)"]);
  expect([...document.querySelectorAll(".catalog > .section")].map((section) => section.id)).toEqual([
    "catalog-products",
    "catalog-jobs",
    "catalog-layers",
    "catalog-series",
  ]);
});

test("a section closes and opens from its title, and keeps its content", async () => {
  show();
  act(() => jobsStore.set([job()]));
  const title = screen.getByRole("button", { name: "Jobs (1)" });
  await userEvent.click(title);
  expect(title.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("progressbar")).toBeNull();
  await userEvent.click(title);
  expect(screen.getByRole("progressbar")).toBeDefined();
});

test("the pane returns to its first state when its last content leaves", () => {
  show();
  act(() => jobsStore.set([job()]));
  act(() => jobsStore.set([]));
  expect(headings()).toEqual([]);
  expect(screen.getByRole("button", { name: "Search products" })).toBeDefined();
});

test("the command Show layer of a job opens the section of the layers and marks the layer", async () => {
  show();
  act(() => {
    jobsStore.set([job({ status: "successful", progress: 100, finished: "2026-11-14T16:22:00Z", layer: "made" })]);
    layersStore.set([{ layer: layer({ id: "made" }), size: 1000, created: null, server: null }]);
  });
  await userEvent.click(screen.getByRole("button", { name: "Layers (1)" }));
  expect(screen.getByRole("button", { name: "Layers (1)" }).getAttribute("aria-expanded")).toBe("false");
  await userEvent.click(screen.getByRole("button", { name: "Show layer" }));
  expect(screen.getByRole("button", { name: "Layers (1)" }).getAttribute("aria-expanded")).toBe("true");
  expect(markedLayerStore.get()).toBe("made");
  expect(document.querySelector(".layer.item--selected .item-title")?.textContent).toBe("Backscatter HH, 21 Oct 2026");
});

test("a series alone ends the first state of the pane, and stands in its own section", () => {
  show();
  expect(headings()).toEqual([]);
  act(() => seriesStore.set([seriesItem()]));
  expect(headings()).toEqual(["Products", "Jobs (0)", "Layers (0)", "Series (1)"]);
  expect(screen.getByText("Backscatter HH, mean of the area")).toBeDefined();
});
