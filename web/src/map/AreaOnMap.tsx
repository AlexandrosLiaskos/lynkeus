// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useEffect, useMemo, useState } from "react";
import { areaStore, type Area } from "../shared/area";
import { useMap } from "../shared/map";
import { report } from "../shared/messages/messages";
import {
  dropShapeLayer,
  FIRST_SHAPE_DISPLAY,
  FIRST_Z_INDEX,
  layerOrderStore,
  putShapeLayer,
  setShapeDisplay,
  shapeDisplayOf,
  shapeDisplayStore,
  type ShapeLayer,
} from "../shared/shapeLayers";
import { useStore } from "../shared/store";
import { areaOfExtent, extentOfArea, SIDES } from "./area";
import { AREA_EDIT_Z_INDEX, AREA_LAYER_ID, AREA_SYMBOL, createAreaLayer, drawArea } from "./areaLayer";
import { startAreaTool } from "./areaTool";
import { toolKeysStore } from "./keys";
import { toolStore } from "./state";

/** What a screen reader is told about the area, which a sighted user sees on the map. */
export function areaSentence(area: Area | null, cornerSet: boolean): string {
  if (cornerSet) {
    return "The first corner is set. Move the map with the arrow keys and press Enter at the opposite corner.";
  }
  return area
    ? `The area is west ${String(area.west)}, south ${String(area.south)}, east ${String(area.east)}, north ${String(area.north)} degrees.`
    : "No area is set.";
}

/** The names of the four sides of the area among the properties of its layer. */
const SIDE_NAMES = { west: "West", south: "South", east: "East", north: "North" } as const;

/** Clear the area, as the button Clear of the group Area does. */
function clearArea(): void {
  areaStore.set(null);
}

/**
 * Describe the area as a layer of the Contents pane: its name, the symbol of its rectangle and its four sides in
 * degrees. Removing the layer clears the area.
 */
export function areaShapeLayer(area: Area): ShapeLayer {
  return {
    id: AREA_LAYER_ID,
    title: "Area",
    line: "Rectangle",
    symbols: [AREA_SYMBOL],
    properties: [
      { name: "Kind", value: "Rectangle" },
      ...SIDES.map((side) => ({ name: SIDE_NAMES[side], value: `${String(area[side])}°` })),
    ],
    remove: clearArea,
  };
}

/** Show the layer of the area again when the Contents pane has hidden it. */
function showAreaLayer(): void {
  if (!shapeDisplayOf(AREA_LAYER_ID).visible) {
    setShapeDisplay(AREA_LAYER_ID, { visible: true });
  }
}

/**
 * The area on the map. The layer shows the area whenever there is one, whichever part of the interface has set
 * it, and the Contents pane lists it as the layer "Area", which it can hide, make transparent, move in the
 * drawing order and remove. While the Rectangle button is on, the rectangle carries its handles, the Rectangle
 * tool is in use and the layer is drawn above every other layer.
 */
export function AreaOnMap() {
  const map = useMap();
  const area = useStore(areaStore);
  const editing = useStore(toolStore) === "area-rectangle";
  const display = useStore(shapeDisplayStore)[AREA_LAYER_ID] ?? FIRST_SHAPE_DISPLAY;
  const place = useStore(layerOrderStore).indexOf(AREA_LAYER_ID);
  const [layer] = useState(createAreaLayer);
  const [cornerSet, setCornerSet] = useState(false);
  // The description changes only with the area, so that the Contents pane receives it once for each area.
  const description = useMemo(() => (area ? areaShapeLayer(area) : null), [area]);

  useEffect(() => {
    map.addLayer(layer);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, layer]);

  // The layer is listed while there is an area. A new area takes the place and the display of the one before it.
  useEffect(() => {
    if (description) {
      putShapeLayer(description);
    } else {
      dropShapeLayer(AREA_LAYER_ID);
    }
  }, [description]);
  useEffect(() => () => dropShapeLayer(AREA_LAYER_ID), []);

  useEffect(() => {
    layer.setVisible(display.visible);
    layer.setOpacity(display.opacity);
  }, [layer, display]);

  // The z-index has one rule: above every layer while the tool is in use, else the place of the drawing order.
  useEffect(() => {
    if (editing) {
      layer.setZIndex(AREA_EDIT_Z_INDEX);
    } else if (place >= 0) {
      layer.setZIndex(FIRST_Z_INDEX + place);
    }
  }, [layer, editing, place]);

  // An area that was just set, and the rectangle that the tool is about to change, must be seen.
  useEffect(() => {
    if (area) {
      showAreaLayer();
    }
  }, [area]);
  useEffect(() => {
    if (editing) {
      showAreaLayer();
    }
  }, [editing]);

  useEffect(() => {
    layer.set("editing", editing);
    drawArea(layer, area ? extentOfArea(area, map.getView().getProjection()) : null, editing);
  }, [map, layer, area, editing]);

  useEffect(() => {
    if (!editing) {
      return;
    }
    const projection = map.getView().getProjection();
    // Draw the area again as it is stored, after a rectangle was given up or refused.
    const restore = () => {
      const stored = areaStore.get();
      drawArea(layer, stored ? extentOfArea(stored, projection) : null, true);
    };
    const tool = startAreaTool(map, layer, {
      onRectangle: (extent) => {
        setCornerSet(false);
        const reading = areaOfExtent(extent, projection);
        if (reading.area) {
          areaStore.set(reading.area);
        } else {
          report("error", reading.fault);
          restore();
        }
      },
      onCancel: () => {
        setCornerSet(false);
        restore();
      },
      onCorner: () => setCornerSet(true),
    });
    toolKeysStore.set({ point: tool.point, cancel: tool.cancel });
    return () => {
      toolKeysStore.set(null);
      tool.stop();
      setCornerSet(false);
    };
  }, [map, layer, editing]);

  return (
    <p className="map-live" role="status">
      {areaSentence(area, cornerSet)}
    </p>
  );
}
