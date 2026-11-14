import type { ToolActions } from "../ribbon/types";
import { openToolPane } from "../shared/dock/dock";
import { SEARCH_PANE } from "./state";
import type { DataToolId } from "./tab";

/** What the finished buttons of the Data tab do. A button enters this list when its function is finished. */
export function useDataActions(): ToolActions<DataToolId> {
  return {
    [SEARCH_PANE]: { run: () => openToolPane(SEARCH_PANE) },
  };
}
