import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat } from "ol/proj";
import { beforeEach, expect, test, vi } from "vitest";
import { displayStore, selectedLayerStore, setDisplay } from "../contents/state";
import { baseMapStore } from "../map/baseMaps";
import { areaStore } from "../shared/area";
import { openToolPane, resetDock } from "../shared/dock/dock";
import type { LayerDescription } from "../shared/layer";
import { mapLayersStore } from "../shared/mapLayers";
import { MapContext } from "../shared/map";
import { copyText } from "./clipboard";
import { saveFile } from "./download";
import { forgetDataSources } from "./layerSources";
import { FIRST_LAYOUT_FORM } from "./layout";
import { pictureLegend } from "./legend";
import { makePicture, pictureFile } from "./mapImage";
import type { Picture } from "./picture";
import { printLayout } from "./printLayout";
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
  baseMapStore.set("blue-marble");
  areaStore.set(null);
  mapLayersStore.set([]);
  displayStore.set({});
  selectedLayerStore.set(null);
  forgetDataSources();
  vi.unstubAllGlobals();
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

test("the map image starts as the map on the screen and states its size in pixels and on paper", () => {
  open("export-map-image");
  expect(screen.getByRole("complementary", { name: "Map image" })).toBeDefined();
  expect(screen.getByLabelText<HTMLSelectElement>("Resolution").value).toBe("96");
  expect(screen.getByLabelText<HTMLSelectElement>("Size").value).toBe("screen");
  expect(
    screen.getByText("The picture has 1052 by 655 pixels. On paper it measures 278 by 173 millimetres."),
  ).toBeDefined();
  expect(screen.queryByLabelText("Width in pixels")).toBeNull();
});

test("a higher resolution gives more pixels, and a custom size starts from them", async () => {
  open("export-map-image");
  await userEvent.selectOptions(screen.getByLabelText("Resolution"), "300");
  expect(screen.getByText(/^The picture has 3288 by 2047 pixels\./)).toBeDefined();
  await userEvent.selectOptions(screen.getByLabelText("Size"), "custom");
  expect(screen.getByLabelText<HTMLInputElement>("Width in pixels").value).toBe("3288");
  expect(screen.getByLabelText<HTMLInputElement>("Height in pixels").value).toBe("2047");
  expect(screen.getByLabelText<HTMLInputElement>("Keep the proportions of the map").checked).toBe(true);
});

test("a wrong side is named, and the picture cannot be saved until it is corrected", async () => {
  open("export-map-image");
  await userEvent.selectOptions(screen.getByLabelText("Size"), "custom");
  const width = screen.getByLabelText("Width in pixels");
  await userEvent.clear(width);
  await userEvent.type(width, "50");
  expect(screen.getByRole("alert").textContent).toBe("Enter a width between 100 and 8000 pixels, without decimals.");
  const save = screen.getByRole("button", { name: "Save" });
  expect(save.getAttribute("aria-disabled")).toBe("true");
  await userEvent.click(save);
  expect(makePicture).not.toHaveBeenCalled();
  await userEvent.type(width, "0");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(save.getAttribute("aria-disabled")).toBeNull();
});

test("the form tells beforehand when OpenStreetMap will be left out", async () => {
  open("export-map-image");
  act(() => baseMapStore.set("openstreetmap"));
  expect(screen.queryByText(NOTE)).toBeNull();
  await userEvent.selectOptions(screen.getByLabelText("Resolution"), "150");
  expect(screen.getByText(NOTE)).toBeDefined();
  act(() => baseMapStore.set("blue-marble"));
  expect(screen.queryByText(NOTE)).toBeNull();
});

test("the Save button draws the picture with the choices of the form and saves it as a PNG file", async () => {
  vi.mocked(makePicture).mockResolvedValue({ picture: PICTURE, notes: [] });
  const file = new Blob(["png"], { type: "image/png" });
  vi.mocked(pictureFile).mockResolvedValue(file);
  open("export-map-image");
  await userEvent.click(screen.getByLabelText("Scale bar"));
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
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
  vi.mocked(makePicture).mockResolvedValueOnce({ picture: PICTURE, notes: ["A background map was left out."] });
  vi.mocked(pictureFile).mockResolvedValue(new Blob());
  open("export-map-image");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText(/\.png\. A background map was left out\.$/)).toBeDefined();
  vi.mocked(makePicture).mockRejectedValueOnce(new Error("The map was not drawn in full."));
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect((await screen.findByText("The map was not drawn in full.")).getAttribute("role")).toBe("alert");
});

test("the layout takes a title, a paper size, an orientation, a resolution and its elements", async () => {
  vi.mocked(printLayout).mockResolvedValue([]);
  open("print-layout");
  expect(screen.getByRole("complementary", { name: "Layout" })).toBeDefined();
  await userEvent.type(screen.getByLabelText("Title"), "Lower Merrimack River");
  await userEvent.selectOptions(screen.getByLabelText("Paper size"), "A3");
  await userEvent.selectOptions(screen.getByLabelText("Orientation"), "portrait");
  await userEvent.selectOptions(screen.getByLabelText("Resolution of the map"), "150");
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
  expect(await screen.findByText("The page was given to the print window of the browser.")).toBeDefined();
  expect(printLayout).toHaveBeenCalledTimes(1);
});

test("the layout tells beforehand when OpenStreetMap will be left out, and shows a failure as an error", async () => {
  vi.mocked(printLayout).mockRejectedValue(new Error("The page could not be laid out, so nothing was printed."));
  open("print-layout");
  act(() => baseMapStore.set("openstreetmap"));
  expect(screen.queryByText(NOTE)).toBeNull();
  await userEvent.selectOptions(screen.getByLabelText("Resolution of the map"), "300");
  expect(screen.getByText(NOTE)).toBeDefined();
  await userEvent.click(screen.getByRole("button", { name: "Print" }));
  const failure = await screen.findByText("The page could not be laid out, so nothing was printed.");
  expect(failure.getAttribute("role")).toBe("alert");
});

test("the link shows the address of the map and follows the view, the background map and the area", () => {
  open("link-to-map");
  const address = screen.getByLabelText<HTMLTextAreaElement>("Address of this map");
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

test("the Copy button copies the address, and the outcome leaves when the map moves", async () => {
  vi.mocked(copyText).mockResolvedValue(undefined);
  open("link-to-map");
  const address = screen.getByLabelText<HTMLTextAreaElement>("Address of this map");
  await userEvent.click(screen.getByRole("button", { name: "Copy" }));
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
  const address = screen.getByLabelText<HTMLTextAreaElement>("Address of this map");
  await userEvent.click(screen.getByRole("button", { name: "Copy" }));
  expect(await screen.findByText(/^The browser did not allow the copy\./)).toBeDefined();
  expect(document.activeElement).toBe(address);
  expect(address.selectionStart).toBe(0);
  expect(address.selectionEnd).toBe(address.value.length);
});

test("the legend is offered when the map shows a layer, and the picture and the page receive the layers shown", async () => {
  vi.mocked(makePicture).mockResolvedValue({ picture: PICTURE, notes: [] });
  vi.mocked(pictureFile).mockResolvedValue(new Blob());
  vi.mocked(printLayout).mockResolvedValue([]);
  open("export-map-image");
  expect(screen.queryByLabelText("Legend of the visible layers")).toBeNull();
  act(() => {
    mapLayersStore.set([BACKSCATTER, HIDDEN]);
    setDisplay(HIDDEN, { visible: false });
  });
  expect(screen.getByLabelText<HTMLInputElement>("Legend of the visible layers").checked).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
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
  await userEvent.click(screen.getByLabelText("Legend of the visible layers"));
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText(/^The picture was saved as /);
  expect(vi.mocked(makePicture).mock.calls[0]?.[1].legends).toEqual([]);
});

test("the record asks for a selected layer", () => {
  open("export-record");
  expect(screen.getByText("No layer is selected. Select a layer in the Contents pane first.")).toBeDefined();
  expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");
});

test("the STAC record of the selected layer is saved beside the name of its data file", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(received) }));
  mapLayersStore.set([BACKSCATTER]);
  selectedLayerStore.set(BACKSCATTER.id);
  open("export-record");
  expect(screen.getByRole("group", { name: "Record of Backscatter HH, 21 Oct 2026" })).toBeDefined();
  expect(screen.getByLabelText<HTMLInputElement>("STAC record").checked).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("The record was saved as backscatter-hh-20261021.json.")).toBeDefined();
  const [content, name] = vi.mocked(saveFile).mock.calls[0] ?? [];
  expect(name).toBe("backscatter-hh-20261021.json");
  expect(content?.type).toBe("application/geo+json");
  const saved = JSON.parse((await content?.text()) ?? "null") as typeof received;
  expect(saved.assets.data.href).toBe("./backscatter-hh-20261021.tif");
  expect(saved.properties).toEqual(received.properties);
});

test("the provenance record is saved as text, also when the STAC record cannot be read", async () => {
  const fetched = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(received) });
  vi.stubGlobal("fetch", fetched);
  mapLayersStore.set([BACKSCATTER]);
  selectedLayerStore.set(BACKSCATTER.id);
  open("export-record");
  await userEvent.click(screen.getByLabelText("Provenance record"));
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
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
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText(/without the lines of the STAC record, which could not be read\.$/)).toBeDefined();
  expect((await vi.mocked(saveFile).mock.calls[1]?.[0].text()) ?? "").not.toContain("Lineage:");
});

test("a STAC record that cannot be read is not saved, and the reason is shown", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
  mapLayersStore.set([BACKSCATTER]);
  selectedLayerStore.set(BACKSCATTER.id);
  open("export-record");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
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
  const citation = await screen.findByLabelText<HTMLTextAreaElement>("Citation of Backscatter HH, 21 Oct 2026");
  expect(citation.readOnly).toBe(true);
  expect(citation.value).toContain(
    "NASA/JPL/NISAR. NISAR Validated Geocoded Polarimetric Covariance Product (Version 1) [Dataset]. " +
      "NASA Alaska Satellite Facility Distributed Active Archive Center. https://doi.org/10.5067/NIL2GCOV-V1 " +
      "Date accessed: 2026-11-14.",
  );
  expect(citation.value).toContain("Liaskos, A. Lynkeus (Version ");
  await userEvent.click(screen.getByRole("button", { name: "Copy" }));
  expect(await screen.findByText("The citation was copied.")).toBeDefined();
  expect(copyText).toHaveBeenCalledWith(citation.value);
});

test("a layer whose record names no DOI has no citation, and nothing can be copied", async () => {
  const withoutDoi = { ...received, properties: { ...received.properties, "sci:doi": undefined } };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(withoutDoi) }));
  mapLayersStore.set([BACKSCATTER]);
  selectedLayerStore.set(BACKSCATTER.id);
  open("citation");
  expect(
    await screen.findByText(
      "The record of Backscatter HH, 21 Oct 2026 does not name the DOI of its NISAR collection, so Lynkeus gives no citation for it.",
    ),
  ).toBeDefined();
  expect(screen.getByRole("button", { name: "Copy" }).getAttribute("aria-disabled")).toBe("true");
  await userEvent.click(screen.getByRole("button", { name: "Copy" }));
  expect(copyText).not.toHaveBeenCalled();
});

test("the citation asks for a selected layer", () => {
  open("citation");
  expect(screen.getByText("No layer is selected. Select a layer in the Contents pane first.")).toBeDefined();
});
