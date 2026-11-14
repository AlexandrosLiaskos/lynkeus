import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, test } from "vitest";
import { areaStore } from "../shared/area";
import { dockStore, resetDock } from "../shared/dock/dock";
import { MapContext } from "../shared/map";
import { useMapActions } from "./actions";
import { baseMapStore } from "./baseMaps";
import { createMap } from "./map";
import { graticuleStore, toolStore } from "./state";

function start() {
  const map = createMap();
  map.setSize([800, 600]);
  const wrapper = ({ children }: { children: ReactNode }) => <MapContext value={map}>{children}</MapContext>;
  const visible = () =>
    map
      .getLayers()
      .getArray()
      .filter((layer) => layer.getVisible())
      .map((layer): unknown => layer.get("id"));
  return { map, visible, ...renderHook(() => useMapActions(), { wrapper }) };
}

beforeEach(() => {
  baseMapStore.set("blue-marble");
  graticuleStore.set(false);
  toolStore.set(null);
  areaStore.set(null);
  resetDock();
});

test("the button of a background map shows that map and is marked as pressed", () => {
  const { result, visible } = start();
  expect(visible()).toEqual(["blue-marble"]);
  expect(result.current["blue-marble"]?.pressed).toBe(true);
  act(() => result.current.openstreetmap?.run());
  expect(baseMapStore.get()).toBe("openstreetmap");
  expect(visible()).toEqual(["openstreetmap"]);
  expect(result.current.openstreetmap?.pressed).toBe(true);
  expect(result.current["blue-marble"]?.pressed).toBe(false);
});

test("a background map that another part of the interface sets is shown", () => {
  const { result, visible } = start();
  act(() => baseMapStore.set("openstreetmap"));
  expect(visible()).toEqual(["openstreetmap"]);
  expect(result.current.openstreetmap?.pressed).toBe(true);
});

test("the button Imagery of a date shows the image of the chosen day and opens its pane", () => {
  const { result, visible } = start();
  act(() => result.current["imagery-of-a-date"]?.run());
  expect(visible()).toEqual(["imagery"]);
  expect(result.current["imagery-of-a-date"]?.pressed).toBe(true);
  expect(dockStore.get().tools).toEqual(["imagery-of-a-date"]);
});

test.each(["go-to-coordinates", "bookmarks", "area-from-coordinates"] as const)(
  "the button %s opens its pane",
  (id) => {
    const { result } = start();
    act(() => result.current[id]?.run());
    expect(dockStore.get().tools).toEqual([id]);
  },
);

test("a measure button starts its tool and opens its pane, and the other one takes its place", () => {
  const { result } = start();
  act(() => result.current["measure-distance"]?.run());
  expect(toolStore.get()).toBe("measure-distance");
  expect(result.current["measure-distance"]?.pressed).toBe(true);
  expect(dockStore.get().tools).toEqual(["measure-distance"]);
  act(() => result.current["measure-area"]?.run());
  expect(toolStore.get()).toBe("measure-area");
  expect(dockStore.get().tools).toEqual(["measure-area"]);
  // The button ends its tool, and the pane stays with the results.
  act(() => result.current["measure-area"]?.run());
  expect(toolStore.get()).toBeNull();
  expect(dockStore.get().tools).toEqual(["measure-area"]);
});

test("the Graticule and Rectangle buttons switch on and off and are marked as pressed", () => {
  const { result } = start();
  act(() => result.current.graticule?.run());
  expect(graticuleStore.get()).toBe(true);
  expect(result.current.graticule?.pressed).toBe(true);
  act(() => result.current.graticule?.run());
  expect(result.current.graticule?.pressed).toBe(false);
  act(() => result.current["area-rectangle"]?.run());
  expect(toolStore.get()).toBe("area-rectangle");
  expect(result.current["area-rectangle"]?.pressed).toBe(true);
  act(() => result.current["area-rectangle"]?.run());
  expect(toolStore.get()).toBeNull();
});

test("the area is set from the view and removed", () => {
  const { result } = start();
  act(() => result.current["area-from-view"]?.run());
  expect(areaStore.get()).not.toBeNull();
  act(() => result.current["area-clear"]?.run());
  expect(areaStore.get()).toBeNull();
});

test("the Rotate button turns the map by 15 degrees and North up returns it", () => {
  const { map, result } = start();
  act(() => result.current.rotate?.run());
  expect(map.getView().getAnimating()).toBe(true);
  map.getView().cancelAnimations();
  map.getView().setRotation(Math.PI / 12);
  act(() => result.current["north-up"]?.run());
  expect(map.getView().getAnimating()).toBe(true);
});
