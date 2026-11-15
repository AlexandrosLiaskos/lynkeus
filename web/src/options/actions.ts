import type { ToolActions } from "../ribbon/types";
import { openToolPane } from "../shared/dock/dock";
import { STORAGE_PANE } from "./StoragePane";
import type { OptionsToolId } from "./tab";

/** What the finished buttons of the Options tab do. A button enters this list when its function is finished. */
export function useOptionsActions(): ToolActions<OptionsToolId> {
  return {
    [STORAGE_PANE]: { run: () => openToolPane(STORAGE_PANE) },
  };
}
