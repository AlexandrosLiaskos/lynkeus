// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import Feature from "ol/Feature";
import type OlMap from "ol/Map";
import Point from "ol/geom/Point";
import VectorLayer from "ol/layer/Vector";
import { fromLonLat, toLonLat, type ProjectionLike } from "ol/proj";
import VectorSource from "ol/source/Vector";
import { Circle, Fill, Stroke, Style } from "ol/style";
import { createStore } from "../shared/store";

/** The name of the layer that draws the mark of a place. */
export const MARK_LAYER_ID = "mark";

/** The place that is marked on the map, as longitude and latitude in degrees, or null when none is marked. */
export const markStore = createStore<readonly [number, number] | null>(null);

// The colours "white" and "primary" of the U.S. Web Design System. A ring on a wider white ring, around a dot,
// stays visible on a background map of any colour.
const WHITE = "#ffffff";
const PRIMARY = "#005ea2";
const MARK = [
  new Style({ image: new Circle({ radius: 10, stroke: new Stroke({ color: WHITE, width: 6 }) }) }),
  new Style({ image: new Circle({ radius: 10, stroke: new Stroke({ color: PRIMARY, width: 3 }) }) }),
  new Style({
    image: new Circle({
      radius: 3,
      fill: new Fill({ color: PRIMARY }),
      stroke: new Stroke({ color: WHITE, width: 1.5 }),
    }),
  }),
];

export type MarkLayer = VectorLayer<VectorSource>;

/** Create a layer that draws a mark above every other layer, under the given name. */
export function createMarkLayer(id = MARK_LAYER_ID): MarkLayer {
  return new VectorLayer({ source: new VectorSource(), zIndex: 1030, properties: { id }, style: MARK });
}

/** Draw the mark at a place, or remove it when there is no place. */
export function drawMark(layer: MarkLayer, place: readonly [number, number] | null, projection: ProjectionLike): void {
  const source = layer.getSource();
  source?.clear();
  if (place) {
    source?.addFeature(new Feature(new Point(fromLonLat([...place], projection))));
  }
}

/** Return the highest latitude that the map shows, in degrees. Web Mercator ends at 85.0511 degrees. */
export function latitudeLimit(map: OlMap): number {
  const projection = map.getView().getProjection();
  const top = projection.getExtent()[3];
  return top === undefined ? 90 : (toLonLat([0, top], projection)[1] ?? 90);
}

/** Move the map so that a place, given as longitude and latitude in degrees, lies at its centre. The scale stays. */
export function goTo(map: OlMap, place: readonly [number, number], duration = 250): void {
  const view = map.getView();
  view.animate({ center: fromLonLat([...place], view.getProjection()), duration });
}
