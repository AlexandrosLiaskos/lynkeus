// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { selectedLayerStore, symbologyStore } from "../contents/state";
import { layersStore } from "../data/layers";
import { resetSession, sessionStore } from "../data/session";
import { productsStore, type Results } from "../data/state";
import { TABS } from "../ribbon/tabs";
import { dockStore, openToolPane, resetDock } from "../shared/dock/dock";
import type { LayerDescription } from "../shared/layer";
import { mapLayersStore } from "../shared/mapLayers";
import { messagesStore } from "../shared/messages/messages";
import { GettingStartedPane, NO_LAYER_ON_MAP, STEPS } from "./GettingStarted";
import { GETTING_STARTED_PANE } from "./state";

/** A layer with the given name. */
function layer(id: string): LayerDescription {
  return {
    id,
    title: `Layer ${id}`,
    kind: "layer",
    url: `/files/${id}.tif`,
    quantity: "Radar backscatter",
    unit: "dB",
    range: [-25, 0],
    colours: "grey",
    dates: ["2026-10-20"],
    inputs: ["product-file.h5"],
    program: "Lynkeus 0.1.0",
    method: null,
    record: `/files/${id}.json`,
  };
}

/** The answer of a search that found one product. The pane reads only how many products it holds. */
const FOUND = { found: 1, products: [{}] } as unknown as Results;

beforeEach(() => {
  resetDock();
  resetSession();
  productsStore.set(null);
  layersStore.set([]);
  mapLayersStore.set([]);
  selectedLayerStore.set(null);
  symbologyStore.set(null);
  messagesStore.set([]);
});

/** Open the pane and return it. */
function open(): HTMLElement {
  render(<GettingStartedPane />);
  act(() => openToolPane(GETTING_STARTED_PANE));
  return screen.getByRole("complementary", { name: "Getting started" });
}

/** For each step, whether it carries the check mark. */
function marks(pane: HTMLElement): boolean[] {
  return within(pane)
    .getAllByRole("listitem")
    .map((step) => within(step).queryByRole("img", { name: "Done" }) !== null);
}

/** The labels of the filled buttons of the pane. */
function filled(pane: HTMLElement): (string | null)[] {
  return Array.from(
    pane.querySelectorAll("button.usa-button:not(.usa-button--outline, .usa-button--unstyled)"),
    (button) => button.textContent,
  );
}

test("the pane is not drawn until it is opened", () => {
  render(<GettingStartedPane />);
  expect(screen.queryByRole("complementary")).toBeNull();
  expect(dockStore.get().tools).toEqual([]);
});

test("the pane lists the five steps in order, each with its name, one sentence and its commands", () => {
  const pane = open();
  const steps = within(pane).getAllByRole("listitem");
  expect(
    steps.map((step) => [
      within(step).getByRole("heading", { level: 3 }).textContent,
      within(step)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ]),
  ).toEqual([
    ["Sign in to Earthdata", ["Sign in"]],
    ["Search products", ["Search products"]],
    ["Get layer", ["Get layer"]],
    ["Display the layer", ["Open Symbology"]],
    ["Share", ["Save map image", "Save record", "Copy citation"]],
  ]);
  for (const { text } of STEPS) {
    expect(text.endsWith(".")).toBe(true);
    // One sentence: the only full stop is the last character.
    expect(text.indexOf(".")).toBe(text.length - 1);
    expect(within(pane).getByText(text)).toBeDefined();
  }
});

test("at first no step carries a check mark, and the first step has the one filled button", () => {
  const pane = open();
  expect(marks(pane)).toEqual([false, false, false, false, false]);
  expect(filled(pane)).toEqual(["Sign in"]);
  expect(
    within(pane)
      .getAllByRole("listitem")
      .map((step) => step.getAttribute("aria-current")),
  ).toEqual(["step", null, null, null, null]);
});

test("a step whose result exists carries a check mark, and the filled button moves to the first step without one", () => {
  const pane = open();
  act(() => sessionStore.set({ state: "signed-in", user: "ada" }));
  expect(marks(pane)).toEqual([true, false, false, false, false]);
  expect(filled(pane)).toEqual(["Search products"]);
  act(() => productsStore.set(FOUND));
  expect(marks(pane)).toEqual([true, true, false, false, false]);
  expect(filled(pane)).toEqual(["Get layer"]);
  act(() => layersStore.set([{ layer: layer("a"), size: null, created: null, server: null }]));
  expect(marks(pane)).toEqual([true, true, true, false, false]);
  expect(filled(pane)).toEqual(["Open Symbology"]);
  act(() => mapLayersStore.set([layer("a")]));
  expect(marks(pane)).toEqual([true, true, true, true, false]);
  expect(filled(pane)).toEqual(["Save map image"]);
});

test("the check marks follow the stores: a sign-out and a cleared search take them away", () => {
  const pane = open();
  act(() => {
    sessionStore.set({ state: "signed-in", user: "ada" });
    productsStore.set(FOUND);
  });
  expect(marks(pane).slice(0, 2)).toEqual([true, true]);
  act(() => {
    sessionStore.set({ state: "signed-out" });
    productsStore.set(null);
  });
  expect(marks(pane).slice(0, 2)).toEqual([false, false]);
  expect(filled(pane)).toEqual(["Sign in"]);
});

test("a search that found nothing and a step done out of order leave the filled button on the first open step", () => {
  const pane = open();
  act(() => {
    productsStore.set({ found: 0, products: [] } as unknown as Results);
    layersStore.set([{ layer: layer("a"), size: null, created: null, server: null }]);
  });
  expect(marks(pane)).toEqual([false, false, true, false, false]);
  expect(filled(pane)).toEqual(["Sign in"]);
});

test("the button of each step opens the tool pane of a ribbon button", async () => {
  const pane = open();
  const ribbon = TABS.flatMap(({ groups }) => groups.flatMap(({ tools }) => tools.map(({ id }) => id)));
  const opened: Record<string, string> = {
    "Sign in": "sign-in",
    "Search products": "search-products",
    "Get layer": "get-layer",
    "Save map image": "export-map-image",
    "Save record": "export-record",
    "Copy citation": "citation",
  };
  for (const [label, id] of Object.entries(opened)) {
    expect(ribbon).toContain(id);
    await userEvent.click(within(pane).getByRole("button", { name: label }));
    expect(dockStore.get().tools.at(-1)).toBe(id);
    expect(dockStore.get().front.right).toBe(id);
  }
  // The pane stays open behind the tools that it has opened.
  expect(dockStore.get().tools[0]).toBe(GETTING_STARTED_PANE);
  expect(messagesStore.get()).toEqual([]);
});

test("Open Symbology on a map without a layer says what to do first", async () => {
  const pane = open();
  await userEvent.click(within(pane).getByRole("button", { name: "Open Symbology" }));
  expect(messagesStore.get().map(({ kind, text }) => [kind, text])).toEqual([["warning", NO_LAYER_ON_MAP]]);
  expect(dockStore.get().tools).toEqual([GETTING_STARTED_PANE]);
  expect(symbologyStore.get()).toBeNull();
});

test("Open Symbology opens the pane for the selected layer, or for the top layer when none is selected", async () => {
  const pane = open();
  act(() => mapLayersStore.set([layer("bottom"), layer("top")]));
  await userEvent.click(within(pane).getByRole("button", { name: "Open Symbology" }));
  expect(symbologyStore.get()?.id).toBe("top");
  expect(dockStore.get().tools.at(-1)).toBe("symbology");
  act(() => selectedLayerStore.set("bottom"));
  await userEvent.click(within(pane).getByRole("button", { name: "Open Symbology" }));
  expect(symbologyStore.get()?.id).toBe("bottom");
  expect(messagesStore.get()).toEqual([]);
});

test("the close button closes the pane", async () => {
  const pane = open();
  await userEvent.click(within(pane).getByRole("button", { name: "Close the Getting started pane" }));
  expect(dockStore.get().tools).toEqual([]);
  expect(screen.queryByRole("complementary")).toBeNull();
});
