import { act, render } from "@testing-library/react";
import Polygon from "ol/geom/Polygon";
import Draw from "ol/interaction/Draw";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type { Style } from "ol/style";
import { beforeEach, expect, test } from "vitest";
import { drawingStore } from "../data/state";
import { testMap } from "../data/testProducts";
import { MapContext } from "../shared/map";
import { setShapeDisplay, shapeDisplayStore, shapeLayersStore, type ShapeLayer } from "../shared/shapeLayers";
import { ANALYSIS_AREA_LAYER_ID, ANALYSIS_AREA_SYMBOL, AnalysisAreaLayer, takeDrawnArea } from "./AnalysisAreaLayer";
import { analysisAreaStore, analysisDrawingStore, SHAPE_FAULTS } from "./analysisArea";

const TRIANGLE = {
  crs: "EPSG:3857",
  kind: "polygon",
  points: [
    [-7900000, 5270000],
    [-7890000, 5271000],
    [-7895000, 5280000],
    [-7900000, 5270000],
  ],
} as const;

beforeEach(() => {
  analysisAreaStore.set(null);
  analysisDrawingStore.set(null);
  drawingStore.set(null);
  shapeLayersStore.set([]);
  shapeDisplayStore.set({});
});

function show() {
  const map = testMap();
  const page = render(
    <MapContext value={map}>
      <AnalysisAreaLayer />
    </MapContext>,
  );
  const layer = map
    .getLayers()
    .getArray()
    .find((candidate) => candidate.get("id") === ANALYSIS_AREA_LAYER_ID) as VectorLayer<VectorSource> | undefined;
  if (!layer) {
    throw new Error("the map has no layer of the area of the analysis");
  }
  return { map, layer, page, shapes: () => layer.getSource()?.getFeatures().length };
}

/** The description of the area among the shape layers, as the Contents pane reads it. */
function listed(): ShapeLayer | undefined {
  return shapeLayersStore.get().find(({ id }) => id === ANALYSIS_AREA_LAYER_ID);
}

test("the area of the analysis is a layer of the Contents pane while there is one, and removing it takes the area away", () => {
  const { layer, shapes, page } = show();
  expect(ANALYSIS_AREA_LAYER_ID).toBe("analysis-area");
  expect([shapes(), listed()]).toEqual([0, undefined]);
  act(() => analysisAreaStore.set(TRIANGLE));
  expect(shapes()).toBe(1);
  expect(listed()).toMatchObject({ title: "Area of the analysis", line: "Polygon of 3 corners" });
  expect(listed()?.symbols).toEqual([{ label: "Area of the analysis", line: "#e66f0e", width: 2 }]);
  expect(listed()?.properties.map(({ name }) => name)).toEqual(["Kind", "West", "South", "East", "North", "Points"]);
  const stroke = (layer.getStyle() as Style).getStroke();
  expect([stroke?.getColor(), stroke?.getWidth()]).toEqual([ANALYSIS_AREA_SYMBOL.line, ANALYSIS_AREA_SYMBOL.width]);
  act(() => listed()?.remove());
  expect([analysisAreaStore.get(), shapes(), listed()]).toEqual([null, 0, undefined]);
  act(() => analysisAreaStore.set(TRIANGLE));
  page.unmount();
  expect(shapeLayersStore.get()).toEqual([]);
});

test("an area that has just been drawn is shown, also when its layer was hidden", () => {
  const { layer } = show();
  act(() => analysisAreaStore.set(TRIANGLE));
  act(() => setShapeDisplay(ANALYSIS_AREA_LAYER_ID, { visible: false }));
  expect(layer.getVisible()).toBe(false);
  act(() => {
    expect(
      takeDrawnArea(
        new Polygon([
          [
            [0, 0],
            [1000, 0],
            [1000, 1000],
            [0, 0],
          ],
        ]),
        "polygon",
        "EPSG:3857",
      ),
    ).toBeNull();
  });
  expect(layer.getVisible()).toBe(true);
  expect(analysisAreaStore.get()?.points).toHaveLength(4);
});

test("a drawn shape that is not an area is refused, and the area stays", () => {
  analysisAreaStore.set(TRIANGLE);
  const crossing = new Polygon([
    [
      [0, 0],
      [1000, 1000],
      [1000, 0],
      [0, 1000],
      [0, 0],
    ],
  ]);
  expect(takeDrawnArea(crossing, "polygon", "EPSG:3857")).toBe(SHAPE_FAULTS.crossing);
  expect(analysisAreaStore.get()).toBe(TRIANGLE);
});

test("a drawing tool is on the map while the area is drawn, and the Escape key or a drawing of the search ends it", () => {
  const { map } = show();
  const drawing = () =>
    map
      .getInteractions()
      .getArray()
      .some((interaction) => interaction instanceof Draw);
  expect(drawing()).toBe(false);
  act(() => analysisDrawingStore.set("rectangle"));
  expect(drawing()).toBe(true);
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect([analysisDrawingStore.get(), drawing()]).toEqual([null, false]);
  act(() => analysisDrawingStore.set("polygon"));
  act(() => drawingStore.set("rectangle"));
  expect([analysisDrawingStore.get(), drawing()]).toEqual([null, false]);
});
