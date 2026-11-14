import type { ProjectionLike } from "ol/proj";
import { get as getProjection } from "ol/proj";

/** The names of the projections that the map can take, as the EPSG Geodetic Parameter Dataset gives them. */
const NAMES: Readonly<Record<string, string>> = {
  "EPSG:3857": "WGS 84 / Pseudo-Mercator",
  "EPSG:4326": "WGS 84",
};

/**
 * Return the name of a projection with its code, for example "WGS 84 / Pseudo-Mercator (EPSG:3857)". A
 * projection whose name is not known is written by its code alone.
 */
export function projectionName(projection: ProjectionLike): string {
  const code = getProjection(projection)?.getCode() ?? "";
  const name = NAMES[code];
  return name ? `${name} (${code})` : code;
}
