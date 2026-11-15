// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type { ToolActions } from "../ribbon/types";
import { openToolPane } from "../shared/dock/dock";
import { aboutDialogStore, GETTING_STARTED_PANE, methodsStore, sourcesDialogStore } from "./state";
import type { HelpToolId } from "./tab";

/** What the finished buttons of the Help tab do. A button enters this list when its function is finished. */
export function useHelpActions(): ToolActions<HelpToolId> {
  return {
    [GETTING_STARTED_PANE]: { run: () => openToolPane(GETTING_STARTED_PANE) },
    "help-methods": { run: () => methodsStore.set({ open: true, tool: null }) },
    "help-sources": { run: () => sourcesDialogStore.set(true) },
    "help-about": { run: () => aboutDialogStore.set(true) },
  };
}
