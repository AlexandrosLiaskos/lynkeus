import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OlMap from "ol/Map";
import View from "ol/View";
import { transformExtent } from "ol/proj";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { jobsStore, loadJobs, resetJobs } from "../data/jobs";
import { layersFaultStore, layersStore, loadLayers, resetLayers } from "../data/layers";
import { job, layer, standIn, type SentLayer, type StandIn } from "../data/testSession";
import { MapContext } from "../shared/map";
import { addToMap, mapLayersStore } from "../shared/mapLayers";
import { messagesStore } from "../shared/messages/messages";
import { layerGroups } from "./details";
import { LayersSection, layersSentence } from "./LayersSection";
import { layersOpenStore, markedLayerStore, showLayer } from "./state";

let server: StandIn;

// The sentence with which the server refuses a name (`layer_renaming` in `api/src/lynkeus/routes.py`).
const REFUSAL = 'The request body must be {"title": "..."} with a title of 1 to 200 characters.';
let map: OlMap;

const BACKSCATTER: SentLayer = {
  layer: layer({ id: "back", title: "Backscatter HH, 21 Oct 2026" }),
  size: 57_200_000,
  created: "2026-11-14T16:25:00Z",
};
const COHERENCE: SentLayer = {
  layer: layer({
    id: "coh",
    title: "Coherence HH, 9 and 21 Oct 2026",
    quantity: "Coherence",
    dates: ["2026-10-09", "2026-10-21"],
    url: "/files/coh/coherence-hh.tif",
    record: "/files/coh/coherence-hh.json",
  }),
  size: 12_400_000,
  created: "2026-11-14T16:40:00Z",
};
const CHANGE: SentLayer = {
  layer: layer({
    id: "change",
    title: "Change of backscatter",
    kind: "result",
    quantity: "Change of radar backscatter",
    unit: "dB",
    method: "docs/methods/backscatter-change.md",
    dates: ["2026-10-21", "2026-11-02"],
  }),
  size: 30_000_000,
  created: "2026-11-14T16:30:00Z",
};

beforeEach(() => {
  resetJobs();
  resetLayers();
  markedLayerStore.set(null);
  layersOpenStore.set(true);
  mapLayersStore.set([]);
  messagesStore.set([]);
  server = standIn();
  map = new OlMap({ view: new View({ center: [0, 0], zoom: 2 }) });
  map.setSize([800, 600]);
});

afterEach(() => {
  resetJobs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function show(layers = [COHERENCE, CHANGE, BACKSCATTER]) {
  server.layers = layers;
  render(
    <MapContext value={map}>
      <main tabIndex={0} aria-label="Map" />
      <LayersSection />
    </MapContext>,
  );
  await act(() => loadLayers());
}

/** The text of a layer of the list, which a click marks. */
const item = (name: RegExp) => screen.getByRole("button", { name });
const names = () =>
  [...document.querySelectorAll(".layer .item-title")].map((title) => title.textContent.split(",")[0]);
const messages = () => messagesStore.get().map(({ kind, text }) => [kind, text]);

/** The commands of a layer: the one that the item shows and the button of the menu "More". */
const commandsOf = (title: string) => within(screen.getByRole("group", { name: `Commands of the layer ${title}` }));

/** Open the menu "More" of a layer and return the names of its commands. */
async function moreOf(title: string): Promise<string[]> {
  await userEvent.click(commandsOf(title).getByRole("button", { name: `More commands of ${title}` }));
  return screen.getAllByRole("menuitem").map((command) => command.textContent);
}

/** Choose a command of a menu that is open. */
const choose = (command: string) => userEvent.click(within(screen.getByRole("menu")).getByText(command));

/** The rows of the property list of a dialog, each as its name and its value. */
function rowsOf(dialog: HTMLElement): string[] {
  return [...dialog.querySelectorAll(".property-row")].map(
    (row) =>
      `${row.querySelector(".property-name")?.textContent ?? ""}: ${row.querySelector(".property-value-text")?.textContent ?? ""}`,
  );
}

test("without a layer the section says how it fills", () => {
  render(<LayersSection />, { wrapper: ({ children }) => <MapContext value={map}>{children}</MapContext> });
  expect(screen.getByRole("button", { name: "Layers (0)" })).toBeDefined();
  expect(screen.getByText("A layer is listed when the job that gets or computes it has finished.")).toBeDefined();
  expect(screen.queryByRole("toolbar")).toBeNull();
});

test("each layer shows its name, its quantity with the unit, its dates and its size", async () => {
  await show();
  expect(screen.getByRole("button", { name: "Layers (3)", expanded: true })).toBeDefined();
  expect(screen.getByRole("status").textContent).toBe("The files take 100 MB. No layer is on the map.");
  expect([...document.querySelectorAll(".layer .catalog-pick")].map((text) => text.textContent)).toEqual([
    "Coherence HH, 9 and 21 Oct 2026Coherence (no unit)9 Oct 2026 and 21 Oct 2026 · 12 MB",
    "Change of backscatterChange of radar backscatter (dB)21 Oct 2026 and 2 Nov 2026 · 30 MB",
    "Backscatter HH, 21 Oct 2026Radar backscatter gamma nought, HH, linear power (no unit)21 Oct 2026 · 57 MB",
  ]);
});

test("the line of the section states the size of the files and the layers on the map", () => {
  const entry = { layer: layer(), size: 4_000_000, created: null };
  expect(layersSentence([entry], 1)).toBe("The files take 4 MB. 1 layer is on the map.");
  expect(layersSentence([entry, { ...entry, size: null }], 2)).toBe("2 layers are on the map.");
});

test("a layer shows the command that fits its state: Add to the map, and Zoom to once it is on the map", async () => {
  await show();
  const title = "Backscatter HH, 21 Oct 2026";
  const shown = () =>
    commandsOf(title)
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label") ?? button.textContent);
  expect(shown()).toEqual(["Add to the map", `More commands of ${title}`]);
  expect(await moreOf(title)).toEqual(["Zoom to", "Details", "Download GeoTIFF", "Rename", "Remove"]);
  await userEvent.keyboard("{Escape}");
  await userEvent.click(commandsOf(title).getByRole("button", { name: "Add to the map" }));
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["back"]);
  expect(item(/^Backscatter HH/).textContent).toMatch(/57 MB · On the map$/);
  expect(screen.getByRole("status").textContent).toBe("The files take 100 MB. 1 layer is on the map.");
  expect(shown()).toEqual(["Zoom to", `More commands of ${title}`]);
  expect(await moreOf(title)).toEqual(["Remove from the map", "Details", "Download GeoTIFF", "Rename", "Remove"]);
  await choose("Remove from the map");
  expect(mapLayersStore.get()).toEqual([]);
  expect(layersStore.get()).toHaveLength(3);
});

test("the map moves to the extent that the STAC record of a layer states", async () => {
  server.files[BACKSCATTER.layer.record] = { type: "Feature", bbox: [-71.2, 42.6, -70.75, 42.95] };
  const fit = vi.spyOn(map.getView(), "fit");
  await show();
  await moreOf("Backscatter HH, 21 Oct 2026");
  await choose("Zoom to");
  await vi.waitFor(() => expect(fit).toHaveBeenCalledTimes(1));
  expect(fit.mock.calls[0]?.[0]).toEqual(transformExtent([-71.2, 42.6, -70.75, 42.95], "EPSG:4326", "EPSG:3857"));
  // A layer on the map shows the same command in its item.
  act(() => addToMap(BACKSCATTER.layer));
  await userEvent.click(commandsOf("Backscatter HH, 21 Oct 2026").getByRole("button", { name: "Zoom to" }));
  await vi.waitFor(() => expect(fit).toHaveBeenCalledTimes(2));
});

test("a record that cannot be read is reported, and the map stays", async () => {
  const fit = vi.spyOn(map.getView(), "fit");
  await show();
  await moreOf("Backscatter HH, 21 Oct 2026");
  await choose("Zoom to");
  await vi.waitFor(() => expect(messages()).toEqual([["error", "Not found."]]));
  expect(fit).not.toHaveBeenCalled();
});

test("the details show every field of the description in groups, with the links to the two files", async () => {
  await show();
  await moreOf("Change of backscatter");
  await choose("Details");
  const dialog = screen.getByRole("dialog", { name: "Layer: Change of backscatter" });
  expect([...dialog.querySelectorAll(".property-group-title")].map((title) => title.textContent)).toEqual([
    "Layer",
    "Legend",
    "Data",
    "Files",
  ]);
  expect(rowsOf(dialog)).toEqual([
    "Name: Change of backscatter",
    "Kind: Result of an analysis tool",
    "Quantity: Change of radar backscatter",
    "Unit: dB",
    "Identifier: change",
    "Range: 0.01 to 0.6",
    "Colour scale: grey",
    "Dates of the data: 21 Oct 2026 and 2 Nov 2026",
    "Product file used: NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001",
    "Program: Lynkeus 0.1.0",
    "Method: docs/methods/backscatter-change.md",
    "Size: 30 MB",
    "Made: 14 Nov 2026, 16:30:00 UTC",
    "GeoTIFF file: backscatter-hh.tif",
    "STAC record: backscatter-hh.json (opens in a new tab)",
  ]);
  const file = within(dialog).getByRole<HTMLAnchorElement>("link", { name: "backscatter-hh.tif" });
  expect(file.getAttribute("href")).toBe(CHANGE.layer.url);
  expect(file.hasAttribute("download")).toBe(true);
  const record = within(dialog).getByRole<HTMLAnchorElement>("link", { name: /^backscatter-hh\.json/ });
  expect(record.getAttribute("href")).toBe(CHANGE.layer.record);
  expect(record.target).toBe("_blank");
  expect(within(dialog).getByRole("button", { name: "Copy Identifier" })).toBeDefined();
});

test("a layer without a stated size, time or method shows no such field", async () => {
  await show([{ layer: BACKSCATTER.layer }]);
  expect(item(/^Backscatter HH/).textContent).toMatch(/21 Oct 2026$/);
  const rows = layerGroups({ layer: BACKSCATTER.layer, size: null, created: null }).flatMap(({ rows: part }) =>
    part.map(({ name, value }) => [name, value]),
  );
  expect(rows.filter(([name]) => name === "Method" || name === "Size" || name === "Made")).toEqual([]);
  expect(rows).toContainEqual(["Kind", "Received from NASA"]);
});

test("the GeoTIFF file of a layer is downloaded from its address", async () => {
  const clicked: [string | null, boolean][] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push([this.getAttribute("href"), this.hasAttribute("download")]);
  });
  await show();
  await moreOf("Coherence HH, 9 and 21 Oct 2026");
  await choose("Download GeoTIFF");
  expect(clicked).toEqual([["/files/coh/coherence-hh.tif", true]]);
  expect(document.querySelector("body > a")).toBeNull();
});

test("a layer is renamed in its place", async () => {
  await show();
  addToMap(BACKSCATTER.layer);
  await moreOf("Backscatter HH, 21 Oct 2026");
  await choose("Rename");
  const field = screen.getByRole<HTMLInputElement>("textbox", { name: "New name" });
  expect(field.value).toBe("Backscatter HH, 21 Oct 2026");
  expect(document.activeElement).toBe(field);
  await userEvent.clear(field);
  await userEvent.click(screen.getByRole("button", { name: "Rename" }));
  expect(screen.getByRole("alert").textContent).toBe("Give the new name of the layer.");
  expect(server.sent("PATCH")).toEqual([]);
  await userEvent.type(field, "Backscatter of Cape Ann{Enter}");
  await vi.waitFor(() => expect(item(/^Backscatter of Cape Ann/)).toBeDefined());
  expect(server.sent("PATCH")).toEqual([
    { method: "PATCH", address: "/api/layers/back", content: { title: "Backscatter of Cape Ann" } },
  ]);
  expect(mapLayersStore.get().map(({ title }) => title)).toEqual(["Backscatter of Cape Ann"]);
  expect(messages()).toEqual([["info", 'The layer was renamed to "Backscatter of Cape Ann".']]);
  expect(screen.queryByRole("textbox")).toBeNull();
  // The field has left the page, and the focus returns to the text of the layer.
  await vi.waitFor(() => expect(document.activeElement).toBe(item(/^Backscatter of Cape Ann/)));
});

test("a renaming that the server refuses is stated at the field, and Cancel leaves the name", async () => {
  await show();
  await moreOf("Backscatter HH, 21 Oct 2026");
  await choose("Rename");
  server.refuse("PATCH", "/api/layers", 400, REFUSAL);
  await userEvent.type(screen.getByRole("textbox", { name: "New name" }), " again{Enter}");
  expect((await screen.findByRole("alert")).textContent).toBe(REFUSAL);
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(item(/^Backscatter HH, 21 Oct 2026/)).toBeDefined();
});

test("a layer is removed only after a confirmation", async () => {
  server.jobs = [job({ jobID: "made-it", status: "successful", layer: "back" })];
  await loadJobs();
  await show();
  addToMap(BACKSCATTER.layer);
  await moreOf("Backscatter HH, 21 Oct 2026");
  await choose("Remove");
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: "Remove the layer" });
  expect(dialog.textContent).toContain(
    'The layer "Backscatter HH, 21 Oct 2026" and its files are removed from the server, and the layer leaves the map. This cannot be undone.',
  );
  await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(dialog.open).toBe(false);
  expect(server.sent("DELETE")).toEqual([]);
  expect(layersStore.get()).toHaveLength(3);

  await moreOf("Backscatter HH, 21 Oct 2026");
  await choose("Remove");
  await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
  await vi.waitFor(() => expect(layersStore.get().map((entry) => entry.layer.id)).toEqual(["coh", "change"]));
  expect(server.sent("DELETE").map(({ address }) => address)).toEqual(["/api/layers/back"]);
  expect(mapLayersStore.get()).toEqual([]);
  expect(messages()).toEqual([["info", 'The layer "Backscatter HH, 21 Oct 2026" was removed.']]);
  await vi.waitFor(() => expect(jobsStore.get()).toEqual([]));
  await vi.waitFor(() => expect(dialog.open).toBe(false));
});

test("a removal that the server refuses is reported, and the layer stays", async () => {
  await show();
  await moreOf("Backscatter HH, 21 Oct 2026");
  await choose("Remove");
  server.refuse("DELETE", "/api/layers", 500, null);
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }));
  await vi.waitFor(() =>
    expect(messages()).toEqual([["error", "The layer could not be removed (the server answered 500)."]]),
  );
  expect(layersStore.get()).toHaveLength(3);
});

test("the header of the section sorts and groups the list", async () => {
  await show();
  const toolbar = within(screen.getByRole("toolbar", { name: "Commands of the list of layers" }));
  expect(toolbar.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
    "Sort by",
    "Group by",
    "Read again",
  ]);
  const pick = async (menu: string, command: string) => {
    await userEvent.click(toolbar.getByRole("button", { name: menu }));
    await choose(command);
  };
  expect(names()).toEqual(["Coherence HH", "Change of backscatter", "Backscatter HH"]);
  await pick("Sort by", "Name");
  expect(names()).toEqual(["Backscatter HH", "Change of backscatter", "Coherence HH"]);
  await pick("Sort by", "Size, largest first");
  expect(names()).toEqual(["Backscatter HH", "Change of backscatter", "Coherence HH"]);
  await pick("Sort by", "Date of the data, latest first");
  expect(names()).toEqual(["Change of backscatter", "Coherence HH", "Backscatter HH"]);
  await pick("Group by", "Received or computed");
  expect(screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)).toEqual([
    "Result of an analysis tool (1)",
    "Received from NASA (2)",
  ]);
  expect(names()).toEqual(["Change of backscatter", "Coherence HH", "Backscatter HH"]);
});

test("a layer that a job shows is marked in the list, and the section opens for it", async () => {
  await show();
  await userEvent.click(screen.getByRole("button", { name: "Layers (3)" }));
  expect(layersOpenStore.get()).toBe(false);
  act(() => showLayer("change"));
  expect(screen.getByRole("button", { name: "Layers (3)", expanded: true })).toBeDefined();
  const marked = item(/^Change of backscatter/);
  expect(marked.getAttribute("aria-pressed")).toBe("true");
  expect(marked.closest("li")?.classList.contains("item--selected")).toBe(true);
  await userEvent.click(marked);
  expect(markedLayerStore.get()).toBeNull();
});

test("a reading that failed is stated in a notice, with a button that reads again", async () => {
  server.refuse("GET", "/api/layers", 500, null);
  await show();
  const alert = screen.getByRole("alert");
  expect(alert.textContent).toBe("The layers could not be read (the server answered 500).");
  server.accept();
  const notice = alert.closest<HTMLElement>(".notice");
  if (!notice) {
    throw new Error("the fault is not in a notice");
  }
  await userEvent.click(within(notice).getByRole("button", { name: "Read again" }));
  await vi.waitFor(() => expect(layersFaultStore.get()).toBeNull());
  expect(names()).toHaveLength(3);
});

test("a layer is put on the map with the keyboard alone", async () => {
  await show();
  item(/^Coherence HH/).focus();
  await userEvent.tab();
  expect(document.activeElement?.textContent).toBe("Add to the map");
  await userEvent.keyboard(" ");
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["coh"]);
});
