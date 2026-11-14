import { useEffect, useState } from "react";
import { areaStore, type Area } from "../shared/area";
import { useMap } from "../shared/map";
import { report } from "../shared/messages/messages";
import { useStore } from "../shared/store";
import { areaOfExtent, extentOfArea } from "./area";
import { createAreaLayer, drawArea } from "./areaLayer";
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

/**
 * The area on the map. The layer shows the area whenever there is one, whichever part of the interface has set
 * it. While the Rectangle button is on, the rectangle carries its handles and the Rectangle tool is in use.
 */
export function AreaOnMap() {
  const map = useMap();
  const area = useStore(areaStore);
  const editing = useStore(toolStore) === "area-rectangle";
  const [layer] = useState(createAreaLayer);
  const [cornerSet, setCornerSet] = useState(false);

  useEffect(() => {
    map.addLayer(layer);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, layer]);

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
