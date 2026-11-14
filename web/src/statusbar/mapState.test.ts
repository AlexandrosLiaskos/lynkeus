import type BaseEvent from "ol/events/Event";
import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat } from "ol/proj";
import { expect, test, vi } from "vitest";
import { readMapState, watchMap, type MapState } from "./mapState";

function createMap(): OlMap {
  return new OlMap({ view: new View({ center: fromLonLat([-70.975, 42.775]), zoom: 10 }) });
}

/** Send to the map an event of the kind that OpenLayers sends when the pointer moves. */
function movePointer(map: OlMap, pixel: number[], coordinate: number[]): void {
  map.dispatchEvent({ type: "pointermove", pixel, coordinate } as unknown as BaseEvent);
}

function last(listener: ReturnType<typeof vi.fn<(state: MapState | null) => void>>): MapState | null | undefined {
  return listener.mock.lastCall?.[0];
}

test("the state of the map holds its projection, resolution, centre and rotation", () => {
  const state = readMapState(createMap(), false, null);
  expect(state?.projection.getCode()).toBe("EPSG:3857");
  expect(state?.resolution).toBeCloseTo(152.8740565703525, 9);
  expect(state?.centre).toEqual(fromLonLat([-70.975, 42.775]));
  expect(state?.rotation).toBe(0);
  expect(state?.loading).toBe(false);
  expect(state?.pointer).toBeNull();
});

test("a map whose view has no centre has no state", () => {
  expect(readMapState(new OlMap({ view: new View() }), false, null)).toBeNull();
});

test("a change of the centre, the resolution or the rotation is passed on", () => {
  const map = createMap();
  const listener = vi.fn<(state: MapState | null) => void>();
  watchMap(map, listener);
  map.getView().setCenter([10, 20]);
  expect(last(listener)?.centre).toEqual([10, 20]);
  map.getView().setZoom(11);
  expect(last(listener)?.resolution).toBeCloseTo(152.8740565703525 / 2, 9);
  map.getView().setRotation(0.5);
  expect(last(listener)?.rotation).toBe(0.5);
});

test("the place of the pointer is passed on, and ends when the pointer leaves the map", () => {
  const map = createMap();
  const listener = vi.fn<(state: MapState | null) => void>();
  watchMap(map, listener);
  movePointer(map, [30, 40], [100, 200]);
  expect(last(listener)?.pointer).toEqual({ pixel: [30, 40], coordinate: [100, 200] });
  map.getViewport()?.dispatchEvent(new Event("pointerleave"));
  expect(last(listener)?.pointer).toBeNull();
});

test("the loading of the map is passed on", () => {
  const map = createMap();
  const listener = vi.fn<(state: MapState | null) => void>();
  watchMap(map, listener);
  map.dispatchEvent("loadstart");
  expect(last(listener)?.loading).toBe(true);
  map.dispatchEvent("loadend");
  expect(last(listener)?.loading).toBe(false);
});

test("a new view of the map is followed in the place of the old one", () => {
  const map = createMap();
  const old = map.getView();
  const listener = vi.fn<(state: MapState | null) => void>();
  watchMap(map, listener);
  map.setView(new View({ center: [1, 2], zoom: 3 }));
  expect(last(listener)?.centre).toEqual([1, 2]);
  const calls = listener.mock.calls.length;
  old.setCenter([5, 6]);
  expect(listener.mock.calls.length).toBe(calls);
  map.getView().setCenter([7, 8]);
  expect(last(listener)?.centre).toEqual([7, 8]);
});

test("the following ends when it is asked to", () => {
  const map = createMap();
  const listener = vi.fn<(state: MapState | null) => void>();
  const end = watchMap(map, listener);
  end();
  map.getView().setCenter([10, 20]);
  movePointer(map, [30, 40], [100, 200]);
  map.dispatchEvent("loadstart");
  expect(listener).not.toHaveBeenCalled();
});
