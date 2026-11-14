import type { Source } from "../shared/sources";

/** The methods, programs and datasets that the Map, View and Share tabs, the Contents pane and the status bar use. */
export const SOURCES: readonly Source[] = [
  {
    name: "OpenLayers",
    version: "10.11.0",
    licence: "BSD-2-Clause",
    url: "https://openlayers.org/",
    use: "Draws the map, the area, the lines of latitude and longitude and the measurements, and measures lengths and areas on a sphere with the mean radius of the WGS 84 ellipsoid.",
  },
  {
    name: "NASA Global Imagery Browse Services (GIBS)",
    licence: "Open data of NASA, used with the acknowledgement that NASA asks for",
    url: "https://nasa-gibs.github.io/gibs-api-docs/",
    use: "The background map Blue Marble, and the daily images in true colour of MODIS (Terra, Aqua) and VIIRS (NOAA-20, NOAA-21) as supplementary data.",
  },
  {
    name: "OpenStreetMap",
    licence: "ODbL-1.0",
    url: "https://www.openstreetmap.org/copyright",
    use: "The background map OpenStreetMap.",
  },
];
