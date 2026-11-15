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
          description:
            "Signs you in to Earthdata with a user token, which the server of Lynkeus keeps in memory to request data from NASA in your name.",
        },
        {
          id: "sign-out",
          label: "Sign out",
          icon: "logout",
          description:
            "Signs you out of Earthdata: the server of Lynkeus forgets the token, while the jobs already started and your layers stay.",
        },
      ],
    },
    {
      label: "Servers",
      tools: [
        {
          id: "servers",
          label: "Servers",
          icon: "electrical_services",
          description:
            "Lists your computers that run your jobs and keep their layers, and connects, renames, limits and removes them, and needs a sign-in to Earthdata.",
        },
      ],
    },
    {
      label: "NISAR",
      tools: [
        {
          id: "search-products",
          label: "Search products",
          icon: "search",
          description:
            "Finds NISAR products in NASA's catalogue by type, area, period, orbit and radar properties, or by name, and lists them in the Catalog pane.",
        },
        {
          id: "get-layer",
          label: "Get layer",
          icon: "save_alt",
          description:
            "Requests from NASA layers of a product found with Search products, each clipped to an area, and needs a sign-in to Earthdata.",
        },
      ],
    },
  ],
} as const satisfies RibbonTab;

export type DataToolId = ToolIdOf<typeof DATA_TAB>;
