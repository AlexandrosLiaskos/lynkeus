import { beforeEach, expect, test, vi } from "vitest";
import { dockStore, openToolPane, resetDock, setAutoHide } from "../shared/dock/dock";
import { PANE_WIDTH, resetPanes, setPaneOpen, setPaneWidth } from "../shared/panes";
import { resetStorage, setPartKept, storageStore } from "../shared/storage/storage";
import { statusBarStore } from "../statusbar/state";
import { PANES_KEY, storedPanes, type StoredPanes } from "./storedPanes";

const PANES: StoredPanes = {
  contents: { open: false, width: 320 },
  catalog: { open: true, width: 400 },
  hidden: ["catalog", "search-products"],
  statusBar: false,
};

function stored(): unknown {
  const text = window.localStorage.getItem(PANES_KEY);
  return text === null ? null : JSON.parse(text);
}

beforeEach(() => {
  resetDock();
  resetPanes();
  statusBarStore.set(true);
  window.localStorage.clear();
  resetStorage();
});

test("the panes are a part that the browser keeps: what is open, the widths, the pins and the status bar", () => {
  expect(storageStore.get().parts.find(({ key }) => key === PANES_KEY)).toMatchObject({ title: "Panes", kept: true });
  setPaneOpen("contents", false);
  expect(stored()).toMatchObject({ v: 1, value: { contents: { open: false, width: PANE_WIDTH.first } } });
  setPaneWidth("catalog", 400);
  expect(stored()).toMatchObject({ value: { catalog: { width: 400 } } });
  setAutoHide("catalog", true);
  expect(stored()).toMatchObject({ value: { hidden: ["catalog"] } });
  statusBarStore.set(false);
  expect(stored()).toMatchObject({ value: { statusBar: false } });
});

test("a tool pane that opens is not stored", () => {
  setPaneWidth("contents", 320);
  const before = window.localStorage.getItem(PANES_KEY);
  openToolPane("search-products");
  expect(dockStore.get().tools).toEqual(["search-products"]);
  expect(window.localStorage.getItem(PANES_KEY)).toBe(before);
  expect(JSON.stringify(stored())).not.toContain("search-products");
});

test("the stored panes return when the page opens, and no tool pane is open", async () => {
  window.localStorage.setItem(PANES_KEY, JSON.stringify({ v: 1, value: { ...PANES, tools: ["search-products"] } }));
  vi.resetModules();
  await import("./storedPanes");
  const panes = await import("../shared/panes");
  const dock = await import("../shared/dock/dock");
  const statusBar = await import("../statusbar/state");
  expect(panes.panesStore.get()).toEqual({ contents: PANES.contents, catalog: PANES.catalog });
  expect(dock.dockStore.get().hidden).toEqual(["catalog", "search-products"]);
  expect(dock.dockStore.get().tools).toEqual([]);
  expect(statusBar.statusBarStore.get()).toBe(false);
});

test("panes whose switch is off are not stored", () => {
  setPaneWidth("contents", 320);
  setPartKept(PANES_KEY, false);
  expect(stored()).toBeNull();
  setPaneWidth("contents", 336);
  expect(stored()).toBeNull();
});

test("valid stored panes are accepted with their own fields only", () => {
  expect(storedPanes({ ...PANES, tools: ["search-products"] })).toEqual(PANES);
});

test.each([
  ["the value is a list", [PANES]],
  ["a pane is missing", { ...PANES, catalog: undefined }],
  ["a pane is open as a text", { ...PANES, contents: { open: "yes", width: 320 } }],
  ["a width is below the smallest", { ...PANES, contents: { open: true, width: PANE_WIDTH.smallest - 1 } }],
  ["a width is above the largest", { ...PANES, catalog: { open: true, width: PANE_WIDTH.largest + 1 } }],
  ["a width is not a whole number", { ...PANES, catalog: { open: true, width: 300.5 } }],
  ["the pins are a text", { ...PANES, hidden: "catalog" }],
  ["a pin is not the name of a pane", { ...PANES, hidden: ["Catalog pane"] }],
  ["a pin is a number", { ...PANES, hidden: [1] }],
  ["a pin stands twice", { ...PANES, hidden: ["catalog", "catalog"] }],
  ["the status bar is a number", { ...PANES, statusBar: 1 }],
])("stored panes are refused and removed when %s", async (_reason, value) => {
  expect(storedPanes(value)).toBeUndefined();
  window.localStorage.setItem(PANES_KEY, JSON.stringify({ v: 1, value }));
  vi.resetModules();
  await import("./storedPanes");
  const panes = await import("../shared/panes");
  expect(panes.panesStore.get().contents.width).toBe(PANE_WIDTH.first);
  expect(window.localStorage.getItem(PANES_KEY)).toBeNull();
});
