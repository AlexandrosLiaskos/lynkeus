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
          description: "States the version, the members, the licence and the citation of Lynkeus.",
        },
      ],
    },
  ],
} as const satisfies RibbonTab;

export type HelpToolId = ToolIdOf<typeof HELP_TAB>;
