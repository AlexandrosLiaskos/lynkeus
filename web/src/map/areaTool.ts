// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type Feature from "ol/Feature";
import type OlMap from "ol/Map";
import { unByKey } from "ol/Observable";
import type { Coordinate } from "ol/coordinate";
import { boundingExtent, type Extent } from "ol/extent";
import type Point from "ol/geom/Point";
import Draw, { createBox } from "ol/interaction/Draw";
import Translate from "ol/interaction/Translate";
import { AREA_EDIT_STYLE, BOX, drawArea, extentAfterHandle, moveArea, type AreaLayer, type Handle } from "./areaLayer";

/** The distance around a handle within which the pointer grabs it, in pixels. With it a handle is 26 pixels wide. */
const GRAB = 8;

/** What the tool tells the part of the interface that started it. */
export interface AreaToolEvents {
  /** The user has drawn, moved or resized the rectangle. It is given in the projection of the map. */
  onRectangle: (extent: Extent) => void;
  /** The user has given up a rectangle that was being drawn. The layer must show the area again. */
  onCancel: () => void;
  /** The first corner was set with the keyboard. */
  onCorner: () => void;
}

/** The Rectangle tool while it is in use. */
export interface AreaTool {
  /** Set a corner at a place, as the Enter key does at the centre of the map. The second corner ends the rectangle. */
  point: (place: Coordinate) => void;
  /** Give up the rectangle that is being drawn. Returns false when none was being drawn. */
  cancel: () => boolean;
  /** End the tool. */
  stop: () => void;
}

/**
 * Start the Rectangle tool on a map. With the pointer, a click sets one corner and a second click the opposite
 * corner; the rectangle on the layer is moved by dragging it and resized by dragging one of its handles. With
 * the keyboard, a corner is set at a given place twice.
 */
export function startAreaTool(map: OlMap, layer: AreaLayer, events: AreaToolEvents): AreaTool {
  const view = map.getView();
  const draw = new Draw({ type: "Circle", geometryFunction: createBox(), stopClick: true, style: AREA_EDIT_STYLE });
  const translate = new Translate({ layers: [layer], hitTolerance: GRAB });
  let drawing = false;
  let corner: Coordinate | null = null;
  let grabbed: Extent | null = null;

  draw.on("drawstart", () => {
    drawing = true;
  });
  draw.on("drawabort", () => {
    drawing = false;
  });
  draw.on("drawend", (event) => {
    drawing = false;
    const rectangle = event.feature.getGeometry();
    if (rectangle) {
      events.onRectangle(rectangle.getExtent());
    }
  });

  // The rectangle after the feature that the pointer drags has moved.
  const dragged = (feature: Feature): Extent | null => {
    const geometry = feature.getGeometry();
    if (!geometry || !grabbed) {
      return null;
    }
    return feature.getId() === BOX
      ? geometry.getExtent()
      : extentAfterHandle(grabbed, feature.getId() as Handle, (geometry as Point).getCoordinates());
  };
  translate.on("translatestart", () => {
    grabbed = layer.getSource()?.getFeatureById(BOX)?.getGeometry()?.getExtent() ?? null;
  });
  translate.on("translating", (event) => {
    const feature = event.features.item(0);
    const extent = dragged(feature);
    if (extent) {
      moveArea(layer, extent, feature);
    }
  });
  translate.on("translateend", (event) => {
    const extent = dragged(event.features.item(0));
    grabbed = null;
    if (extent) {
      events.onRectangle(extent);
    }
  });

  // A rectangle that is drawn with the keyboard reaches from its first corner to the centre of the map.
  const sketch = () => {
    const center = view.getCenter();
    if (corner && center) {
      drawArea(layer, boundingExtent([corner, center]), false);
    }
  };
  const following = view.on("change:center", sketch);

  // The interaction that is added last receives an event first, so a press on the rectangle moves it and does
  // not start a new one.
  map.addInteraction(draw);
  map.addInteraction(translate);

  return {
    point: (place) => {
      if (!corner) {
        corner = place;
        sketch();
        events.onCorner();
        return;
      }
      const extent = boundingExtent([corner, place]);
      corner = null;
      events.onRectangle(extent);
    },
    cancel: () => {
      if (corner) {
        corner = null;
        events.onCancel();
        return true;
      }
      if (drawing) {
        draw.abortDrawing();
        return true;
      }
      return false;
    },
    stop: () => {
      unByKey(following);
      map.removeInteraction(draw);
      map.removeInteraction(translate);
    },
  };
}
