import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import gcov from "../../../api/tests/data/product-gcov.json";
import { isProduct, type Product, type ProductSearch } from "../data/products";
import { clearProducts, productsStore, selectedProductStore } from "../data/state";
import { resetPanes } from "../shared/panes";
import { CatalogPane } from "./CatalogPane";

const SEARCH: ProductSearch = {
  product: "GCOV",
  area: { west: -71.2, south: 42.6, east: -70.75, north: 42.95 },
  start: "2026-10-01",
  end: "2026-11-14",
};

function products(): Product[] {
  if (!isProduct(gcov)) {
    throw new Error("the product of the test is not valid");
  }
  const pair: Product = { ...gcov, id: "pair", dates: ["2026-10-09", "2026-10-21"], channels: ["HH"], size: null };
  return [gcov, pair];
}

beforeEach(() => {
  clearProducts();
  resetPanes();
});

test("the pane is not shown before the first search", () => {
  render(<CatalogPane />);
  expect(screen.queryByRole("complementary")).toBeNull();
});

test("the products found are listed with their date, orbit, channels, size and maturity", () => {
  render(<CatalogPane />);
  act(() => productsStore.set({ search: SEARCH, answer: { found: 2, products: products() } }));
  expect(screen.getByRole("complementary", { name: "Catalog" })).toBeDefined();
  expect(screen.getByRole("heading", { name: "Products found" })).toBeDefined();
  expect(screen.getByText(/1 Oct 2026 to 14 Nov 2026\. 2 products\./)).toBeDefined();
  const [first, second] = screen.getAllByRole("button", { pressed: false });
  expect(first?.textContent).toBe("21 Oct 2026Track 141, frame 67, descendingHH, HV · 5.8 GB · Validated");
  expect(second?.textContent).toBe("9 Oct 2026 and 21 Oct 2026Track 141, frame 67, descendingHH · Validated");
});

test("the summary says when more products were found than are listed", () => {
  render(<CatalogPane />);
  act(() => productsStore.set({ search: SEARCH, answer: { found: 500, products: products() } }));
  expect(screen.getByText(/The latest 2 of 500 products are listed\./)).toBeDefined();
});

test("a click selects a product and a second click ends the selection", async () => {
  render(<CatalogPane />);
  act(() => productsStore.set({ search: SEARCH, answer: { found: 2, products: products() } }));
  const item = screen.getByRole("button", { name: /^21 Oct 2026/ });
  await userEvent.click(item);
  expect(selectedProductStore.get()).toBe("G4405194348-ASF");
  expect(item.getAttribute("aria-pressed")).toBe("true");
  await userEvent.click(item);
  expect(selectedProductStore.get()).toBeNull();
});

test("the Clear button removes the list and the pane", async () => {
  render(<CatalogPane />);
  act(() => productsStore.set({ search: SEARCH, answer: { found: 2, products: products() } }));
  await userEvent.click(screen.getByRole("button", { name: "Clear" }));
  expect(productsStore.get()).toBeNull();
  expect(screen.queryByRole("complementary")).toBeNull();
});
