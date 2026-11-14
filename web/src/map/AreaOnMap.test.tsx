import { act, render, screen } from "@testing-library/react";
import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat } from "ol/proj";
import { beforeEach, expect, test } from "vitest";
import { areaStore } from "../shared/area";
import { MapContext } from "../shared/map";
import { messagesStore } from "../shared/messages/messages";
import { AREA_FAULTS, extentOfArea } from "./area";
import { AREA_LAYER_ID, BOX, type AreaLayer } from "./areaLayer";
import { AreaOnMap } from "./AreaOnMap";
import { toolKeysStore } from "./keys";
import { toolStore } from "./state";

const AREA = { west: -71.2, south: 42.6, east: -70.75, north: 42.95 };

function start() {
  const map = new OlMap({ view: new View({ center: fromLonLat([-71, 42.8]), zoom: 9 }) });
  render(
    <MapContext value={map}>
      <AreaOnMap />
    </MapContext>,
  );
  const layer = map.getAllLayers().find((candidate) => candidate.get("id") === AREA_LAYER_ID) as AreaLayer | undefined;
  const features = () => layer?.getSource()?.getFeatures() ?? [];
  return { map, layer, features };
}

beforeEach(() => {
  areaStore.set(null);
  toolStore.set(null);
  messagesStore.set([]);
});

test("the area is drawn on its own layer whenever one is set, and removed with it", () => {
  const { map, layer, features } = start();
  expect(layer).toBeDefined();
  expect(features()).toHaveLength(0);
  act(() => areaStore.set(AREA));
  expect(features().map((feature) => feature.getId())).toEqual([BOX]);
  const drawn = layer?.getSource()?.getExtent() ?? [];
  extentOfArea(AREA, map.getView().getProjection()).forEach((side, index) => {
    expect(drawn[index]).toBeCloseTo(side, 6);
  });
  expect(screen.getByRole("status").textContent).toBe(
    "The area is west -71.2, south 42.6, east -70.75, north 42.95 degrees.",
  );
  act(() => areaStore.set(null));
  expect(features()).toHaveLength(0);
  expect(screen.getByRole("status").textContent).toBe("No area is set.");
});

test("while the Rectangle button is on, the rectangle carries its eight handles", () => {
  const { features } = start();
  act(() => areaStore.set(AREA));
  act(() => toolStore.set("area-rectangle"));
  expect(features()).toHaveLength(9);
  act(() => toolStore.set(null));
  expect(features()).toHaveLength(1);
  expect(toolKeysStore.get()).toBeNull();
});

test("with the keyboard, the Enter key at two places sets the area", () => {
  start();
  act(() => toolStore.set("area-rectangle"));
  act(() => toolKeysStore.get()?.point(fromLonLat([-71.2, 42.6])));
  expect(areaStore.get()).toBeNull();
  expect(screen.getByRole("status").textContent).toMatch(/^The first corner is set\./);
  act(() => toolKeysStore.get()?.point(fromLonLat([-70.75, 42.95])));
  expect(areaStore.get()).toEqual(AREA);
});

test("a rectangle across the meridian of 180 degrees is refused in a sentence and the area stays", () => {
  const { features } = start();
  act(() => areaStore.set(AREA));
  act(() => toolStore.set("area-rectangle"));
  act(() => toolKeysStore.get()?.point(fromLonLat([170, 10])));
  act(() => toolKeysStore.get()?.point([(fromLonLat([180, 0])[0] ?? 0) + 1e6, 0]));
  expect(areaStore.get()).toBe(AREA);
  expect(messagesStore.get().map(({ kind, text }) => [kind, text])).toEqual([["error", AREA_FAULTS.meridian]]);
  expect(features()).toHaveLength(9);
});

test("the Escape key gives up a rectangle that is being drawn", () => {
  const { features } = start();
  act(() => areaStore.set(AREA));
  act(() => toolStore.set("area-rectangle"));
  act(() => toolKeysStore.get()?.point(fromLonLat([0, 0])));
  expect(features()).toHaveLength(1);
  let given = false;
  act(() => {
    given = toolKeysStore.get()?.cancel() ?? false;
  });
  expect(given).toBe(true);
  expect(features()).toHaveLength(9);
  expect(screen.getByRole("status").textContent).toMatch(/^The area is west -71\.2/);
});
