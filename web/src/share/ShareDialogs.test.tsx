// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { render } from "@testing-library/react";
import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat, toLonLat } from "ol/proj";
import { afterEach, beforeEach, expect, test } from "vitest";
import { baseMapStore } from "../map/baseMaps";
import { areaStore } from "../shared/area";
import { resetDock } from "../shared/dock/dock";
import { MapContext } from "../shared/map";
import { messagesStore } from "../shared/messages/messages";
import { ShareDialogs } from "./ShareDialogs";

let map: OlMap;

beforeEach(() => {
  resetDock();
  messagesStore.set([]);
  baseMapStore.set("blue-marble");
  areaStore.set(null);
  map = new OlMap({ view: new View({ center: fromLonLat([0, 20]), zoom: 2 }) });
  map.setSize([1052, 655]);
});

afterEach(() => {
  window.location.hash = "";
});

function openPage(): void {
  render(
    <MapContext value={map}>
      <ShareDialogs />
    </MapContext>,
  );
}

function centre(): number[] {
  return toLonLat(map.getView().getCenter() ?? [0, 0]).map((value) => Math.round(value * 1e6) / 1e6);
}

test("a page that opens with a link shows the state of the link, and the link leaves the address", () => {
  window.location.hash = "#map=10.5/42.775/-70.975&rotation=30&basemap=openstreetmap&area=-71.2,42.6,-70.75,42.95";
  openPage();
  expect(centre()).toEqual([-70.975, 42.775]);
  expect(map.getView().getZoom()).toBeCloseTo(10.5, 9);
  expect(map.getView().getRotation()).toBeCloseTo(Math.PI / 6, 9);
  expect(baseMapStore.get()).toBe("openstreetmap");
  expect(areaStore.get()).toEqual({ west: -71.2, south: 42.6, east: -70.75, north: 42.95 });
  expect(window.location.hash).toBe("");
  expect(messagesStore.get()).toEqual([]);
});

test("a page that opens without a link keeps its first view", () => {
  openPage();
  expect(centre()).toEqual([0, 20]);
  expect(map.getView().getZoom()).toBe(2);
  expect(messagesStore.get()).toEqual([]);
});

test("a wrong part of a link is reported and ignored, and the other parts are applied", () => {
  window.location.hash = "#map=3/10/20&basemap=moon&area=5,5,1,1";
  openPage();
  expect(centre()).toEqual([20, 10]);
  expect(baseMapStore.get()).toBe("blue-marble");
  expect(areaStore.get()).toBeNull();
  expect(messagesStore.get().map(({ kind, text }) => [kind, text])).toEqual([
    [
      "warning",
      "The address of the page gives a basemap and an area that Lynkeus cannot read. These parts were ignored.",
    ],
  ]);
});

test("a link that is given to an open page is read too, and a part of another function stays in the address", () => {
  openPage();
  window.location.hash = "#other=1&map=4/-33.9/18.4";
  window.dispatchEvent(new Event("hashchange"));
  expect(centre()).toEqual([18.4, -33.9]);
  expect(map.getView().getZoom()).toBe(4);
  expect(window.location.hash).toBe("#other=1");
});
