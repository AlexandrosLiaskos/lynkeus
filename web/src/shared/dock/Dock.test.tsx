// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { PANE_WIDTH, panesStore, resetPanes } from "../panes";
import { useStore } from "../store";
import { Dock } from "./Dock";
import { dockStore, frontOf, isHidden, openToolPane, resetDock, setAutoHide, showPane } from "./dock";
import { DockPane } from "./DockPane";

beforeEach(() => {
  resetDock();
  resetPanes();
});

/** A pane with a field, whose text shows whether the pane kept its state. */
function Notes({ id, title, onClose = vi.fn() }: { id: string; title: string; onClose?: () => void }) {
  const [text, setText] = useState("");
  return (
    <DockPane id={id} title={title} onClose={onClose}>
      <input aria-label={`Notes of ${title}`} value={text} onChange={(event) => setText(event.target.value)} />
    </DockPane>
  );
}

test("a side without a pane shows no tabs and no edge", () => {
  render(<Dock side="right">{null}</Dock>);
  expect(screen.queryByRole("tablist")).toBeNull();
  expect(screen.queryByRole("separator")).toBeNull();
});

test("a side with one pane shows the pane and the edge, without tabs", () => {
  render(
    <Dock side="right">
      <Notes id="catalog" title="Catalog" />
    </Dock>,
  );
  expect(screen.getByRole("complementary", { name: "Catalog" })).toBeDefined();
  expect(screen.getByRole("separator", { name: "Width of the panes on the right of the map" })).toBeDefined();
  expect(screen.queryByRole("tablist")).toBeNull();
});

test("stacked panes have a tab each, and the pane that appeared last is in front", () => {
  render(
    <Dock side="right">
      <Notes id="catalog" title="Catalog" />
      <Notes id="search-products" title="Search products" />
    </Dock>,
  );
  const tabs = screen.getAllByRole("tab");
  expect(tabs.map((tab) => tab.textContent)).toEqual(["Catalog", "Search products"]);
  expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "true"]);
  expect(screen.getByRole("tabpanel", { name: "Search products" })).toBeDefined();
  expect(screen.queryByRole("complementary", { name: "Catalog" })).toBeNull();
});

test("a click on a tab brings its pane to the front, and the other pane keeps what was typed in it", async () => {
  render(
    <Dock side="right">
      <Notes id="catalog" title="Catalog" />
      <Notes id="search-products" title="Search products" />
    </Dock>,
  );
  await userEvent.type(screen.getByRole("textbox", { name: "Notes of Search products" }), "GCOV");
  await userEvent.click(screen.getByRole("tab", { name: "Catalog" }));
  expect(screen.getByRole("complementary", { name: "Catalog" })).toBeDefined();
  expect(screen.queryByRole("complementary", { name: "Search products" })).toBeNull();
  await userEvent.click(screen.getByRole("tab", { name: "Search products" }));
  expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Notes of Search products" }).value).toBe("GCOV");
});

test("the arrow keys, Home and End move between the tabs and bring each pane to the front", async () => {
  render(
    <Dock side="right">
      <Notes id="catalog" title="Catalog" />
      <Notes id="search-products" title="Search products" />
      <Notes id="get-layer" title="Get layer" />
    </Dock>,
  );
  screen.getByRole("tab", { name: "Get layer" }).focus();
  await userEvent.keyboard("{ArrowRight}");
  expect(frontOf(dockStore.get(), "right")).toBe("catalog");
  expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Catalog" }));
  await userEvent.keyboard("{ArrowLeft}");
  expect(frontOf(dockStore.get(), "right")).toBe("get-layer");
  await userEvent.keyboard("{Home}");
  expect(frontOf(dockStore.get(), "right")).toBe("catalog");
  await userEvent.keyboard("{End}");
  expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Get layer" }));
  expect(screen.getByRole("tab", { name: "Get layer" }).tabIndex).toBe(0);
  expect(screen.getByRole("tab", { name: "Catalog" }).tabIndex).toBe(-1);
});

test("when a pane leaves the stack, its tab leaves and the pane before it comes to the front", () => {
  const { rerender } = render(
    <Dock side="right">
      <Notes key="catalog" id="catalog" title="Catalog" />
      <Notes key="get-layer" id="get-layer" title="Get layer" />
    </Dock>,
  );
  rerender(
    <Dock side="right">
      <Notes key="catalog" id="catalog" title="Catalog" />
    </Dock>,
  );
  expect(screen.queryByRole("tablist")).toBeNull();
  expect(screen.getByRole("complementary", { name: "Catalog" })).toBeDefined();
});

test("each side has its own stack", () => {
  render(
    <>
      <Dock side="left">
        <Notes id="contents" title="Contents" />
      </Dock>
      <Dock side="right">
        <Notes id="catalog" title="Catalog" />
      </Dock>
    </>,
  );
  expect(screen.getByRole("complementary", { name: "Contents" })).toBeDefined();
  expect(screen.getByRole("complementary", { name: "Catalog" })).toBeDefined();
  expect(screen.queryByRole("tablist")).toBeNull();
  expect(screen.getAllByRole("separator")).toHaveLength(2);
});

test("the arrow keys on the edge change the width of the side, and the edge states it", async () => {
  const { container } = render(
    <Dock side="left">
      <Notes id="contents" title="Contents" />
    </Dock>,
  );
  const dock = container.firstElementChild as HTMLElement;
  const edge = screen.getByRole("separator", { name: "Width of the panes on the left of the map" });
  expect(dock.style.getPropertyValue("--dock-width")).toBe(`${String(PANE_WIDTH.first)}px`);
  expect(edge.getAttribute("aria-valuenow")).toBe(String(PANE_WIDTH.first));
  edge.focus();
  await userEvent.keyboard("{ArrowRight}{ArrowRight}");
  expect(panesStore.get().contents.width).toBe(PANE_WIDTH.first + 2 * PANE_WIDTH.step);
  expect(edge.getAttribute("aria-valuenow")).toBe(String(PANE_WIDTH.first + 2 * PANE_WIDTH.step));
  expect(dock.style.getPropertyValue("--dock-width")).toBe(`${String(PANE_WIDTH.first + 2 * PANE_WIDTH.step)}px`);
  await userEvent.keyboard("{Home}");
  expect(panesStore.get().contents.width).toBe(PANE_WIDTH.smallest);
});

test("the tool panes share the width of the right side with the Catalog pane", async () => {
  render(
    <Dock side="right">
      <Notes id="get-layer" title="Get layer" />
    </Dock>,
  );
  screen.getByRole("separator").focus();
  await userEvent.keyboard("{ArrowLeft}");
  expect(panesStore.get().catalog.width).toBe(PANE_WIDTH.first + PANE_WIDTH.step);
});

test("the Escape key in a pane moves the keyboard focus to the map and leaves the pane open", async () => {
  const onClose = vi.fn();
  render(
    <>
      <main tabIndex={0} aria-label="Map" />
      <Dock side="right">
        <Notes id="get-layer" title="Get layer" onClose={onClose} />
      </Dock>
    </>,
  );
  screen.getByRole("textbox").focus();
  await userEvent.keyboard("{Escape}");
  expect(document.activeElement).toBe(screen.getByRole("main"));
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole("complementary", { name: "Get layer" })).toBeDefined();
});

test("Shift with Escape and the close button ask to close the pane", async () => {
  const onClose = vi.fn();
  render(
    <Dock side="right">
      <Notes id="get-layer" title="Get layer" onClose={onClose} />
    </Dock>,
  );
  screen.getByRole("textbox").focus();
  await userEvent.keyboard("{Shift>}{Escape}{/Shift}");
  expect(onClose).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole("button", { name: "Close the Get layer pane" }));
  expect(onClose).toHaveBeenCalledTimes(2);
});

test("a pane brought to the front by another part of the page is shown", () => {
  render(
    <Dock side="right">
      <Notes id="catalog" title="Catalog" />
      <Notes id="get-layer" title="Get layer" />
    </Dock>,
  );
  act(() => showPane("catalog"));
  expect(screen.getByRole("tab", { name: "Catalog" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("complementary", { name: "Catalog" })).toBeDefined();
});

test("the pin hides its pane into a tab at the edge, the other panes stay in the stack, and the tab shows the pane", async () => {
  render(
    <Dock side="right" icons={{ catalog: "folder" }}>
      <Notes id="catalog" title="Catalog" />
      <Notes id="search-products" title="Search products" />
      <Notes id="get-layer" title="Get layer" />
    </Dock>,
  );
  await userEvent.type(screen.getByRole("textbox", { name: "Notes of Get layer" }), "GCOV");
  await userEvent.click(screen.getByRole("button", { name: "Auto-hide the Get layer pane" }));
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Catalog", "Search products"]);
  expect(screen.getByRole("tabpanel", { name: "Search products" })).toBeDefined();
  expect(screen.queryByRole("complementary", { name: "Get layer" })).toBeNull();
  const strip = within(screen.getByRole("group", { name: "Hidden panes on the right of the map" }));
  const tab = strip.getByRole("button", { name: "Get layer" });
  expect(strip.getAllByRole("button")).toHaveLength(1);
  expect(tab.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(tab);
  await userEvent.click(tab);
  expect(tab.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("complementary", { name: "Get layer" })).toBeDefined();
  expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Notes of Get layer" }).value).toBe("GCOV");
  expect(screen.getAllByRole("tab")).toHaveLength(2);
  await userEvent.click(tab);
  expect(screen.queryByRole("complementary", { name: "Get layer" })).toBeNull();
});

test("a pane that shows from its tab stays for work in the ribbon and in the other side, and hides for a press in the map", async () => {
  render(
    <>
      <button type="button">Data</button>
      <Dock side="left">
        <Notes id="contents" title="Contents" />
      </Dock>
      <div className="workspace-map">
        <main tabIndex={0} aria-label="Map" />
      </div>
      <Dock side="right">
        <Notes id="catalog" title="Catalog" />
      </Dock>
    </>,
  );
  act(() => {
    setAutoHide("contents", true);
    setAutoHide("catalog", true);
  });
  expect(screen.queryByRole("separator")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Contents" }));
  await userEvent.click(screen.getByRole("button", { name: "Catalog" }));
  await userEvent.click(screen.getByRole("textbox", { name: "Notes of Contents" }));
  await userEvent.click(screen.getByRole("button", { name: "Data" }));
  expect(screen.getByRole("complementary", { name: "Contents" })).toBeDefined();
  expect(screen.getByRole("complementary", { name: "Catalog" })).toBeDefined();
  expect(screen.getAllByRole("separator")).toHaveLength(2);
  await userEvent.click(screen.getByRole("main"));
  expect(screen.queryByRole("complementary")).toBeNull();
});

test("the pin of a pane that shows from its tab returns the pane to the front of the stack", async () => {
  render(
    <Dock side="right">
      <Notes id="catalog" title="Catalog" />
      <Notes id="get-layer" title="Get layer" />
    </Dock>,
  );
  act(() => setAutoHide("catalog", true));
  expect(screen.queryByRole("tablist")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Catalog" }));
  await userEvent.click(screen.getByRole("button", { name: "Pin the Catalog pane" }));
  expect(isHidden(dockStore.get(), "catalog")).toBe(false);
  expect(screen.queryByRole("group")).toBeNull();
  expect(screen.getByRole("tab", { name: "Catalog" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("tabpanel", { name: "Catalog" })).toBeDefined();
});

/** A tool pane, which is drawn only while it is open. */
function Tool() {
  const open = useStore(dockStore).tools.includes("get-layer");
  return open ? <Notes id="get-layer" title="Get layer" /> : null;
}

test("a tool pane that is opened shows in the stack, and the pane that showed from its tab hides", async () => {
  render(
    <Dock side="right">
      <Notes id="catalog" title="Catalog" />
      <Tool />
    </Dock>,
  );
  act(() => setAutoHide("catalog", true));
  await userEvent.click(screen.getByRole("button", { name: "Catalog" }));
  expect(screen.getByRole("complementary", { name: "Catalog" })).toBeDefined();
  act(() => openToolPane("get-layer"));
  expect(screen.getByRole("complementary", { name: "Get layer" })).toBeDefined();
  expect(screen.queryByRole("complementary", { name: "Catalog" })).toBeNull();
  expect(within(screen.getByRole("group")).getAllByRole("button")).toHaveLength(1);
});

test("a pane that showed from its tab and is closed no longer shows", async () => {
  const onClose = vi.fn();
  render(
    <Dock side="right">
      <Notes id="catalog" title="Catalog" />
      <Notes id="get-layer" title="Get layer" onClose={onClose} />
    </Dock>,
  );
  act(() => setAutoHide("get-layer", true));
  await userEvent.click(screen.getByRole("button", { name: "Get layer" }));
  await userEvent.click(screen.getByRole("button", { name: "Close the Get layer pane" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(dockStore.get().revealed.right).toBeNull();
});
