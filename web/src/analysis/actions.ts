import type { ToolActions } from "../ribbon/types";
import { openToolPane } from "../shared/dock/dock";
import type { AnalysisToolId } from "./tab";
import { FINISHED_TOOLS } from "./tools";

/**
 * What the finished buttons of the Analysis tab do: each one opens the tool pane of its tool. A button enters
 * this list when its function is finished, so every other button of the tab stays inactive.
 */
export function useAnalysisActions(): ToolActions<AnalysisToolId> {
  return Object.fromEntries(FINISHED_TOOLS.map((tool) => [tool, { run: () => openToolPane(tool) }]));
}
