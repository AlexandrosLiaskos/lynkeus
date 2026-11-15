// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat } from "ol/proj";
import { beforeEach, expect, test, vi } from "vitest";
import { displayStore, selectedLayerStore, setDisplay } from "../contents/state";
import { baseMapStore } from "../map/baseMaps";
import { areaStore } from "../shared/area";
import { dockStore, openToolPane, resetDock } from "../shared/dock/dock";
import type { LayerDescription } from "../shared/layer";
import { mapLayersStore } from "../shared/mapLayers";
import { MapContext } from "../shared/map";
import { panesStore, resetPanes, setPaneOpen } from "../shared/panes";
import { copyText } from "./clipboard";
import { saveFile } from "./download";
import { forgetDataSources } from "./layerSources";
import { FIRST_LAYOUT_FORM } from "./layout";
import { pictureLegend } from "./legend";
import { makePicture, pictureFile } from "./mapImage";
import type { Picture } from "./picture";
import { statementOf } from "../options/kept";
import { printLayout } from "./printLayout";
import { provenanceText } from "./record";
import { FILE_ADDRESS } from "./RecordFields";
import received from "./testdata/record-gcov-20261021.json";
import { SharePanes } from "./SharePanes";

vi.mock("./clipboard", () => ({ copyText: vi.fn() }));
vi.mock("./printLayout", () => ({ printLayout: vi.fn() }));
vi.mock("./download", async (original) => ({ ...(await original<typeof import("./download")>()), saveFile: vi.fn() }));
vi.mock("./mapImage", async (original) => ({
  ...(await original<typeof import("./mapImage")>()),
  makePicture: vi.fn(),
  pictureFile: vi.fn(),
}));

const PICTURE: Picture = {
  canvas: document.createElement("canvas"),
  view: { projection: "EPSG:3857", center: [0, 0], resolution: 100, rotation: 0, size: [1052, 655] },
  credits: [],
};
const NOTE = /^OpenStreetMap is left out of a picture/;

const BACKSCATTER: LayerDescription = {
  id: "gcov-hhhh-20261021",
  title: "Backscatter HH, 21 Oct 2026",
  kind: "layer",
  url: "/files/gcov-hhhh-20261021/gcov-hhhh-20261021.tif",
  quantity: "Radar backscatter gamma nought, HH, linear power",
  unit: "1",
  range: [0, 0.5],
  colours: "grey",
  dates: ["2026-10-21"],
  inputs: ["NISAR_L2_PR_GCOV_033_141_D_067_4005_DHDH_A_20261021T234330_20261021T234405_P05036_N_F_J_001.h5"],
  program: "Lynkeus 0.1.0",
  method: null,
  record: "/files/gcov-hhhh-20261021/gcov-hhhh-20261021.json",
};
const HIDDEN: LayerDescription = { ...BACKSCATTER, id: "hidden", title: "Hidden layer" };

let map: OlMap;

beforeEach(() => {
  vi.clearAllMocks();
  resetDock();
  resetPanes();
  baseMapStore.set("blue-marble");
  areaStore.set(null);
  mapLayersStore.set([]);
  displayStore.set({});
  selectedLayerStore.set(null);
  forgetDataSources();
  vi.unstubAllGlobals();
  // A test that reads a record gives the answer of the server itself; no test sends a request.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("No record is given in this test.")));
  map = new OlMap({ view: new View({ center: fromLonLat([-70.975, 42.775]), zoom: 10 }) });
  map.setSize([1052, 655]);
});

function open(id: string): void {
  render(
    <MapContext value={map}>
      <SharePanes />
    </MapContext>,
  );
  act(() => openToolPane(id));
}

test("no pane of the Share tab is drawn before its button opens it", () => {
  render(
    <MapContext value={map}>
      <SharePanes />
    </MapContext>,
  );
  expect(screen.queryByRole("complementary")).toBeNull();
});

test.each([
  ["export-map-image", "Map image"],
  ["print-layout", "Layout"],
  ["link-to-map", "Link to this map"],
  ["export-record", "Record"],
  ["citation", "Citation"],
])("the pane %s explains its tool behind the i of its title and holds no hint under a field", (id, title) => {
  mapLayersStore.set([BACKSCATTER]);
  selectedLayerStore.set(BACKSCATTER.id);
  open(id);
  const pane = screen.getByRole("complementary", { name: title });
  expect(screen.getByRole("button", { name: `Information about ${title}` })).toBeDefined();
  expect(pane.querySelector(".usa-hint")).toBeNull();
  const filled = [...pane.querySelectorAll(".usa-button")].filter(
    (button) => !button.classList.contains("usa-button--outline") && !button.classList.contains("usa-button--unstyled"),
  );
  expect(filled).toHaveLength(1);
});

test("the map image starts as the map on the screen and states its size in pixels and on paper", () => {
  open("export-map-image");
  expect(screen.getByRole("complementary", { name: "Map image" })).toBeDefined();
  expect(screen.getByLabelText<HTMLSelectElement>("Resolution").value).toBe("96");
  expect(screen.getByLabelText<HTMLSelectElement>("Size").value).toBe("screen");
  expect(screen.getByText("Pixels").closest(".property-row")?.textContent).toBe("Pixels1052 by 655");
  expect(screen.getByText("On paper").closest(".property-row")?.textContent).toContain("278 by 173 mm");
  expect(screen.queryByLabelText("Width (px)")).toBeNull();
});

test("the fields of the map image stand in two groups, and the explanation of a field stands behind its i", async () => {
  open("export-map-image");
  const picture = screen.getByRole("group", { name: "Picture" });
  const elements = screen.getByRole("group", { name: "Elements" });
  expect(picture.contains(screen.getByLabelText("Size"))).toBe(true);
  expect(elements.contains(screen.getByLabelText("North arrow"))).toBe(true);
  expect(screen.getByRole("button", { name: "Information about Size" })).toBeDefined();
  const explanation = screen.getByText(/^With the size of the screen, the picture shows the whole map/);
  expect(explanation.closest(".info-bubble")).not.toBeNull();
  expect(screen.getByLabelText("Size").getAttribute("aria-describedby")).toBe(explanation.id);
  expect(screen.getByText(/^The north arrow is drawn only when the map is rotated\./).id).toBe(
    elements.getAttribute("aria-describedby"),
  );
  await userEvent.click(screen.getByRole("button", { name: "Elements" }));
  expect(elements.hidden).toBe(true);
});

test("the map image states in a notice that the sources are always written on the picture", () => {
  open("export-map-image");
  const notice = screen.getByText(
    "The sources of the map are always written on the picture, as the services of the basemaps ask.",
  );
  expect(notice.getAttribute("role")).toBe("status");
  expect(notice.closest(".notice--info")).not.toBeNull();
});

test("a higher resolution gives more pixels, and a custom size starts from them", async () => {
  open("export-map-image");
  await userEvent.selectOptions(screen.getByLabelText("Resolution"), "300");
  expect(screen.getByText("3288 by 2047")).toBeDefined();
  await userEvent.selectOptions(screen.getByLabelText("Size"), "custom");
  expect(screen.getByLabelText<HTMLInputElement>("Width (px)").value).toBe("3288");
  expect(screen.getByLabelText<HTMLInputElement>("Height (px)").value).toBe("2047");
  expect(screen.getByLabelText<HTMLInputElement>("Keep proportions").checked).toBe(true);
});

test("a wrong side is named at the foot, and the picture cannot be saved until it is corrected", async () => {
  open("export-map-image");
  await userEvent.selectOptions(screen.getByLabelText("Size"), "custom");
  const width = screen.getByLabelText("Width (px)");
  await userEvent.clear(width);
  await userEvent.type(width, "50");
  const fault = "Enter a width between 100 and 8000 pixels, without decimals.";
  const save = screen.getByRole("button", { name: "Save as PNG" });
  const missing = screen.getByText(fault);
  expect(missing.closest(".tool-pane-foot")).not.toBeNull();
  expect(save.getAttribute("aria-describedby")).toBe(missing.id);
  expect(save.getAttribute("aria-disabled")).toBe("true");
  expect(screen.queryByText("Pixels")).toBeNull();
  await userEvent.click(save);
  expect(makePicture).not.toHaveBeenCalled();
  await userEvent.type(width, "0");
  expect(screen.queryByText(fault)).toBeNull();
  expect(save.getAttribute("aria-disabled")).toBeNull();
});

test("the error of a side is written under its field after the field is left", async () => {
  open("export-map-image");
  await userEvent.selectOptions(screen.getByLabelText("Size"), "custom");
  await userEvent.click(screen.getByLabelText("Keep proportions"));
  const width = screen.getByLabelText("Width (px)");
  await userEvent.clear(width);
  await userEvent.type(width, "50");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(width.getAttribute("aria-invalid")).toBeNull();
  await userEvent.tab();
  const error = screen.getByRole("alert");
  expect(error.textContent).toBe("Enter a width between 100 and 8000 pixels, without decimals.");
  expect(width.getAttribute("aria-invalid")).toBe("true");
  expect(width.getAttribute("aria-describedby")?.split(" ")).toContain(error.id);
  expect(width.nextElementSibling).toBe(error);
  await userEvent.type(width, "0");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(width.getAttribute("aria-invalid")).toBeNull();
});

test("the form tells beforehand when OpenStreetMap will be left out", async () => {
  open("export-map-image");
  act(() => baseMapStore.set("openstreetmap"));
  expect(screen.queryByText(NOTE)).toBeNull();
  await userEvent.selectOptions(screen.getByLabelText("Resolution"), "150");
  expect(screen.getByText(NOTE).closest(".notice--warning")).not.toBeNull();
  act(() => baseMapStore.set("blue-marble"));
  expect(screen.queryByText(NOTE)).toBeNull();
});

test("the Save button draws the picture with the choices of the form and saves it as a PNG file", async () => {
  vi.mocked(makePicture).mockResolvedValue({ picture: PICTURE, notes: [] });
  const file = new Blob(["png"], { type: "image/png" });
  vi.mocked(pictureFile).mockResolvedValue(file);
  open("export-map-image");
  await userEvent.click(screen.getByLabelText("Scale bar"));
  await userEvent.click(screen.getByRole("button", { name: "Save as PNG" }));
  const outcome = await screen.findByText(/^The picture was saved as /);
  expect(makePicture).toHaveBeenCalledWith(map, {
    width: 1052,
    height: 655,
    resolution: 96,
    sources: true,
    scaleBar: false,
    northArrow: "rotated",
    legends: [],
  });
  expect(pictureFile).toHaveBeenCalledWith(PICTURE, 96);
  const [content, name] = vi.mocked(saveFile).mock.calls[0] ?? [];
  expect(content).toBe(file);
  expect(name).toMatch(/^lynkeus-map-\d{8}-\d{6}\.png$/);
  expect(outcome.textContent).toBe(`The picture was saved as ${name ?? ""}.`);
  expect(outcome.getAttribute("role")).toBe("status");
});

test("a note of the picture is shown with the outcome, and a failure is shown as an error", async () => {
  vi.mocked(makePicture).mockResolvedValueOnce({ picture: PICTURE, notes: ["A basemap was left out."] });
  vi.mocked(pictureFile).mockResolvedValue(new Blob());
  open("export-map-image");
  await userEvent.click(screen.getByRole("button", { name: "Save as PNG" }));
  expect(await screen.findByText(/\.png\. A basemap was left out\.$/)).toBeDefined();
  vi.mocked(makePicture).mockRejectedValueOnce(new Error("The map was not drawn in full."));
  await userEvent.click(screen.getByRole("button", { name: "Save as PNG" }));
  expect((await screen.findByText("The map was not drawn in full.")).getAttribute("role")).toBe("alert");
});

test("the layout takes a title, a paper size, an orientation, a resolution and its elements", async () => {
  vi.mocked(printLayout).mockResolvedValue([]);
  open("print-layout");
  expect(screen.getByRole("complementary", { name: "Layout" })).toBeDefined();
  await userEvent.type(screen.getByLabelText("Title"), "Lower Merrimack River");
  await userEvent.selectOptions(screen.getByLabelText("Paper size"), "A3");
  await userEvent.selectOptions(screen.getByLabelText("Orientation"), "portrait");
  await userEvent.selectOptions(screen.getByLabelText("Map resolution"), "150");
  expect(screen.getByRole("group", { name: "Page" }).contains(screen.getByLabelText("Title"))).toBe(true);
  expect(screen.getByRole("group", { name: "Elements" }).contains(screen.getByLabelText("Coordinate frame"))).toBe(
    true,
  );
  await userEvent.click(screen.getByLabelText("North arrow"));
  await userEvent.click(screen.getByRole("button", { name: "Print" }));
  expect(printLayout).toHaveBeenCalledWith(
    map,
    {
      ...FIRST_LAYOUT_FORM,
      title: "Lower Merrimack River",
      paper: "A3",
      orientation: "portrait",
      resolution: 150,
      northArrow: false,
    },
    [],
  );
  expect(await screen.findByText("The page was sent to the print window of the browser.")).toBeDefined();
  expect(printLayout).toHaveBeenCalledTimes(1);
});

test("the layout states in a notice what every page carries, and explains the resolution behind its i", () => {
  open("print-layout");
  const notice = screen.getByText(
    "The page always states the scale, the projection, the date and the sources of the map.",
  );
  expect(notice.closest(".notice--info")).not.toBeNull();
  const explanation = screen.getByText(/^With the pixels of the screen, the page shows the largest part of the map/);
  expect(explanation.closest(".info-bubble")).not.toBeNull();
  expect(screen.getByLabelText("Map resolution").getAttribute("aria-describedby")).toBe(explanation.id);
});

test("the layout tells beforehand when OpenStreetMap will be left out, and shows a failure as an error", async () => {
  vi.mocked(printLayout).mockRejectedValue(new Error("The page could not be laid out, so nothing was printed."));
  open("print-layout");
  act(() => baseMapStore.set("openstreetmap"));
  expect(screen.queryByText(NOTE)).toBeNull();
  await userEvent.selectOptions(screen.getByLabelText("Map resolution"), "300");
  expect(screen.getByText(NOTE).closest(".notice--warning")).not.toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Print" }));
  const failure = await screen.findByText("The page could not be laid out, so nothing was printed.");
  expect(failure.getAttribute("role")).toBe("alert");
});

test("the link shows the address of the map and follows the view, the basemap and the area", () => {
  open("link-to-map");
  const address = screen.getByLabelText<HTMLTextAreaElement>("Address");
  const page = window.location.href.replace(/#.*$/, "");
  expect(address.value).toBe(`${page}#map=10/42.775/-70.975&basemap=blue-marble`);
  expect(address.readOnly).toBe(true);
  act(() => {
    map.getView().setZoom(11.5);
    map.dispatchEvent("moveend");
    baseMapStore.set("openstreetmap");
    areaStore.set({ west: -71.2, south: 42.6, east: -70.75, north: 42.95 });
  });
  expect(address.value).toBe(`${page}#map=11.5/42.775/-70.975&basemap=openstreetmap&area=-71.2,42.6,-70.75,42.95`);
});

test("the link explains behind its i what the address holds, and states in a notice what it does not hold", () => {
  open("link-to-map");
  const explanation = screen.getByText(/^The address opens Lynkeus with the same view of the map/);
  expect(explanation.closest(".info-bubble")).not.toBeNull();
  expect(screen.getByLabelText("Address").getAttribute("aria-describedby")).toBe(explanation.id);
  const notice = screen.getByText(/^The address does not hold the layers of the map\./);
  expect(notice.closest(".notice--info")).not.toBeNull();
});

test("the Copy button copies the address, and the outcome leaves when the map moves", async () => {
  vi.mocked(copyText).mockResolvedValue(undefined);
  open("link-to-map");
  const address = screen.getByLabelText<HTMLTextAreaElement>("Address");
  await userEvent.click(screen.getByRole("button", { name: "Copy address" }));
  expect(await screen.findByText("The address was copied.")).toBeDefined();
  expect(copyText).toHaveBeenCalledWith(address.value);
  act(() => {
    map.getView().setZoom(12);
    map.dispatchEvent("moveend");
  });
  expect(screen.queryByText("The address was copied.")).toBeNull();
});

test("when the browser refuses the copy, the address is selected for the keyboard", async () => {
  vi.mocked(copyText).mockRejectedValue(new Error("Not allowed"));
  open("link-to-map");
  const address = screen.getByLabelText<HTMLTextAreaElement>("Address");
  await userEvent.click(screen.getByRole("button", { name: "Copy address" }));
  expect(
    await screen.findByText("The browser did not allow the copy. The address is selected; copy it with the keyboard."),
  ).toBeDefined();
  expect(document.activeElement).toBe(address);
  expect(address.selectionStart).toBe(0);
  expect(address.selectionEnd).toBe(address.value.length);
});

test("the legend is offered when the map shows a layer, and the picture and the page receive the layers shown", async () => {
  vi.mocked(makePicture).mockResolvedValue({ picture: PICTURE, notes: [] });
  vi.mocked(pictureFile).mockResolvedValue(new Blob());
  vi.mocked(printLayout).mockResolvedValue([]);
  open("export-map-image");
  expect(screen.queryByLabelText("Legend")).toBeNull();
  act(() => {
    mapLayersStore.set([BACKSCATTER, HIDDEN]);
    setDisplay(HIDDEN, { visible: false });
  });
  expect(screen.getByLabelText<HTMLInputElement>("Legend").checked).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Save as PNG" }));
  await screen.findByText(/^The picture was saved as /);
  expect(vi.mocked(makePicture).mock.calls[0]?.[1].legends).toEqual([pictureLegend(BACKSCATTER)]);

  act(() => openToolPane("print-layout"));
  await userEvent.click(screen.getByRole("button", { name: "Print" }));
  expect(vi.mocked(printLayout).mock.calls[0]?.[2]).toEqual([BACKSCATTER]);
});

test("without the legend, the picture is drawn with no legend", async () => {
  vi.mocked(makePicture).mockResolvedValue({ picture: PICTURE, notes: [] });
  vi.mocked(pictureFile).mockResolvedValue(new Blob());
  mapLayersStore.set([BACKSCATTER]);
  open("export-map-image");
  await userEvent.click(screen.getByLabelText("Legend"));
  await userEvent.click(screen.getByRole("button", { name: "Save as PNG" }));
  await screen.findByText(/^The picture was saved as /);
  expect(vi.mocked(makePicture).mock.calls[0]?.[1].legends).toEqual([]);
});

test("without a layer on the map, the record states what is needed and offers the tool that gets a layer", async () => {
  open("export-record");
  expect(screen.getByText("No layers on the map")).toBeDefined();
  expect(screen.getByText("Get a layer, then select it in the Contents pane to save its record.")).toBeDefined();
  const save = screen.getByRole("button", { name: "Save record" });
  expect(save.getAttribute("aria-disabled")).toBe("true");
  expect(screen.getByText("Get a layer first.").id).toBe(save.getAttribute("aria-describedby"));
  await userEvent.click(screen.getByRole("button", { name: "Get layer" }));
  expect(dockStore.get().tools).toContain("get-layer");
});

test("with layers and none selected, the record asks for a selection and offers the Contents pane", async () => {
  mapLayersStore.set([BACKSCATTER]);
  act(() => setPaneOpen("contents", false));
  open("export-record");
  expect(screen.getByText("No layer selected")).toBeDefined();
  expect(screen.getByText("Select a layer in the Contents pane to save its record.")).toBeDefined();
  const save = screen.getByRole("button", { name: "Save record" });
  expect(save.getAttribute("aria-disabled")).toBe("true");
  expect(screen.getByText("Select a layer in the Contents pane.").id).toBe(save.getAttribute("aria-describedby"));
  await userEvent.click(screen.getByRole("button", { name: "Show Contents pane" }));
  expect(panesStore.get().contents.open).toBe(true);
  act(() => selectedLayerStore.set(BACKSCATTER.id));
  expect(screen.queryByText("No layer selected")).toBeNull();
  expect(save.getAttribute("aria-disabled")).toBeNull();
});

test("the STAC record of the selected layer is saved beside the name of its data file", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(received) }));
  mapLayersStore.set([BACKSCATTER]);
  selectedLayerStore.set(BACKSCATTER.id);
  open("export-record");
  expect(screen.getByText("Layer").closest(".property-row")?.textContent).toContain("Backscatter HH, 21 Oct 2026");
  const format = screen.getByRole("group", { name: "Format" });
  const explanation = screen.getByText(/^A STAC record is a JSON file in the form of a STAC Item/);
  expect(explanation.closest(".info-bubble")).not.toBeNull();
  expect(format.getAttribute("aria-describedby")).toBe(explanation.id);
  expect(screen.getByLabelText<HTMLInputElement>("STAC record").checked).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Save record" }));
  expect(await screen.findByText("The record was saved as backscatter-hh-20261021.json.")).toBeDefined();
  const [content, name] = vi.mocked(saveFile).mock.calls[0] ?? [];
  expect(name).toBe("backscatter-hh-20261021.json");
  expect(content?.type).toBe("application/geo+json");
  const saved = JSON.parse((await content?.text()) ?? "null") as typeof received;
  expect(saved.assets.data.href).toBe("./backscatter-hh-20261021.tif");
  expect(saved.properties).toEqual(received.properties);
});

test("the pane of the record says who reads the file of the layer at the address that the record holds", () => {
  mapLayersStore.set([BACKSCATTER]);
  selectedLayerStore.set(BACKSCATTER.id);
  open("export-record");
  const notice = screen.getByText(FILE_ADDRESS);
  expect(notice.getAttribute("role")).toBe("status");
  // The sentence about the file is the statement of docs/Storage.md.
  expect(FILE_ADDRESS).toBe(
    "The saved record holds the address of the layer on this site. The file of a layer is read by whoever holds its address, until the layer is removed.",
  );
  expect(FILE_ADDRESS.endsWith(` ${statementOf("files")}`)).toBe(true);
  // The provenance record writes the address of the file, with the name of the site.
  expect(provenanceText(BACKSCATTER, null, "https://lynkeus.nkua.cloud/")).toContain(
    `File: https://lynkeus.nkua.cloud${BACKSCATTER.url}\n`,
  );
  // Without a selected layer the pane shows no record, and so no such sentence.
  act(() => selectedLayerStore.set(null));
  expect(screen.queryByText(FILE_ADDRESS)).toBeNull();
});

test("the provenance record is saved as text, also when the STAC record cannot be read", async () => {
  const fetched = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(received) });
  vi.stubGlobal("fetch", fetched);
  mapLayersStore.set([BACKSCATTER]);
  selectedLayerStore.set(BACKSCATTER.id);
  open("export-record");
  await userEvent.click(screen.getByLabelText("Provenance record"));
  await userEvent.click(screen.getByRole("button", { name: "Save record" }));
  expect(
    await screen.findByText("The provenance record was saved as backscatter-hh-20261021-provenance.txt."),
  ).toBeDefined();
  const [content, name] = vi.mocked(saveFile).mock.calls[0] ?? [];
  expect(name).toBe("backscatter-hh-20261021-provenance.txt");
  expect(content?.type).toBe("text/plain;charset=utf-8");
  const text = (await content?.text()) ?? "";
  expect(text).toContain("Title: Backscatter HH, 21 Oct 2026");
  expect(text).toContain("Lineage: Layer /science/LSAR/GCOV/grids/frequencyA/HHHH of the NISAR product");

  fetched.mockResolvedValue({ ok: false, status: 404 });
  await userEvent.click(screen.getByRole("button", { name: "Save record" }));
  expect(await screen.findByText(/without the lines of the STAC record, which could not be read\.$/)).toBeDefined();
  expect((await vi.mocked(saveFile).mock.calls[1]?.[0].text()) ?? "").not.toContain("Lineage:");
});

test("a STAC record that cannot be read is not saved, and the reason is shown", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
  mapLayersStore.set([BACKSCATTER]);
  selectedLayerStore.set(BACKSCATTER.id);
  open("export-record");
  await userEvent.click(screen.getByRole("button", { name: "Save record" }));
  const failure = await screen.findByText("The server did not give the record of the layer (answer 404).");
  expect(failure.getAttribute("role")).toBe("alert");
  expect(saveFile).not.toHaveBeenCalled();
});

test("the citation of the selected layer is shown and copied", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(received) }));
  vi.mocked(copyText).mockResolvedValue(undefined);
  mapLayersStore.set([BACKSCATTER]);
  selectedLayerStore.set(BACKSCATTER.id);
  open("citation");
  expect(screen.getByText("The record of the layer is being read.").closest(".tool-pane-foot")).not.toBeNull();
  const citation = await screen.findByRole<HTMLTextAreaElement>("textbox", { name: "Citation" });
  expect(citation.readOnly).toBe(true);
  expect(screen.getByText("Layer").closest(".property-row")?.textContent).toContain("Backscatter HH, 21 Oct 2026");
  const explanation = screen.getByText(/^The data are cited as NASA's catalogue cites a NISAR collection/);
  expect(explanation.closest(".info-bubble")).not.toBeNull();
  expect(citation.getAttribute("aria-describedby")).toBe(explanation.id);
  expect(citation.value).toContain(
    "NASA/JPL/NISAR. NISAR Validated Geocoded Polarimetric Covariance Product (Version 1) [Dataset]. " +
      "NASA Alaska Satellite Facility Distributed Active Archive Center. https://doi.org/10.5067/NIL2GCOV-V1 " +
      "Date accessed: 2026-11-14.",
  );
  expect(citation.value).toContain("Liaskos, A., and Team Lynkeus. Lynkeus (Version ");
  await userEvent.click(screen.getByRole("button", { name: "Copy citation" }));
  expect(await screen.findByText("The citation was copied.")).toBeDefined();
  expect(copyText).toHaveBeenCalledWith(citation.value);
});

test("a layer whose record names no DOI has no citation, and nothing can be copied", async () => {
  const withoutDoi = { ...received, properties: { ...received.properties, "sci:doi": undefined } };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(withoutDoi) }));
  mapLayersStore.set([BACKSCATTER]);
  selectedLayerStore.set(BACKSCATTER.id);
  open("citation");
  expect(await screen.findByText("No citation for this layer")).toBeDefined();
  expect(screen.getByText("Select a layer whose record names the DOI of its NISAR collection.")).toBeDefined();
  const copy = screen.getByRole("button", { name: "Copy citation" });
  expect(copy.getAttribute("aria-disabled")).toBe("true");
  expect(screen.getByText("The record of the layer names no DOI of a NISAR collection.").id).toBe(
    copy.getAttribute("aria-describedby"),
  );
  await userEvent.click(screen.getByRole("button", { name: "Copy citation" }));
  expect(copyText).not.toHaveBeenCalled();
});

test("the citation asks for a selected layer", () => {
  mapLayersStore.set([BACKSCATTER]);
  open("citation");
  expect(screen.getByText("No layer selected")).toBeDefined();
  expect(screen.getByText("Select a layer in the Contents pane to cite it.")).toBeDefined();
  expect(screen.getByRole("button", { name: "Show Contents pane" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Copy citation" }).getAttribute("aria-disabled")).toBe("true");
});

test("when the browser refuses the copy, the citation is selected for the keyboard", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(received) }));
  vi.mocked(copyText).mockRejectedValue(new Error("Not allowed"));
  mapLayersStore.set([BACKSCATTER]);
  selectedLayerStore.set(BACKSCATTER.id);
  open("citation");
  const citation = await screen.findByRole<HTMLTextAreaElement>("textbox", { name: "Citation" });
  await userEvent.click(screen.getByRole("button", { name: "Copy citation" }));
  expect(
    await screen.findByText("The browser did not allow the copy. The citation is selected; copy it with the keyboard."),
  ).toBeDefined();
  expect(document.activeElement).toBe(citation);
});
