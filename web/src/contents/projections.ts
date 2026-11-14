import { get, type Projection } from "ol/proj";
import { register } from "ol/proj/proj4";
import proj4 from "proj4";

/**
 * The projections of NISAR products that OpenLayers does not hold, as the EPSG registry defines them. OpenLayers
 * holds Web Mercator, geographic coordinates and every zone of the Universal Transverse Mercator projection.
 */
const DEFINITIONS: Readonly<Record<string, string>> = {
  // WGS 84 / NSIDC EASE-Grid 2.0 Global, the grid of the soil moisture product.
  "EPSG:6933": "+proj=cea +lat_ts=30 +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs +type=crs",
  // WGS 84 / NSIDC Sea Ice Polar Stereographic North.
  "EPSG:3413": "+proj=stere +lat_0=90 +lat_ts=70 +lon_0=-45 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs +type=crs",
  // WGS 84 / Antarctic Polar Stereographic.
  "EPSG:3031": "+proj=stere +lat_0=-90 +lat_ts=-71 +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs +type=crs",
};

let registered = false;

/** Return the projection of an EPSG code, or null when Lynkeus cannot convert its coordinates. */
export function projectionOf(code: string): Projection | null {
  if (!registered) {
    for (const [name, definition] of Object.entries(DEFINITIONS)) {
      proj4.defs(name, definition);
    }
    register(proj4);
    registered = true;
  }
  return get(code);
}
