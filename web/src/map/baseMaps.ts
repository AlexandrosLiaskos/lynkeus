import OSM from "ol/source/OSM";
import type TileSource from "ol/source/Tile";
import XYZ from "ol/source/XYZ";
import { createStore } from "../shared/store";
import { createImagerySource } from "./imagery";

export type BaseMapId = "blue-marble" | "openstreetmap" | "imagery";

/** A background map that the user can choose. */
export interface BaseMap {
  id: BaseMapId;
  createSource: () => TileSource;
}

const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";

/**
 * The background maps. Each source asks for its images with the attribute `crossOrigin`, so that the browser
 * lets the page read the drawn map, for example to save it as an image. Both services allow this for every site.
 * The background map "imagery" is the satellite image of the day that the user has chosen.
 */
export const BASE_MAPS: readonly BaseMap[] = [
  {
    id: "blue-marble",
    createSource: () =>
      new XYZ({
        url: `${GIBS}/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg`,
        maxZoom: 8,
        crossOrigin: "anonymous",
        attributions: 'Imagery: <a href="https://nasa-gibs.github.io/gibs-api-docs/">NASA GIBS</a>',
      }),
  },
  {
    id: "openstreetmap",
    createSource: () => new OSM({ crossOrigin: "anonymous" }),
  },
  {
    id: "imagery",
    createSource: createImagerySource,
  },
];

/** The background map that is shown. Any part of the interface may read it and set it. */
export const baseMapStore = createStore<BaseMapId>("blue-marble");
