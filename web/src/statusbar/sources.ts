import type { Source } from "../shared/sources";

/** The methods, programs and datasets that the status bar and the View tab use. */
export const SOURCES: readonly Source[] = [
  {
    name: "OpenGIS Web Map Tile Service Implementation Standard",
    version: "1.0.0 (OGC 07-057r7)",
    licence: "OGC Document License Agreement",
    url: "https://www.ogc.org/standards/wmts/",
    use: "The size of a pixel of the screen, 0.28 millimetres, that the scale of the map assumes.",
  },
  {
    name: "ISO 6709, Standard representation of geographic point location by coordinates",
    version: "2022",
    licence: "Copyright of the International Organization for Standardization",
    url: "https://www.iso.org/standard/75147.html",
    use: "The way in which the status bar writes latitude and longitude.",
  },
  {
    name: "EPSG Geodetic Parameter Dataset",
    version: "12.029",
    licence: "EPSG Terms of Use",
    url: "https://epsg.org/",
    use: "The names of the projections.",
  },
];
