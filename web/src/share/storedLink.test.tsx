// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { render } from "@testing-library/react";
import { toLonLat } from "ol/proj";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const VIEW = { center: [23.7, 37.9], zoom: 8, rotation: 0.5, baseMap: "openstreetmap", imagery: null, graticule: true };
const AREA = { west: 23, south: 37, east: 24, north: 38 };

beforeEach(() => {
  window.localStorage.setItem("lynkeus.view", JSON.stringify({ v: 1, value: VIEW }));
  window.localStorage.setItem("lynkeus.area", JSON.stringify({ v: 1, value: AREA }));
});

afterEach(() => {
  window.location.hash = "";
});

/**
 * Open the page as `Platform` does: the modules are loaded, which restores the stored parts, the map is created
 * and its stored view restored, and then the page is drawn, which reads the link of the address.
 */
async function openPage() {
  vi.resetModules();
  const { MapContext } = await import("../shared/map");
  const { createMap } = await import("../map/map");
  const { keepMapView } = await import("../map/storedView");
  const { baseMapStore } = await import("../map/baseMaps");
  const { graticuleStore } = await import("../map/state");
  const { areaStore } = await import("../shared/area");
  const { ShareDialogs } = await import("./ShareDialogs");
  const map = createMap();
  map.setSize([1052, 655]);
  const part = keepMapView(map);
  const state = () => ({
    centre: toLonLat(map.getView().getCenter() ?? [0, 0]).map((value) => Math.round(value * 1e6) / 1e6),
    zoom: Math.round((map.getView().getZoom() ?? 0) * 1e6) / 1e6,
    rotation: map.getView().getRotation(),
    baseMap: baseMapStore.get(),
    graticule: graticuleStore.get(),
    area: areaStore.get(),
  });
  const before = state();
  render(
    <MapContext value={map}>
      <ShareDialogs />
    </MapContext>,
  );
  const after = state();
  part.leave();
  return { before, after };
}

test("a page that opens without a link shows the stored view, basemap and area", async () => {
  const { before, after } = await openPage();
  expect(after).toEqual({
    centre: [23.7, 37.9],
    zoom: 8,
    rotation: 0.5,
    baseMap: "openstreetmap",
    graticule: true,
    area: AREA,
  });
  expect(before).toEqual(after);
});

test("the state of a link replaces the stored state, which was restored before the link was read", async () => {
  window.location.hash = "#map=10.5/42.775/-70.975&basemap=blue-marble&area=-71.2,42.6,-70.75,42.95";
  const { before, after } = await openPage();
  expect(before).toMatchObject({ centre: [23.7, 37.9], zoom: 8, baseMap: "openstreetmap", area: AREA });
  expect(after).toEqual({
    centre: [-70.975, 42.775],
    zoom: 10.5,
    rotation: 0,
    baseMap: "blue-marble",
    // A link does not carry the graticule, so the stored choice stays.
    graticule: true,
    area: { west: -71.2, south: 42.6, east: -70.75, north: 42.95 },
  });
  expect(window.location.hash).toBe("");
});

test("a link that gives only an area leaves the stored view in its place", async () => {
  window.location.hash = "#area=-71.2,42.6,-70.75,42.95";
  const { after } = await openPage();
  expect(after).toMatchObject({
    centre: [23.7, 37.9],
    zoom: 8,
    baseMap: "openstreetmap",
    area: { west: -71.2, south: 42.6, east: -70.75, north: 42.95 },
  });
});
