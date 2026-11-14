import type OlMap from "ol/Map";
import { getHeight, getWidth, type Extent } from "ol/extent";
import type Geometry from "ol/geom/Geometry";
import MultiPolygon from "ol/geom/MultiPolygon";
import Polygon from "ol/geom/Polygon";
import { transformExtent, type ProjectionLike } from "ol/proj";
import type { Ring } from "./products";

/** The largest number of points in the polygons of a search area. The server holds the same number. */
export const MOST_POINTS = 250;

/** The largest number of polygons in a search area. The server holds the same number. */
export const MOST_POLYGONS = 10;

/**
 * The longest step of longitude between two points of a polygon, in degrees. The catalogue joins two points
 * along the shortest way on the globe, and the map joins them with a straight line. Between points that are
 * this close, the two lines differ by less than one kilometre at every latitude.
 */
export const LONGEST_STEP = 2;

/** A rectangle in degrees of longitude and latitude (WGS 84). A west larger than the east crosses 180 degrees. */
export interface Rectangle {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** The area of a search: a rectangle, or one or more polygons. */
export type SearchArea = ({ kind: "rectangle" } & Rectangle) | { kind: "polygons"; rings: readonly Ring[] };

function round(degrees: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(degrees * factor) / factor;
}

/** Bring a longitude between -180 and 180 degrees. */
export function wrapLongitude(longitude: number): number {
  const wrapped = ((((longitude + 180) % 360) + 360) % 360) - 180;
  // The meridian of 180 degrees keeps the sign that it was given.
  return wrapped === -180 && longitude > 0 ? 180 : wrapped;
}

/**
 * Return the rectangle of an extent that is given in degrees. An extent that reaches past 180 degrees gives a
 * rectangle that crosses that meridian, and an extent wider than the Earth gives every longitude.
 */
export function rectangleOfExtent([west, south, east, north]: readonly number[]): Rectangle {
  const sides = { south: round(Math.max(-90, south ?? -90)), north: round(Math.min(90, north ?? 90)) };
  if (west === undefined || east === undefined || east - west >= 360) {
    return { west: -180, east: 180, ...sides };
  }
  return { west: round(wrapLongitude(west)), east: round(wrapLongitude(east)), ...sides };
}

/** Return the part of the Earth that the map shows, as a rectangle in degrees with four decimals. */
export function viewArea(map: OlMap): Rectangle {
  const view = map.getView();
  return rectangleOfExtent(transformExtent(view.calculateExtent(map.getSize()), view.getProjection(), "EPSG:4326"));
}

/** Tell whether a rectangle is one that the catalogue can search. */
export function isRectangle({ west, south, east, north }: Rectangle): boolean {
  return (
    [west, south, east, north].every(Number.isFinite) &&
    west >= -180 &&
    west <= 180 &&
    east >= -180 &&
    east <= 180 &&
    west !== east &&
    south >= -90 &&
    south < north &&
    north <= 90
  );
}

/** Return the number of points in the polygons of an area. */
export function pointCount(rings: readonly Ring[]): number {
  return rings.reduce((count, ring) => count + ring.length, 0);
}

/** Return what is wrong with an area, in plain words, or null when the catalogue can search it. */
export function areaFault(area: SearchArea): string | null {
  if (area.kind === "rectangle") {
    if (![area.west, area.south, area.east, area.north].every(Number.isFinite)) {
      return "Give the four sides of the area as numbers.";
    }
    return isRectangle(area)
      ? null
      : "The area is not valid. South must be smaller than north, and west must differ from east. Longitude runs from -180 to 180 degrees and latitude from -90 to 90.";
  }
  if (area.rings.length === 0 || area.rings.some((ring) => ring.length < 4)) {
    return "A polygon needs at least three points.";
  }
  if (area.rings.length > MOST_POLYGONS) {
    return `The area has ${String(area.rings.length)} polygons. A search takes at most ${String(MOST_POLYGONS)}.`;
  }
  if (pointCount(area.rings) > MOST_POINTS) {
    return `The polygons of the area have ${String(pointCount(area.rings))} points. A search takes at most ${String(MOST_POINTS)}.`;
  }
  return null;
}

/** Make the longitudes of a ring continuous, so that a ring across 180 degrees does not jump to the other side. */
function unwrapped(ring: Ring): [number, number][] {
  const points: [number, number][] = [];
  let before: number | undefined;
  for (const [longitude, latitude] of ring) {
    const next = before === undefined ? longitude : before + wrapLongitude(longitude - before);
    points.push([next, latitude]);
    before = next;
  }
  return points;
}

/**
 * Add points along the sides of a ring, so that no two neighbours are further apart in longitude than the
 * longest step. The points lie on the straight line that the map draws in the Web Mercator projection.
 */
export function densify(ring: Ring, step = LONGEST_STEP): Ring {
  const mercator = (latitude: number) => Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));
  const latitudeOf = (y: number) => (Math.atan(Math.exp(y)) * 360) / Math.PI - 90;
  const points = unwrapped(ring);
  const dense: [number, number][] = [];
  points.forEach(([longitude, latitude], index) => {
    const next = points[index + 1];
    dense.push([longitude, latitude]);
    if (next) {
      const pieces = Math.ceil(Math.abs(next[0] - longitude) / step);
      for (let piece = 1; piece < pieces; piece += 1) {
        const share = piece / pieces;
        const y = mercator(latitude) + (mercator(next[1]) - mercator(latitude)) * share;
        dense.push([longitude + (next[0] - longitude) * share, latitudeOf(y)]);
      }
    }
  });
  return dense.map(([longitude, latitude]) => [round(wrapLongitude(longitude), 5), round(latitude, 5)] as const);
}

/** Return the outer rings of the polygons of a geometry, in degrees. A geometry of another kind gives none. */
export function ringsOfGeometry(geometry: Geometry, projection: ProjectionLike): Ring[] {
  const polygons =
    geometry instanceof Polygon ? [geometry] : geometry instanceof MultiPolygon ? geometry.getPolygons() : [];
  return polygons.flatMap((polygon) => {
    const outer = polygon.clone().transform(projection, "EPSG:4326").getLinearRing(0)?.getCoordinates() ?? [];
    const ring = outer.map(([longitude, latitude]) => [round(longitude ?? 0, 5), round(latitude ?? 0, 5)] as const);
    return ring.length >= 4 ? [ring] : [];
  });
}

/**
 * Make polygons ready for a search: add points along long sides and, when the polygons have more points than
 * a search takes, leave out the points that change the outline least. Return null when the polygons cannot be
 * brought under the limit.
 */
export function fitRings(rings: readonly Ring[], most = MOST_POINTS): Ring[] | null {
  const dense = rings.map((ring) => densify(ring));
  if (pointCount(dense) <= most) {
    return dense;
  }
  // The tolerance of the simplification starts at about one hundred metres and doubles until the points fit.
  for (let tolerance = 0.001; tolerance <= 4; tolerance *= 2) {
    const simpler = rings.flatMap((ring) => {
      const outline = new Polygon([unwrapped(ring)]).simplify(tolerance);
      return ringsOfGeometry(outline, "EPSG:4326").map((simple) => densify(simple));
    });
    if (simpler.length > 0 && pointCount(simpler) <= most) {
      return simpler;
    }
  }
  return null;
}

/**
 * Return the rectangle around polygons, in degrees, from their westernmost to their easternmost longitude. For
 * polygons on both sides of 180 degrees this is nearly every longitude.
 */
export function rectangleAround(rings: readonly Ring[]): Rectangle {
  const points = rings.flat();
  const longitudes = points.map(([longitude]) => longitude);
  const latitudes = points.map(([, latitude]) => latitude);
  return {
    west: Math.min(...longitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    north: Math.max(...latitudes),
  };
}

/**
 * Return the shape of an area for the map, in the projection of the map. A rectangle across 180 degrees is
 * drawn in one piece, east of that meridian.
 */
export function areaGeometry(area: SearchArea, projection: ProjectionLike): Geometry {
  const rings =
    area.kind === "rectangle"
      ? [rectangleRing(area)]
      : area.rings.map((ring) => unwrapped(ring).map(([longitude, latitude]) => [longitude, latitude]));
  return new MultiPolygon(rings.map((ring) => [ring])).transform("EPSG:4326", projection);
}

function rectangleRing({ west, south, east, north }: Rectangle): number[][] {
  const right = east > west ? east : east + 360;
  // Points along the south and the north keep the sides on their parallels in every projection.
  const steps = Math.max(1, Math.ceil((right - west) / 10));
  const along = Array.from({ length: steps + 1 }, (_, index) => west + ((right - west) * index) / steps);
  return [
    ...along.map((longitude) => [longitude, south]),
    ...along.reverse().map((longitude) => [longitude, north]),
    [west, south],
  ];
}

/** Return the extent of an area on the map, in the projection of the map, or null when the area has no size. */
export function areaExtent(area: SearchArea, projection: ProjectionLike): Extent | null {
  const extent = areaGeometry(area, projection).getExtent();
  return getWidth(extent) > 0 && getHeight(extent) > 0 ? extent : null;
}

function degrees(value: number, positive: string, negative: string): string {
  return `${String(Math.abs(value))}° ${value < 0 ? negative : positive}`;
}

/** Describe an area in words, for the statement of what was searched. */
export function describeArea(area: SearchArea | null): string {
  if (!area) {
    return "the whole Earth";
  }
  if (area.kind === "polygons") {
    const points = pointCount(area.rings) - area.rings.length;
    return area.rings.length === 1
      ? `a polygon of ${String(points)} points`
      : `${String(area.rings.length)} polygons of ${String(points)} points`;
  }
  return `the rectangle from ${degrees(area.west, "E", "W")} to ${degrees(area.east, "E", "W")} and from ${degrees(area.south, "N", "S")} to ${degrees(area.north, "N", "S")}`;
}

/** Write a ring as the catalogue reads a polygon: longitude and latitude of every point, with commas between. */
export function ringText(ring: Ring): string {
  return ring.map(([longitude, latitude]) => `${String(longitude)},${String(latitude)}`).join(",");
}
