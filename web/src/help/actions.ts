import type { ToolActions } from "../ribbon/types";
import { aboutDialogStore } from "./state";
import type { HelpToolId } from "./tab";

/** What the finished buttons of the Help tab do. A button enters this list when its function is finished. */
export function useHelpActions(): ToolActions<HelpToolId> {
  return {
    "help-about": { run: () => aboutDialogStore.set(true) },
  };
}
