import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OlMap from "ol/Map";
import View from "ol/View";
import VectorLayer from "ol/layer/Vector";
import { beforeEach, expect, test } from "vitest";
import { selectedLayerStore } from "../contents/state";
import { dockStore, openToolPane, resetDock } from "../shared/dock/dock";
import { MapContext } from "../shared/map";
import { mapLayersStore } from "../shared/mapLayers";
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
  expect(screen.getByText(/below the layer Backscatter HH, 21 Oct 2026,/)).toBeDefined();
  await userEvent.click(screen.getByLabelText("Level, moved up and down"));
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
