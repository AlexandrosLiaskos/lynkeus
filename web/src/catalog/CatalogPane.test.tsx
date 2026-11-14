import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import detail from "../../../api/tests/data/detail-gcov.json";
import * as files from "../data/export";
import { stopSearch } from "../data/run";
import { firstDraft, searchOfDraft, type ProductSearch } from "../data/search";
import {
  clearProducts,
  hoveredProductStore,
  outlinesStore,
  productsStore,
  searchDraftStore,
  selectedProductStore,
} from "../data/state";
import { pairProduct, realProduct, serverWith, someProducts, testMap } from "../data/testProducts";
import { MapContext } from "../shared/map";
import { messagesStore } from "../shared/messages/messages";
import { resetDock } from "../shared/dock/dock";
import { resetPanes } from "../shared/panes";
import { CatalogPane } from "./CatalogPane";
import { countSentence } from "./ProductsSection";

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
      <CatalogPane />
    </MapContext>,
  );
}

function items(): string[] {
  return screen
    .getAllByRole("button", { pressed: false })
    .flatMap((button) => (button.classList.contains("catalog-item") ? [button.textContent] : []));
}

beforeEach(() => {
  clearProducts();
  stopSearch();
  searchDraftStore.set(null);
  outlinesStore.set(true);
  messagesStore.set([]);
  resetDock();
  resetPanes();
  // The details of a selected product are asked from the server.
  vi.stubGlobal("fetch", serverWith(detail).fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("the pane is not shown before the first search", () => {
  show();
  expect(screen.queryByRole("complementary")).toBeNull();
});

test("the products found are listed with their date, orbit, channels, size and maturity", () => {
  show();
  const pair = pairProduct("2026-10-09", "2026-10-21");
  const sideOnly = { ...realProduct(), id: "side", channels: [], side_channels: ["VV"], maturity: "Beta" } as const;
  act(() => productsStore.set({ search: search(), found: 3, products: [realProduct(), pair, sideOnly] }));
  expect(screen.getByRole("complementary", { name: "Catalog" })).toBeDefined();
  expect(screen.getByRole("heading", { name: "Products found" })).toBeDefined();
  expect(items()).toEqual([
    "21 Oct 2026Track 141, frame 67, descendingHH, HV · 5.8 GB · Validated",
    "9 Oct 2026 and 21 Oct 2026 (12 days)Track 141, frame 67, descendingHH · Validated",
    "21 Oct 2026Track 141, frame 67, descendingB: VV · 5.8 GB · Beta",
  ]);
});

test("the pane states what was searched and how many products are listed", () => {
  show();
  act(() => productsStore.set({ search: search(), found: 500, products: someProducts(2) }));
  const summary = screen.getByText(/^GCOV \(Geocoded Polarimetric Covariance\)/);
  expect(summary.textContent).toBe(
    "GCOV (Geocoded Polarimetric Covariance), validated and provisional, in the rectangle from 71.2° W to 70.75° W and from 42.6° N to 42.95° N, from 1 Oct 2026 to 14 Nov 2026. 2 of 500 products are listed.",
  );
  expect(countSentence(0, 0)).toBe("No product was found.");
  expect(countSentence(1, 1)).toBe("1 product.");
  expect(countSentence(12, 12)).toBe("12 products.");
  expect(countSentence(200, 13172)).toBe("200 of 13,172 products are listed.");
});

test("a click selects a product and shows its details, and a second click ends the selection", async () => {
  show();
  act(() => productsStore.set({ search: search(), found: 2, products: someProducts(2) }));
  const item = screen.getByRole("button", { name: /^21 Oct 2026/ });
  await userEvent.click(item);
  expect(selectedProductStore.get()).toBe("G0-ASF");
  expect(item.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("heading", { name: "Product details" })).toBeDefined();
  await userEvent.click(item);
  expect(selectedProductStore.get()).toBeNull();
  expect(screen.queryByRole("heading", { name: "Product details" })).toBeNull();
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
  expect(second.classList.contains("catalog-item--hovered")).toBe(true);
});

test("the list is divided into groups with the number of products of each", async () => {
  show();
  const [first, second, third] = someProducts(3);
  if (!first || !second || !third) {
    throw new Error("the test has no products");
  }
  act(() => productsStore.set({ search: search(), found: 3, products: [first, { ...second, frame: 68 }, third] }));
  expect(screen.queryByRole("heading", { level: 4 })).toBeNull();
  await userEvent.selectOptions(screen.getByLabelText("Group by"), "frame");
  expect(screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)).toEqual([
    "Track 141, frame 67, descending (2)",
    "Track 141, frame 68, descending (1)",
  ]);
});

test("another order asks the server again", async () => {
  const { fetch, asked } = serverWith({ found: 2, products: someProducts(2).reverse() });
  vi.stubGlobal("fetch", fetch);
  show();
  act(() => productsStore.set({ search: search(), found: 2, products: someProducts(2) }));
  await userEvent.selectOptions(screen.getByLabelText("Sort by"), "oldest");
  await vi.waitFor(() => expect(productsStore.get()?.search.sort).toBe("oldest"));
  expect(asked[0]).toMatch(/&sort=oldest$/);
  expect(screen.getByLabelText<HTMLSelectElement>("Sort by").value).toBe("oldest");
  expect(items()[0]).toMatch(/^9 Oct 2026/);
});

test("the button at the foot of the list loads the next products", async () => {
  const { fetch, asked } = serverWith({ found: 450, products: someProducts(200, 200) });
  vi.stubGlobal("fetch", fetch);
  show();
  act(() => productsStore.set({ search: search(), found: 450, products: someProducts(200) }));
  await userEvent.click(screen.getByRole("button", { name: "Load 200 more" }));
  await vi.waitFor(() => expect(productsStore.get()?.products).toHaveLength(400));
  expect(asked[0]).toMatch(/&offset=200$/);
  expect(screen.getByRole("button", { name: "Load 50 more" })).toBeDefined();
  expect(screen.getByText("400 of 450 products are listed.")).toBeDefined();
  // The list of the test holds 400 products, which a slow machine draws in more than the usual time of a test.
}, 30_000);

test("a list that holds every product found has no button to load more", () => {
  show();
  act(() => productsStore.set({ search: search(), found: 2, products: someProducts(2) }));
  expect(screen.queryByRole("button", { name: /^Load/ })).toBeNull();
});

test("the tools of the list hide the outlines and save the list as a file", async () => {
  const saved: [string, string, string][] = [];
  vi.spyOn(files, "saveFile").mockImplementation((name, type, text) => {
    saved.push([name, type, text]);
  });
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-14T12:00:00Z") });
  show();
  act(() => productsStore.set({ search: search(), found: 2, products: someProducts(2) }));
  const outlines = screen.getByLabelText<HTMLInputElement>("Outlines on the map");
  expect(outlines.checked).toBe(true);
  await userEvent.click(outlines);
  expect(outlinesStore.get()).toBe(false);
  expect(outlines.checked).toBe(false);
  const tools = within(screen.getByRole("group", { name: "Tools of the list" }));
  await userEvent.click(tools.getByRole("button", { name: "Save as CSV" }));
  await userEvent.click(tools.getByRole("button", { name: "Save as GeoJSON" }));
  vi.useRealTimers();
  expect(saved.map(([name, type]) => [name, type])).toEqual([
    ["nisar-gcov-2026-11-14.csv", "text/csv"],
    ["nisar-gcov-2026-11-14.geojson", "application/geo+json"],
  ]);
  expect(saved[0]?.[2].split("\r\n")).toHaveLength(4);
  expect((JSON.parse(saved[1]?.[2] ?? "{}") as { features: unknown[] }).features).toHaveLength(2);
});

test("the tools that need products are inactive for an empty list", () => {
  show();
  act(() => productsStore.set({ search: search(), found: 0, products: [] }));
  expect(screen.getByText("No product was found.")).toBeDefined();
  for (const name of ["Zoom to all", "Save as CSV", "Save as GeoJSON"]) {
    expect(screen.getByRole<HTMLButtonElement>("button", { name }).disabled).toBe(true);
  }
});

test("the Clear button removes the list and the pane", async () => {
  show();
  act(() => productsStore.set({ search: search(), found: 2, products: someProducts(2) }));
  await userEvent.click(screen.getByRole("button", { name: "Clear" }));
  expect(productsStore.get()).toBeNull();
  expect(screen.queryByRole("complementary")).toBeNull();
});
