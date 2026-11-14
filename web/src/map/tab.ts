import type { RibbonTab, ToolIdOf } from "../ribbon/types";

/** The Map tab: its groups and buttons, in the order shown. */
export const MAP_TAB = {
  id: "map",
  label: "Map",
  groups: [
    {
      label: "Navigate",
      tools: [
        { id: "full-extent", label: "Full extent", icon: "zoom_out_map", description: "Shows the whole world." },
        { id: "zoom-in", label: "Zoom in", icon: "zoom_in", description: "Enlarges the map by one level." },
        { id: "zoom-out", label: "Zoom out", icon: "zoom_out", description: "Reduces the map by one level." },
        {
          id: "zoom-to-layer",
          label: "Zoom to layer",
          icon: "search",
          description: "Shows the whole of the selected layer.",
        },
        {
          id: "zoom-to-area",
          label: "Zoom to area",
          icon: "my_location",
          description: "Shows the whole of the drawn area.",
        },
      ],
    },
    {
      label: "Basemap",
      tools: [
        {
          id: "blue-marble",
          label: "Blue Marble",
          icon: "public",
          description: "Shows the Blue Marble image of NASA as the background map.",
        },
        {
          id: "openstreetmap",
          label: "OpenStreetMap",
          icon: "map",
          description: "Shows OpenStreetMap as the background map.",
        },
      ],
    },
    {
      label: "Area",
      tools: [
        {
          id: "area-rectangle",
          label: "Rectangle",
          icon: "check_box_outline_blank",
          description: "Draws the rectangle that the Data and Analysis dialogs use as their area.",
        },
        {
          id: "area-from-view",
          label: "From the current view",
          icon: "visibility",
          description: "Sets the area to what the map shows.",
        },
        { id: "area-clear", label: "Clear", icon: "highlight_off", description: "Removes the area." },
      ],
    },
    {
      label: "Inquiry",
      tools: [
        {
          id: "identify",
          label: "Identify",
          icon: "info",
          description: "Shows the value of every visible layer at a clicked point, with its unit.",
        },
      ],
    },
    {
      label: "Compare",
      tools: [
        {
          id: "swipe",
          label: "Swipe",
          icon: "drag_handle",
          description: "Uncovers the layer below the top one along a line that is dragged across the map.",
        },
      ],
    },
  ],
} as const satisfies RibbonTab;

export type MapToolId = ToolIdOf<typeof MAP_TAB>;
