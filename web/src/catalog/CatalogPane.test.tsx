import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import detail from "../../../api/tests/data/detail-gcov.json";
import * as files from "../data/export";
import { resetJobs } from "../data/jobs";
import { resetLayers } from "../data/layers";
import { stopSearch } from "../data/run";
import { firstDraft, searchOfDraft, type ProductSearch } from "../data/search";
import {
  clearProducts,
  GET_LAYER_PANE,
  hoveredProductStore,
  outlinesStore,
  productsStore,
  SEARCH_PANE,
  searchDraftStore,
  selectedProductStore,
} from "../data/state";
import { pairProduct, realProduct, serverWith, someProducts, testMap } from "../data/testProducts";
import { dockStore, resetDock } from "../shared/dock/dock";
import { MapContext } from "../shared/map";
import { messagesStore } from "../shared/messages/messages";
import { resetPanes, setPaneOpen } from "../shared/panes";
import { CatalogPane } from "./CatalogPane";
import { countSentence, searchWords } from "./ProductList";

const BOX = { kind: "rectangle", west: "-71.2", south: "42.6", east: "-70.75", north: "42.95" } as const;

function search(): ProductSearch {
  const made = searchOfDraft({ ...firstDraft(BOX, new Date("2026-11-14T12:00:00Z")), start: "2026-10-01" });
  if (typeof made === "string") {
    throw new Error(made);
  }
  return made;
}

function show() {
  render(
    <MapContext value={testMap()}>
      <main tabIndex={0} aria-label="Map" />
      <CatalogPane />
    </MapContext>,
  );
}

/** The texts of the products of the list, in their order. */
function items(): string[] {
  return [...document.querySelectorAll(".catalog-pick")].map((button) => button.textContent);
}

/** The text of a product of the list, which a click selects. */
const product = (name: RegExp) => screen.getByRole("button", { name });

/** Open a menu of the toolbar and choose one of its commands. */
async function choose(menu: string | RegExp, command: string) {
  await userEvent.click(screen.getByRole("button", { name: menu }));
  await userEvent.click(within(screen.getByRole("menu")).getByText(command));
}

beforeEach(() => {
  clearProducts();
  stopSearch();
  resetJobs();
  resetLayers();
  searchDraftStore.set(null);
  outlinesStore.set(true);
  messagesStore.set([]);
  resetDock();
  resetPanes();
  setPaneOpen("catalog", true);
  // The details of a selected product are asked from the server.
  vi.stubGlobal("fetch", serverWith(detail).fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("before the first search the pane states what is missing and leads to the search", async () => {
  show();
  const pane = within(screen.getByRole("complementary", { name: "Catalog" }));
  expect(pane.getByText("No products yet")).toBeDefined();
  expect(
    pane.getByText("Search NASA's catalogue to list the products of an area and to get layers from them."),
  ).toBeDefined();
  await userEvent.click(pane.getByRole("button", { name: "Search products" }));
  expect(dockStore.get().tools).toEqual([SEARCH_PANE]);
});

test("the pane is not drawn while it is closed", () => {
  show();
  act(() => setPaneOpen("catalog", false));
  expect(screen.queryByRole("complementary")).toBeNull();
});

test("the products found are listed with their date, orbit, channels, size and maturity", () => {
  show();
  const pair = pairProduct("2026-10-09", "2026-10-21");
  const sideOnly = { ...realProduct(), id: "side", channels: [], side_channels: ["VV"], maturity: "Beta" } as const;
  act(() => productsStore.set({ search: search(), found: 3, products: [realProduct(), pair, sideOnly] }));
  expect(screen.getByRole("button", { name: "Products (3)", expanded: true })).toBeDefined();
  expect(items()).toEqual([
    "21 Oct 2026Track 141, frame 67, descendingHH, HV · 5.8 GB · Validated",
    "9 Oct 2026 and 21 Oct 2026 (12 days)Track 141, frame 67, descendingHH · Validated",
    "21 Oct 2026Track 141, frame 67, descendingB: VV · 5.8 GB · Beta",
  ]);
});

test("one line names the search, and its full statement stands behind the button of the explanation", () => {
  show();
  act(() => productsStore.set({ search: search(), found: 500, products: someProducts(2) }));
  expect(screen.getByText("GCOV · 1 Oct 2026 to 14 Nov 2026 · rectangle")).toBeDefined();
  const about = screen.getByRole("button", { name: "Information about the search" });
  expect(document.getElementById(about.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
    "GCOV (Geocoded Polarimetric Covariance), validated and provisional, in the rectangle from 71.2° W to 70.75° W and from 42.6° N to 42.95° N, from 1 Oct 2026 to 14 Nov 2026.",
  );
});

test("a search is named by its type, its period and the kind of its area, or by the number of its names", () => {
  const made = search();
  const ring = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 0],
  ] as const;
  expect(searchWords({ ...made, area: null, start: null, end: null })).toBe("GCOV · every date · whole Earth");
  expect(searchWords({ ...made, area: { kind: "polygons", rings: [ring] } })).toBe(
    "GCOV · 1 Oct 2026 to 14 Nov 2026 · polygon",
  );
  expect(searchWords({ ...made, area: { kind: "polygons", rings: [ring, ring] } })).toMatch(/ · 2 polygons$/);
  expect(searchWords({ ...made, product: null, names: ["NISAR_L2_*"] })).toBe("1 product name");
  expect(searchWords({ ...made, product: null, names: ["a", "b"] })).toBe("2 product names");
});

test("the link Edit search opens the pane of the search", async () => {
  show();
  act(() => productsStore.set({ search: search(), found: 2, products: someProducts(2) }));
  await userEvent.click(screen.getByRole("button", { name: "Edit search" }));
  expect(dockStore.get().tools).toEqual([SEARCH_PANE]);
});

test("a click selects a product and shows its commands, and a second click ends the selection", async () => {
  show();
  act(() => productsStore.set({ search: search(), found: 2, products: someProducts(2) }));
  expect(screen.queryByRole("group", { name: "Commands of the product" })).toBeNull();
  const item = product(/^21 Oct 2026/);
  await userEvent.click(item);
  expect(selectedProductStore.get()).toBe("G0-ASF");
  expect(item.getAttribute("aria-pressed")).toBe("true");
  expect(item.closest("li")?.classList.contains("item--selected")).toBe(true);
  const commands = within(screen.getByRole("group", { name: "Commands of the product" }));
  expect(commands.getAllByRole("button").map((button) => button.textContent)).toEqual([
    "Get layer",
    "Details",
    "Zoom to",
  ]);
  await userEvent.click(item);
  expect(selectedProductStore.get()).toBeNull();
  expect(screen.queryByRole("group", { name: "Commands of the product" })).toBeNull();
});

test("the command Get layer of a product opens the tool and keeps the product selected", async () => {
  show();
  act(() => productsStore.set({ search: search(), found: 2, products: someProducts(2) }));
  await userEvent.click(product(/^21 Oct 2026/));
  await userEvent.click(screen.getByRole("button", { name: "Get layer" }));
  expect(dockStore.get().tools).toEqual([GET_LAYER_PANE]);
  expect(selectedProductStore.get()).toBe("G0-ASF");
});

test("the details take the place of the list, and the link back returns to the selected product", async () => {
  show();
  act(() => productsStore.set({ search: search(), found: 2, products: someProducts(2) }));
  await userEvent.click(product(/^21 Oct 2026/));
  await userEvent.click(screen.getByRole("button", { name: "Details" }));
  expect(items()).toEqual([]);
  expect(screen.queryByRole("toolbar", { name: "Commands of the list of products" })).toBeNull();
  const back = screen.getByRole("button", { name: "Back to products" });
  expect(document.activeElement).toBe(back);
  expect(await screen.findByText("Program")).toBeDefined();
  expect(screen.getByRole("button", { name: "Products (2)" })).toBeDefined();
  await userEvent.click(back);
  expect(items()).toHaveLength(2);
  expect(selectedProductStore.get()).toBe("G0-ASF");
  expect(document.activeElement).toBe(product(/^21 Oct 2026/));
});

test("the details close when the selection ends or passes to another product on the map", async () => {
  show();
  act(() => productsStore.set({ search: search(), found: 2, products: someProducts(2) }));
  await userEvent.click(product(/^21 Oct 2026/));
  await userEvent.click(screen.getByRole("button", { name: "Details" }));
  act(() => selectedProductStore.set(null));
  expect(screen.queryByRole("button", { name: "Back to products" })).toBeNull();
  expect(items()).toHaveLength(2);

  await userEvent.click(product(/^21 Oct 2026/));
  await userEvent.click(screen.getByRole("button", { name: "Details" }));
  act(() => selectedProductStore.set("G1-ASF"));
  expect(screen.queryByRole("button", { name: "Back to products" })).toBeNull();
  expect(product(/^9 Oct 2026/).getAttribute("aria-pressed")).toBe("true");
});

test("the product on which the pointer or the keyboard focus rests is named for the map", async () => {
  show();
  act(() => productsStore.set({ search: search(), found: 2, products: someProducts(2) }));
  const [first, second] = screen.getAllByRole("button", { name: /Track 141/ });
  if (!first || !second) {
    throw new Error("the list of the test is empty");
  }
  await userEvent.hover(first);
  expect(hoveredProductStore.get()).toBe("G0-ASF");
  await userEvent.hover(second);
  expect(hoveredProductStore.get()).toBe("G1-ASF");
  await userEvent.unhover(second);
  expect(hoveredProductStore.get()).toBeNull();
  act(() => first.focus());
  expect(hoveredProductStore.get()).toBe("G0-ASF");
  // A product under the pointer on the map is marked in the list.
  act(() => hoveredProductStore.set("G1-ASF"));
  expect(second.closest("li")?.classList.contains("catalog-product--hovered")).toBe(true);
});

test("the list is divided into groups with the number of products of each", async () => {
  show();
  const [first, second, third] = someProducts(3);
  if (!first || !second || !third) {
    throw new Error("the test has no products");
  }
  act(() => productsStore.set({ search: search(), found: 3, products: [first, { ...second, frame: 68 }, third] }));
  expect(screen.queryByRole("heading", { level: 4 })).toBeNull();
  await choose("Group by", "Track and frame");
  expect(screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)).toEqual([
    "Track 141, frame 67, descending (2)",
    "Track 141, frame 68, descending (1)",
  ]);
  await userEvent.click(screen.getByRole("button", { name: "Group by" }));
  expect(screen.getByRole("menuitemcheckbox", { name: "Track and frame" }).getAttribute("aria-checked")).toBe("true");
});

test("another order asks the server again, and the button of the order names it", async () => {
  const { fetch, asked } = serverWith({ found: 2, products: someProducts(2).reverse() });
  vi.stubGlobal("fetch", fetch);
  show();
  act(() => productsStore.set({ search: search(), found: 2, products: someProducts(2) }));
  await choose("Sort: latest first", "Acquisition, earliest first");
  await vi.waitFor(() => expect(productsStore.get()?.search.sort).toBe("oldest"));
  expect(asked[0]).toMatch(/&sort=oldest$/);
  expect(screen.getByRole("button", { name: "Sort: earliest first" })).toBeDefined();
  expect(items()[0]).toMatch(/^9 Oct 2026/);
});

test("the button at the foot of the list loads the next products", async () => {
  const { fetch, asked } = serverWith({ found: 450, products: someProducts(200, 200) });
  vi.stubGlobal("fetch", fetch);
  show();
  act(() => productsStore.set({ search: search(), found: 450, products: someProducts(200) }));
  expect(screen.getByText("200 of 450 products are listed.")).toBeDefined();
  await userEvent.click(screen.getByRole("button", { name: "Load 200 more" }));
  await vi.waitFor(() => expect(productsStore.get()?.products).toHaveLength(400));
  expect(asked[0]).toMatch(/&offset=200$/);
  expect(screen.getByRole("button", { name: "Load 50 more" })).toBeDefined();
  expect(screen.getByText("400 of 450 products are listed.")).toBeDefined();
  expect(screen.getByRole("button", { name: "Products (400)" })).toBeDefined();
  // The list of the test holds 400 products, which a slow machine draws in more than the usual time of a test.
}, 30_000);

test("a list that holds every product found has no button to load more", () => {
  show();
  act(() => productsStore.set({ search: search(), found: 2, products: someProducts(2) }));
  expect(screen.queryByRole("button", { name: /^Load/ })).toBeNull();
  expect(countSentence(0, 0)).toBe("No product was found.");
  expect(countSentence(1, 1)).toBe("1 product.");
  expect(countSentence(12, 12)).toBe("12 products.");
  expect(countSentence(200, 13172)).toBe("200 of 13,172 products are listed.");
});

test("the toolbar of the list hides the outlines and saves the list as a file", async () => {
  const saved: [string, string, string][] = [];
  vi.spyOn(files, "saveFile").mockImplementation((name, type, text) => {
    saved.push([name, type, text]);
  });
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-14T12:00:00Z") });
  show();
  act(() => productsStore.set({ search: search(), found: 2, products: someProducts(2) }));
  const toolbar = within(screen.getByRole("toolbar", { name: "Commands of the list of products" }));
  expect(
    toolbar.getAllByRole("button").map((button) => button.getAttribute("aria-label") ?? button.textContent),
  ).toEqual(["Sort: latest first", "Group by", "Zoom to all", "Outlines on the map", "Save as", "Clear the list"]);
  const outlines = toolbar.getByRole("button", { name: "Outlines on the map" });
  expect(outlines.getAttribute("aria-pressed")).toBe("true");
  await userEvent.click(outlines);
  expect(outlinesStore.get()).toBe(false);
  expect(outlines.getAttribute("aria-pressed")).toBe("false");
  await choose("Save as", "CSV");
  await choose("Save as", "GeoJSON");
  vi.useRealTimers();
  expect(saved.map(([name, type]) => [name, type])).toEqual([
    ["nisar-gcov-2026-11-14.csv", "text/csv"],
    ["nisar-gcov-2026-11-14.geojson", "application/geo+json"],
  ]);
  expect(saved[0]?.[2].split("\r\n")).toHaveLength(4);
  expect((JSON.parse(saved[1]?.[2] ?? "{}") as { features: unknown[] }).features).toHaveLength(2);
});

test("a search that found nothing says so, and the commands that need products are inactive", async () => {
  show();
  act(() => productsStore.set({ search: search(), found: 0, products: [] }));
  expect(screen.getByRole("button", { name: "Products (0)" })).toBeDefined();
  expect(screen.getByText("No products found")).toBeDefined();
  expect(screen.getByRole("button", { name: "Edit search" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Zoom to all" }).getAttribute("aria-disabled")).toBe("true");
  await userEvent.click(screen.getByRole("button", { name: "Save as" }));
  expect(screen.getAllByRole("menuitem").map((command) => command.getAttribute("aria-disabled"))).toEqual([
    "true",
    "true",
  ]);
});

test("the command Clear the list removes the products, and the pane leads to the search again", async () => {
  show();
  act(() => productsStore.set({ search: search(), found: 2, products: someProducts(2) }));
  await userEvent.click(screen.getByRole("button", { name: "Clear the list" }));
  expect(productsStore.get()).toBeNull();
  expect(screen.getByRole("complementary", { name: "Catalog" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Search products" })).toBeDefined();
  // The button that held the focus has left the page with the list.
  await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole("main")));
});
