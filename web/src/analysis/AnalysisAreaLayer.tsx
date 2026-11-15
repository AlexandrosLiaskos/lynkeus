import { useEffect, useMemo, useState } from "react";
import Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import Polygon from "ol/geom/Polygon";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Stroke, Style } from "ol/style";
import { drawingStore } from "../data/state";
import { drawShape, type ShapeKind } from "../shared/drawShape";
import { useMap } from "../shared/map";
import { report } from "../shared/messages/messages";
import {
  dropShapeLayer,
  putShapeLayer,
  setShapeDisplay,
  shapeDisplayOf,
  type ShapeLayer,
  type ShapeSymbol,
} from "../shared/shapeLayers";
import { useStore } from "../shared/store";
import { useShapeLayer } from "../shared/useShapeLayer";
import { analysisAreaStore, analysisDrawingStore, shapeName, shapeOfGeometry, shapeProperties } from "./analysisArea";

/** The id of the shape layer of the area of the analysis. The layer of the map carries it. */
export const ANALYSIS_AREA_LAYER_ID = "analysis-area";

/**
 * How the map draws the area of the analysis, which is also its symbol in the legend of the layer: a solid line in
 * the orange of the U.S. Web Design System, so that it differs from the area of the search and from the outlines of
 * the products.
 */
export const ANALYSIS_AREA_SYMBOL = {
  label: "Area of the analysis",
  line: "#e66f0e",
  width: 2,
} satisfies ShapeSymbol;

const AREA_STYLE = new Style({
  stroke: new Stroke({ color: ANALYSIS_AREA_SYMBOL.line, width: ANALYSIS_AREA_SYMBOL.width }),
});

/** Take a shape drawn on the map as the area of the analysis. Return what is wrong with the shape, or null. */
export function takeDrawnArea(shape: Geometry, kind: ShapeKind, projection: string): string | null {
  const taken = shapeOfGeometry(shape, kind, projection);
  if (typeof taken === "string") {
    return taken;
  }
  analysisAreaStore.set(taken);
  return null;
}

/** Take the area out of the analysis. */
function removeArea(): void {
  analysisAreaStore.set(null);
}

/**
 * The area of the analysis on the map. It is one layer of the Contents pane, "Area of the analysis", whenever an
 * area is drawn: the pane shows and hides the layer, moves it in the drawing order and removes it, which takes the
 * area out of every form of the Analysis tab. An area that has just been drawn is shown even when the layer was
 * hidden. The user draws the area as a rectangle or as a polygon, with the drawing of the area of the search
 * (`drawShape`); a drawing of the one area ends a drawing of the other.
 */
export function AnalysisAreaLayer() {
  const map = useMap();
  const area = useStore(analysisAreaStore);
  const drawing = useStore(analysisDrawingStore);
  const searchDrawing = useStore(drawingStore);
  const [layer] = useState(
    () =>
      new VectorLayer({
        source: new VectorSource(),
        style: AREA_STYLE,
        properties: { id: ANALYSIS_AREA_LAYER_ID },
      }),
  );
  useShapeLayer(layer, ANALYSIS_AREA_LAYER_ID);

  useEffect(() => {
    map.addLayer(layer);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, layer]);

  useEffect(() => {
    const source = layer.getSource();
    source?.clear();
    if (area) {
      const ring = area.points.map(([x, y]) => [x, y]);
      source?.addFeature(new Feature(new Polygon([ring]).transform(area.crs, map.getView().getProjection())));
    }
  }, [map, layer, area]);

  const description = useMemo<ShapeLayer | null>(
    () =>
      area && {
        id: ANALYSIS_AREA_LAYER_ID,
        title: "Area of the analysis",
        line: shapeName(area).charAt(0).toUpperCase() + shapeName(area).slice(1),
        symbols: [ANALYSIS_AREA_SYMBOL],
        properties: shapeProperties(area),
        remove: removeArea,
      },
    [area],
  );

  // An area that has just been drawn is shown, also when the user had hidden the layer of the area before it.
  useEffect(() => {
    if (description) {
      putShapeLayer(description);
      if (!shapeDisplayOf(ANALYSIS_AREA_LAYER_ID).visible) {
        setShapeDisplay(ANALYSIS_AREA_LAYER_ID, { visible: true });
      }
    } else {
      dropShapeLayer(ANALYSIS_AREA_LAYER_ID);
    }
  }, [description]);
  useEffect(() => () => dropShapeLayer(ANALYSIS_AREA_LAYER_ID), []);

  // The drawing of the area of the search ends the drawing of this area.
  useEffect(() => {
    if (searchDrawing) {
      analysisDrawingStore.set(null);
    }
  }, [searchDrawing]);

  useEffect(() => {
    if (!drawing) {
      return;
    }
    return drawShape(
      map,
      drawing,
      ANALYSIS_AREA_SYMBOL.line,
      (shape) => {
        const fault = takeDrawnArea(shape, drawing, map.getView().getProjection().getCode());
        if (fault) {
          report("warning", fault);
        }
      },
      () => analysisDrawingStore.set(null),
    );
  }, [map, drawing]);

  return null;
}
