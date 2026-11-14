import type { ToolActions } from "../ribbon/types";
import { areaStore } from "../shared/area";
import { openToolPane } from "../shared/dock/dock";
import { report } from "../shared/messages/messages";
import { AREA_FILE_NAME, areaFile } from "./areaFile";
import { saveFile } from "./download";
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

/** What the finished buttons of the Share tab do. A button enters this list when its function is finished. */
export function useShareActions(): ToolActions<ShareToolId> {
  return {
    "export-map-image": { run: () => openToolPane("export-map-image") },
    "export-area": { run: saveArea },
    "print-layout": { run: () => openToolPane("print-layout") },
    "link-to-map": { run: () => openToolPane("link-to-map") },
  };
}
