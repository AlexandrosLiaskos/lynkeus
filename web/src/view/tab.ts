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
      ],
    },
  ],
} as const satisfies RibbonTab;

export type ViewToolId = ToolIdOf<typeof VIEW_TAB>;
