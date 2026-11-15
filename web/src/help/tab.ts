// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type { RibbonTab, ToolIdOf } from "../ribbon/types";

/** The Help tab: its groups and buttons, in the order shown. */
export const HELP_TAB = {
  id: "help",
  label: "Help",
  groups: [
    {
      label: "Help",
      tools: [
        {
          id: "help-getting-started",
          label: "Getting started",
          icon: "help_outline",
          description: "Lists the steps of the work in order, each with the button that opens its tool.",
        },
        {
          id: "help-methods",
          label: "Methods",
          icon: "science",
          description: "Describes the method of each tool: its reference, formula, input layer, unit and legend.",
        },
        {
          id: "help-sources",
          label: "Sources",
          icon: "format_quote",
          description: "Lists every method, program and dataset that Lynkeus uses, with its licence.",
        },
        {
          id: "help-about",
          label: "About",
          icon: "info_outline",
          description:
            "States the version, the team, the licence and the citation of Lynkeus, and the data that it stores.",
        },
      ],
    },
  ],
} as const satisfies RibbonTab;

export type HelpToolId = ToolIdOf<typeof HELP_TAB>;
