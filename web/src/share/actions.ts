import type { ToolActions } from "../ribbon/types";
import { areaStore } from "../shared/area";
import { openToolPane } from "../shared/dock/dock";
import { report } from "../shared/messages/messages";
import { AREA_FILE_NAME, areaFile } from "./areaFile";
import { saveFile } from "./download";
import { layerFileName, saveAddress } from "./layerFile";
import { useDataSources } from "./layerSources";
import { siteAddress } from "./record";
import { SELECT_A_LAYER, selectedLayer, useSelectedLayer } from "./selection";
import type { ShareToolId } from "./tab";

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
 * What the finished buttons of the Share tab do. The Citation button has an action while the record of the
 * selected layer, or the records of its inputs, name the DOI of a NISAR collection.
 */
export function useShareActions(): ToolActions<ShareToolId> {
  const sources = useDataSources(useSelectedLayer());
  return {
    "export-layer": { run: saveLayer },
    "export-map-image": { run: () => openToolPane("export-map-image") },
    "export-record": { run: () => openToolPane("export-record") },
    "export-area": { run: saveArea },
    "print-layout": { run: () => openToolPane("print-layout") },
    "link-to-map": { run: () => openToolPane("link-to-map") },
    ...(sources && sources.length > 0 ? { citation: { run: () => openToolPane("citation") } } : {}),
  };
}
