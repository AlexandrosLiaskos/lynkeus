import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type BaseEvent from "ol/events/Event";
import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat } from "ol/proj";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { valueAt } from "../contents/display";
import { selectedLayerStore } from "../contents/state";
import type { LayerDescription } from "../shared/layer";
import { MapContext } from "../shared/map";
import { addToMap, mapLayersStore } from "../shared/mapLayers";
import { messagesStore } from "../shared/messages/messages";
import { scaleAt } from "./scale";
import { coordinateFormatStore, statusBarStore } from "./state";
import { ITEM_NAMES, StatusBar } from "./StatusBar";

vi.mock("../contents/display", () => ({ valueAt: vi.fn() }));
const read = vi.mocked(valueAt);

const LAYER: LayerDescription = {
  id: "gcov-hhhh-20261020",
  title: "Backscatter HH, 20 Oct 2026",
  kind: "layer",
  url: "/files/gcov-hhhh-20261020.tif",
  quantity: "Radar backscatter",
  unit: "dB",
  range: [-25, 0],
  colours: "grey",
  dates: ["2026-10-20"],
  inputs: ["product-file.h5"],
  program: "Lynkeus 0.1.0",
  method: null,
  record: "/files/gcov-hhhh-20261020.json",
};

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  read.mockReset();
  mapLayersStore.set([]);
  selectedLayerStore.set(null);
  statusBarStore.set(true);
  coordinateFormatStore.set("degrees");
  messagesStore.set([]);
});

/** Show the status bar of a map of the pilot area at zoom level 10. */
function setUp() {
  const map = new OlMap({ view: new View({ center: fromLonLat([-70.975, 42.775]), zoom: 10 }) });
  const { container } = render(
    <MapContext value={map}>
      <StatusBar />
    </MapContext>,
  );
  /** The values that the bar shows, without the unseen texts that keep the widths of the fields. */
  const values = () => [...container.querySelectorAll(".statusbar-field-text")].map((field) => field.textContent);
  return { map, values, container };
}

test("the bar shows the scale at the centre of the map", () => {
  setUp();
  // At zoom level 10 and latitude 42.775 degrees one pixel is 112.2136 metres on the ground: 1:400,763.
  expect(screen.getByRole<HTMLInputElement>("combobox", { name: "Scale" }).value).toBe("1:400,763");
});

test("without a pointer over the map the bar shows the coordinates of the centre", () => {
  const { values } = setUp();
  expect(values()).toEqual(["Centre", "42.775°N", "70.975°W", ""]);
});

test("the bar shows the coordinates under the pointer, and those of the centre again when the pointer leaves", () => {
  const { map, values } = setUp();
  act(() => {
    const coordinate = fromLonLat([23.7281, 37.9838]);
    map.dispatchEvent({ type: "pointermove", pixel: [10, 20], coordinate } as unknown as BaseEvent);
  });
  expect(values().slice(0, 3)).toEqual(["Pointer", "37.984°N", "23.728°E"]);
  act(() => {
    map.getViewport()?.dispatchEvent(new Event("pointerleave"));
  });
  expect(values().slice(0, 3)).toEqual(["Centre", "42.775°N", "70.975°W"]);
});

test("the coordinates follow the centre when the map moves", () => {
  const { map, values } = setUp();
  act(() => map.getView().setCenter(fromLonLat([151.2093, -33.8688])));
  expect(values().slice(0, 3)).toEqual(["Centre", "33.869°S", "151.209°E"]);
});

test("the list of formats writes the coordinates in each of the four ways", async () => {
  const { values } = setUp();
  const formats = screen.getByRole<HTMLSelectElement>("combobox", { name: "Coordinate format" });
  expect(
    within(formats)
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual(["Decimal degrees", "Degrees, minutes, seconds", "UTM", "Map projection"]);
  await userEvent.selectOptions(formats, "Degrees, minutes, seconds");
  expect(values().slice(1, 3)).toEqual(["42°46′30″N", "70°58′30″W"]);
  await userEvent.selectOptions(formats, "UTM");
  expect(values().slice(1, 4)).toEqual(["Zone 19 North", "338432 m E", "4737721 m N"]);
  await userEvent.selectOptions(formats, "Map projection");
  expect(values().slice(1, 3)).toEqual(["X -7900901 m", "Y 5277787 m"]);
});

test("the bar names the projection of the map", () => {
  setUp();
  // The name and the brackets stand in elements of their own, which a narrow window hides; the code stays.
  const code = screen.getByText("EPSG:3857");
  expect(code.textContent).toBe("WGS 84 / Pseudo-Mercator (EPSG:3857)");
  expect([...code.children].map((part) => [part.className, part.textContent])).toEqual([
    ["statusbar-projection-name", "WGS 84 / Pseudo-Mercator ("],
    ["statusbar-projection-name", ")"],
  ]);
});

test("a typed scale is set on the map", async () => {
  const { map } = setUp();
  const field = screen.getByRole<HTMLInputElement>("combobox", { name: "Scale" });
  await userEvent.clear(field);
  await userEvent.type(field, "50000{Enter}");
  const view = map.getView();
  expect(scaleAt(view.getProjection(), view.getResolution() ?? NaN, view.getCenter() ?? [])).toBeCloseTo(50_000, 6);
  expect(field.value).toBe("1:50,000");
  expect(messagesStore.get()).toEqual([]);
});

test("after a scale is set its text is selected, so that the next typed scale replaces it", async () => {
  const { map } = setUp();
  const field = screen.getByRole<HTMLInputElement>("combobox", { name: "Scale" });
  field.focus();
  await userEvent.keyboard("{ArrowUp}{Enter}");
  expect(field.value).toBe("1:500");
  expect([field.selectionStart, field.selectionEnd]).toEqual([0, 5]);
  await userEvent.keyboard("1:250,000{Enter}");
  const view = map.getView();
  expect(scaleAt(view.getProjection(), view.getResolution() ?? NaN, view.getCenter() ?? [])).toBeCloseTo(250_000, 6);
  expect(field.value).toBe("1:250,000");
  expect([field.selectionStart, field.selectionEnd]).toEqual([0, 9]);
  expect(messagesStore.get()).toEqual([]);
});

test("a scale that the map cannot show is reported, and the bar shows the scale that was set", async () => {
  setUp();
  const field = screen.getByRole<HTMLInputElement>("combobox", { name: "Scale" });
  await userEvent.clear(field);
  await userEvent.type(field, "1:1{Enter}");
  expect(messagesStore.get().map(({ kind, text }) => [kind, text])).toEqual([
    ["warning", "The map cannot show the scale 1:1. It shows the nearest scale that it can."],
  ]);
  expect(field.value).toBe("1:2");
});

test("the rotation shows only on a map that is turned, with a button that brings north to the top", async () => {
  const { map } = setUp();
  expect(screen.queryByText("Rotation")).toBeNull();
  act(() => map.getView().setRotation(Math.PI / 6));
  expect(screen.getByText("Rotation")).toBeDefined();
  expect(screen.getByText("30.0°")).toBeDefined();
  await userEvent.click(screen.getByRole("button", { name: "North up" }));
  expect(map.getView().getRotation()).toBe(0);
  expect(screen.queryByText("Rotation")).toBeNull();
});

test("the bar says that the map is loading until the loading ends", () => {
  const { map, values } = setUp();
  act(() => {
    map.dispatchEvent("loadstart");
  });
  expect(values().at(-1)).toBe("Loading");
  expect(screen.getByTitle(ITEM_NAMES.loading)).toBeDefined();
  act(() => {
    map.dispatchEvent("loadend");
  });
  expect(values().at(-1)).toBe("");
  expect(screen.queryByTitle(ITEM_NAMES.loading)).toBeNull();
});

/** The names of the items of the bar, in their order: the texts of their `title` attributes. */
function itemNames(): (string | null)[] {
  return [...document.querySelectorAll(".statusbar [title]")].map((item) => item.getAttribute("title"));
}

test("every item of the bar carries its name, which the browser shows under the pointer", () => {
  const { map } = setUp();
  read.mockReturnValue(null);
  expect(itemNames()).toEqual([
    "Scale of the map",
    "Coordinates of the centre of the map",
    "Coordinate format",
    "Projection of the map: WGS 84 / Pseudo-Mercator (EPSG:3857)",
  ]);
  act(() => {
    const coordinate = fromLonLat([23.7281, 37.9838]);
    map.dispatchEvent({ type: "pointermove", pixel: [10, 20], coordinate } as unknown as BaseEvent);
    map.getView().setRotation(Math.PI / 6);
    addToMap(LAYER);
    selectedLayerStore.set(LAYER.id);
  });
  expect(itemNames()).toEqual([
    "Scale of the map",
    "Coordinates under the pointer",
    "Coordinate format",
    `Value of ${LAYER.title} under the pointer`,
    "Rotation of the map, clockwise",
    "Projection of the map: WGS 84 / Pseudo-Mercator (EPSG:3857)",
  ]);
  act(() => {
    map.getViewport()?.dispatchEvent(new Event("pointerleave"));
  });
  expect(itemNames()[3]).toBe(`Value of ${LAYER.title} at the centre of the map`);
});

test("the name of an item stands in the element of names and its value outside it", () => {
  const { container } = setUp();
  read.mockReturnValue(null);
  act(() => {
    addToMap(LAYER);
    selectedLayerStore.set(LAYER.id);
  });
  expect([...container.querySelectorAll(".statusbar-label")].map((label) => label.textContent)).toEqual([
    "Scale",
    "PointerCentreCentre",
    LAYER.title,
  ]);
  for (const item of container.querySelectorAll(".statusbar-item")) {
    expect(item.parentElement?.className).toBe("statusbar");
  }
});

test("the bar is a named region of the page, and is not drawn while it is hidden", () => {
  setUp();
  expect(screen.getByRole("region", { name: "Status bar" })).toBeDefined();
  act(() => statusBarStore.set(false));
  expect(screen.queryByRole("region")).toBeNull();
});

test("without a selected layer the bar shows no value of a layer", () => {
  setUp();
  act(() => addToMap(LAYER));
  expect(screen.queryByText(LAYER.title)).toBeNull();
  expect(read).not.toHaveBeenCalled();
});

test("the bar shows the name of the selected layer and its value under the pointer, with the unit", () => {
  vi.useFakeTimers();
  const { map, values } = setUp();
  map.setSize([800, 600]);
  read.mockImplementation((_map, _id, pixel) => (pixel[0] === 10 ? -12.345678 : -7.5));
  act(() => {
    addToMap(LAYER);
    selectedLayerStore.set(LAYER.id);
  });
  act(() => {
    vi.advanceTimersToNextFrame();
  });
  // Without a pointer over the map the value is that of the centre of the map.
  expect(read).toHaveBeenLastCalledWith(map, LAYER.id, [400, 300]);
  expect(screen.getByText(LAYER.title)).toBeDefined();
  expect(values()).toEqual(["Centre", "42.775°N", "70.975°W", "-7.5 dB", ""]);
  act(() => {
    const coordinate = fromLonLat([23.7281, 37.9838]);
    map.dispatchEvent({ type: "pointermove", pixel: [10, 20], coordinate } as unknown as BaseEvent);
  });
  act(() => {
    vi.advanceTimersToNextFrame();
  });
  expect(read).toHaveBeenLastCalledWith(map, LAYER.id, [10, 20]);
  expect(values().at(3)).toBe("-12.3457 dB");
});

test("where the selected layer has no value the bar says so", () => {
  vi.useFakeTimers();
  const { values } = setUp();
  read.mockReturnValue(null);
  act(() => {
    addToMap(LAYER);
    selectedLayerStore.set(LAYER.id);
  });
  act(() => {
    vi.advanceTimersToNextFrame();
  });
  expect(values().at(3)).toBe("No data");
});

test("the value leaves the bar when the selected layer is taken off the map", () => {
  setUp();
  act(() => {
    addToMap(LAYER);
    selectedLayerStore.set(LAYER.id);
  });
  expect(screen.getByText(LAYER.title)).toBeDefined();
  act(() => mapLayersStore.set([]));
  expect(screen.queryByText(LAYER.title)).toBeNull();
});

test("the value of a layer without dimension is written without a unit", () => {
  vi.useFakeTimers();
  const { map, values } = setUp();
  map.setSize([800, 600]);
  // A linear power, held as a number of 32 bits, as the files hold their values.
  read.mockReturnValue(Math.fround(0.0432156));
  act(() => {
    addToMap({ ...LAYER, unit: "1" });
    selectedLayerStore.set(LAYER.id);
  });
  act(() => {
    vi.advanceTimersToNextFrame();
  });
  expect(values().at(3)).toBe("0.0432156");
});
