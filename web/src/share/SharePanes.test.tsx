import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat } from "ol/proj";
import { beforeEach, expect, test, vi } from "vitest";
import { baseMapStore } from "../map/baseMaps";
import { areaStore } from "../shared/area";
import { openToolPane, resetDock } from "../shared/dock/dock";
import { MapContext } from "../shared/map";
import { copyText } from "./clipboard";
import { saveFile } from "./download";
import { FIRST_LAYOUT_FORM } from "./layout";
import { makePicture, pictureFile } from "./mapImage";
import type { Picture } from "./picture";
import { printLayout } from "./printLayout";
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

let map: OlMap;

beforeEach(() => {
  vi.clearAllMocks();
  resetDock();
  baseMapStore.set("blue-marble");
  areaStore.set(null);
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
  expect(printLayout).toHaveBeenCalledWith(map, {
    ...FIRST_LAYOUT_FORM,
    title: "Lower Merrimack River",
    paper: "A3",
    orientation: "portrait",
    resolution: 150,
    northArrow: false,
  });
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
