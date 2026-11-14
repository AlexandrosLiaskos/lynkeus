import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat } from "ol/proj";
import { beforeEach, expect, test, vi } from "vitest";
import { displayStore } from "../contents/state";
import { dockStore, resetDock } from "../shared/dock/dock";
import { MapContext } from "../shared/map";
import { mapLayersStore } from "../shared/mapLayers";
import { identifyStore } from "./identify";
import { IDENTIFY_LAYER_ID, IdentifyOnMap } from "./IdentifyOnMap";
import { IdentifyPane } from "./IdentifyPane";
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

test("the Enter key at the cross identifies the place, marks it and opens the pane with the values", () => {
  const { marks } = start();
  act(() => toolStore.set("identify"));
  act(() => toolKeysStore.get()?.point(PLACE));
  expect(dockStore.get().tools).toEqual(["identify"]);
  expect(marks()).toBe(1);
  expect(screen.getByText("42.80000° N")).toBeDefined();
  expect(screen.getByText("70.90000° W")).toBeDefined();
  // The top layer comes first.
  const [first, second] = screen.getAllByRole("region");
  expect(first?.getAttribute("aria-label")).toBe("Backscatter HH, 2 Nov 2026");
  expect(within(first as HTMLElement).getByText("No data at this place")).toBeDefined();
  expect(within(second as HTMLElement).getByText("Radar backscatter (gamma nought), HH")).toBeDefined();
  expect(within(second as HTMLElement).getByText("0.0345123 linear power")).toBeDefined();
  expect(within(second as HTMLElement).getByText("21 Oct 2026")).toBeDefined();
});

test("the tool takes the keys of the map only while its button is on", () => {
  start();
  expect(toolKeysStore.get()).toBeNull();
  act(() => toolStore.set("identify"));
  expect(toolKeysStore.get()?.cancel()).toBe(false);
  act(() => toolStore.set(null));
  expect(toolKeysStore.get()).toBeNull();
});

test("the Clear button removes the result and the mark", async () => {
  const { marks } = start();
  act(() => toolStore.set("identify"));
  act(() => toolKeysStore.get()?.point(PLACE));
  await userEvent.click(screen.getByRole("button", { name: "Clear" }));
  expect(identifyStore.get()).toBeNull();
  expect(marks()).toBe(0);
  expect(screen.getByText(/^Click a place on the map\./)).toBeDefined();
  expect(screen.getByRole("button", { name: "Clear" }).getAttribute("aria-disabled")).toBe("true");
});

test("a map without layers gives the place and says that it shows no layer there", () => {
  mapLayersStore.set([]);
  start();
  act(() => toolStore.set("identify"));
  act(() => toolKeysStore.get()?.point(PLACE));
  expect(screen.getByText("The map shows no layer at this place.")).toBeDefined();
});
