import type { Coordinate } from "ol/coordinate";
import { getWidth } from "ol/extent";
import { greatCircleArc } from "ol/geom/flat/geodesic";
import type LineString from "ol/geom/LineString";
import type Polygon from "ol/geom/Polygon";
import { toLonLat } from "ol/proj";
import type Projection from "ol/proj/Projection";
import { DEFAULT_RADIUS, getArea, getDistance } from "ol/sphere";
import { createStore } from "../shared/store";

/**
 * The radius of the sphere on which OpenLayers measures, in metres: the mean radius of the WGS 84 ellipsoid.
 * A length is the sum of the great-circle distances between the points of a line, and an area is the area of
 * the polygon whose sides are great circles.
 */
export const EARTH_RADIUS = DEFAULT_RADIUS;

/** The units of a length, with the number of metres in one unit and the decimals shown. */
export const DISTANCE_UNITS = {
  m: { name: "Metres", symbol: "m", size: 1, decimals: 1 },
  km: { name: "Kilometres", symbol: "km", size: 1000, decimals: 3 },
} as const;
export type DistanceUnit = keyof typeof DISTANCE_UNITS;

/** The units of an area, with the number of square metres in one unit and the decimals shown. */
export const AREA_UNITS = {
  m2: { name: "Square metres", symbol: "m²", size: 1, decimals: 0 },
  ha: { name: "Hectares", symbol: "ha", size: 1e4, decimals: 2 },
  km2: { name: "Square kilometres", symbol: "km²", size: 1e6, decimals: 3 },
} as const;
export type AreaUnit = keyof typeof AREA_UNITS;

function format(value: number, decimals: number, symbol: string): string {
  const number = new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${number.format(value)} ${symbol}`;
}

/** Write a length given in metres in a unit, as "12.345 km". */
export function formatDistance(metres: number, unit: DistanceUnit): string {
  const { size, decimals, symbol } = DISTANCE_UNITS[unit];
  return format(metres / size, decimals, symbol);
}

/** Write an area given in square metres in a unit, as "1,234.56 ha". */
export function formatArea(squareMetres: number, unit: AreaUnit): string {
  const { size, decimals, symbol } = AREA_UNITS[unit];
  return format(squareMetres / size, decimals, symbol);
}

/** What was measured on a line or on a polygon. */
export interface Measurement {
  kind: "distance" | "area";
  /** The length of each segment of the line, or of each side of the polygon, in metres. */
  segments: readonly number[];
  /** The length of the line, or the perimeter of the polygon, in metres. */
  length: number;
  /** The area of the polygon in square metres, or null for a line. */
  area: number | null;
}

/** Return the great-circle length of each segment between the points of a line, in metres. */
export function segmentLengths(points: readonly Coordinate[], projection: Projection): number[] {
  const places = points.map((point) => toLonLat(point, projection));
  return places.slice(1).map((place, index) => getDistance(places[index] ?? place, place));
}

/** Measure a line that is given in the projection of the map. */
export function measureLine(line: LineString, projection: Projection): Measurement {
  const segments = segmentLengths(line.getCoordinates(), projection);
  return { kind: "distance", segments, length: segments.reduce((sum, length) => sum + length, 0), area: null };
}

/** Measure a polygon that is given in the projection of the map. Its perimeter is that of its outer ring. */
export function measurePolygon(polygon: Polygon, projection: Projection): Measurement {
  const segments = segmentLengths(polygon.getLinearRing(0)?.getCoordinates() ?? [], projection);
  return {
    kind: "area",
    segments,
    length: segments.reduce((sum, length) => sum + length, 0),
    area: getArea(polygon, { projection }),
  };
}

/**
 * Return the points of the great circle between two points of the map, in the projection of the map, close
 * enough for a line through them to follow the circle within half a pixel. The points continue from the
 * first point, also across the meridian of 180 degrees, where the map repeats the world.
 */
export function arcBetween(from: Coordinate, to: Coordinate, projection: Projection, resolution: number): Coordinate[] {
  const [longitude1 = 0, latitude1 = 0] = toLonLat(from, projection);
  const [longitude2 = 0, latitude2 = 0] = toLonLat(to, projection);
  const flat = greatCircleArc(longitude1, latitude1, longitude2, latitude2, projection, (resolution * resolution) / 4);
  const world = getWidth(projection.getExtent());
  const arc: Coordinate[] = [];
  let shift = Math.round(((from[0] ?? 0) - (flat[0] ?? 0)) / world) * world;
  let previous = Number.NaN;
  for (let index = 0; index + 1 < flat.length; index += 2) {
    let x = (flat[index] ?? 0) + shift;
    if (Math.abs(x - previous) > world / 2) {
      shift += x < previous ? world : -world;
      x = (flat[index] ?? 0) + shift;
    }
    previous = x;
    arc.push([x, flat[index + 1] ?? 0]);
  }
  return arc;
}

/** The units in which the measurements are shown. */
export const measureUnitsStore = createStore<{ distance: DistanceUnit; area: AreaUnit }>({
  distance: "km",
  area: "km2",
});

/** The measurements that are finished, the oldest first. They stay until the user clears them. */
export const measurementsStore = createStore<readonly Measurement[]>([]);
