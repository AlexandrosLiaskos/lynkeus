import type { ToolActions } from "../ribbon/types";
import type { DataToolId } from "./tab";

/** What the finished buttons of the Data tab do. A button enters this list when its function is finished. */
export function useDataActions(): ToolActions<DataToolId> {
  return {};
}
