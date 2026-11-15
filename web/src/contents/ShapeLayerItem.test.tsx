import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Feature from "ol/Feature";
import { fromExtent } from "ol/geom/Polygon";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { beforeEach, expect, test, vi } from "vitest";
import { baseMapStore } from "../map/baseMaps";
import { createMap } from "../map/map";
import type { LayerDescription } from "../shared/layer";
import { MapContext } from "../shared/map";
import { addToMap, mapLayersStore } from "../shared/mapLayers";
import { resetPanes, setPaneOpen } from "../shared/panes";
import {
  dropShapeLayer,
  layerOrderStore,
  putShapeLayer,
  shapeDisplayOf,
  shapeDisplayStore,
  shapeLayersStore,
  type ShapeLayer,
  type ShapeMembers,
} from "../shared/shapeLayers";
import { listedBasemapStore } from "./BasemapItem";
import { ContentsPane } from "./ContentsPane";
import { layerProblemsStore } from "./drawing";
import { displayStore, foldedStore, propertiesStore, selectedLayerStore } from "./state";

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
const COHERENCE = layer("coherence", "Coherence HH, 20 m", ["2026-10-09", "2026-10-21"]);

/** A shape layer whose owner takes it off the map when the pane removes it. */
function shape(id: string, title: string, more: Partial<ShapeLayer> = {}): ShapeLayer {
  return {
    id,
    title,
    symbols: [{ label: "Area", line: "#d83933", width: 2, fill: "rgba(216, 57, 51, 0.1)" }],
    properties: [{ name: "Kind", value: "Area of the Map tab" }],
    remove: vi.fn(() => dropShapeLayer(id)),
    ...more,
  };
}

/** The members of a group of three outlines, with commands that only record their calls. */
function members(more: Partial<ShapeMembers> = {}): ShapeMembers {
  return {
    items: [
      { id: "p1", title: "21 Oct 2026, 01:23 UTC", line: "Track 141, frame 71, ascending" },
      { id: "p2", title: "2 Nov 2026, 01:23 UTC", line: "Track 141, frame 71, ascending" },
      { id: "p3", title: "14 Nov 2026, 01:23 UTC" },
    ],
    selected: null,
    hidden: [],
    select: vi.fn(),
    setVisible: vi.fn(),
    zoomTo: vi.fn(),
    ...more,
  };
}

const PRODUCTS_SYMBOLS = [
  { label: "Outline of a product", line: "#005ea2", width: 1.5, fill: "rgba(0, 94, 162, 0.08)" },
  { label: "Selected product", line: "#e5a000", width: 3, casing: "#1b1b1b", dash: [6, 3] },
];

function show() {
  const map = createMap();
  render(
    <MapContext value={map}>
      <ContentsPane />
    </MapContext>,
  );
  return map;
}

/** The titles of the rows as the pane lists them, the top layer first and the basemap last. */
function titles(): (string | null | undefined)[] {
  const list = screen.getByRole("list", { name: "Layers, the top layer first" });
  return [...list.querySelectorAll(".contents-row")].map((row) => row.querySelector(".item-title")?.textContent);
}

const nameOf = (text: string) => screen.getByRole("button", { name: text });
const ids = () => layerOrderStore.get();
const openMenu = (title: string) => userEvent.click(screen.getByRole("button", { name: `More commands of ${title}` }));
const command = (name: string) => screen.getByRole("menuitem", { name });

beforeEach(() => {
  baseMapStore.set("blue-marble");
  listedBasemapStore.set("blue-marble");
  resetPanes();
  setPaneOpen("contents", true);
  propertiesStore.set(null);
  mapLayersStore.set([]);
  shapeLayersStore.set([]);
  shapeDisplayStore.set({});
  displayStore.set({});
  foldedStore.set([]);
  selectedLayerStore.set(null);
  layerProblemsStore.set({});
});

test("a shape layer is listed above the other layers at first, and the basemap stays last", () => {
  addToMap(OCTOBER);
  putShapeLayer(shape("area", "Area"));
  addToMap(COHERENCE);
  show();
  expect(titles()).toEqual(["Area", "Coherence HH, 20 m", "Backscatter HH", "Blue Marble"]);
});

test("a shape layer that is put on the map while the pane is open enters the list, and leaves it when it is dropped", () => {
  addToMap(COHERENCE);
  show();
  act(() => putShapeLayer(shape("search-area", "Area of the search")));
  expect(titles()).toEqual(["Area of the search", "Coherence HH, 20 m", "Blue Marble"]);
  act(() => dropShapeLayer("search-area"));
  expect(titles()).toEqual(["Coherence HH, 20 m", "Blue Marble"]);
});

test("the row of a shape layer has the columns of every row, with its secondary line under its title", () => {
  addToMap(COHERENCE);
  putShapeLayer(shape("area", "Area", { line: "Set on the Map tab" }));
  show();
  const rows = [...document.querySelectorAll(".contents-row")];
  expect(rows).toHaveLength(3);
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
  expect(rows[0]?.querySelector(".item-line")?.textContent).toBe("Set on the Map tab");
  expect(nameOf("Area Set on the Map tab")).toBeTruthy();
});

test("the box of a shape layer hides and shows it", async () => {
  putShapeLayer(shape("area", "Area"));
  show();
  const box = screen.getByRole("checkbox", { name: "Show Area" });
  expect(box).toHaveProperty("checked", true);
  await userEvent.click(box);
  expect(shapeDisplayOf("area").visible).toBe(false);
  expect(box).toHaveProperty("checked", false);
  await userEvent.click(box);
  expect(shapeDisplayOf("area").visible).toBe(true);
});

test("a click on the name selects the shape layer, and a second click ends the selection", async () => {
  addToMap(COHERENCE);
  putShapeLayer(shape("area", "Area"));
  show();
  const name = nameOf("Area");
  await userEvent.click(name);
  expect(selectedLayerStore.get()).toBe("area");
  expect(name.getAttribute("aria-pressed")).toBe("true");
  expect(name.closest("li")?.className).toContain("contents-layer--selected");
  await userEvent.click(nameOf("Coherence HH, 20 m 9 Oct 2026 and 21 Oct 2026"));
  expect(selectedLayerStore.get()).toBe("coherence");
  expect(name.getAttribute("aria-pressed")).toBe("false");
  await userEvent.click(name);
  await userEvent.click(name);
  expect(selectedLayerStore.get()).toBeNull();
});

test("the legend draws a sample of each symbol beside its label: the fill, the casing under the line, the dashes", () => {
  putShapeLayer(shape("products", "Products found", { symbols: PRODUCTS_SYMBOLS }));
  show();
  const legend = document.querySelector(".contents-details .legend");
  const entries = [...(legend?.querySelectorAll("li") ?? [])];
  expect(entries.map((entry) => entry.textContent)).toEqual(["Outline of a product", "Selected product"]);
  const samples = entries.map((entry) => entry.querySelector("svg.legend-sample"));
  expect(samples.map((sample) => sample?.getAttribute("viewBox"))).toEqual(["0 0 24 12", "0 0 24 12"]);
  expect(samples.map((sample) => sample?.getAttribute("aria-hidden"))).toEqual(["true", "true"]);

  // A symbol with a fill is a rectangle that holds the fill, with the line around it.
  const [fill, outline] = [...(samples[0]?.querySelectorAll("rect") ?? [])];
  expect(samples[0]?.querySelectorAll("rect")).toHaveLength(2);
  expect(fill?.getAttribute("fill")).toBe("rgba(0, 94, 162, 0.08)");
  expect(outline?.getAttribute("fill")).toBe("none");
  expect(outline?.getAttribute("stroke")).toBe("#005ea2");
  expect(outline?.getAttribute("stroke-width")).toBe("1.5");
  expect(outline?.getAttribute("stroke-dasharray")).toBeNull();

  // A symbol without a fill is a line, over its casing, which is wider by one pixel on each side.
  const [casing, line] = [...(samples[1]?.querySelectorAll("line") ?? [])];
  expect(samples[1]?.querySelectorAll("line")).toHaveLength(2);
  expect(samples[1]?.querySelector("rect")).toBeNull();
  expect(casing?.getAttribute("stroke")).toBe("#1b1b1b");
  expect(casing?.getAttribute("stroke-width")).toBe("5");
  expect(line?.getAttribute("stroke")).toBe("#e5a000");
  expect(line?.getAttribute("stroke-width")).toBe("3");
  expect(line?.getAttribute("stroke-dasharray")).toBe("6 3");
});

test("a fill with a casing is drawn as three rectangles, and a very wide line is drawn four pixels wide", () => {
  putShapeLayer(
    shape("area", "Area", {
      symbols: [{ label: "Area", line: "#d83933", width: 9, casing: "#ffffff", fill: "rgba(216, 57, 51, 0.1)" }],
    }),
  );
  show();
  const rectangles = [...document.querySelectorAll("svg.legend-sample rect")];
  expect(rectangles.map((rectangle) => rectangle.getAttribute("stroke"))).toEqual([null, "#ffffff", "#d83933"]);
  expect(rectangles.map((rectangle) => rectangle.getAttribute("stroke-width"))).toEqual([null, "6", "4"]);
  // The rectangle stands inside the sample by half of the casing.
  expect(rectangles[2]?.getAttribute("x")).toBe("3");
  expect(rectangles[2]?.getAttribute("width")).toBe("18");
  expect(rectangles[2]?.getAttribute("height")).toBe("6");
});

test("the legend of a shape layer can be folded", async () => {
  putShapeLayer(shape("area", "Area"));
  show();
  const fold = screen.getByRole("button", { name: "Legend of Area" });
  expect(fold.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("slider", { name: "Opacity" })).toBeTruthy();
  await userEvent.click(fold);
  expect(fold.getAttribute("aria-expanded")).toBe("false");
  expect(foldedStore.get()).toEqual(["area"]);
  expect(screen.queryByRole("slider")).toBeNull();
});

test("the slider sets the opacity of the shape layer", () => {
  putShapeLayer(shape("area", "Area"));
  show();
  const slider = screen.getByRole("slider", { name: "Opacity" });
  fireEvent.change(slider, { target: { value: "40" } });
  expect(shapeDisplayOf("area")).toEqual({ visible: true, opacity: 0.4 });
  expect(slider.getAttribute("aria-valuetext")).toBe("40 percent");
  expect(screen.getByText("40 %")).toBeTruthy();
});

test("a layer without members has no section of shapes", () => {
  putShapeLayer(shape("area", "Area"));
  show();
  expect(screen.queryByRole("button", { name: /^Shapes/ })).toBeNull();
});

test("the shapes of a group stand in a section that is closed at first and states their number", async () => {
  putShapeLayer(shape("products", "Products found", { members: members({ hidden: ["p2"] }) }));
  show();
  const toggle = screen.getByRole("button", { name: "Shapes (3)" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(document.querySelectorAll(".contents-members .item")).toHaveLength(0);
  await userEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  const rows = [...document.querySelectorAll(".contents-members .item")];
  expect(rows.map((row) => row.querySelector(".item-title")?.textContent)).toEqual([
    "21 Oct 2026, 01:23 UTC",
    "2 Nov 2026, 01:23 UTC",
    "14 Nov 2026, 01:23 UTC",
  ]);
  expect(rows.map((row) => row.querySelector(".item-line")?.textContent)).toEqual([
    "Track 141, frame 71, ascending",
    "Track 141, frame 71, ascending",
    undefined,
  ]);
  // The box of a member is checked unless the member is hidden.
  expect(rows.map((row) => row.querySelector("input")?.checked)).toEqual([true, false, true]);
  await userEvent.click(toggle);
  expect(document.querySelectorAll(".contents-members .item")).toHaveLength(0);
});

test("the box of a member shows or hides its shape, its name selects it and its button zooms to it", async () => {
  const group = members({ hidden: ["p2"] });
  putShapeLayer(shape("products", "Products found", { members: group }));
  show();
  await userEvent.click(screen.getByRole("button", { name: "Shapes (3)" }));
  await userEvent.click(screen.getByRole("checkbox", { name: "Show 21 Oct 2026, 01:23 UTC" }));
  expect(group.setVisible).toHaveBeenLastCalledWith("p1", false);
  await userEvent.click(screen.getByRole("checkbox", { name: "Show 2 Nov 2026, 01:23 UTC" }));
  expect(group.setVisible).toHaveBeenLastCalledWith("p2", true);
  const name = nameOf("21 Oct 2026, 01:23 UTC Track 141, frame 71, ascending");
  expect(name.getAttribute("aria-pressed")).toBe("false");
  await userEvent.click(name);
  expect(group.select).toHaveBeenLastCalledWith("p1");
  await userEvent.click(screen.getByRole("button", { name: "Zoom to 14 Nov 2026, 01:23 UTC" }));
  expect(group.zoomTo).toHaveBeenLastCalledWith("p3");
  // The members are not layers: the selection of a layer stays as it was.
  expect(selectedLayerStore.get()).toBeNull();
});

test("the selected member is marked as the selected item of the list, and a click on it ends the selection", async () => {
  const group = members({ selected: "p2" });
  putShapeLayer(shape("products", "Products found", { members: group }));
  show();
  await userEvent.click(screen.getByRole("button", { name: "Shapes (3)" }));
  const rows = [...document.querySelectorAll(".contents-members .item")];
  expect(rows.map((row) => row.className)).toEqual(["item", "item item--selected", "item"]);
  const name = nameOf("2 Nov 2026, 01:23 UTC Track 141, frame 71, ascending");
  expect(name.getAttribute("aria-pressed")).toBe("true");
  await userEvent.click(name);
  expect(group.select).toHaveBeenLastCalledWith(null);
});

test("a member that becomes selected while the list is open is brought into view", async () => {
  const scroll = vi.fn();
  HTMLElement.prototype.scrollIntoView = scroll;
  const first = members({ selected: "p1" });
  putShapeLayer(shape("products", "Products found", { members: first }));
  show();
  await userEvent.click(screen.getByRole("button", { name: "Shapes (3)" }));
  // The member that was selected before the list opened stays where it is.
  expect(scroll).not.toHaveBeenCalled();
  const next = members({ selected: "p3" });
  act(() => putShapeLayer(shape("products", "Products found", { members: next })));
  expect(scroll).toHaveBeenCalledTimes(1);
  expect(scroll).toHaveBeenLastCalledWith({ block: "nearest" });
  expect((scroll.mock.contexts[0] as HTMLElement).textContent).toContain("14 Nov 2026, 01:23 UTC");
  // The commands of a row call the description that the layer has now.
  await userEvent.click(nameOf("21 Oct 2026, 01:23 UTC Track 141, frame 71, ascending"));
  expect(next.select).toHaveBeenLastCalledWith("p1");
  expect(first.select).not.toHaveBeenCalled();
  act(() => putShapeLayer(shape("products", "Products found", { members: members() })));
  expect(scroll).toHaveBeenCalledTimes(1);
});

test("a group of two thousand shapes draws their rows only while its section is open", () => {
  const items = Array.from({ length: 2000 }, (_, index) => ({
    id: `p${String(index)}`,
    title: `Product ${String(index)}`,
  }));
  putShapeLayer(shape("products", "Products found", { members: members({ items, selected: "p1999" }) }));
  show();
  expect(document.querySelectorAll(".contents-members .item")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Shapes (2000)" }));
  expect(document.querySelectorAll(".contents-members .item")).toHaveLength(2000);
  expect(document.querySelectorAll(".contents-members .item--selected")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Legend of Products found" }));
  expect(document.querySelectorAll(".contents-members .item")).toHaveLength(0);
}, 60000);

test("the menu of a shape layer has the commands that suit it, and the right mouse button opens the same menu", async () => {
  addToMap(COHERENCE);
  putShapeLayer(shape("area", "Area"));
  show();
  await openMenu("Area");
  const menu = screen.getByRole("menu", { name: "More commands of Area" });
  const commands = within(menu)
    .getAllByRole("menuitem")
    .map((item) => item.textContent);
  expect(commands).toEqual([
    "Zoom to layer",
    "Move up",
    "Move down",
    "Move to top",
    "Move to bottom",
    "Remove",
    "Properties",
  ]);
  // The top layer cannot move up.
  expect(command("Move up").getAttribute("aria-disabled")).toBe("true");
  expect(command("Move to top").getAttribute("aria-disabled")).toBe("true");
  expect(command("Move down").getAttribute("aria-disabled")).toBe("false");
  await userEvent.keyboard("{Escape}");
  fireEvent.contextMenu(nameOf("Area"), { clientX: 40, clientY: 60 });
  expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(commands);
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(nameOf("Area"));
});

test("a command of the menu moves a shape layer under a layer of a file and states its new place", async () => {
  [OCTOBER, COHERENCE].forEach(addToMap);
  putShapeLayer(shape("area", "Area"));
  show();
  expect(ids()).toEqual(["october", "coherence", "area"]);
  const files = mapLayersStore.get();
  await openMenu("Area");
  await userEvent.click(command("Move down"));
  expect(ids()).toEqual(["october", "area", "coherence"]);
  expect(titles()).toEqual(["Coherence HH, 20 m", "Area", "Backscatter HH", "Blue Marble"]);
  // The layers of the files keep their own order, so their store is left as it was.
  expect(mapLayersStore.get()).toBe(files);
  expect(screen.getByRole("status").textContent).toBe("Area is at place 2 of 3.");
  expect(document.activeElement).toBe(nameOf("Area"));
  await openMenu("Area");
  await userEvent.click(command("Move to bottom"));
  expect(ids()).toEqual(["area", "october", "coherence"]);
  expect(screen.getByRole("status").textContent).toBe("Area is at place 3 of 3.");
  await openMenu("Area");
  expect(command("Move down").getAttribute("aria-disabled")).toBe("true");
  await userEvent.click(command("Move to top"));
  expect(ids()).toEqual(["october", "coherence", "area"]);
});

test("a layer of a file moves across a shape layer, and the order of its own store follows", async () => {
  [OCTOBER, COHERENCE].forEach(addToMap);
  putShapeLayer(shape("area", "Area"));
  show();
  await openMenu("Coherence HH, 20 m");
  await userEvent.click(command("Move up"));
  expect(ids()).toEqual(["october", "area", "coherence"]);
  await openMenu("Coherence HH, 20 m");
  await userEvent.click(command("Move to bottom"));
  expect(ids()).toEqual(["coherence", "october", "area"]);
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["coherence", "october"]);
  expect(screen.getByRole("status").textContent).toBe("Coherence HH, 20 m is at place 3 of 3.");
});

test("with the focus on the name, Alt and an arrow key move the shape layer", async () => {
  [OCTOBER, COHERENCE].forEach(addToMap);
  putShapeLayer(shape("area", "Area"));
  show();
  nameOf("Area").focus();
  await userEvent.keyboard("{Alt>}{ArrowDown}{ArrowDown}{/Alt}");
  expect(ids()).toEqual(["area", "october", "coherence"]);
  expect(document.activeElement).toBe(nameOf("Area"));
  await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
  expect(ids()).toEqual(["october", "area", "coherence"]);
  expect(screen.getByRole("status").textContent).toBe("Area is at place 2 of 3.");
  // A shape layer has no field for a new name.
  await userEvent.keyboard("{F2}");
  expect(screen.queryByRole("textbox")).toBeNull();
});

test("a row is dragged across a row of the other kind", () => {
  [OCTOBER, COHERENCE].forEach(addToMap);
  putShapeLayer(shape("area", "Area"));
  show();
  const rows = () => [...document.querySelectorAll(".contents-row")];
  const items = () => [...document.querySelectorAll(".contents-layer")];
  const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
  // The simulated browser gives every element the height 0, so the pointer counts as below the middle of the target.
  fireEvent.dragStart(rows()[0] as Element, { dataTransfer });
  expect(dataTransfer.setData).toHaveBeenLastCalledWith("text/plain", "Area");
  fireEvent.dragOver(items()[2] as Element, { dataTransfer, clientY: 10 });
  expect(items()[2]?.className).toContain("contents-layer--drop-below");
  fireEvent.drop(items()[2] as Element, { dataTransfer });
  expect(ids()).toEqual(["area", "october", "coherence"]);
  expect(titles()).toEqual(["Coherence HH, 20 m", "Backscatter HH", "Area", "Blue Marble"]);
  expect(document.querySelector(".contents-layer--drop-below")).toBeNull();
  // The layer of a file is dragged under the shape layer.
  fireEvent.dragStart(rows()[0] as Element, { dataTransfer });
  fireEvent.dragOver(items()[2] as Element, { dataTransfer, clientY: 10 });
  fireEvent.drop(items()[2] as Element, { dataTransfer });
  expect(ids()).toEqual(["coherence", "area", "october"]);
  expect(mapLayersStore.get().map(({ id }) => id)).toEqual(["coherence", "october"]);
});

test("the command Zoom to layer shows the whole of the shapes that the owner of the layer has drawn", async () => {
  putShapeLayer(shape("area", "Area"));
  const map = show();
  const extent = [2600000, 4500000, 2700000, 4600000];
  map.addLayer(
    new VectorLayer({
      source: new VectorSource({ features: [new Feature(fromExtent(extent))] }),
      properties: { id: "area" },
    }),
  );
  const fit = vi.spyOn(map.getView(), "fit").mockImplementation(() => undefined);
  await openMenu("Area");
  await userEvent.click(command("Zoom to layer"));
  await vi.waitFor(() => expect(fit).toHaveBeenCalledTimes(1));
  expect(fit.mock.calls[0]?.[0]).toEqual(extent);
});

test("the command Zoom to layer leaves the map as it is for a layer that is empty or not on the map", async () => {
  putShapeLayer(shape("area", "Area"));
  putShapeLayer(shape("search-area", "Area of the search"));
  const map = show();
  map.addLayer(new VectorLayer({ source: new VectorSource(), properties: { id: "area" } }));
  const fit = vi.spyOn(map.getView(), "fit").mockImplementation(() => undefined);
  await openMenu("Area");
  await userEvent.click(command("Zoom to layer"));
  await openMenu("Area of the search");
  await userEvent.click(command("Zoom to layer"));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(fit).not.toHaveBeenCalled();
});

test("the Remove command asks the owner to take the shape layer off the map and moves the focus to the next layer", async () => {
  addToMap(OCTOBER);
  const area = shape("area", "Area");
  putShapeLayer(area);
  selectedLayerStore.set("area");
  show();
  await openMenu("Area");
  await userEvent.click(command("Remove"));
  expect(area.remove).toHaveBeenCalledTimes(1);
  expect(shapeLayersStore.get()).toEqual([]);
  expect(selectedLayerStore.get()).toBeNull();
  expect(titles()).toEqual(["Backscatter HH", "Blue Marble"]);
  expect(document.activeElement).toBe(nameOf("Backscatter HH 21 Oct 2026"));
  expect(screen.getByRole("status").textContent).toBe("The layer was removed.");
});

test("the removal of a layer of a file moves the focus to the shape layer under it", async () => {
  putShapeLayer(shape("area", "Area"));
  addToMap(COHERENCE);
  show();
  await openMenu("Area");
  await userEvent.click(command("Move to bottom"));
  await openMenu("Coherence HH, 20 m");
  await userEvent.click(command("Remove"));
  expect(mapLayersStore.get()).toEqual([]);
  expect(document.activeElement).toBe(nameOf("Area"));
});

test("the Delete key on the name removes the shape layer, and after the last layer the focus moves to the map", async () => {
  const area = shape("area", "Area");
  putShapeLayer(area);
  show();
  nameOf("Area").focus();
  await userEvent.keyboard("{Delete}");
  expect(area.remove).toHaveBeenCalledTimes(1);
  expect(ids()).toEqual([]);
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Map" }));
});

test("a shape layer that its owner keeps stays listed and selected after the Remove command", async () => {
  const kept = shape("area", "Area", { remove: vi.fn() });
  putShapeLayer(kept);
  selectedLayerStore.set("area");
  show();
  nameOf("Area").focus();
  await userEvent.keyboard("{Delete}");
  expect(kept.remove).toHaveBeenCalledTimes(1);
  expect(titles()).toEqual(["Area", "Blue Marble"]);
  expect(selectedLayerStore.get()).toBe("area");
  expect(document.activeElement).toBe(nameOf("Area"));
});

test("the command Properties opens the window of the shape layer", async () => {
  putShapeLayer(shape("area", "Area"));
  show();
  await openMenu("Area");
  await userEvent.click(command("Properties"));
  expect(propertiesStore.get()?.id).toBe("area");
});

test("the header of the members takes the name that the group gives them", () => {
  putShapeLayer(shape("products", "Products found", { members: members({ name: "Products" }) }));
  show();
  expect(screen.getByRole("button", { name: "Products (3)" })).toBeTruthy();
});
