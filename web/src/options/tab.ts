// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type { RibbonTab, ToolIdOf } from "../ribbon/types";

/** The Options tab: its groups and buttons, in the order shown. */
export const OPTIONS_TAB = {
  id: "options",
  label: "Options",
  groups: [
    {
      label: "Browser",
      tools: [
        {
          id: "options-storage",
          label: "Storage",
          icon: "settings",
          description: "Opens the options of what Lynkeus keeps in this browser.",
        },
      ],
    },
  ],
} as const satisfies RibbonTab;

export type OptionsToolId = ToolIdOf<typeof OPTIONS_TAB>;
