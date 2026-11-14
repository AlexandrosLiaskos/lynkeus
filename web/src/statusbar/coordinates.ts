import type { Coordinate } from "ol/coordinate";
import { get as getProjection, toLonLat, transform, type ProjectionLike } from "ol/proj";

/** The ways in which the status bar writes the coordinates of a point, in the order of the list. */
export const COORDINATE_FORMATS = [
  { id: "degrees", label: "Decimal degrees" },
  { id: "dms", label: "Degrees, minutes, seconds" },
  { id: "utm", label: "UTM" },
  { id: "map", label: "Map projection" },
] as const;

export type CoordinateFormat = (typeof COORDINATE_FORMATS)[number]["id"];

/**
 * The coordinates of a point as text. Each part is one field of the status bar, for example the latitude. For
 * each part, `widest` holds the widest texts that the part can take, so that the field keeps one width.
 */
export interface WrittenCoordinate {
  parts: readonly string[];
  widest: readonly (readonly string[])[];
}

/** The most decimals written: of a degree (1 centimetre on the ground), of a second of arc, and of a metre. */
const MOST_DECIMALS = { degrees: 7, seconds: 3, metres: 2 } as const;

/** The limits of latitude of the Universal Transverse Mercator zones, in degrees. */
const UTM_SOUTH = -80;
const UTM_NORTH = 84;

/**
 * Return the number of decimals at which one unit of the last digit is not longer than a length, and at most
 * the given number. The length is the size of one pixel of the map, so the coordinates are written as finely as
 * the map shows them.
 */
export function decimalsFor(length: number, most: number): number {
  return length > 0 ? Math.min(most, Math.max(0, Math.ceil(-Math.log10(length)))) : most;
}

/** Return the longitude and the latitude of a point of the map, in degrees. The longitude lies from -180 to 180. */
export function toDegrees(point: Coordinate, projection: ProjectionLike): [longitude: number, latitude: number] {
  const [longitude = NaN, latitude = NaN] = toLonLat(point, projection);
  return [longitude, latitude];
}

/** Return the letter of the half of the Earth in which an angle lies. An angle that is written as zero is positive. */
function side(angle: number, written: string, positive: string, negative: string): string {
  return angle < 0 && Number(written) !== 0 ? negative : positive;
}

/**
 * Write a position in decimal degrees, the latitude first, each with the letter of its hemisphere, as the
 * standard ISO 6709 writes a position for a reader.
 */
export function formatDegrees(longitude: number, latitude: number, decimals: number): [string, string] {
  const north = Math.abs(latitude).toFixed(decimals);
  const east = Math.abs(longitude).toFixed(decimals);
  return [`${north}°${side(latitude, north, "N", "S")}`, `${east}°${side(longitude, east, "E", "W")}`];
}

/** Write an angle in degrees, minutes and seconds. The minutes and the whole seconds take two digits. */
function sexagesimal(angle: number, decimals: number): string {
  const unit = 10 ** decimals;
  const total = Math.round(Math.abs(angle) * 3600 * unit);
  const seconds = (total % (60 * unit)) / unit;
  const minutes = Math.floor(total / (60 * unit)) % 60;
  const degrees = Math.floor(total / (3600 * unit));
  const width = decimals > 0 ? decimals + 3 : 2;
  return `${String(degrees)}°${String(minutes).padStart(2, "0")}′${seconds.toFixed(decimals).padStart(width, "0")}″`;
}

/**
 * Write a position in degrees, minutes and seconds, the latitude first, each with the letter of its hemisphere.
 * `decimals` is the number of decimals of the seconds.
 */
export function formatSexagesimal(longitude: number, latitude: number, decimals: number): [string, string] {
  const north = sexagesimal(latitude, decimals);
  const east = sexagesimal(longitude, decimals);
  const isZero = (written: string) => /^0°00′0+(?:\.0+)?″$/.test(written);
  return [
    `${north}${latitude < 0 && !isZero(north) ? "S" : "N"}`,
    `${east}${longitude < 0 && !isZero(east) ? "W" : "E"}`,
  ];
}

/** A position in the Universal Transverse Mercator system on WGS 84: the zone, and the easting and the northing in metres. */
export interface UtmPosition {
  /** Number of the zone, from 1 to 60. */
  zone: number;
  /** Whether the position is north of the equator. The northing of a southern position starts from 10,000,000 metres. */
  north: boolean;
  easting: number;
  northing: number;
}

/**
 * Return a position in the Universal Transverse Mercator zone of its longitude, or null outside the latitudes
 * that the system covers (80 degrees south to 84 degrees north). The zones are 6 degrees wide and zone 1 starts at
 * 180 degrees west. The wider zones around Norway and Svalbard of the military grid are not applied.
 */
export function toUtm(longitude: number, latitude: number): UtmPosition | null {
  if (!(latitude >= UTM_SOUTH && latitude <= UTM_NORTH) || !Number.isFinite(longitude)) {
    return null;
  }
  const zone = Math.min(60, Math.max(1, Math.floor((longitude + 180) / 6) + 1));
  const north = latitude >= 0;
  const code = `EPSG:${String((north ? 32600 : 32700) + zone)}`;
  const [easting = NaN, northing = NaN] = transform([longitude, latitude], "EPSG:4326", code);
  return { zone, north, easting, northing };
}

/** The text shown where the Universal Transverse Mercator system has no zone. */
export const NO_UTM_ZONE = "No UTM zone";

/**
 * Write a position in the Universal Transverse Mercator system. The hemisphere is written as a word, because a
 * letter after the number of the zone can also mean a band of latitude.
 */
export function formatUtm(position: UtmPosition, decimals: number): [string, string, string] {
  return [
    `Zone ${String(position.zone)} ${position.north ? "North" : "South"}`,
    `${position.easting.toFixed(decimals)} m E`,
    `${position.northing.toFixed(decimals)} m N`,
  ];
}

/** Write a number with a fixed number of decimals. A negative number that is written as zero loses its sign. */
function fixed(value: number, decimals: number): string {
  const written = value.toFixed(decimals);
  return Number(written) === 0 ? written.replace("-", "") : written;
}

/** Return the sign of the unit of a projection: m for metres and the degree sign for degrees. */
function unitSign(units: string | undefined): string {
  return units === "m" ? " m" : units === "degrees" ? "°" : units ? ` ${units}` : "";
}

/**
 * Write the coordinates of a point of the map in the chosen way. `projection` is the projection of the map and
 * `resolution` the size of one of its pixels in the units of the projection. The number of decimals follows the
 * size of one pixel at `centre`, the centre of the map, so that every point of one view is written with the same
 * number of decimals. Without a centre the point itself is used.
 */
export function writeCoordinate(
  point: Coordinate,
  projection: ProjectionLike,
  resolution: number,
  format: CoordinateFormat,
  centre: Coordinate = point,
): WrittenCoordinate {
  const [x = NaN, y = NaN] = point;
  const [longitude, latitude] = toDegrees(point, projection);
  // The size of one pixel of the map along a meridian at the centre of the map, in degrees.
  const [centreX = NaN, centreY = NaN] = centre;
  const pixel = Math.abs(toDegrees([centreX, centreY + resolution], projection)[1] - toDegrees(centre, projection)[1]);

  switch (format) {
    case "degrees": {
      const decimals = decimalsFor(pixel, MOST_DECIMALS.degrees);
      const [north, east] = formatDegrees(-178.5, 88.5, decimals);
      return { parts: formatDegrees(longitude, latitude, decimals), widest: [[north], [east]] };
    }
    case "dms": {
      const decimals = decimalsFor(pixel * 3600, MOST_DECIMALS.seconds);
      const [north, east] = formatSexagesimal(-178.5, 88.5, decimals);
      return { parts: formatSexagesimal(longitude, latitude, decimals), widest: [[north], [east]] };
    }
    case "utm": {
      // One degree of latitude is 111 kilometres long, to the precision that the number of decimals needs.
      const decimals = decimalsFor(pixel * 111_000, MOST_DECIMALS.metres);
      const position = toUtm(longitude, latitude);
      const sample = { zone: 60, easting: 888_888, northing: 8_888_888 };
      const [north, east, up] = formatUtm({ ...sample, north: true }, decimals);
      const [south] = formatUtm({ ...sample, north: false }, decimals);
      return {
        parts: position ? formatUtm(position, decimals) : [NO_UTM_ZONE, "", ""],
        widest: [[north, south], [east], [up]],
      };
    }
    case "map": {
      const mapProjection = getProjection(projection);
      const units = mapProjection?.getUnits();
      const sign = unitSign(units);
      const decimals = decimalsFor(resolution, units === "degrees" ? MOST_DECIMALS.degrees : MOST_DECIMALS.metres);
      // A map that repeats the world sideways gives the place inside the first world.
      const extent = mapProjection?.getExtent();
      const [west, , east] = extent ?? [];
      const wrapped =
        mapProjection?.canWrapX() && west !== undefined && east !== undefined
          ? ((((x - west) % (east - west)) + (east - west)) % (east - west)) + west
          : x;
      const digits = String(Math.ceil(Math.max(...(extent ?? [1]).map(Math.abs)))).length;
      const sample = (-Number("8".repeat(digits))).toFixed(decimals);
      return {
        parts: [`X ${fixed(wrapped, decimals)}${sign}`, `Y ${fixed(y, decimals)}${sign}`],
        widest: [[`X ${sample}${sign}`], [`Y ${sample}${sign}`]],
      };
    }
  }
}
