// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import OlMap from "ol/Map";
import View from "ol/View";
import { fromLonLat } from "ol/proj";
import { beforeEach, expect, test } from "vitest";
import { EARTH_RADIUS, measurementsStore } from "./measure";
import { createMeasureLayer, MEASURE_LAYER_ID } from "./measureLayer";
import { sketchStore, startMeasureTool } from "./measureTool";

const DEGREE = (Math.PI * EARTH_RADIUS) / 180;

function start(kind: "distance" | "area") {
  const map = new OlMap({ view: new View({ center: [0, 0], zoom: 5 }) });
  // The simulated browser draws no map, so the place of a point on the screen, which OpenLayers asks for while
  // a polygon is drawn, is given here: one pixel for each kilometre.
  map.getPixelFromCoordinate = ([x = 0, y = 0]) => [x / 1000, -y / 1000];
  const layer = createMeasureLayer(map.getView().getProjection());
  map.addLayer(layer);
  return { map, layer, tool: startMeasureTool(map, layer, kind) };
}

beforeEach(() => {
  measurementsStore.set([]);
  sketchStore.set(null);
});

test("the layer of the measurements carries its name and is drawn above the layers of the map", () => {
  const { layer } = start("distance");
  expect(layer.get("id")).toBe(MEASURE_LAYER_ID);
  expect(layer.getZIndex()).toBeGreaterThanOrEqual(1000);
});

test("with the keyboard, points are added and the same place twice ends the line", () => {
  const { layer, tool } = start("distance");
  tool.point(fromLonLat([0, 0]));
  // One point is not a line, so the same place again does not end it.
  tool.point(fromLonLat([0, 0]));
  expect(measurementsStore.get()).toHaveLength(0);
  tool.point(fromLonLat([1, 0]));
  expect(sketchStore.get()?.length).toBeCloseTo(DEGREE, 6);
  tool.point(fromLonLat([1, 2]));
  tool.point(fromLonLat([1, 2]));
  const [measurement] = measurementsStore.get();
  expect(measurement?.kind).toBe("distance");
  expect(measurement?.segments).toHaveLength(2);
  expect(measurement?.length).toBeCloseTo(3 * DEGREE, 6);
  expect(sketchStore.get()).toBeNull();
  expect(layer.getSource()?.getFeatures()).toHaveLength(1);
});

test("the last point is taken back, and a drawing is given up", () => {
  const { layer, tool } = start("distance");
  expect(tool.cancel()).toBe(false);
  tool.point(fromLonLat([0, 0]));
  tool.point(fromLonLat([1, 0]));
  tool.point(fromLonLat([5, 5]));
  tool.back();
  tool.point(fromLonLat([1, 1]));
  tool.point(fromLonLat([1, 1]));
  expect(measurementsStore.get()[0]?.length).toBeCloseTo(2 * DEGREE, 6);
  tool.point(fromLonLat([3, 3]));
  expect(tool.cancel()).toBe(true);
  expect(sketchStore.get()).toBeNull();
  expect(measurementsStore.get()).toHaveLength(1);
  expect(layer.getSource()?.getFeatures()).toHaveLength(1);
});

test("a polygon needs three points and gives its area and its perimeter", () => {
  const { tool } = start("area");
  tool.point(fromLonLat([0, -0.5]));
  tool.point(fromLonLat([1, -0.5]));
  tool.point(fromLonLat([1, -0.5]));
  expect(measurementsStore.get()).toHaveLength(0);
  tool.point(fromLonLat([1, 0.5]));
  tool.point(fromLonLat([0, 0.5]));
  tool.point(fromLonLat([0, 0.5]));
  const [measurement] = measurementsStore.get();
  expect(measurement?.kind).toBe("area");
  expect(measurement?.segments).toHaveLength(4);
  expect((measurement?.area ?? 0) / (DEGREE * DEGREE)).toBeCloseTo(1, 4);
  expect((measurement?.length ?? 0) / (4 * DEGREE)).toBeCloseTo(1, 4);
});

test("the tool removes its interaction when it ends, and the finished measurements stay", () => {
  const { map, layer, tool } = start("distance");
  const before = map.getInteractions().getLength();
  tool.point(fromLonLat([0, 0]));
  tool.point(fromLonLat([1, 0]));
  tool.point(fromLonLat([1, 0]));
  tool.point(fromLonLat([2, 2]));
  tool.stop();
  expect(map.getInteractions().getLength()).toBe(before - 1);
  expect(layer.getSource()?.getFeatures()).toHaveLength(1);
  expect(sketchStore.get()).toBeNull();
});
