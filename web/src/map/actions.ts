import { useEffect } from "react";
import type { ToolActions } from "../ribbon/types";
import { areaStore } from "../shared/area";
import { closeToolPane, openToolPane } from "../shared/dock/dock";
import { useMap } from "../shared/map";
import { useStore } from "../shared/store";
import { baseMapStore } from "./baseMaps";
import { setAreaFromView, showNextView, showPreviousView, zoomToArea } from "./commands";
import { northUp, rotateBy, ROTATION_STEP, showBaseMap, showWorld, zoomBy } from "./map";
import { graticuleStore, toggleTool, toolStore } from "./state";
import type { MapToolId } from "./tab";

/** Start or end a measure tool. Its pane opens with it, and the pane of the other measure tool closes. */
function toggleMeasure(tool: "measure-distance" | "measure-area"): void {
  toggleTool(tool);
  closeToolPane(tool === "measure-distance" ? "measure-area" : "measure-distance");
  if (toolStore.get() === tool) {
    openToolPane(tool);
  }
}

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
    "go-to-coordinates": { run: () => openToolPane("go-to-coordinates") },
    bookmarks: { run: () => openToolPane("bookmarks") },
    rotate: { run: () => rotateBy(map, ROTATION_STEP) },
    "north-up": { run: () => northUp(map) },
    "blue-marble": { run: () => baseMapStore.set("blue-marble"), pressed: baseMap === "blue-marble" },
    openstreetmap: { run: () => baseMapStore.set("openstreetmap"), pressed: baseMap === "openstreetmap" },
    // The button shows the image of the chosen day, and its pane changes the day.
    "imagery-of-a-date": {
      run: () => {
        baseMapStore.set("imagery");
        openToolPane("imagery-of-a-date");
      },
      pressed: baseMap === "imagery",
    },
    graticule: { run: () => graticuleStore.set(!graticule), pressed: graticule },
    "area-rectangle": { run: () => toggleTool("area-rectangle"), pressed: tool === "area-rectangle" },
    "area-from-view": { run: () => setAreaFromView(map) },
    "area-from-coordinates": { run: () => openToolPane("area-from-coordinates") },
    "area-clear": { run: () => areaStore.set(null) },
    "measure-distance": { run: () => toggleMeasure("measure-distance"), pressed: tool === "measure-distance" },
    "measure-area": { run: () => toggleMeasure("measure-area"), pressed: tool === "measure-area" },
  };
}
