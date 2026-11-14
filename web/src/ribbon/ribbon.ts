import type { BaseMapId } from "../map/baseMaps";

type Measurement = "backscatter" | "coherence" | "displacement" | "soil-moisture";

export type TabId = "map" | "data" | "analysis";

export type ToolId =
  | BaseMapId
  | "zoom-in"
  | "zoom-out"
  | "full-extent"
  | "sign-in"
  | "search-products"
  | `${Measurement}-${"state" | "change" | "series" | "map"}`;

/** A button of the ribbon. The icon is a name in the icon set of the U.S. Web Design System. */
interface Tool {
  id: ToolId;
  label: string;
  icon: string;
}

interface ToolGroup {
  label: string;
  tools: readonly Tool[];
}

interface RibbonTab {
  id: TabId;
  label: string;
  groups: readonly ToolGroup[];
}

/** The four tools of a measurement, in the order that every group of the Analysis tab follows. */
function analysisTools(measurement: Measurement, state: "One date" | "One pair"): Tool[] {
  return [
    { id: `${measurement}-state`, label: state, icon: "image" },
    { id: `${measurement}-change`, label: "Change", icon: "autorenew" },
    { id: `${measurement}-series`, label: "Series", icon: "insights" },
    { id: `${measurement}-map`, label: "Thematic map", icon: "grid_view" },
  ];
}

export const RIBBON: readonly RibbonTab[] = [
  {
    id: "map",
    label: "Map",
    groups: [
      {
        label: "Navigate",
        tools: [
          { id: "full-extent", label: "Full extent", icon: "zoom_out_map" },
          { id: "zoom-in", label: "Zoom in", icon: "zoom_in" },
          { id: "zoom-out", label: "Zoom out", icon: "zoom_out" },
        ],
      },
      {
        label: "Basemap",
        tools: [
          { id: "blue-marble", label: "Blue Marble", icon: "public" },
          { id: "openstreetmap", label: "OpenStreetMap", icon: "map" },
        ],
      },
    ],
  },
  {
    id: "data",
    label: "Data",
    groups: [
      { label: "Earthdata", tools: [{ id: "sign-in", label: "Sign in", icon: "login" }] },
      { label: "NISAR", tools: [{ id: "search-products", label: "Search products", icon: "search" }] },
    ],
  },
  {
    id: "analysis",
    label: "Analysis",
    groups: [
      { label: "Backscatter", tools: analysisTools("backscatter", "One date") },
      { label: "Coherence", tools: analysisTools("coherence", "One pair") },
      { label: "Surface displacement", tools: analysisTools("displacement", "One pair") },
      { label: "Soil moisture", tools: analysisTools("soil-moisture", "One date") },
    ],
  },
];
