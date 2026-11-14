import type { ToolActions } from "../ribbon/types";
import type { ShareToolId } from "./tab";

/** What the finished buttons of the Share tab do. A button enters this list when its function is finished. */
export function useShareActions(): ToolActions<ShareToolId> {
  return {};
}
