import OSM from "ol/source/OSM";
import type TileSource from "ol/source/Tile";
import XYZ from "ol/source/XYZ";

export type BaseMapId = "blue-marble" | "openstreetmap";

/** A background map that the user can choose. */
export interface BaseMap {
  id: BaseMapId;
  createSource: () => TileSource;
}

const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";

export const BASE_MAPS: readonly BaseMap[] = [
  {
    id: "blue-marble",
    createSource: () =>
      new XYZ({
        url: `${GIBS}/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg`,
        maxZoom: 8,
        attributions: 'Imagery: <a href="https://nasa-gibs.github.io/gibs-api-docs/">NASA GIBS</a>',
      }),
  },
  {
    id: "openstreetmap",
    createSource: () => new OSM(),
  },
];
