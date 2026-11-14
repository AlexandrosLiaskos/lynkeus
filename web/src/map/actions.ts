import { useEffect } from "react";
import type { ToolActions } from "../ribbon/types";
import { areaStore } from "../shared/area";
import { useMap } from "../shared/map";
import { useStore } from "../shared/store";
import { baseMapStore } from "./baseMaps";
import { setAreaFromView, showNextView, showPreviousView, zoomToArea } from "./commands";
import { northUp, rotateBy, ROTATION_STEP, showBaseMap, showWorld, zoomBy } from "./map";
import { graticuleStore, toggleTool, toolStore } from "./state";
import type { MapToolId } from "./tab";

/** What the finished buttons of the Map tab do. */
export function useMapActions(): ToolActions<MapToolId> {
  const map = useMap();
  const baseMap = useStore(baseMapStore);
  const graticule = useStore(graticuleStore);
  const tool = useStore(toolStore);

  useEffect(() => {
    showBaseMap(map, baseMap);
  }, [map, baseMap]);

  return {
    "full-extent": { run: () => showWorld(map) },
    "zoom-in": { run: () => zoomBy(map, 1) },
    "zoom-out": { run: () => zoomBy(map, -1) },
    "zoom-to-area": { run: () => zoomToArea(map) },
    "previous-extent": { run: () => showPreviousView(map) },
    "next-extent": { run: () => showNextView(map) },
    rotate: { run: () => rotateBy(map, ROTATION_STEP) },
    "north-up": { run: () => northUp(map) },
    "blue-marble": { run: () => baseMapStore.set("blue-marble"), pressed: baseMap === "blue-marble" },
    openstreetmap: { run: () => baseMapStore.set("openstreetmap"), pressed: baseMap === "openstreetmap" },
    graticule: { run: () => graticuleStore.set(!graticule), pressed: graticule },
    "area-rectangle": { run: () => toggleTool("area-rectangle"), pressed: tool === "area-rectangle" },
    "area-from-view": { run: () => setAreaFromView(map) },
    "area-clear": { run: () => areaStore.set(null) },
  };
}
