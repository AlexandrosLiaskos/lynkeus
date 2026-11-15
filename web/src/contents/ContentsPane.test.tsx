// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { againStore, resetAgain } from "../data/again";
import { jobsReadStore, jobsStore, resetJobs } from "../data/jobs";
import { layersReadStore, layersStore, resetLayers, type LayerSource } from "../data/layers";
import { resetSession, sessionStore } from "../data/session";
import { job, standIn } from "../data/testSession";
import { baseMapStore } from "../map/baseMaps";
import { createMap } from "../map/map";
import type { LayerDescription } from "../shared/layer";
import { MapContext } from "../shared/map";
import { addToMap, mapLayersStore } from "../shared/mapLayers";
import { dockStore, resetDock } from "../shared/dock/dock";
import { resetPanes, setPaneOpen } from "../shared/panes";
import { serversStore } from "../shared/servers";
import { LABORATORY, OFFICE, SERVERS } from "../servers/testServers";
import { listedBasemapStore } from "./BasemapItem";
import { ContentsPane, withRemoved } from "./ContentsPane";
import { drawAgainStore, layerProblemsStore } from "./drawing";
import { keptStore, resetKept, restoreKept, statesStore } from "./kept";
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
  resetKept();
  resetSession();
  resetLayers();
  resetJobs();
  resetAgain();
  baseMapStore.set("blue-marble");
  listedBasemapStore.set("blue-marble");
  resetDock();
  resetPanes();
  setPaneOpen("contents", true);
  copiedDisplayStore.set(null);
  symbologyStore.set(null);
  propertiesStore.set(null);
  mapLayersStore.set([]);
  resetKept();
  displayStore.set({});
  foldedStore.set([]);
  selectedLayerStore.set(null);
  layerProblemsStore.set({});
  drawAgainStore.set({});
  serversStore.set(null);
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
  expect(items.map((item) => item.querySelector(".item-title")?.textContent)).toEqual([
    "Coherence HH, 20 m",
    "Backscatter HH",
    "Blue Marble",
  ]);
});

test("every row has the same columns, so that the boxes and the names stand in line", () => {
  addToMap(COHERENCE);
  show();
  const rows = [...document.querySelectorAll(".contents-row")];
  expect(rows).toHaveLength(2);
  for (const row of rows) {
    const [fold, box, name, menu] = [...row.children];
    expect(fold?.className).toBe("contents-fold");
    expect(box?.className).toBe("contents-visible");
    expect(name?.querySelector(".item-title") ?? name).toHaveProperty(
      "className",
      expect.stringContaining("item-title"),
    );
    expect(menu?.querySelector("button")?.getAttribute("aria-haspopup")).toBe("menu");
  }
  // The dates of a layer are the secondary line under its title.
  expect(rows[0]?.querySelector(".item-line")?.textContent).toBe("9 Oct 2026 and 21 Oct 2026");
});

test("the arrow of the map and of a legend is one icon, which the style turns when the row is folded", async () => {
  addToMap(COHERENCE);
  show();
  const arrows = () =>
    [
      screen.getByRole("button", { name: "Map" }),
      screen.getByRole("button", { name: "Legend of Coherence HH, 20 m" }),
    ].map((button) => button.querySelector("use")?.getAttribute("href")?.split("#")[1]);
  expect(arrows()).toEqual(["expand_more", "expand_more"]);
  await userEvent.click(screen.getByRole("button", { name: "Legend of Coherence HH, 20 m" }));
  expect(arrows()).toEqual(["expand_more", "expand_more"]);
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
  const button = screen.getByRole("button", { name: "More commands of Coherence HH, 20 m" });
  expect(button.getAttribute("aria-haspopup")).toBe("menu");
  button.focus();
  await userEvent.keyboard("{Enter}");
  expect(button.getAttribute("aria-expanded")).toBe("true");
  const menu = screen.getByRole("menu", { name: "More commands of Coherence HH, 20 m" });
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
  const button = screen.getByRole("button", { name: "More commands of Coherence HH, 20 m" });
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
  await userEvent.click(screen.getByRole("button", { name: "More commands of Coherence HH, 20 m" }));
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
  await userEvent.click(screen.getByRole("button", { name: "More commands of Coherence HH, 20 m" }));
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
  await userEvent.click(screen.getByRole("button", { name: "More commands of Coherence HH, 20 m" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["october"]);
  expect(selectedLayerStore.get()).toBeNull();
  expect(document.activeElement).toBe(nameOf("Backscatter HH 21 Oct 2026"));
  expect(document.querySelector("p.usa-sr-only")?.textContent).toBe("The layer was removed.");
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
  await userEvent.click(screen.getByRole("button", { name: "More commands of Coherence HH, 20 m" }));
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
  const [november, october] = screen.getAllByRole("button", { name: "More commands of Backscatter HH" });
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
  await userEvent.click(screen.getByRole("button", { name: "More commands of Backscatter HH" }));
  const command = screen.getByRole("menuitemcheckbox", { name: "Show in decibels" });
  expect(command.getAttribute("aria-checked")).toBe("true");
  await userEvent.click(command);
  expect(displayOf(power).decibels).toBe(false);
  expect(screen.queryByText("Shown in decibels (dB).")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "More commands of Backscatter HH" }));
  expect(screen.getByRole("menuitemcheckbox", { name: "Show in decibels" }).getAttribute("aria-checked")).toBe("false");
});

test("the commands Symbology and Properties open the pane and the window of the layer", async () => {
  addToMap(COHERENCE);
  show();
  await userEvent.click(screen.getByRole("button", { name: "More commands of Coherence HH, 20 m" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Symbology" }));
  expect(symbologyStore.get()?.id).toBe("coherence");
  expect(dockStore.get().tools).toContain("symbology");
  await userEvent.click(screen.getByRole("button", { name: "More commands of Coherence HH, 20 m" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Properties" }));
  expect(propertiesStore.get()?.id).toBe("coherence");
});

test("the menu opens at the pointer with the right mouse button", () => {
  addToMap(COHERENCE);
  show();
  fireEvent.contextMenu(nameOf("Coherence HH, 20 m 9 Oct 2026 and 21 Oct 2026"), { clientX: 40, clientY: 60 });
  expect(screen.getByRole("menu", { name: "More commands of Coherence HH, 20 m" })).toBeTruthy();
});

test("the menu at the pointer has the commands of the menu button, and Escape returns the focus to the name", async () => {
  [OCTOBER, COHERENCE].forEach(addToMap);
  show();
  await userEvent.click(screen.getByRole("button", { name: "More commands of Coherence HH, 20 m" }));
  const ofButton = screen.getAllByRole("menuitem").map((command) => command.textContent);
  await userEvent.keyboard("{Escape}");
  fireEvent.contextMenu(nameOf("Coherence HH, 20 m 9 Oct 2026 and 21 Oct 2026"), { clientX: 40, clientY: 60 });
  expect(screen.getAllByRole("menuitem").map((command) => command.textContent)).toEqual(ofButton);
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(nameOf("Coherence HH, 20 m 9 Oct 2026 and 21 Oct 2026"));
});

test("only one menu of a layer is open at a time", async () => {
  addToMap(COHERENCE);
  show();
  await userEvent.click(screen.getByRole("button", { name: "More commands of Coherence HH, 20 m" }));
  expect(screen.getAllByRole("menu")).toHaveLength(1);
  // A press of the right mouse button outside the open menu closes it, and the menu at the pointer opens.
  fireEvent.pointerDown(nameOf("Coherence HH, 20 m 9 Oct 2026 and 21 Oct 2026"), { button: 2 });
  fireEvent.contextMenu(nameOf("Coherence HH, 20 m 9 Oct 2026 and 21 Oct 2026"), { clientX: 40, clientY: 60 });
  expect(screen.getAllByRole("menu")).toHaveLength(1);
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
  await userEvent.click(screen.getByRole("button", { name: "More commands of Blue Marble" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
  expect(baseMapStore.get()).toBeNull();
  expect(screen.queryByRole("checkbox", { name: "Show Blue Marble" })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Map" }));
  act(() => {
    baseMapStore.set("imagery");
  });
  expect(screen.getByRole("checkbox", { name: "Show Imagery of a date" })).toHaveProperty("checked", true);
});

test("a layer whose file could not be read says so in a notice in place of its legend", () => {
  addToMap(COHERENCE);
  layerProblemsStore.set({ coherence: { text: "The file of the layer could not be read.", again: false } });
  show();
  expect(screen.getByRole("alert").textContent).toBe("The file of the layer could not be read.");
  expect(screen.queryByRole("slider")).toBeNull();
});

test("the notice of a layer that could not be read offers to remove the layer", async () => {
  [OCTOBER, COHERENCE].forEach(addToMap);
  layerProblemsStore.set({ coherence: { text: "The file of the layer could not be read.", again: false } });
  show();
  await userEvent.click(screen.getByRole("button", { name: "Remove layer" }));
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["october"]);
  expect(document.activeElement).toBe(nameOf("Backscatter HH 21 Oct 2026"));
});

test("the basemap has its menu at the pointer too, and Escape returns the focus to its menu button", async () => {
  show();
  fireEvent.contextMenu(screen.getByText("Blue Marble", { selector: ".item-title" }), { clientX: 40, clientY: 60 });
  expect(
    within(screen.getByRole("menu", { name: "More commands of Blue Marble" })).getAllByRole("menuitem"),
  ).toHaveLength(1);
  await userEvent.keyboard("{Escape}");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "More commands of Blue Marble" }));
});

const keptOn = (server: string, id: string, title: string): LayerDescription => ({
  ...layer(id, title, ["2026-10-21"]),
  url: `/api/servers/${server}/files/fedcba9876543210fedcba9876543210/${id}.tif`,
  record: `/api/servers/${server}/files/fedcba9876543210fedcba9876543210/${id}.json`,
});

test("a layer whose own server is not connected is marked beside its dates", () => {
  serversStore.set(SERVERS);
  [keptOn(OFFICE.id, "near", "Backscatter HV"), keptOn(LABORATORY.id, "far", "Backscatter VV"), OCTOBER].forEach(
    addToMap,
  );
  show();
  expect(listed()).toEqual([
    "Backscatter HH 21 Oct 2026",
    "Backscatter VV 21 Oct 2026 · server not connected",
    "Backscatter HV 21 Oct 2026",
  ]);
  act(() =>
    serversStore.set({ ...SERVERS, servers: SERVERS.servers.map((server) => ({ ...server, connected: true })) }),
  );
  expect(listed()[1]).toBe("Backscatter VV 21 Oct 2026");
});

test("the notice of a layer whose file may be readable later offers to try again, and the layer stays", async () => {
  const far = keptOn(LABORATORY.id, "far", "Backscatter VV");
  addToMap(far);
  const text =
    'Your server "Laboratory server", which keeps this layer, is not connected. Start Lynkeus Server on that computer and try again.';
  layerProblemsStore.set({ far: { text, again: true } });
  show();
  expect(screen.getByRole("alert").textContent).toBe(text);
  expect(screen.queryByRole("button", { name: "Remove layer" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(drawAgainStore.get()).toEqual({ far: 1 });
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["far"]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The request that made a received layer, as the list of the server states it. */
const REQUEST: LayerSource = {
  process: "get-layer",
  inputs: {
    product: "GCOV",
    granule: "NISAR_L2_PR_GCOV",
    layer: "HHHH",
    area: { west: 1, south: 2, east: 3, north: 4 },
  },
};

/** A result that an analysis tool made from the two backscatter layers. */
const CHANGE: LayerDescription = {
  ...layer("change", "Backscatter change", ["2026-10-21", "2026-11-02"]),
  kind: "result",
  method: "docs/methods/backscatter-change.md",
};

/** Give the page the sign-in of an account and the list of its layers on the server. */
function signedIn(user: string, layers: readonly LayerDescription[]): void {
  sessionStore.set({ state: "signed-in", user, token: true });
  layersStore.set(layers.map((described) => ({ layer: described, size: null, created: null, server: null })));
  layersReadStore.set({ account: user });
}

/** Bring layers into the page as the browser stored them for the account a_user, with the request of each. */
function storedFor(layers: readonly LayerDescription[], account: string | null = "a_user"): void {
  restoreKept(
    layers.map((described) => ({
      layer: described,
      account,
      source:
        described.kind === "result"
          ? { process: "backscatter-change", inputs: { inputs: ["october", "november"], title: described.title } }
          : REQUEST,
    })),
  );
}

const notices = () =>
  [...document.querySelectorAll(".contents-notices .notice-text")].map((notice) => notice.textContent);
const rowOf = (title: string) => {
  const row = [...document.querySelectorAll<HTMLElement>(".contents-layer")].find((item) =>
    item.querySelector(".contents-name")?.textContent?.startsWith(title),
  );
  if (!row) {
    throw new Error(`The list has no layer ${title}.`);
  }
  return row;
};

test("layers that wait for the sign-in are not listed: one notice names their account and offers the sign-in", async () => {
  sessionStore.set({ state: "signed-out" });
  storedFor([OCTOBER, NOVEMBER]);
  show();
  expect(listed()).toEqual([]);
  expect(notices()).toEqual([
    "2 layers of this map belong to the Earthdata account a_user and are not shown. Sign in to that account to show them again.",
  ]);
  // The notice is a state of the pane and no error.
  expect(document.querySelector(".contents-notices .notice--info")).not.toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(dockStore.get().tools).toEqual(["sign-in"]);
});

test("after the sign-in to their account the layers are listed again, in their order", () => {
  sessionStore.set({ state: "signed-out" });
  storedFor([OCTOBER, COHERENCE, NOVEMBER]);
  show();
  expect(listed()).toEqual([]);
  act(() => signedIn("a_user", [NOVEMBER, COHERENCE, OCTOBER]));
  expect(notices()).toEqual([]);
  expect(listed()).toEqual([
    "Backscatter HH 2 Nov 2026",
    "Coherence HH, 20 m 9 Oct 2026 and 21 Oct 2026",
    "Backscatter HH 21 Oct 2026",
  ]);
});

test("signed in to another account, the notice names the first account and removes its layers from this browser", async () => {
  signedIn("b_user", [COHERENCE]);
  restoreKept([
    { layer: OCTOBER, account: "a_user", source: REQUEST },
    { layer: COHERENCE, account: "b_user", source: REQUEST },
  ]);
  show();
  expect(listed()).toEqual(["Coherence HH, 20 m 9 Oct 2026 and 21 Oct 2026"]);
  expect(notices()).toEqual([
    "1 layer of this map belongs to the Earthdata account a_user, and you are signed in as b_user. It is shown again after a sign-in as a_user.",
  ]);
  expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Remove from this browser" }));
  expect(notices()).toEqual([]);
  expect(keptStore.get().map((entry) => entry.layer.id)).toEqual(["coherence"]);
  expect(listed()).toEqual(["Coherence HH, 20 m 9 Oct 2026 and 21 Oct 2026"]);
});

test("while the project server does not answer, one notice says so and no layer is listed", () => {
  sessionStore.set({ state: "unreachable" });
  storedFor([OCTOBER, NOVEMBER]);
  show();
  expect(listed()).toEqual([]);
  expect(notices()).toEqual([
    "The project server does not answer, so 2 layers of this map are not shown. The page asks again by itself.",
  ]);
  expect(document.querySelector(".contents-notices .notice--warning")).not.toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(document.querySelector(".contents-notices .usa-button")).toBeNull();
});

test("before the first answers the pane says nothing about the stored layers", () => {
  storedFor([OCTOBER]);
  show();
  expect(listed()).toEqual([]);
  expect(notices()).toEqual([]);
});

test("a layer that the server removed has a row at its place, which says so and draws nothing", () => {
  signedIn("a_user", [OCTOBER, COHERENCE]);
  storedFor([OCTOBER, NOVEMBER, COHERENCE]);
  show();
  expect(statesStore.get().november).toBe("removed");
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["october", "coherence"]);
  expect(listed()).toEqual([
    "Coherence HH, 20 m 9 Oct 2026 and 21 Oct 2026",
    "Backscatter HH 2 Nov 2026 · removed from the server",
    "Backscatter HH 21 Oct 2026",
  ]);
  const row = rowOf("Backscatter HH 2 Nov");
  // The layer is not drawn: its row has no box, no legend and no opacity, and it is no error.
  expect(within(row).queryByRole("checkbox")).toBeNull();
  expect(within(row).queryByRole("slider")).toBeNull();
  expect(within(row).queryByRole("alert")).toBeNull();
  expect(within(row).getByRole("status").textContent).toBe(
    "The project server no longer keeps this layer: it removed the layer after the keeping time, or the layer was removed elsewhere. Get again requests it from NASA with the same choices and gives it this place.",
  );
  expect(within(row).getByRole("button", { name: "Get again" })).toBeDefined();
  expect(within(row).getByRole("button", { name: "Remove from the map" })).toBeDefined();
  // The layers of the map keep their commands, and their places count the layers of the map only.
  expect(screen.getByRole("checkbox", { name: "Show Coherence HH, 20 m" })).toBeDefined();
});

test("Get again sends the request that made the layer, and the row then says that the layer was requested", async () => {
  const server = standIn();
  signedIn("a_user", [OCTOBER]);
  jobsReadStore.set({ account: "a_user" });
  storedFor([OCTOBER, NOVEMBER]);
  show();
  await userEvent.click(screen.getByRole("button", { name: "Get again" }));
  await vi.waitFor(() => expect(againStore.get()).toEqual({ november: "job-1" }));
  expect(server.sent("POST")).toEqual([
    { method: "POST", address: "/api/processes/get-layer/execution", content: { inputs: REQUEST.inputs } },
  ]);
  const row = rowOf("Backscatter HH 2 Nov");
  expect(within(row).getByRole("status").textContent).toBe(
    "This layer was requested again, and its job is waiting. The new layer takes this place when the job ends.",
  );
  expect(within(row).queryByRole("button", { name: "Get again" })).toBeNull();
  expect(within(row).getByRole("button", { name: "Remove from the map" })).toBeDefined();
});

test("when the job of Get again ends, the new layer takes the place and the display of the removed one", () => {
  const again = layer("november-again", "Backscatter HH", ["2026-11-02"]);
  signedIn("a_user", [OCTOBER, COHERENCE]);
  restoreKept([
    { layer: OCTOBER, account: "a_user", source: REQUEST },
    { layer: NOVEMBER, account: "a_user", source: REQUEST, display: { ...displayOf(NOVEMBER), opacity: 0.3 } },
    { layer: COHERENCE, account: "a_user", source: REQUEST },
  ]);
  jobsStore.set([job({ jobID: "again", status: "running" })]);
  jobsReadStore.set({ account: "a_user" });
  againStore.set({ november: "again" });
  show();
  // The job ends, and the list of the server holds its layer.
  act(() => {
    signedIn("a_user", [again, OCTOBER, COHERENCE]);
    jobsStore.set([job({ jobID: "again", status: "successful", layer: "november-again" })]);
  });
  expect(listed()).toEqual([
    "Coherence HH, 20 m 9 Oct 2026 and 21 Oct 2026",
    "Backscatter HH 2 Nov 2026",
    "Backscatter HH 21 Oct 2026",
  ]);
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["october", "november-again", "coherence"]);
  expect(displayStore.get()["november-again"]?.opacity).toBe(0.3);
  expect(within(rowOf("Backscatter HH 2 Nov")).getByRole("slider").getAttribute("aria-valuetext")).toBe("30 percent");
});

test("a result that the server removed names its tool and its inputs, and Remove from the map takes it out", async () => {
  signedIn("a_user", [OCTOBER, NOVEMBER]);
  storedFor([OCTOBER, NOVEMBER, CHANGE]);
  show();
  const row = rowOf("Backscatter change");
  expect(within(row).getByRole("status").textContent).toBe(
    'The project server no longer keeps this result: it removed the result after the keeping time, or the result was removed elsewhere. The tool Backscatter, Change made it from the layers "Backscatter HH" and "Backscatter HH".',
  );
  expect(within(row).queryByRole("button", { name: "Get again" })).toBeNull();
  // The notice and the row both offer the command.
  const commands = within(row).getAllByRole("button", { name: "Remove from the map" });
  expect(commands).toHaveLength(2);
  await userEvent.click(commands[1] as HTMLElement);
  expect(listed()).toEqual(["Backscatter HH 2 Nov 2026", "Backscatter HH 21 Oct 2026"]);
  expect(keptStore.get().map((entry) => entry.layer.id)).toEqual(["october", "november"]);
  // The focus goes to the layer that took the place of the removed row.
  expect(document.activeElement?.textContent).toBe("Backscatter HH 2 Nov 2026");
  expect(document.querySelector("p.usa-sr-only")?.textContent).toBe("The layer was removed.");
});

test("a removed layer stands above the nearest kept layer under it that the list shows", () => {
  const row = (id: string) => ({ id, title: id, layer: layer(id, id, ["2026-10-21"]) });
  const kept = ["a", "b", "c", "d"].map((id) => ({
    layer: layer(id, id, ["2026-10-21"]),
    account: "a_user",
    source: null,
    aside: id === "b" || id === "a",
  }));
  // The list shows the top layer first: d over c. The removed b stood between c and a, and a at the bottom.
  expect(
    withRemoved([row("d"), row("c")], kept, { a: "removed", b: "removed", c: "ready", d: "ready" }).map(({ id }) => id),
  ).toEqual(["d", "c", "b", "a"]);
  expect(withRemoved([row("d"), row("c")], kept, { a: "waits", b: "removed" }).map(({ id }) => id)).toEqual([
    "d",
    "c",
    "b",
  ]);
  const middle = kept.map((entry) => ({ ...entry, aside: entry.layer.id === "c" }));
  expect(withRemoved([row("d"), row("b"), row("a")], middle, { c: "removed" }).map(({ id }) => id)).toEqual([
    "d",
    "c",
    "b",
    "a",
  ]);
});
