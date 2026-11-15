// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { Dock } from "../dock/Dock";
import { dockStore, frontOf, resetDock } from "../dock/dock";
import { DockPane } from "../dock/DockPane";
import { panesStore, resetPanes, setPaneOpen } from "../panes";
import { Pane } from "./Pane";

beforeEach(() => {
  resetDock();
  resetPanes();
});

test("an open pane shows its title and its content", () => {
  render(
    <Pane id="contents" title="Contents">
      Layers
    </Pane>,
  );
  const pane = screen.getByRole("complementary", { name: "Contents" });
  expect(screen.getByRole("heading", { name: "Contents" })).toBeDefined();
  expect(pane.textContent).toContain("Layers");
});

test("a closed pane is not shown", () => {
  setPaneOpen("contents", false);
  render(
    <Pane id="contents" title="Contents">
      Layers
    </Pane>,
  );
  expect(screen.queryByRole("complementary")).toBeNull();
});

test("the close button closes the pane", async () => {
  render(
    <Pane id="catalog" title="Catalog">
      Items
    </Pane>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Close the Catalog pane" }));
  expect(panesStore.get().catalog.open).toBe(false);
  expect(screen.queryByRole("complementary")).toBeNull();
});

test("a pane that closes with the keyboard focus inside it passes the focus to the map", async () => {
  render(
    <>
      <main tabIndex={0} aria-label="Map" />
      <Pane id="catalog" title="Catalog">
        Items
      </Pane>
    </>,
  );
  screen.getByRole("button", { name: "Close the Catalog pane" }).focus();
  await userEvent.keyboard("{Enter}");
  expect(screen.queryByRole("complementary")).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("main"));
});

test("a pane that is opened again comes to the front of its side", () => {
  render(
    <Dock side="right">
      <Pane id="catalog" title="Catalog">
        Items
      </Pane>
      <DockPane id="get-layer" title="Get layer" onClose={vi.fn()}>
        Form
      </DockPane>
    </Dock>,
  );
  expect(frontOf(dockStore.get(), "right")).toBe("get-layer");
  act(() => setPaneOpen("catalog", true));
  expect(frontOf(dockStore.get(), "right")).toBe("catalog");
  expect(screen.getByRole("complementary", { name: "Catalog" })).toBeDefined();
});
