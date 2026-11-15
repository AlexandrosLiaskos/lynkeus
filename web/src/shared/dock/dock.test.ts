import { beforeEach, expect, test } from "vitest";
import {
  closeToolPane,
  concealPanes,
  dockStore,
  enterDock,
  frontOf,
  leaveDock,
  openToolPane,
  panesOf,
  resetDock,
  setAutoHide,
  showPane,
  shownOf,
  sideOf,
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

test("a side that hides its panes shows none of them until one is asked for", () => {
  enterDock({ id: "contents", title: "Contents" });
  enterDock({ id: "catalog", title: "Catalog" });
  enterDock({ id: "get-layer", title: "Get layer" });
  expect(shownOf(dockStore.get(), "right")).toBe("get-layer");
  setAutoHide("right", true);
  expect(shownOf(dockStore.get(), "right")).toBeNull();
  expect(frontOf(dockStore.get(), "right")).toBe("get-layer");
  expect(shownOf(dockStore.get(), "left")).toBe("contents");
  showPane("catalog");
  expect(shownOf(dockStore.get(), "right")).toBe("catalog");
  concealPanes("right");
  expect(shownOf(dockStore.get(), "right")).toBeNull();
});

test("the tab of a hidden pane shows its pane, and hides the pane that shows", () => {
  enterDock({ id: "catalog", title: "Catalog" });
  enterDock({ id: "get-layer", title: "Get layer" });
  setAutoHide("right", true);
  togglePane("get-layer");
  expect(shownOf(dockStore.get(), "right")).toBe("get-layer");
  togglePane("catalog");
  expect(shownOf(dockStore.get(), "right")).toBe("catalog");
  togglePane("catalog");
  expect(shownOf(dockStore.get(), "right")).toBeNull();
});

test("a tool pane that is opened on a side that hides its panes shows, and a side that is pinned again shows its front pane", () => {
  enterDock({ id: "catalog", title: "Catalog" });
  setAutoHide("right", true);
  openToolPane("search-products");
  enterDock({ id: "search-products", title: "Search products" });
  expect(shownOf(dockStore.get(), "right")).toBe("search-products");
  setAutoHide("right", true);
  expect(shownOf(dockStore.get(), "right")).toBeNull();
  setAutoHide("right", false);
  expect(shownOf(dockStore.get(), "right")).toBe("search-products");
});
