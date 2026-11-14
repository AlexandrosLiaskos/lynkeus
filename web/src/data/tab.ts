import type { RibbonTab, ToolIdOf } from "../ribbon/types";

/** The Data tab: its groups and buttons, in the order shown. */
export const DATA_TAB = {
  id: "data",
  label: "Data",
  groups: [
    {
      label: "Earthdata",
      tools: [
        {
          id: "sign-in",
          label: "Sign in",
          icon: "login",
          description: "Takes a personal Earthdata user token, with which Lynkeus requests data during this session.",
        },
        { id: "sign-out", label: "Sign out", icon: "logout", description: "Removes the token from the browser." },
      ],
    },
    {
      label: "NISAR",
      tools: [
        {
          id: "search-products",
          label: "Search products",
          icon: "search",
          description: "Finds NISAR products by type, area and dates.",
        },
        {
          id: "get-layer",
          label: "Get layer",
          icon: "save_alt",
          description: "Requests one layer of the selected product, clipped to the area.",
        },
      ],
    },
  ],
} as const satisfies RibbonTab;

export type DataToolId = ToolIdOf<typeof DATA_TAB>;
