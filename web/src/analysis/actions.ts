import type { ToolActions } from "../ribbon/types";
import type { AnalysisToolId } from "./tab";

/** What the finished buttons of the Analysis tab do. A button enters this list when its function is finished. */
export function useAnalysisActions(): ToolActions<AnalysisToolId> {
  return {};
}
