// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import Feature from "ol/Feature";
import type { Coordinate } from "ol/coordinate";
import { getCenter, type Extent } from "ol/extent";
import Point from "ol/geom/Point";
import { fromExtent } from "ol/geom/Polygon";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Fill, RegularShape, Stroke, Style } from "ol/style";
import type { ShapeSymbol } from "../shared/shapeLayers";
import { sidesOf } from "./area";

/** The name of the layer that draws the area. */
export const AREA_LAYER_ID = "area";

/** The name of the feature that is the rectangle of the area. The other features are its handles. */
export const BOX = "box";

/** The handles of the rectangle: its four corners and the middle of its four sides. */
export const HANDLES = ["sw", "s", "se", "e", "ne", "n", "nw", "w"] as const;
export type Handle = (typeof HANDLES)[number];

// The colours "ink" and "white" of the U.S. Web Design System. A dark dashed line on a white line stays
// visible on a background map of any colour.
const INK = "#1b1b1b";
const WHITE = "#ffffff";
// The width of the dashed line, in pixels. The white line under it is twice as wide.
const LINE_WIDTH = 2;
// The lengths of a dash and of a gap of the dashed line, in pixels.
const LINE_DASH: readonly number[] = [8, 6];
const CASING = new Style({ stroke: new Stroke({ color: WHITE, width: 2 * LINE_WIDTH }) });
const LINE = new Style({ stroke: new Stroke({ color: INK, width: LINE_WIDTH, lineDash: [...LINE_DASH] }) });
const TINT = new Style({ fill: new Fill({ color: "rgba(27, 27, 27, 0.1)" }) });
const HANDLE = new Style({
  image: new RegularShape({
    points: 4,
    radius: 7,
    angle: Math.PI / 4,
    fill: new Fill({ color: WHITE }),
    stroke: new Stroke({ color: INK, width: 2 }),
  }),
  zIndex: 1,
});

/** The style of the rectangle at rest: its outline alone, so that the layers inside it keep their colours. */
export const AREA_STYLE = [CASING, LINE];

/** The style of the rectangle while it is drawn or changed: its outline and a light tint, which can be grabbed. */
export const AREA_EDIT_STYLE = [TINT, CASING, LINE];

/** The symbol of the area in the legend of its layer: the line of the rectangle at rest, as `AREA_STYLE` draws it. */
export const AREA_SYMBOL: ShapeSymbol = {
  label: "Area",
  line: INK,
  width: LINE_WIDTH,
  dash: LINE_DASH,
  casing: WHITE,
};

/**
 * The z-index of the layer while the Rectangle tool is in use: above every layer of the drawing order, so that
 * the handles of the rectangle can always be seen and grabbed.
 */
export const AREA_EDIT_Z_INDEX = 1010;

export type AreaLayer = VectorLayer<VectorSource>;

/**
 * Create the layer that draws the area. It has no z-index of its own: the part that puts it on the map gives it
 * its place in the drawing order. Its property "editing" shows the tint.
 */
export function createAreaLayer(): AreaLayer {
  const layer: AreaLayer = new VectorLayer({
    source: new VectorSource(),
    properties: { id: AREA_LAYER_ID },
    style: (feature) => {
      if (feature.getId() !== BOX) {
        return HANDLE;
      }
      return layer.get("editing") === true ? AREA_EDIT_STYLE : AREA_STYLE;
    },
  });
  return layer;
}

/** Return the place of a handle on a rectangle. */
export function handlePlace(extent: Extent, handle: Handle): Coordinate {
  const [west, south, east, north] = sidesOf(extent);
  const [x = Number.NaN, y = Number.NaN] = getCenter(extent);
  return [
    handle.includes("w") ? west : handle.includes("e") ? east : x,
    handle.includes("s") ? south : handle.includes("n") ? north : y,
  ];
}

/**
 * Return a rectangle after one of its handles is moved to a place. A corner moves its two sides and the handle
 * of a side moves that side alone. A handle that is moved past the opposite side turns the rectangle over.
 */
export function extentAfterHandle(extent: Extent, handle: Handle, place: Coordinate): Extent {
  let [west, south, east, north] = sidesOf(extent);
  const [x = Number.NaN, y = Number.NaN] = place;
  if (handle.includes("w")) {
    west = x;
  } else if (handle.includes("e")) {
    east = x;
  }
  if (handle.includes("s")) {
    south = y;
  } else if (handle.includes("n")) {
    north = y;
  }
  return [Math.min(west, east), Math.min(south, north), Math.max(west, east), Math.max(south, north)];
}

/** Draw a rectangle on the layer, with its handles when asked, or empty the layer when there is no rectangle. */
export function drawArea(layer: AreaLayer, extent: Extent | null, handles: boolean): void {
  const source = layer.getSource();
  source?.clear();
  if (!source || !extent) {
    return;
  }
  const box = new Feature(fromExtent(extent));
  box.setId(BOX);
  source.addFeature(box);
  if (handles) {
    source.addFeatures(
      HANDLES.map((handle) => {
        const feature = new Feature(new Point(handlePlace(extent, handle)));
        feature.setId(handle);
        return feature;
      }),
    );
  }
}

/** Move the rectangle and its handles to a new rectangle, except the one feature that the pointer is dragging. */
export function moveArea(layer: AreaLayer, extent: Extent, dragged: Feature): void {
  layer.getSource()?.forEachFeature((feature) => {
    const id = feature.getId();
    if (feature === dragged) {
      return;
    }
    if (id === BOX) {
      feature.setGeometry(fromExtent(extent));
    } else if (HANDLES.some((handle) => handle === id)) {
      feature.setGeometry(new Point(handlePlace(extent, id as Handle)));
    }
  });
}
