import { act, render, screen } from "@testing-library/react";
import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat } from "ol/proj";
import { beforeEach, expect, test } from "vitest";
import { MapContext } from "../shared/map";
import { toolKeysStore } from "./keys";
import { measurementsStore, measureUnitsStore } from "./measure";
import { MEASURE_LAYER_ID, type MeasureLayer } from "./measureLayer";
import { MeasureOnMap } from "./MeasureOnMap";
import { toolStore } from "./state";

function start() {
  const map = new OlMap({ view: new View({ center: [0, 0], zoom: 5 }) });
  // The simulated browser draws no map, so the place of a point on the screen, which OpenLayers asks for while
  // a polygon is drawn, is given here: one pixel for each kilometre.
  map.getPixelFromCoordinate = ([x = 0, y = 0]) => [x / 1000, -y / 1000];
  render(
    <MapContext value={map}>
      <MeasureOnMap />
    </MapContext>,
  );
  const layer = map.getAllLayers().find((candidate) => candidate.get("id") === MEASURE_LAYER_ID) as
    MeasureLayer | undefined;
  return { map, drawn: () => layer?.getSource()?.getFeatures().length };
}

function line(...places: [number, number][]) {
  for (const place of places) {
    act(() => toolKeysStore.get()?.point(fromLonLat(place)));
  }
  act(() => toolKeysStore.get()?.point(fromLonLat(places.at(-1) ?? [0, 0])));
}

beforeEach(() => {
  toolStore.set(null);
  measurementsStore.set([]);
  measureUnitsStore.set({ distance: "km", area: "km2" });
});

test("a measure tool takes the keys of the map while its button is on", () => {
  start();
  expect(toolKeysStore.get()).toBeNull();
  act(() => toolStore.set("measure-distance"));
  expect(toolKeysStore.get()?.back).toBeDefined();
  act(() => toolStore.set(null));
  expect(toolKeysStore.get()).toBeNull();
});

test("a measured line stays on the map after the tool ends, and a screen reader is told its length", () => {
  const { drawn } = start();
  expect(screen.getByRole("status").textContent).toBe("Nothing is measured.");
  act(() => toolStore.set("measure-distance"));
  line([0, 0], [1, 0]);
  expect(screen.getByRole("status").textContent).toBe("The line is 111.195 km long.");
  act(() => toolStore.set("measure-area"));
  line([0, -0.5], [1, -0.5], [1, 0.5], [0, 0.5]);
  expect(screen.getByRole("status").textContent).toMatch(
    /^The area is 12,36\d\.\d{3} km², and its perimeter is 44\d\.\d{3} km\.$/,
  );
  act(() => toolStore.set(null));
  expect(drawn()).toBe(2);
  expect(measurementsStore.get()).toHaveLength(2);
});

test("the measurements leave the map when their list is emptied", () => {
  const { drawn } = start();
  act(() => toolStore.set("measure-distance"));
  line([0, 0], [1, 0]);
  expect(drawn()).toBe(1);
  act(() => measurementsStore.set([]));
  expect(drawn()).toBe(0);
});
