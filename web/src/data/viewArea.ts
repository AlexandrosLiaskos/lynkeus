import type OlMap from "ol/Map";
import { transformExtent } from "ol/proj";
import type { Area } from "../shared/area";

function round(degrees: number): number {
  return Math.round(degrees * 1e4) / 1e4;
}

/** Return the part of the Earth that the map shows, as an area in degrees with four decimals. */
export function viewArea(map: OlMap): Area {
  const view = map.getView();
  const [west, south, east, north] = transformExtent(
    view.calculateExtent(map.getSize()),
    view.getProjection(),
    "EPSG:4326",
  );
  return {
    west: round(Math.max(-180, west ?? -180)),
    south: round(Math.max(-90, south ?? -90)),
    east: round(Math.min(180, east ?? 180)),
    north: round(Math.min(90, north ?? 90)),
  };
}
