// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type { RibbonTab, ToolIdOf } from "../ribbon/types";

/** The View tab: its groups and buttons, in the order shown. */
export const VIEW_TAB = {
  id: "view",
  label: "View",
  groups: [
    {
      label: "Windows",
      tools: [
        { id: "view-contents", label: "Contents", icon: "list", description: "Shows or hides the Contents pane." },
        { id: "view-catalog", label: "Catalog", icon: "folder", description: "Shows or hides the Catalog pane." },
        {
          id: "view-reset-panes",
          label: "Reset panes",
          icon: "undo",
          description:
            "Opens the Contents pane and the Catalog pane at their first width, pinned open, and closes the tool panes.",
        },
        {
          id: "view-full-screen",
          label: "Full screen",
          icon: "zoom_out_map",
          description: "Shows the map over the whole screen until the Escape key is pressed.",
        },
      ],
    },
    {
      label: "Show",
      tools: [
        {
          id: "view-status-bar",
          label: "Status bar",
          icon: "info_outline",
          description: "Shows or hides the status bar under the map.",
        },
      ],
    },
  ],
} as const satisfies RibbonTab;

export type ViewToolId = ToolIdOf<typeof VIEW_TAB>;
