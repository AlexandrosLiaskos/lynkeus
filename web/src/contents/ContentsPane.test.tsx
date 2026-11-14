import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { baseMapStore } from "../map/baseMaps";
import { createMap } from "../map/map";
import type { LayerDescription } from "../shared/layer";
import { MapContext } from "../shared/map";
import { addToMap, mapLayersStore } from "../shared/mapLayers";
import { dockStore, resetDock } from "../shared/dock/dock";
import { resetPanes, setPaneOpen } from "../shared/panes";
import { listedBasemapStore } from "./BasemapItem";
import { ContentsPane } from "./ContentsPane";
import { layerProblemsStore } from "./drawing";
import {
  copiedDisplayStore,
  displayOf,
  displayStore,
  foldedStore,
  propertiesStore,
  selectedLayerStore,
  setDisplay,
  symbologyStore,
} from "./state";

// The drawing of the layers needs a real browser. Its own tests cover it.
vi.mock("./useLayerDrawing", () => ({ useLayerDrawing: () => undefined }));

function layer(id: string, title: string, dates: string[]): LayerDescription {
  return {
    id,
    title,
    kind: "layer",
    url: `/files/${id}/${id}.tif`,
    quantity: "Interferometric coherence magnitude, HH",
    unit: "1",
    range: [0, 1],
    colours: "grey",
    dates,
    inputs: ["NISAR_L2_PR_GUNW"],
    program: "Lynkeus 0.1.0",
    method: null,
    record: `/files/${id}/${id}.json`,
  };
}

const OCTOBER = layer("october", "Backscatter HH", ["2026-10-21"]);
const NOVEMBER = layer("november", "Backscatter HH", ["2026-11-02"]);
const COHERENCE = layer("coherence", "Coherence HH, 20 m", ["2026-10-09", "2026-10-21"]);

function show() {
  const map = createMap();
  render(
    <MapContext value={map}>
      <ContentsPane />
    </MapContext>,
  );
  return map;
}

/** The names of the layers as the pane lists them, with their dates. */
function listed(): (string | null)[] {
  const list = screen.getByRole("list", { name: "Layers, the top layer first" });
  return [...list.querySelectorAll(".contents-name")].map((name) => name.textContent);
}

const nameOf = (text: string) => screen.getByRole("button", { name: text });

beforeEach(() => {
  baseMapStore.set("blue-marble");
  listedBasemapStore.set("blue-marble");
  resetDock();
  resetPanes();
  setPaneOpen("contents", true);
  copiedDisplayStore.set(null);
  symbologyStore.set(null);
  propertiesStore.set(null);
  mapLayersStore.set([]);
  displayStore.set({});
  foldedStore.set([]);
  selectedLayerStore.set(null);
  layerProblemsStore.set({});
});

test("without layers the pane shows the map with its basemap as its only layer", () => {
  show();
  expect(screen.getByRole("button", { name: "Map" }).getAttribute("aria-expanded")).toBe("true");
  const layers = screen.getByRole("list", { name: "Layers, the top layer first" });
  expect(within(layers).getAllByRole("listitem")).toHaveLength(1);
  expect(within(layers).getByRole("checkbox", { name: "Show Blue Marble" })).toHaveProperty("checked", true);
  expect(screen.queryByText(/has no layers/)).toBeNull();
});

test("the row of the map folds and unfolds its layers", async () => {
  addToMap(COHERENCE);
  show();
  const map = screen.getByRole("button", { name: "Map" });
  await userEvent.click(map);
  expect(map.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("list", { name: "Layers, the top layer first" })).toBeNull();
  await userEvent.click(map);
  expect(screen.getByRole("list", { name: "Layers, the top layer first" })).toBeTruthy();
});

test("the basemap is listed under the other layers", () => {
  [OCTOBER, COHERENCE].forEach(addToMap);
  show();
  const items = within(screen.getByRole("list", { name: "Layers, the top layer first" })).getAllByRole("listitem");
  expect(items.map((item) => item.textContent)).toEqual([
    expect.stringContaining("Coherence HH, 20 m"),
    expect.stringContaining("Backscatter HH"),
    "Blue Marble",
  ]);
});

test("the layers are listed in drawing order, the top layer first, each with its dates", () => {
  [OCTOBER, NOVEMBER, COHERENCE].forEach(addToMap);
  show();
  expect(listed()).toEqual([
    "Coherence HH, 20 m 9 Oct 2026 and 21 Oct 2026",
    "Backscatter HH 2 Nov 2026",
    "Backscatter HH 21 Oct 2026",
  ]);
});

test("the box of a layer hides and shows it", async () => {
  addToMap(COHERENCE);
  show();
  const box = screen.getByRole("checkbox", { name: "Show Coherence HH, 20 m" });
  expect(box).toHaveProperty("checked", true);
  await userEvent.click(box);
  expect(displayOf(COHERENCE).visible).toBe(false);
  await userEvent.click(box);
  expect(displayOf(COHERENCE).visible).toBe(true);
});

test("a click on the name selects the layer, and a second click ends the selection", async () => {
  [OCTOBER, COHERENCE].forEach(addToMap);
  show();
  const name = nameOf("Coherence HH, 20 m 9 Oct 2026 and 21 Oct 2026");
  await userEvent.click(name);
  expect(selectedLayerStore.get()).toBe("coherence");
  expect(name.getAttribute("aria-pressed")).toBe("true");
  await userEvent.click(nameOf("Backscatter HH 21 Oct 2026"));
  expect(selectedLayerStore.get()).toBe("october");
  expect(name.getAttribute("aria-pressed")).toBe("false");
  await userEvent.click(nameOf("Backscatter HH 21 Oct 2026"));
  expect(selectedLayerStore.get()).toBeNull();
});

test("the legend of a layer shows under it and can be folded", async () => {
  addToMap(COHERENCE);
  show();
  expect(screen.getByRole("img", { name: "Colour scale grey, from 0 to 1" })).toBeTruthy();
  const fold = screen.getByRole("button", { name: "Legend of Coherence HH, 20 m" });
  expect(fold.getAttribute("aria-expanded")).toBe("true");
  await userEvent.click(fold);
  expect(fold.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("img", { name: "Colour scale grey, from 0 to 1" })).toBeNull();
});

test("the slider sets the opacity of the layer", () => {
  addToMap(COHERENCE);
  show();
  const slider = screen.getByRole("slider", { name: "Opacity" });
  fireEvent.change(slider, { target: { value: "40" } });
  expect(displayOf(COHERENCE).opacity).toBe(0.4);
  expect(slider.getAttribute("aria-valuetext")).toBe("40 percent");
  expect(screen.getByText("40 %")).toBeTruthy();
});

test("the menu of a layer opens with the keyboard, and the arrow keys move between its commands", async () => {
  [OCTOBER, COHERENCE].forEach(addToMap);
  show();
  const button = screen.getByRole("button", { name: "Commands of Coherence HH, 20 m" });
  expect(button.getAttribute("aria-haspopup")).toBe("menu");
  button.focus();
  await userEvent.keyboard("{Enter}");
  expect(button.getAttribute("aria-expanded")).toBe("true");
  const menu = screen.getByRole("menu", { name: "Commands of Coherence HH, 20 m" });
  const commands = within(menu).getAllByRole("menuitem");
  expect(commands.map((command) => command.textContent)).toEqual([
    "Zoom to layer",
    "Move up",
    "Move down",
    "Move to top",
    "Move to bottom",
    "Rename",
    "Remove",
    "Copy display",
    "Paste display",
    "Symbology",
    "Properties",
  ]);
  expect(document.activeElement).toBe(commands[0]);
  await userEvent.keyboard("{ArrowDown}");
  expect(document.activeElement).toBe(commands[1]);
  await userEvent.keyboard("{ArrowUp}{ArrowUp}");
  expect(document.activeElement).toBe(commands.at(-1));
  await userEvent.keyboard("{Home}");
  expect(document.activeElement).toBe(commands[0]);
  await userEvent.keyboard("{End}");
  expect(document.activeElement).toBe(commands.at(-1));
  await userEvent.keyboard("m");
  expect(document.activeElement).toBe(commands[1]);
  await userEvent.keyboard("m");
  expect(document.activeElement).toBe(commands[2]);
});

test("the Escape key closes the menu and returns the focus to the button that opened it", async () => {
  addToMap(COHERENCE);
  show();
  const button = screen.getByRole("button", { name: "Commands of Coherence HH, 20 m" });
  button.focus();
  await userEvent.keyboard("{ArrowUp}");
  expect(document.activeElement?.textContent).toBe("Properties");
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(button);
});

test("the commands of the top layer that cannot move it are inactive", async () => {
  [OCTOBER, COHERENCE].forEach(addToMap);
  show();
  await userEvent.click(screen.getByRole("button", { name: "Commands of Coherence HH, 20 m" }));
  const state = (name: string) => screen.getByRole("menuitem", { name }).getAttribute("aria-disabled");
  expect(state("Move up")).toBe("true");
  expect(state("Move to top")).toBe("true");
  expect(state("Move down")).toBe("false");
  await userEvent.click(screen.getByRole("menuitem", { name: "Move up" }));
  expect(screen.getByRole("menu")).toBeTruthy();
  expect(listed()[0]).toContain("Coherence");
});

test("a command of the menu moves the layer and states its new place", async () => {
  [OCTOBER, NOVEMBER, COHERENCE].forEach(addToMap);
  show();
  await userEvent.click(screen.getByRole("button", { name: "Commands of Coherence HH, 20 m" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Move to bottom" }));
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["coherence", "october", "november"]);
  expect(screen.queryByRole("menu")).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("Coherence HH, 20 m is at place 3 of 3.");
  expect(document.activeElement).toBe(nameOf("Coherence HH, 20 m 9 Oct 2026 and 21 Oct 2026"));
});

test("with the focus on the name, Alt and an arrow key move the layer", async () => {
  [OCTOBER, NOVEMBER, COHERENCE].forEach(addToMap);
  show();
  const name = nameOf("Coherence HH, 20 m 9 Oct 2026 and 21 Oct 2026");
  name.focus();
  await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["october", "coherence", "november"]);
  expect(screen.getByRole("status").textContent).toBe("Coherence HH, 20 m is at place 2 of 3.");
  expect(document.activeElement).toBe(nameOf("Coherence HH, 20 m 9 Oct 2026 and 21 Oct 2026"));
  await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["october", "november", "coherence"]);
});

test("the Remove command takes the layer off the map and moves the focus to the next layer", async () => {
  [OCTOBER, COHERENCE].forEach(addToMap);
  selectedLayerStore.set("coherence");
  show();
  await userEvent.click(screen.getByRole("button", { name: "Commands of Coherence HH, 20 m" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["october"]);
  expect(selectedLayerStore.get()).toBeNull();
  expect(document.activeElement).toBe(nameOf("Backscatter HH 21 Oct 2026"));
  expect(screen.getByRole("status").textContent).toBe("The layer was removed.");
});

test("the Delete key on the name removes the layer, and after the last layer the focus moves to the map", async () => {
  addToMap(COHERENCE);
  show();
  nameOf("Coherence HH, 20 m 9 Oct 2026 and 21 Oct 2026").focus();
  await userEvent.keyboard("{Delete}");
  expect(mapLayersStore.get()).toEqual([]);
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Map" }));
});

test("the F2 key on the name opens a field, and Enter gives the layer the name typed", async () => {
  [OCTOBER, COHERENCE].forEach(addToMap);
  show();
  nameOf("Coherence HH, 20 m 9 Oct 2026 and 21 Oct 2026").focus();
  await userEvent.keyboard("{F2}");
  const field = screen.getByRole("textbox", { name: "New name of Coherence HH, 20 m" });
  expect(document.activeElement).toBe(field);
  await userEvent.clear(field);
  await userEvent.type(field, "Coherence, October{Enter}");
  expect(mapLayersStore.get().find(({ id }) => id === "coherence")?.title).toBe("Coherence, October");
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(document.activeElement).toBe(nameOf("Coherence, October 9 Oct 2026 and 21 Oct 2026"));
});

test("the Rename command opens the same field, and Escape keeps the old name", async () => {
  addToMap(COHERENCE);
  show();
  await userEvent.click(screen.getByRole("button", { name: "Commands of Coherence HH, 20 m" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
  const field = screen.getByRole("textbox", { name: "New name of Coherence HH, 20 m" });
  await userEvent.type(field, "Another name{Escape}");
  expect(mapLayersStore.get()[0]?.title).toBe("Coherence HH, 20 m");
  expect(screen.queryByRole("textbox")).toBeNull();
});

test("the display of one layer is copied to another, which keeps its own visibility and opacity", async () => {
  [OCTOBER, NOVEMBER].forEach(addToMap);
  setDisplay(OCTOBER, { range: [0.2, 0.8], colours: "viridis", inverted: true, opacity: 0.5 });
  setDisplay(NOVEMBER, { visible: false });
  show();
  const [november, october] = screen.getAllByRole("button", { name: "Commands of Backscatter HH" });
  await userEvent.click(november as HTMLElement);
  expect(screen.getByRole("menuitem", { name: "Paste display" }).getAttribute("aria-disabled")).toBe("true");
  await userEvent.keyboard("{Escape}");
  await userEvent.click(october as HTMLElement);
  await userEvent.click(screen.getByRole("menuitem", { name: "Copy display" }));
  await userEvent.click(november as HTMLElement);
  await userEvent.click(screen.getByRole("menuitem", { name: "Paste display" }));
  expect(displayOf(NOVEMBER)).toEqual({
    visible: false,
    opacity: 1,
    range: [0.2, 0.8],
    colours: "viridis",
    inverted: true,
  });
});

test("a power has the command Show in decibels, which is switched on at the start", async () => {
  const power = {
    ...OCTOBER,
    quantity: "Radar backscatter gamma nought, HH, linear power",
    range: [0.01, 0.4] as const,
  };
  addToMap(power);
  show();
  expect(screen.getByText("Shown in decibels (dB).")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Commands of Backscatter HH" }));
  const command = screen.getByRole("menuitemcheckbox", { name: "Show in decibels" });
  expect(command.getAttribute("aria-checked")).toBe("true");
  await userEvent.click(command);
  expect(displayOf(power).decibels).toBe(false);
  expect(screen.queryByText("Shown in decibels (dB).")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Commands of Backscatter HH" }));
  expect(screen.getByRole("menuitemcheckbox", { name: "Show in decibels" }).getAttribute("aria-checked")).toBe("false");
});

test("the commands Symbology and Properties open the pane and the window of the layer", async () => {
  addToMap(COHERENCE);
  show();
  await userEvent.click(screen.getByRole("button", { name: "Commands of Coherence HH, 20 m" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Symbology" }));
  expect(symbologyStore.get()?.id).toBe("coherence");
  expect(dockStore.get().tools).toContain("symbology");
  await userEvent.click(screen.getByRole("button", { name: "Commands of Coherence HH, 20 m" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Properties" }));
  expect(propertiesStore.get()?.id).toBe("coherence");
});

test("the menu opens at the pointer with the right mouse button", () => {
  addToMap(COHERENCE);
  show();
  fireEvent.contextMenu(nameOf("Coherence HH, 20 m 9 Oct 2026 and 21 Oct 2026"), { clientX: 40, clientY: 60 });
  expect(screen.getByRole("menu", { name: "Commands of Coherence HH, 20 m" })).toBeTruthy();
});

test("a layer dragged onto another one takes the place below it", () => {
  [OCTOBER, NOVEMBER, COHERENCE].forEach(addToMap);
  show();
  const rows = [...document.querySelectorAll(".contents-row")];
  const items = [...document.querySelectorAll(".contents-layer")];
  const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
  // The simulated browser gives every element the height 0, so the pointer counts as below the middle of the target.
  fireEvent.dragStart(rows[0] as Element, { dataTransfer });
  fireEvent.dragOver(items[2] as Element, { dataTransfer, clientY: 10 });
  expect(items[2]?.className).toContain("contents-layer--drop-below");
  fireEvent.drop(items[2] as Element, { dataTransfer });
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["coherence", "october", "november"]);
  expect(document.querySelector(".contents-layer--drop-below")).toBeNull();
});

test("the box of the basemap hides and shows it, and a basemap chosen on the Map tab takes its place", () => {
  show();
  const marble = screen.getByRole("checkbox", { name: "Show Blue Marble" });
  fireEvent.click(marble);
  expect(baseMapStore.get()).toBeNull();
  expect(marble).toHaveProperty("checked", false);
  fireEvent.click(marble);
  expect(baseMapStore.get()).toBe("blue-marble");
  act(() => {
    baseMapStore.set("openstreetmap");
  });
  expect(screen.queryByRole("checkbox", { name: "Show Blue Marble" })).toBeNull();
  expect(screen.getByRole("checkbox", { name: "Show OpenStreetMap" })).toHaveProperty("checked", true);
});

test("the Remove command of the basemap takes it off the map and out of the list", async () => {
  show();
  await userEvent.click(screen.getByRole("button", { name: "Commands of Blue Marble" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
  expect(baseMapStore.get()).toBeNull();
  expect(screen.queryByRole("checkbox", { name: "Show Blue Marble" })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Map" }));
  act(() => {
    baseMapStore.set("imagery");
  });
  expect(screen.getByRole("checkbox", { name: "Show Imagery of a date" })).toHaveProperty("checked", true);
});

test("a layer whose file could not be read says so in place of its legend", () => {
  addToMap(COHERENCE);
  layerProblemsStore.set({ coherence: "The file of the layer could not be read." });
  show();
  expect(screen.getByText("The file of the layer could not be read.")).toBeTruthy();
  expect(screen.queryByRole("slider")).toBeNull();
});
