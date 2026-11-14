import { createStore } from "./store";

/** A rectangle on the Earth, in degrees of longitude and latitude (WGS 84). */
export interface Area {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * Tell whether a value is an area. West is smaller than east and south smaller than north, so an area does not
 * cross the meridian of 180 degrees.
 */
export function isArea(value: unknown): value is Area {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { west, south, east, north } = value as Record<string, unknown>;
  return (
    typeof west === "number" &&
    typeof south === "number" &&
    typeof east === "number" &&
    typeof north === "number" &&
    west >= -180 &&
    west < east &&
    east <= 180 &&
    south >= -90 &&
    south < north &&
    north <= 90
  );
}

/** The area that the user has drawn, or null when there is none. The Data and Analysis dialogs read it. */
export const areaStore = createStore<Area | null>(null);
