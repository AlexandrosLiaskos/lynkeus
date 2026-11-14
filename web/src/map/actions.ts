import { useEffect } from "react";
import { selectedLayerStore } from "../contents/state";
import type { ToolActions } from "../ribbon/types";
import { areaStore } from "../shared/area";
import { closeToolPane, openToolPane } from "../shared/dock/dock";
import { useMap } from "../shared/map";
import { mapLayersStore } from "../shared/mapLayers";
import { report } from "../shared/messages/messages";
import { useStore } from "../shared/store";
import { baseMapStore } from "./baseMaps";
import { NOTICES, setAreaFromView, showNextView, showPreviousView, zoomToArea, zoomToLayer } from "./commands";
import { northUp, rotateBy, ROTATION_STEP, showBaseMap, showWorld, zoomBy } from "./map";
import { graticuleStore, toggleTool, toolStore } from "./state";
import { swipeStore } from "./swipe";
import type { MapToolId } from "./tab";

/** Start or end a measure tool. Its pane opens with it, and the pane of the other measure tool closes. */
function toggleMeasure(tool: "measure-distance" | "measure-area"): void {
  toggleTool(tool);
  closeToolPane(tool === "measure-distance" ? "measure-area" : "measure-distance");
  if (toolStore.get() === tool) {
    openToolPane(tool);
  }
}

/** Start or end the Identify tool. Its pane opens with it. */
function toggleIdentify(): void {
  toggleTool("identify");
  if (toolStore.get() === "identify") {
    openToolPane("identify");
  }
}

/** Start or end the swipe of the layer that is selected in the Contents pane. Its pane opens and closes with it. */
function toggleSwipe(): void {
  const swipe = swipeStore.get();
  const selected = selectedLayerStore.get();
  if (swipe.on) {
    swipeStore.set({ ...swipe, on: false });
    closeToolPane("swipe");
  } else if (mapLayersStore.get().some(({ id }) => id === selected)) {
    swipeStore.set({ ...swipe, on: true });
    openToolPane("swipe");
  } else {
    report("info", NOTICES.noLayer);
  }
}

/** What the finished buttons of the Map tab do. */
export function useMapActions(): ToolActions<MapToolId> {
  const map = useMap();
  const baseMap = useStore(baseMapStore);
  const graticule = useStore(graticuleStore);
  const tool = useStore(toolStore);
  const swipe = useStore(swipeStore);

  useEffect(() => {
    showBaseMap(map, baseMap);
  }, [map, baseMap]);

  return {
    "full-extent": { run: () => showWorld(map) },
    "zoom-in": { run: () => zoomBy(map, 1) },
    "zoom-out": { run: () => zoomBy(map, -1) },
    "zoom-to-layer": { run: () => void zoomToLayer(map) },
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
    identify: { run: toggleIdentify, pressed: tool === "identify" },
    "measure-distance": { run: () => toggleMeasure("measure-distance"), pressed: tool === "measure-distance" },
    "measure-area": { run: () => toggleMeasure("measure-area"), pressed: tool === "measure-area" },
    swipe: { run: toggleSwipe, pressed: swipe.on },
  };
}
