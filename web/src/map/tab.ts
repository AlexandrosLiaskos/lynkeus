import type { RibbonTab, ToolIdOf } from "../ribbon/types";

/** The Map tab: its groups and buttons, in the order shown. */
export const MAP_TAB = {
  id: "map",
  label: "Map",
  groups: [
    {
      label: "Navigate",
      tools: [
        {
          id: "full-extent",
          label: "Full extent",
          icon: "zoom_out_map",
          description: "Shows the whole world.",
        },
        {
          id: "zoom-in",
          label: "Zoom in",
          icon: "zoom_in",
          description: "Enlarges the map by one level.",
        },
        {
          id: "zoom-out",
          label: "Zoom out",
          icon: "zoom_out",
          description: "Reduces the map by one level.",
        },
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
          description: "Shows the whole of the area.",
        },
        {
          id: "previous-extent",
          label: "Previous extent",
          icon: "arrow_back",
          description: "Returns to the view shown before.",
        },
        {
          id: "next-extent",
          label: "Next extent",
          icon: "arrow_forward",
          description: "Goes forward again to the view that Previous extent has left.",
        },
        {
          id: "go-to-coordinates",
          label: "Go to coordinates",
          icon: "location_on",
          description: "Moves the map to a typed latitude and longitude and marks the place.",
        },
        {
          id: "bookmarks",
          label: "Bookmarks",
          icon: "bookmark",
          description: "Saves the view under a name in the local storage of this browser and returns to it.",
        },
        {
          id: "rotate",
          label: "Rotate",
          icon: "autorenew",
          description: "Turns the map by 15 degrees clockwise.",
        },
        {
          id: "north-up",
          label: "North up",
          icon: "arrow_upward",
          description: "Returns north to the top of the map.",
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
        {
          id: "imagery-of-a-date",
          label: "Imagery of a date",
          icon: "calendar_today",
          description: "Shows the satellite image of a chosen day from NASA GIBS as the background map.",
        },
        {
          id: "graticule",
          label: "Graticule",
          icon: "language",
          description: "Shows or hides the lines of latitude and longitude.",
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
          description: "Draws the rectangle that the Data and Analysis tools use as their area.",
        },
        {
          id: "area-from-view",
          label: "From the current view",
          icon: "visibility",
          description: "Sets the area to what the map shows.",
        },
        {
          id: "area-from-coordinates",
          label: "From coordinates",
          icon: "edit",
          description: "Sets the area from typed west, south, east and north, in degrees.",
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
          description:
            "Shows the coordinates of a clicked place and the value of every visible layer there, with its unit and date.",
        },
        {
          id: "measure-distance",
          label: "Measure distance",
          icon: "insights",
          description: "Measures the length of a line that is drawn on the map.",
        },
        {
          id: "measure-area",
          label: "Measure area",
          icon: "grid_view",
          description: "Measures the area of a polygon that is drawn on the map.",
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
          description: "Uncovers what lies below the selected layer along a line that is moved across the map.",
        },
      ],
    },
  ],
} as const satisfies RibbonTab;

export type MapToolId = ToolIdOf<typeof MAP_TAB>;
