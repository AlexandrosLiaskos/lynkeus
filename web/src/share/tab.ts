import type { RibbonTab, ToolIdOf } from "../ribbon/types";

/** The Share tab: its groups and buttons, in the order shown. */
export const SHARE_TAB = {
  id: "share",
  label: "Share",
  groups: [
    {
      label: "Export",
      tools: [
        {
          id: "export-layer",
          label: "Layer",
          icon: "file_download",
          description: "Saves the file of the selected layer as a GeoTIFF.",
        },
        {
          id: "export-map-image",
          label: "Map image",
          icon: "photo_camera",
          description: "Saves the map as a PNG image, with the legend and a scale bar.",
        },
        {
          id: "export-record",
          label: "Record",
          icon: "file_present",
          description: "Saves the record of a result: its input files, program, version and method.",
        },
      ],
    },
  ],
} as const satisfies RibbonTab;

export type ShareToolId = ToolIdOf<typeof SHARE_TAB>;
