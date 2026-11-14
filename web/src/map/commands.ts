import type OlMap from "ol/Map";
import { extentOf } from "../contents/display";
import { selectedLayerStore } from "../contents/state";
import { areaStore } from "../shared/area";
import { report } from "../shared/messages/messages";
import { areaOfExtent, extentOfArea } from "./area";
import { viewStepsOf } from "./history";
import { showExtent } from "./map";

/** The sentences with which a command says that it has nothing to act on. */
export const NOTICES = {
  noArea: "There is no area. Set one with a button of the group Area.",
  noLayer: "No layer is selected. Select a layer in the Contents pane.",
  noExtent: "The extent of the selected layer could not be read.",
  noEarlierView: "There is no earlier view.",
  noLaterView: "There is no later view.",
} as const;

/**
 * Set the area to what the map shows. On a map that is turned, the area is the smallest rectangle with sides
 * along the meridians and the parallels that holds the view.
 */
export function setAreaFromView(map: OlMap): void {
  const view = map.getView();
  const { area, fault } = areaOfExtent(view.calculateExtent(map.getSize()), view.getProjection());
  if (area) {
    areaStore.set(area);
  } else {
    report("error", fault);
  }
}

/** Show the whole of the area. */
export function zoomToArea(map: OlMap, duration?: number): void {
  const area = areaStore.get();
  if (area) {
    showExtent(map, extentOfArea(area, map.getView().getProjection()), duration);
  } else {
    report("info", NOTICES.noArea);
  }
}

/** Show the whole of the layer that is selected in the Contents pane. */
export async function zoomToLayer(map: OlMap, duration?: number): Promise<void> {
  const id = selectedLayerStore.get();
  if (!id) {
    report("info", NOTICES.noLayer);
    return;
  }
  const extent = await extentOf(map, id);
  if (extent) {
    showExtent(map, extent, duration);
  } else {
    report("error", NOTICES.noExtent);
  }
}

/** Return to the view shown before the present one. */
export function showPreviousView(map: OlMap): void {
  if (!viewStepsOf(map).back()) {
    report("info", NOTICES.noEarlierView);
  }
}

/** Go forward again to the view that a step back has left. */
export function showNextView(map: OlMap): void {
  if (!viewStepsOf(map).forward()) {
    report("info", NOTICES.noLaterView);
  }
}
