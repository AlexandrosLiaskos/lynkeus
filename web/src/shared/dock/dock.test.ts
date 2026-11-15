// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { beforeEach, expect, test } from "vitest";
import {
  closeToolPane,
  concealPanes,
  dockStore,
  enterDock,
  frontOf,
  hiddenOf,
  isHidden,
  isShown,
  leaveDock,
  openToolPane,
  panesOf,
  pinAllPanes,
  resetDock,
  revealedOf,
  setAutoHide,
  showPane,
  sideOf,
  stackOf,
  togglePane,
} from "./dock";

beforeEach(resetDock);

test("the Contents pane stands on the left and every other pane on the right", () => {
  expect(sideOf("contents")).toBe("left");
  expect(sideOf("catalog")).toBe("right");
  expect(sideOf("search-products")).toBe("right");
});

test("a side without a pane has no pane in front", () => {
  expect(panesOf(dockStore.get(), "right")).toEqual([]);
  expect(frontOf(dockStore.get(), "right")).toBeNull();
});

test("a pane that appears comes to the front of its side and leaves the other side as it is", () => {
  enterDock({ id: "contents", title: "Contents" });
  enterDock({ id: "catalog", title: "Catalog" });
  enterDock({ id: "search-products", title: "Search products" });
  expect(panesOf(dockStore.get(), "right").map(({ id }) => id)).toEqual(["catalog", "search-products"]);
  expect(frontOf(dockStore.get(), "right")).toBe("search-products");
  expect(frontOf(dockStore.get(), "left")).toBe("contents");
});

test("a pane that appears again keeps its place and takes its new title", () => {
  enterDock({ id: "catalog", title: "Catalog" });
  enterDock({ id: "get-layer", title: "Get layer" });
  enterDock({ id: "catalog", title: "Catalog (12)" });
  expect(panesOf(dockStore.get(), "right")).toEqual([
    { id: "catalog", title: "Catalog (12)" },
    { id: "get-layer", title: "Get layer" },
  ]);
  expect(frontOf(dockStore.get(), "right")).toBe("catalog");
});

test("a pane is brought to the front, and a pane that is not shown cannot hide the others", () => {
  enterDock({ id: "catalog", title: "Catalog" });
  enterDock({ id: "get-layer", title: "Get layer" });
  showPane("catalog");
  expect(frontOf(dockStore.get(), "right")).toBe("catalog");
  showPane("sign-in");
  expect(frontOf(dockStore.get(), "right")).toBe("get-layer");
});

test("when the pane in front leaves, the pane before it comes to the front", () => {
  enterDock({ id: "catalog", title: "Catalog" });
  enterDock({ id: "search-products", title: "Search products" });
  enterDock({ id: "get-layer", title: "Get layer" });
  leaveDock("get-layer");
  expect(frontOf(dockStore.get(), "right")).toBe("search-products");
  showPane("catalog");
  leaveDock("catalog");
  expect(frontOf(dockStore.get(), "right")).toBe("search-products");
  leaveDock("search-products");
  expect(frontOf(dockStore.get(), "right")).toBeNull();
});

test("a pane behind the front one leaves without changing the front", () => {
  enterDock({ id: "catalog", title: "Catalog" });
  enterDock({ id: "get-layer", title: "Get layer" });
  leaveDock("catalog");
  leaveDock("catalog");
  expect(frontOf(dockStore.get(), "right")).toBe("get-layer");
});

test("a tool pane is opened once, asks for the keyboard focus each time, and is closed", () => {
  openToolPane("search-products");
  const first = dockStore.get().focus;
  openToolPane("search-products");
  expect(dockStore.get().tools).toEqual(["search-products"]);
  expect(dockStore.get().focus).toEqual({ id: "search-products" });
  expect(dockStore.get().focus).not.toBe(first);
  closeToolPane("search-products");
  closeToolPane("search-products");
  expect(dockStore.get().tools).toEqual([]);
});

test("a pane that hides automatically leaves the stack, and the other panes of its side stay in it", () => {
  enterDock({ id: "contents", title: "Contents" });
  enterDock({ id: "catalog", title: "Catalog" });
  enterDock({ id: "get-layer", title: "Get layer" });
  setAutoHide("get-layer", true);
  const state = dockStore.get();
  expect(stackOf(state, "right").map(({ id }) => id)).toEqual(["catalog"]);
  expect(hiddenOf(state, "right").map(({ id }) => id)).toEqual(["get-layer"]);
  expect(frontOf(state, "right")).toBe("catalog");
  expect(revealedOf(state, "right")).toBeNull();
  expect(isShown(state, "get-layer")).toBe(false);
  expect(isShown(state, "catalog")).toBe(true);
  expect(isShown(state, "contents")).toBe(true);
});

test("the tab of a pane that hides automatically shows the pane, and hides the pane that shows", () => {
  enterDock({ id: "catalog", title: "Catalog" });
  enterDock({ id: "get-layer", title: "Get layer" });
  setAutoHide("catalog", true);
  setAutoHide("get-layer", true);
  togglePane("get-layer");
  expect(revealedOf(dockStore.get(), "right")).toBe("get-layer");
  togglePane("catalog");
  expect(revealedOf(dockStore.get(), "right")).toBe("catalog");
  togglePane("catalog");
  expect(revealedOf(dockStore.get(), "right")).toBeNull();
  showPane("get-layer");
  expect(isShown(dockStore.get(), "get-layer")).toBe(true);
  concealPanes("right");
  expect(isShown(dockStore.get(), "get-layer")).toBe(false);
});

test("a new tool pane opens in the stack and hides the pane that shows over it", () => {
  enterDock({ id: "catalog", title: "Catalog" });
  setAutoHide("catalog", true);
  showPane("catalog");
  openToolPane("search-products");
  enterDock({ id: "search-products", title: "Search products" });
  const state = dockStore.get();
  expect(isHidden(state, "search-products")).toBe(false);
  expect(frontOf(state, "right")).toBe("search-products");
  expect(revealedOf(state, "right")).toBeNull();
  expect(hiddenOf(state, "right").map(({ id }) => id)).toEqual(["catalog"]);
});

test("a pane keeps hiding automatically while it is closed, and the pin returns it to the front of the stack", () => {
  enterDock({ id: "catalog", title: "Catalog" });
  openToolPane("get-layer");
  enterDock({ id: "get-layer", title: "Get layer" });
  setAutoHide("get-layer", true);
  closeToolPane("get-layer");
  leaveDock("get-layer");
  expect(frontOf(dockStore.get(), "right")).toBe("catalog");
  openToolPane("get-layer");
  enterDock({ id: "get-layer", title: "Get layer" });
  expect(revealedOf(dockStore.get(), "right")).toBe("get-layer");
  expect(frontOf(dockStore.get(), "right")).toBe("catalog");
  setAutoHide("get-layer", false);
  expect(frontOf(dockStore.get(), "right")).toBe("get-layer");
  expect(revealedOf(dockStore.get(), "right")).toBeNull();
  setAutoHide("catalog", true);
  pinAllPanes();
  expect(dockStore.get().hidden).toEqual([]);
});
