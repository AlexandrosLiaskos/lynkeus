import type { ToolActions } from "../ribbon/types";
import type { ViewToolId } from "./tab";

/** What the finished buttons of the View tab do. A button enters this list when its function is finished. */
export function useViewActions(): ToolActions<ViewToolId> {
  return {};
}
