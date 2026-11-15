import type { ToolActions } from "../ribbon/types";
import { areaStore } from "../shared/area";
import { openToolPane } from "../shared/dock/dock";
import { report } from "../shared/messages/messages";
import { useStore } from "../shared/store";
import { AREA_FILE_NAME, areaFile } from "./areaFile";
import { saveFile } from "./download";
import { layerFileName, saveAddress } from "./layerFile";
import { citationMissing, useDataSources } from "./layerSources";
import { siteAddress } from "./record";
import { layerMissing, SELECT_A_LAYER, selectedLayer, useHasLayers, useSelectedLayer } from "./selection";
import type { ShareToolId } from "./tab";

/** What the Area button says while no area is set. */
export const SET_AN_AREA = "Set an area in the Map tab.";

/** Save the area as a GeoJSON file, or tell the user that no area is set. */
function saveArea(): void {
  const area = areaStore.get();
  if (!area) {
    report("warning", "No area is set. Set an area in the Map tab, then save it.");
    return;
  }
  saveFile(areaFile(area), AREA_FILE_NAME);
  report("success", `The area was saved as ${AREA_FILE_NAME}.`);
}

/**
 * Save the file of the selected layer, a Cloud Optimized GeoTIFF, under a name built from the title and the
 * dates of the layer. The browser receives the file from the server as it is.
 */
function saveLayer(): void {
  const layer = selectedLayer();
  if (!layer) {
    report("warning", SELECT_A_LAYER);
    return;
  }
  const address = siteAddress(layer.url);
  if (address === null) {
    report("error", "The file of the layer is not on this site, so it was not saved.");
    return;
  }
  const name = layerFileName(layer, "tif");
  saveAddress(address, name);
  report("success", `The browser saves the file of the layer as ${name}.`);
}

/**
 * What the finished buttons of the Share tab do. A button that needs something first is inactive and states what
 * it lacks: the Layer and Record buttons a selected layer, the Area button an area, and the Citation button a
 * selected layer whose record, or the records of its inputs, name the DOI of a NISAR collection.
 */
export function useShareActions(): ToolActions<ShareToolId> {
  const layer = useSelectedLayer();
  const hasLayers = useHasLayers();
  const area = useStore(areaStore);
  const sources = useDataSources(layer);
  const noLayer = layer ? undefined : layerMissing(hasLayers);
  return {
    "export-layer": { run: saveLayer, missing: noLayer },
    "export-map-image": { run: () => openToolPane("export-map-image") },
    "export-record": { run: () => openToolPane("export-record"), missing: noLayer },
    "export-area": { run: saveArea, missing: area ? undefined : SET_AN_AREA },
    "print-layout": { run: () => openToolPane("print-layout") },
    "link-to-map": { run: () => openToolPane("link-to-map") },
    citation: { run: () => openToolPane("citation"), missing: citationMissing(layer, hasLayers, sources) },
  };
}
