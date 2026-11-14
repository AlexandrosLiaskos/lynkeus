import type { Source } from "../shared/sources";

/**
 * The programs and the colour scales that the Contents pane and the drawing of the layers use. OpenLayers, which
 * draws the tiles, is in the list of the Map tab.
 */
export const SOURCES: readonly Source[] = [
  {
    name: "geotiff.js",
    version: "3.1.0-beta.0",
    licence: "MIT",
    url: "https://geotiffjs.github.io/",
    use: "Reads the Cloud Optimized GeoTIFF of a layer in parts.",
  },
  {
    name: "PROJ4JS",
    version: "2.23.0",
    licence: "MIT",
    url: "http://proj4js.org/",
    use: "Converts the coordinates of the EASE-Grid 2.0 and of the polar stereographic projections.",
  },
  {
    name: "viridis, magma, inferno and plasma colour scales (N. Smith, S. van der Walt, E. Firing)",
    licence: "CC0-1.0",
    url: "https://bids.github.io/colormap/",
    use: "Colour scales for a quantity that runs from low to high.",
  },
  {
    name: "ColorBrewer (C. Brewer, M. Harrower, The Pennsylvania State University)",
    version: "2.0",
    licence: "Apache-2.0",
    url: "https://colorbrewer2.org/",
    use: "The colour scales YlGnBu, RdBu and BrBG.",
  },
  {
    name: "Scientific colour maps (F. Crameri)",
    licence: "MIT",
    url: "https://www.fabiocrameri.ch/colourmaps/",
    use: "The colour scales batlow, vik and romaO.",
  },
  {
    name: "cmocean (K. Thyng and others)",
    version: "4.0.3",
    licence: "MIT",
    url: "https://matplotlib.org/cmocean/",
    use: "The colour scales balance and phase.",
  },
  {
    name: "Matplotlib",
    version: "3.11.2",
    licence: "Matplotlib licence",
    url: "https://matplotlib.org/",
    use: "The ten colours of the scale tab10, for classes.",
  },
];
