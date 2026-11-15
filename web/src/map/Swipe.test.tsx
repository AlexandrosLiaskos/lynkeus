// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OlMap from "ol/Map";
import View from "ol/View";
import VectorLayer from "ol/layer/Vector";
import { beforeEach, expect, test } from "vitest";
import { selectedLayerStore } from "../contents/state";
import { dockStore, openToolPane, resetDock } from "../shared/dock/dock";
import { MapContext } from "../shared/map";
import { mapLayersStore } from "../shared/mapLayers";
import { panesStore, resetPanes, setPaneOpen } from "../shared/panes";
import { swipeStore } from "./swipe";
import { SwipeOnMap } from "./SwipeOnMap";
import { SwipePane } from "./SwipePane";
import { testLayer } from "./testLayer";

function start() {
  const map = new OlMap({ view: new View({ center: [0, 0], zoom: 5 }) });
  map.setSize([800, 600]);
  // The Contents pane draws each layer of the store under its id.
  const layer = new VectorLayer({ properties: { id: "october" } });
  map.addLayer(layer);
  render(
    <MapContext value={map}>
      <SwipeOnMap />
      <SwipePane />
    </MapContext>,
  );
  // The line stands inside the map, which the simulated browser does not put on the page.
  const line = () => map.getOverlayContainerStopEvent()?.querySelector<HTMLElement>("[role=slider]") ?? null;
  return { layer, line };
}

beforeEach(() => {
  mapLayersStore.set([testLayer("october", "Backscatter HH, 21 Oct 2026")]);
  selectedLayerStore.set("october");
  swipeStore.set({ on: false, line: "upright", share: 50 });
  resetDock();
  resetPanes();
});

test("while the swipe is on, the selected layer is cut and a line stands on the map as a slider", () => {
  const { layer, line } = start();
  expect(line()).toBeNull();
  expect(layer.hasListener("prerender")).toBe(false);
  act(() => swipeStore.set({ ...swipeStore.get(), on: true }));
  expect(layer.hasListener("prerender")).toBe(true);
  expect(line()?.getAttribute("aria-label")).toBe("Swipe line of Backscatter HH, 21 Oct 2026");
  expect(line()?.getAttribute("aria-orientation")).toBe("horizontal");
  expect(line()?.getAttribute("aria-valuenow")).toBe("50");
  expect(line()?.getAttribute("aria-valuetext")).toBe(
    "Backscatter HH, 21 Oct 2026 covers 50 percent of the map, from the left",
  );
  expect(line()?.style.left).toBe("50%");
  act(() => swipeStore.set({ ...swipeStore.get(), on: false }));
  expect(line()).toBeNull();
  expect(layer.hasListener("prerender")).toBe(false);
});

test("the keys of a slider move the line", () => {
  const { line } = start();
  act(() => swipeStore.set({ ...swipeStore.get(), on: true }));
  const slider = line();
  if (!slider) {
    throw new Error("the line is not on the map");
  }
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  fireEvent.keyDown(slider, { key: "PageUp" });
  expect(swipeStore.get().share).toBe(61);
  expect(line()?.getAttribute("aria-valuenow")).toBe("61");
  fireEvent.keyDown(slider, { key: "Home" });
  expect(swipeStore.get().share).toBe(0);
});

test("without a selected layer there is no line", () => {
  const { layer, line } = start();
  selectedLayerStore.set(null);
  act(() => swipeStore.set({ ...swipeStore.get(), on: true }));
  expect(line()).toBeNull();
  expect(layer.hasListener("prerender")).toBe(false);
});

test("the pane names the layer, turns the line and ends the swipe", async () => {
  const { line } = start();
  act(() => {
    swipeStore.set({ ...swipeStore.get(), on: true });
    openToolPane("swipe");
  });
  expect(within(screen.getByRole("group", { name: "Layer" })).getByText("Backscatter HH, 21 Oct 2026")).toBeDefined();
  await userEvent.click(screen.getByLabelText("Horizontal, moved up and down"));
  expect(swipeStore.get().line).toBe("level");
  expect(line()?.getAttribute("aria-orientation")).toBe("vertical");
  expect(line()?.style.top).toBe("50%");
  act(() => swipeStore.set({ ...swipeStore.get(), share: 25 }));
  // A level line stands 25 percent of the height above the bottom edge.
  expect(line()?.style.top).toBe("75%");
  expect(line()?.getAttribute("aria-valuetext")).toBe(
    "Backscatter HH, 21 Oct 2026 covers 25 percent of the map, from the bottom",
  );
  await userEvent.click(screen.getByRole("button", { name: "End swipe" }));
  expect(swipeStore.get().on).toBe(false);
  expect(dockStore.get().tools).toEqual([]);
});

test("without a selected layer the pane says how to select one and shows the Contents pane", async () => {
  start();
  act(() => {
    selectedLayerStore.set(null);
    setPaneOpen("contents", false);
    openToolPane("swipe");
  });
  const layer = screen.getByRole("group", { name: "Layer" });
  expect(within(layer).getByText("No layer selected")).toBeDefined();
  expect(within(layer).getByText("Select the layer to swipe in the Contents pane.")).toBeDefined();
  await userEvent.click(within(layer).getByRole("button", { name: "Show Contents pane" }));
  expect(panesStore.get().contents.open).toBe(true);
  expect(dockStore.get().front.left).toBe("contents");
  // The direction of the line can still be chosen.
  expect(screen.getByLabelText("Vertical, moved left and right")).toBeDefined();
});

/** Return the explanation that describes an element. */
function explanation(element: HTMLElement): string | undefined {
  return document.getElementById(element.getAttribute("aria-describedby") ?? "")?.textContent;
}

test("the layer and the line are described by their explanations, and no text stands under a title", () => {
  start();
  act(() => openToolPane("swipe"));
  expect(explanation(screen.getByRole("group", { name: "Layer" }))).toMatch(
    /^The layer that is selected in the Contents pane\. The line uncovers what lies below this layer/,
  );
  expect(explanation(screen.getByRole("group", { name: "Line" }))).toMatch(
    /^The layer is drawn on the left of a vertical line and under a horizontal line\. .* the Home and End keys to the edges\.$/,
  );
  expect(screen.getByRole("button", { name: "Information about Layer" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Information about Line" })).toBeDefined();
  expect(document.querySelector(".usa-hint")).toBeNull();
});
