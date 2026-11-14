import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, test } from "vitest";
import { MapContext } from "../shared/map";
import { useMapActions } from "./actions";
import { baseMapStore } from "./baseMaps";
import { createMap } from "./map";

function start() {
  const map = createMap();
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
