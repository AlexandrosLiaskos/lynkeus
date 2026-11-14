import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat } from "ol/proj";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import product from "../../../api/tests/data/product-gcov.json";
import { areaStore } from "../shared/area";
import { MapContext } from "../shared/map";
import { messagesStore } from "../shared/messages/messages";
import { panesStore, resetPanes, setPaneOpen } from "../shared/panes";
import { SearchDialog } from "./SearchDialog";
import { clearProducts, productsStore, searchDialogStore } from "./state";

function open() {
  const map = new OlMap({ view: new View({ center: fromLonLat([-70.9, 42.8]), zoom: 10 }) });
  map.setSize([800, 600]);
  render(
    <MapContext value={map}>
      <SearchDialog />
    </MapContext>,
  );
  act(() => searchDialogStore.set(true));
}

function field(name: string): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>(name);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-14T12:00:00Z") });
  areaStore.set(null);
  clearProducts();
  messagesStore.set([]);
  resetPanes();
  searchDialogStore.set(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("the form starts with the view of the map and the last 30 days", () => {
  open();
  expect(Number(field("West").value)).toBeCloseTo(-71.4493, 3);
  expect(Number(field("East").value)).toBeCloseTo(-70.3507, 3);
  expect(field("First day").value).toBe("2026-10-15");
  expect(field("Last day").value).toBe("2026-11-14");
  expect(screen.getByLabelText<HTMLSelectElement>("Product type").value).toBe("GCOV");
});

test("the form starts with the drawn area when there is one", () => {
  areaStore.set({ west: -71.2, south: 42.6, east: -70.75, north: 42.95 });
  open();
  expect([field("West").value, field("South").value, field("East").value, field("North").value]).toEqual([
    "-71.2",
    "42.6",
    "-70.75",
    "42.95",
  ]);
});

test("wrong choices are named and nothing is sent", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  open();
  await userEvent.clear(field("West"));
  await userEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(screen.getByRole("alert").textContent).toBe("Give the four sides of the area as numbers.");
  await userEvent.type(field("West"), "-60");
  await userEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(screen.getByRole("alert").textContent).toMatch(/West must be smaller than east/);
  expect(fetch).not.toHaveBeenCalled();
  expect(searchDialogStore.get()).toBe(true);
});

test("a search fills the list, opens the Catalog pane, reports the number and closes the dialog", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ found: 1, products: [product] }), { status: 200 }))),
  );
  setPaneOpen("catalog", false);
  areaStore.set({ west: -71.2, south: 42.6, east: -70.75, north: 42.95 });
  open();
  await userEvent.selectOptions(screen.getByLabelText("Product type"), "GCOV");
  await userEvent.click(screen.getByRole("button", { name: "Search" }));
  await vi.waitFor(() => expect(searchDialogStore.get()).toBe(false));
  expect(productsStore.get()?.search).toEqual({
    product: "GCOV",
    area: { west: -71.2, south: 42.6, east: -70.75, north: 42.95 },
    start: "2026-10-15",
    end: "2026-11-14",
  });
  expect(productsStore.get()?.answer.products.map(({ id }) => id)).toEqual(["G4405194348-ASF"]);
  expect(panesStore.get().catalog.open).toBe(true);
  expect(messagesStore.get().map(({ kind, text }) => [kind, text])).toEqual([["success", "1 product was found."]]);
});

test("a search that finds more products than are listed says so", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ found: 13172, products: [product] }), { status: 200 }))),
  );
  open();
  await userEvent.click(screen.getByRole("button", { name: "Search" }));
  await vi.waitFor(() => expect(searchDialogStore.get()).toBe(false));
  expect(messagesStore.get()[0]?.kind).toBe("warning");
  expect(messagesStore.get()[0]?.text).toMatch(/^13172 products were found, and the latest 1 are listed\./);
});

test("a search without a product reports that none was found", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ found: 0, products: [] }), { status: 200 }))),
  );
  open();
  await userEvent.click(screen.getByRole("button", { name: "Search" }));
  await vi.waitFor(() => expect(searchDialogStore.get()).toBe(false));
  expect(messagesStore.get().map(({ kind }) => kind)).toEqual(["info"]);
  expect(productsStore.get()?.answer.products).toEqual([]);
});

test("a failed search keeps the dialog open and shows the words of the server", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ detail: "NASA's catalogue did not answer in time." }), { status: 504 }),
      ),
    ),
  );
  open();
  await userEvent.click(screen.getByRole("button", { name: "Search" }));
  expect((await screen.findByRole("alert")).textContent).toBe("NASA's catalogue did not answer in time.");
  expect(searchDialogStore.get()).toBe(true);
  expect(productsStore.get()).toBeNull();
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Search" }).disabled).toBe(false);
});

test("the Cancel button closes the dialog", async () => {
  open();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(searchDialogStore.get()).toBe(false);
});
