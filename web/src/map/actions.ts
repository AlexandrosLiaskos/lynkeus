import { useEffect } from "react";
import type { ToolActions } from "../ribbon/types";
import { useMap } from "../shared/map";
import { useStore } from "../shared/store";
import { baseMapStore } from "./baseMaps";
import { showBaseMap, showWorld, zoomBy } from "./map";
import type { MapToolId } from "./tab";

/** What the finished buttons of the Map tab do. */
export function useMapActions(): ToolActions<MapToolId> {
  const map = useMap();
  const baseMap = useStore(baseMapStore);

  useEffect(() => {
    showBaseMap(map, baseMap);
  }, [map, baseMap]);

  return {
    "full-extent": { run: () => showWorld(map) },
    "zoom-in": { run: () => zoomBy(map, 1) },
    "zoom-out": { run: () => zoomBy(map, -1) },
    "blue-marble": { run: () => baseMapStore.set("blue-marble"), pressed: baseMap === "blue-marble" },
    openstreetmap: { run: () => baseMapStore.set("openstreetmap"), pressed: baseMap === "openstreetmap" },
  };
}
