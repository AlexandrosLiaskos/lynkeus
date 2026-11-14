import type Point from "ol/geom/Point";
import { expect, test } from "vitest";
import {
  AREA_LAYER_ID,
  BOX,
  createAreaLayer,
  drawArea,
  extentAfterHandle,
  handlePlace,
  HANDLES,
  moveArea,
} from "./areaLayer";

const EXTENT = [10, 20, 30, 60];

test("the layer of the area carries its name and is drawn above the layers of the map", () => {
  const layer = createAreaLayer();
  expect(layer.get("id")).toBe(AREA_LAYER_ID);
  expect(layer.getZIndex()).toBeGreaterThanOrEqual(1000);
});

test("the handles stand on the corners and on the middle of the sides", () => {
  expect(HANDLES.map((handle) => handlePlace(EXTENT, handle))).toEqual([
    [10, 20],
    [20, 20],
    [30, 20],
    [30, 40],
    [30, 60],
    [20, 60],
    [10, 60],
    [10, 40],
  ]);
});

test("a corner moves two sides and the handle of a side moves that side alone", () => {
  expect(extentAfterHandle(EXTENT, "ne", [35, 70])).toEqual([10, 20, 35, 70]);
  expect(extentAfterHandle(EXTENT, "sw", [12, 25])).toEqual([12, 25, 30, 60]);
  expect(extentAfterHandle(EXTENT, "n", [99, 50])).toEqual([10, 20, 30, 50]);
  expect(extentAfterHandle(EXTENT, "w", [5, 99])).toEqual([5, 20, 30, 60]);
});

test("a handle moved past the opposite side turns the rectangle over", () => {
  expect(extentAfterHandle(EXTENT, "e", [0, 0])).toEqual([0, 20, 10, 60]);
  expect(extentAfterHandle(EXTENT, "sw", [40, 80])).toEqual([30, 60, 40, 80]);
});

test("the rectangle is drawn with or without its handles, and removed", () => {
  const layer = createAreaLayer();
  const ids = () =>
    layer
      .getSource()
      ?.getFeatures()
      .map((feature) => feature.getId());
  drawArea(layer, EXTENT, false);
  expect(ids()).toEqual([BOX]);
  expect(layer.getSource()?.getFeatureById(BOX)?.getGeometry()?.getExtent()).toEqual(EXTENT);
  drawArea(layer, EXTENT, true);
  expect(ids()).toHaveLength(9);
  drawArea(layer, null, true);
  expect(ids()).toEqual([]);
});

test("the rectangle and the other handles follow the handle that is dragged", () => {
  const layer = createAreaLayer();
  drawArea(layer, EXTENT, true);
  const source = layer.getSource();
  const dragged = source?.getFeatureById("ne");
  if (!source || !dragged) {
    throw new Error("the layer has no handle");
  }
  (dragged.getGeometry() as Point).setCoordinates([50, 80]);
  moveArea(layer, extentAfterHandle(EXTENT, "ne", [50, 80]), dragged);
  expect(source.getFeatureById(BOX)?.getGeometry()?.getExtent()).toEqual([10, 20, 50, 80]);
  expect((source.getFeatureById("e")?.getGeometry() as Point).getCoordinates()).toEqual([50, 50]);
  expect((source.getFeatureById("sw")?.getGeometry() as Point).getCoordinates()).toEqual([10, 20]);
});
