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
          description: "Saves the file of the layer that is selected in the Contents pane as a GeoTIFF file.",
        },
        {
          id: "export-map-image",
          label: "Map image",
          icon: "photo_camera",
          description:
            "Saves the map as a PNG image with a scale bar, a north arrow, the legend and the sources of the map.",
        },
        {
          id: "export-record",
          label: "Record",
          icon: "file_present",
          description:
            "Saves the record of the layer that is selected in the Contents pane, as a STAC record or as a provenance record.",
        },
        {
          id: "export-area",
          label: "Area",
          icon: "save_alt",
          description: "Saves the area that is set in the Map tab as a GeoJSON file.",
        },
      ],
    },
    {
      label: "Print",
      tools: [
        {
          id: "print-layout",
          label: "Layout",
          icon: "print",
          description:
            "Prints the map on a page with a title, the legend, a scale bar, a north arrow, a coordinate frame and the sources of the map, or saves the page as a PDF file.",
        },
      ],
    },
    {
      label: "Link",
      tools: [
        {
          id: "link-to-map",
          label: "Link to this map",
          icon: "link",
          description: "Gives an address that opens Lynkeus with the same view, basemap and area.",
        },
      ],
    },
    {
      label: "Cite",
      tools: [
        {
          id: "citation",
          label: "Citation",
          icon: "format_quote",
          description:
            "Gives the text that cites the data, the method and Lynkeus for the layer that is selected in the Contents pane, when its record names the DOI of its NISAR collection.",
        },
      ],
    },
  ],
} as const satisfies RibbonTab;

export type ShareToolId = ToolIdOf<typeof SHARE_TAB>;
