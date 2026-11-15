// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import OlMap from "ol/Map";
import View from "ol/View";
import type Point from "ol/geom/Point";
import { toLonLat } from "ol/proj";
import { expect, test } from "vitest";
import { createMarkLayer, drawMark, goTo, latitudeLimit, MARK_LAYER_ID } from "./mark";

test("the mark is drawn at its place on its own layer, and removed", () => {
  const layer = createMarkLayer();
  expect(layer.get("id")).toBe(MARK_LAYER_ID);
  drawMark(layer, [-70.9, 42.8], "EPSG:3857");
  const [feature] = layer.getSource()?.getFeatures() ?? [];
  const [longitude = 0, latitude = 0] = toLonLat((feature?.getGeometry() as Point).getCoordinates());
  expect(longitude).toBeCloseTo(-70.9, 9);
  expect(latitude).toBeCloseTo(42.8, 9);
  drawMark(layer, null, "EPSG:3857");
  expect(layer.getSource()?.getFeatures()).toHaveLength(0);
});

test("the map moves to a place and keeps its scale", () => {
  const map = new OlMap({ view: new View({ center: [0, 0], zoom: 7 }) });
  goTo(map, [170.13, -43.77], 0);
  const [longitude = 0, latitude = 0] = toLonLat(map.getView().getCenter() ?? [0, 0]);
  expect(longitude).toBeCloseTo(170.13, 9);
  expect(latitude).toBeCloseTo(-43.77, 9);
  expect(map.getView().getZoom()).toBe(7);
});

test("the map in Web Mercator ends at 85.0511 degrees of latitude", () => {
  expect(latitudeLimit(new OlMap({ view: new View({ center: [0, 0], zoom: 2 }) }))).toBeCloseTo(85.0511, 4);
});
