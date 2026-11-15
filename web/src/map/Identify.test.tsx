import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat } from "ol/proj";
import { beforeEach, expect, test, vi } from "vitest";
import { displayStore } from "../contents/state";
import { dockStore, openToolPane, resetDock } from "../shared/dock/dock";
import { MapContext } from "../shared/map";
import { mapLayersStore } from "../shared/mapLayers";
import { identifyStore } from "./identify";
import { IDENTIFY_LAYER_ID, IdentifyOnMap } from "./IdentifyOnMap";
import { IdentifyPane, layerGroups } from "./IdentifyPane";
import { toolKeysStore } from "./keys";
import type { MarkLayer } from "./mark";
import { toolStore } from "./state";
import { testLayer } from "./testLayer";

vi.mock("../contents/display", () => ({
  // The simulated browser draws no layer, so the value of a layer at a pixel is given here.
  valueAt: (_map: unknown, id: string) => (id === "october" ? 0.0345123 : null),
}));

const PLACE = fromLonLat([-70.9, 42.8]);

function start() {
  const map = new OlMap({ view: new View({ center: PLACE, zoom: 10 }) });
  // The simulated browser draws no map, so the pixel of a place and the place of a pixel are given here.
  map.getPixelFromCoordinate = () => [400, 300];
  map.getCoordinateFromPixel = () => PLACE;
  render(
    <MapContext value={map}>
      <IdentifyOnMap />
      <IdentifyPane />
    </MapContext>,
  );
  const layer = map.getAllLayers().find((candidate) => candidate.get("id") === IDENTIFY_LAYER_ID) as
    MarkLayer | undefined;
  return { marks: () => layer?.getSource()?.getFeatures().length };
}

beforeEach(() => {
  toolStore.set(null);
  identifyStore.set(null);
  displayStore.set({});
  mapLayersStore.set([
    testLayer("october", "Backscatter HH, 21 Oct 2026"),
    testLayer("november", "Backscatter HH, 2 Nov 2026"),
  ]);
  resetDock();
});

test("before the first click the pane names the next step, and its button says why it is inactive", () => {
  start();
  act(() => openToolPane("identify"));
  expect(screen.getByText("No place identified")).toBeDefined();
  expect(screen.getByText("Click a place on the map.")).toBeDefined();
  expect(screen.getByRole("button", { name: "Clear result" }).getAttribute("aria-disabled")).toBe("true");
  expect(screen.getByRole("status").textContent).toBe("There is no result to clear.");
  expect(document.querySelector(".usa-hint")).toBeNull();
});

test("the Enter key at the cross identifies the place, marks it and opens the pane with the values", () => {
  const { marks } = start();
  act(() => toolStore.set("identify"));
  act(() => toolKeysStore.get()?.point(PLACE));
  expect(dockStore.get().tools).toEqual(["identify"]);
  expect(marks()).toBe(1);
  const place = screen.getByRole("group", { name: "Place" });
  expect(within(place).getByText("42.80000° N")).toBeDefined();
  expect(within(place).getByText("70.90000° W")).toBeDefined();
  expect(within(place).getByRole("button", { name: "Copy Latitude" })).toBeDefined();
  expect(within(place).getByRole("button", { name: "Copy Longitude" })).toBeDefined();
  // The top layer comes first.
  const layers = screen.getByRole("group", { name: "Layers (2)" });
  expect(
    within(layers)
      .getAllByRole("heading", { level: 4 })
      .map((heading) => heading.textContent),
  ).toEqual(["Backscatter HH, 2 Nov 2026", "Backscatter HH, 21 Oct 2026"]);
  const [first, second] = layers.querySelectorAll<HTMLElement>(".property-group");
  expect(within(first as HTMLElement).getByText("No data at this place")).toBeDefined();
  expect(within(second as HTMLElement).getByText("Radar backscatter (gamma nought), HH")).toBeDefined();
  expect(within(second as HTMLElement).getByText("0.0345123 linear power")).toBeDefined();
  expect(within(second as HTMLElement).getByText("21 Oct 2026")).toBeDefined();
  // A value can be copied, and the statement that a layer has no data cannot.
  expect(within(layers).getAllByRole("button", { name: "Copy Radar backscatter (gamma nought), HH" })).toHaveLength(1);
});

test("the tool takes the keys of the map only while its button is on", () => {
  start();
  expect(toolKeysStore.get()).toBeNull();
  act(() => toolStore.set("identify"));
  expect(toolKeysStore.get()?.cancel()).toBe(false);
  act(() => toolStore.set(null));
  expect(toolKeysStore.get()).toBeNull();
});

test("the button Clear result removes the result and the mark", async () => {
  const { marks } = start();
  act(() => toolStore.set("identify"));
  act(() => toolKeysStore.get()?.point(PLACE));
  await userEvent.click(screen.getByRole("button", { name: "Clear result" }));
  expect(identifyStore.get()).toBeNull();
  expect(marks()).toBe(0);
  expect(screen.getByText("Click a place on the map.")).toBeDefined();
  expect(screen.getByRole("button", { name: "Clear result" }).getAttribute("aria-disabled")).toBe("true");
});

test("a map without layers gives the place and says how to get a visible layer", () => {
  mapLayersStore.set([]);
  start();
  act(() => toolStore.set("identify"));
  act(() => toolKeysStore.get()?.point(PLACE));
  expect(screen.getByText("42.80000° N")).toBeDefined();
  const layers = screen.getByRole("group", { name: "Layers (0)" });
  expect(within(layers).getByText("No visible layer")).toBeDefined();
  expect(
    within(layers).getByText("Show a layer in the Contents pane, or get one from the Catalog pane."),
  ).toBeDefined();
});

test("each layer has a group of rows under its title, and a second layer of one title takes a number", () => {
  const layer = { quantity: "Coherence", unit: "", dates: ["2026-10-21", "2026-11-02"] };
  expect(
    layerGroups([
      { ...layer, id: "a", title: "Coherence", value: 0.5 },
      { ...layer, id: "b", title: "Coherence", value: null },
    ]),
  ).toEqual([
    {
      title: "Coherence",
      rows: [
        { name: "Coherence", value: "0.5", copy: true },
        { name: "Dates", value: "21 Oct 2026 and 2 Nov 2026" },
      ],
    },
    {
      title: "Coherence (2)",
      rows: [
        { name: "Coherence", value: "No data at this place" },
        { name: "Dates", value: "21 Oct 2026 and 2 Nov 2026" },
      ],
    },
  ]);
});
