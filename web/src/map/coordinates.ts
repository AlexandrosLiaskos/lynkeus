/** The two angles of a place on the Earth. */
export type Axis = "latitude" | "longitude";

const LIMIT = { latitude: 90, longitude: 180 } as const;
const LETTERS = { latitude: ["N", "S"], longitude: ["E", "W"] } as const;

/**
 * Read a latitude or a longitude that the user typed, and return it in decimal degrees, or null when the text
 * is not one. The forms read are those of the Go To XY tool of ArcGIS Pro: decimal degrees ("42.8", "-70.9",
 * "70.9 W"), degrees and minutes ("42 48.5 N"), and degrees, minutes and seconds ("42° 48′ 30″ N",
 * "42 48 30"). South and west are given by the letter S or W or by a minus sign, not by both.
 */
export function parseAngle(text: string, axis: Axis): number | null {
  const [positive, negative] = LETTERS[axis];
  let rest = text.trim().toUpperCase();
  let sign = 1;
  let letter = false;
  for (const [hemisphere, value] of [
    [positive, 1],
    [negative, -1],
  ] as const) {
    if (rest.startsWith(hemisphere) || rest.endsWith(hemisphere)) {
      rest = rest.startsWith(hemisphere) ? rest.slice(1) : rest.slice(0, -1);
      sign = value;
      letter = true;
      break;
    }
  }
  rest = rest.trim();
  if (rest.startsWith("-") || rest.startsWith("+")) {
    if (letter) {
      return null;
    }
    sign = rest.startsWith("-") ? -1 : 1;
    rest = rest.slice(1);
  }
  // The signs of degrees, minutes and seconds, in their typed and their typographic forms, separate the parts.
  const parts = rest
    .replace(/[°'′"″]/g, " ")
    .trim()
    .split(/\s+/);
  if (parts.length > 3 || !parts.every((part) => /^\d+(\.\d+)?$/.test(part))) {
    return null;
  }
  const [degrees = 0, minutes = 0, seconds = 0] = parts.map(Number);
  // Only the last part may carry decimals, and minutes and seconds stay under 60.
  const whole = parts.slice(0, -1).every((part) => !part.includes("."));
  if (!whole || minutes >= 60 || seconds >= 60) {
    return null;
  }
  const value = degrees + minutes / 60 + seconds / 3600;
  return value <= LIMIT[axis] ? sign * value : null;
}

/** Write an angle in decimal degrees with five decimals and the letter of its hemisphere, as "42.80000° N". */
export function formatAngle(value: number, axis: Axis): string {
  const [positive, negative] = LETTERS[axis];
  return `${Math.abs(value).toFixed(5)}° ${value < 0 ? negative : positive}`;
}
