// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type Feature from "ol/Feature";
import type OlMap from "ol/Map";
import type { Coordinate } from "ol/coordinate";
import LineString from "ol/geom/LineString";
import Polygon from "ol/geom/Polygon";
import Draw from "ol/interaction/Draw";
import type Projection from "ol/proj/Projection";
import { createStore } from "../shared/store";
import { measureLine, measurementsStore, measurePolygon, type Measurement } from "./measure";
import { measureStyle, type MeasureLayer } from "./measureLayer";

/** What is measured: the length of a line or the area of a polygon. */
export type MeasureKind = "distance" | "area";

/** The measurement of the line or polygon that is being drawn, or null when none is being drawn. */
export const sketchStore = createStore<Measurement | null>(null);

/** Measure a line or a polygon of the map, or return null for any other geometry. */
export function measureGeometry(geometry: unknown, projection: Projection): Measurement | null {
  if (geometry instanceof LineString) {
    return measureLine(geometry, projection);
  }
  return geometry instanceof Polygon ? measurePolygon(geometry, projection) : null;
}

/** A measure tool while it is in use. */
export interface MeasureTool {
  /** Add a point at a place, as the Enter key does at the centre of the map. The same place twice ends the drawing. */
  point: (place: Coordinate) => void;
  /** Take back the last point. */
  back: () => void;
  /** Give up the line or polygon that is being drawn. Returns false when none was being drawn. */
  cancel: () => boolean;
  /** End the tool. The finished measurements stay on the map. */
  stop: () => void;
}

/**
 * Start a measure tool on a map. With the pointer, each click adds a point and a double click ends the line or
 * the polygon. With the keyboard, a point is added at a given place, and the same place twice ends it. A finished
 * line or polygon stays on the layer and is added to the list of measurements.
 */
export function startMeasureTool(map: OlMap, layer: MeasureLayer, kind: MeasureKind): MeasureTool {
  const projection = map.getView().getProjection();
  const style = measureStyle(projection);
  const draw = new Draw({
    source: layer.getSource() ?? undefined,
    type: kind === "distance" ? "LineString" : "Polygon",
    stopClick: true,
    // While a polygon is drawn, OpenLayers also draws its outline as a line, which carries no second set of labels.
    style: (feature, resolution) =>
      kind === "area" && feature.getGeometry() instanceof LineString
        ? style(feature, resolution).slice(0, 2)
        : style(feature, resolution),
  });
  let sketch: Feature | null = null;
  let last: Coordinate | null = null;

  const end = () => {
    sketch = null;
    last = null;
    sketchStore.set(null);
  };
  draw.on("drawstart", (event) => {
    sketch = event.feature;
    const geometry = sketch.getGeometry();
    geometry?.on("change", () => sketchStore.set(measureGeometry(geometry, projection)));
  });
  draw.on("drawabort", end);
  draw.on("drawend", (event) => {
    const measurement = measureGeometry(event.feature.getGeometry(), projection);
    end();
    if (measurement) {
      measurementsStore.set([...measurementsStore.get(), measurement]);
    }
  });
  map.addInteraction(draw);

  // The number of points that the sketch holds, without the one that follows the pointer.
  const placed = () => {
    const geometry = sketch?.getGeometry();
    if (geometry instanceof LineString) {
      return geometry.getCoordinates().length - 1;
    }
    return geometry instanceof Polygon ? (geometry.getLinearRing(0)?.getCoordinates().length ?? 2) - 2 : 0;
  };

  return {
    point: (place) => {
      if (sketch && last && last[0] === place[0] && last[1] === place[1]) {
        if (placed() >= (kind === "distance" ? 2 : 3)) {
          draw.finishDrawing();
        }
        return;
      }
      draw.appendCoordinates([place]);
      last = place;
    },
    back: () => {
      if (sketch) {
        draw.removeLastPoint();
        last = null;
      }
    },
    cancel: () => {
      if (!sketch) {
        return false;
      }
      draw.abortDrawing();
      return true;
    },
    stop: () => {
      draw.abortDrawing();
      map.removeInteraction(draw);
    },
  };
}
