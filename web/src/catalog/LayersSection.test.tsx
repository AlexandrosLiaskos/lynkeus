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
import { LayersSection, layersSentence } from "./LayersSection";
import { openLayerStore } from "./state";

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
  openLayerStore.set(null);
  mapLayersStore.set([]);
  messagesStore.set([]);
  server = standIn();
  map = new OlMap({ view: new View({ center: [0, 0], zoom: 2 }) });
  map.setSize([800, 600]);
});

afterEach(() => {
  resetJobs();
  vi.unstubAllGlobals();
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

const item = (name: RegExp) => screen.getByRole("button", { name });
const names = () =>
  screen.getAllByRole("listitem").map((row) => row.querySelector(".catalog-item-title")?.textContent.split(",")[0]);
const messages = () => messagesStore.get().map(({ kind, text }) => [kind, text]);

/** Show the tools of a layer and return their group. */
async function toolsOf(name: RegExp, title: string) {
  await userEvent.click(item(name));
  return within(screen.getByRole("group", { name: `Tools of the layer ${title}` }));
}

test("the section is not shown while the session has no layer", () => {
  render(<LayersSection />, { wrapper: ({ children }) => <MapContext value={map}>{children}</MapContext> });
  expect(screen.queryByRole("region")).toBeNull();
});

test("each layer shows its name, its quantity with the unit, its dates and its size", async () => {
  await show();
  expect(screen.getByRole("region", { name: "Layers" })).toBeDefined();
  expect(screen.getByRole("status").textContent).toBe("3 layers, 100 MB. None is on the map.");
  expect(screen.getAllByRole("listitem").map((row) => row.querySelector("button")?.textContent)).toEqual([
    "Coherence HH, 9 and 21 Oct 2026Coherence (no unit)9 Oct 2026 and 21 Oct 2026 · 12 MB",
    "Change of backscatterChange of radar backscatter (dB)21 Oct 2026 and 2 Nov 2026 · 30 MB",
    "Backscatter HH, 21 Oct 2026Radar backscatter gamma nought, HH, linear power (no unit)21 Oct 2026 · 57 MB",
  ]);
});

test("the sentence of the section counts the layers, their size and those on the map", () => {
  const entry = { layer: layer(), size: 4_000_000, created: null };
  expect(layersSentence([entry], 1)).toBe("1 layer, 4 MB. 1 is on the map.");
  expect(layersSentence([entry, { ...entry, size: null }], 2)).toBe("2 layers. 2 are on the map.");
});

test("a layer is added to the map and taken off it", async () => {
  await show();
  const tools = await toolsOf(/^Backscatter HH/, "Backscatter HH, 21 Oct 2026");
  expect(tools.getAllByRole("button").map((button) => button.textContent)).toEqual([
    "Add to the map",
    "Zoom to",
    "Details",
    "Rename",
    "Remove",
  ]);
  await userEvent.click(tools.getByRole("button", { name: "Add to the map" }));
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["back"]);
  expect(item(/^Backscatter HH/).textContent).toMatch(/57 MB · On the map$/);
  expect(screen.getByRole("status").textContent).toBe("3 layers, 100 MB. 1 is on the map.");
  await userEvent.click(tools.getByRole("button", { name: "Remove from the map" }));
  expect(mapLayersStore.get()).toEqual([]);
  expect(layersStore.get()).toHaveLength(3);
});

test("the map moves to the extent that the STAC record of a layer states", async () => {
  server.files[BACKSCATTER.layer.record] = { type: "Feature", bbox: [-71.2, 42.6, -70.75, 42.95] };
  const fit = vi.spyOn(map.getView(), "fit");
  await show();
  const tools = await toolsOf(/^Backscatter HH/, "Backscatter HH, 21 Oct 2026");
  await userEvent.click(tools.getByRole("button", { name: "Zoom to" }));
  await vi.waitFor(() => expect(fit).toHaveBeenCalledTimes(1));
  expect(fit.mock.calls[0]?.[0]).toEqual(transformExtent([-71.2, 42.6, -70.75, 42.95], "EPSG:4326", "EPSG:3857"));
});

test("a record that cannot be read is reported, and the map stays", async () => {
  const fit = vi.spyOn(map.getView(), "fit");
  await show();
  const tools = await toolsOf(/^Backscatter HH/, "Backscatter HH, 21 Oct 2026");
  await userEvent.click(tools.getByRole("button", { name: "Zoom to" }));
  await vi.waitFor(() => expect(messages()).toEqual([["error", "Not found."]]));
  expect(fit).not.toHaveBeenCalled();
});

test("the details show every field of the description, with the links to the two files", async () => {
  await show();
  const tools = await toolsOf(/^Change of backscatter/, "Change of backscatter");
  await userEvent.click(tools.getByRole("button", { name: "Details" }));
  const dialog = within(screen.getByRole("dialog", { name: "Layer: Change of backscatter" }));
  expect(dialog.getAllByRole("row").map((row) => row.textContent)).toEqual([
    "NameChange of backscatter",
    "KindResult of an analysis tool",
    "QuantityChange of radar backscatter",
    "UnitdB",
    "Range of the legend0.01 to 0.6",
    "Colour scalegrey",
    "Dates of the data21 Oct 2026 and 2 Nov 2026",
    "Product file usedNISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001",
    "ProgramLynkeus 0.1.0",
    "Methoddocs/methods/backscatter-change.md",
    "Size of the files30 MB",
    "Made14 Nov 2026, 16:30:00 UTC",
    "GeoTIFF filebackscatter-hh.tif",
    "STAC recordbackscatter-hh.json (opens in a new tab)",
    "Identifier of the layerchange",
  ]);
  const file = dialog.getByRole<HTMLAnchorElement>("link", { name: "backscatter-hh.tif" });
  expect(file.getAttribute("href")).toBe(CHANGE.layer.url);
  expect(file.hasAttribute("download")).toBe(true);
  const record = dialog.getByRole<HTMLAnchorElement>("link", { name: /^backscatter-hh\.json/ });
  expect(record.getAttribute("href")).toBe(CHANGE.layer.record);
  expect(record.target).toBe("_blank");
});

test("a layer without a stated size, time or method shows no such field", async () => {
  await show([{ layer: BACKSCATTER.layer }]);
  expect(item(/^Backscatter HH/).textContent).toMatch(/21 Oct 2026$/);
  const tools = await toolsOf(/^Backscatter HH/, "Backscatter HH, 21 Oct 2026");
  await userEvent.click(tools.getByRole("button", { name: "Details" }));
  const rows = within(screen.getByRole("dialog"))
    .getAllByRole("row")
    .map((row) => row.textContent);
  expect(rows.filter((row) => /^(Method|Size|Made)/.test(row))).toEqual([]);
  expect(rows).toContain("KindReceived from NASA");
});

test("the GeoTIFF file of a layer is downloaded from its address", async () => {
  await show();
  const tools = await toolsOf(/^Coherence HH/, "Coherence HH, 9 and 21 Oct 2026");
  const link = tools.getByRole<HTMLAnchorElement>("link", { name: "Download" });
  expect(link.getAttribute("href")).toBe("/files/coh/coherence-hh.tif");
  expect(link.hasAttribute("download")).toBe(true);
});

test("a layer is renamed in its place", async () => {
  await show();
  addToMap(BACKSCATTER.layer);
  const tools = await toolsOf(/^Backscatter HH/, "Backscatter HH, 21 Oct 2026");
  await userEvent.click(tools.getByRole("button", { name: "Rename" }));
  const field = screen.getByRole<HTMLInputElement>("textbox", { name: "New name of the layer" });
  expect(field.value).toBe("Backscatter HH, 21 Oct 2026");
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
});

test("a renaming that the server refuses is stated at the field, and Cancel leaves the name", async () => {
  await show();
  const tools = await toolsOf(/^Backscatter HH/, "Backscatter HH, 21 Oct 2026");
  await userEvent.click(tools.getByRole("button", { name: "Rename" }));
  server.refuse("PATCH", "/api/layers", 400, REFUSAL);
  await userEvent.type(screen.getByRole("textbox", { name: "New name of the layer" }), " again{Enter}");
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
  const tools = await toolsOf(/^Backscatter HH/, "Backscatter HH, 21 Oct 2026");
  await userEvent.click(tools.getByRole("button", { name: "Remove" }));
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: "Remove the layer" });
  expect(dialog.textContent).toContain(
    'The layer "Backscatter HH, 21 Oct 2026" and its files are removed from the server, and the layer leaves the map. This cannot be undone.',
  );
  await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(dialog.open).toBe(false);
  expect(server.sent("DELETE")).toEqual([]);
  expect(layersStore.get()).toHaveLength(3);

  await userEvent.click(tools.getByRole("button", { name: "Remove" }));
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
  const tools = await toolsOf(/^Backscatter HH/, "Backscatter HH, 21 Oct 2026");
  await userEvent.click(tools.getByRole("button", { name: "Remove" }));
  server.refuse("DELETE", "/api/layers", 500, null);
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }));
  await vi.waitFor(() =>
    expect(messages()).toEqual([["error", "The layer could not be removed (the server answered 500)."]]),
  );
  expect(layersStore.get()).toHaveLength(3);
});

test("the list is sorted and grouped", async () => {
  await show();
  expect(names()).toEqual(["Coherence HH", "Change of backscatter", "Backscatter HH"]);
  await userEvent.selectOptions(screen.getByLabelText("Sort by"), "Name");
  expect(names()).toEqual(["Backscatter HH", "Change of backscatter", "Coherence HH"]);
  await userEvent.selectOptions(screen.getByLabelText("Sort by"), "Size, largest first");
  expect(names()).toEqual(["Backscatter HH", "Change of backscatter", "Coherence HH"]);
  await userEvent.selectOptions(screen.getByLabelText("Sort by"), "Date of the data, latest first");
  expect(names()).toEqual(["Change of backscatter", "Coherence HH", "Backscatter HH"]);
  await userEvent.selectOptions(screen.getByLabelText("Group by"), "Received or computed");
  expect(screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)).toEqual([
    "Result of an analysis tool (1)",
    "Received from NASA (2)",
  ]);
  expect(names()).toEqual(["Change of backscatter", "Coherence HH", "Backscatter HH"]);
});

test("a layer that the list of jobs names shows its tools", async () => {
  await show();
  act(() => openLayerStore.set("change"));
  expect(item(/^Change of backscatter/).getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("group", { name: "Tools of the layer Change of backscatter" })).toBeDefined();
});

test("a reading that failed is stated, with a button that reads again", async () => {
  server.refuse("GET", "/api/layers", 500, null);
  await show();
  expect(screen.getByRole("alert").textContent).toMatch(/^The layers could not be read \(the server answered 500\)\./);
  server.accept();
  await userEvent.click(screen.getByRole("button", { name: "Read again" }));
  await vi.waitFor(() => expect(layersFaultStore.get()).toBeNull());
  expect(names()).toHaveLength(3);
});

test("a layer is put on the map with the keyboard alone", async () => {
  await show();
  item(/^Coherence HH/).focus();
  await userEvent.keyboard("{Enter}");
  await userEvent.tab();
  expect(document.activeElement?.textContent).toBe("Add to the map");
  await userEvent.keyboard(" ");
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["coh"]);
});
