// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type { ToolActions } from "../ribbon/types";
import { openServers } from "../servers/state";
import { openToolPane } from "../shared/dock/dock";
import { askSignOut } from "./session";
import { SIGN_IN_PANE } from "./SignInPane";
import { GET_LAYER_PANE, SEARCH_PANE } from "./state";
import type { DataToolId } from "./tab";

/** What the finished buttons of the Data tab do. A button enters this list when its function is finished. */
export function useDataActions(): ToolActions<DataToolId> {
  return {
    "sign-in": { run: () => openToolPane(SIGN_IN_PANE) },
    "sign-out": { run: askSignOut },
    servers: { run: openServers },
    [SEARCH_PANE]: { run: () => openToolPane(SEARCH_PANE) },
    [GET_LAYER_PANE]: { run: () => openToolPane(GET_LAYER_PANE) },
  };
}
