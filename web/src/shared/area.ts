import { keepInBrowser } from "./storage/storage";
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

/** The name under which the area is kept in the local storage of the browser. */
export const AREA_KEY = "lynkeus.area";

/** Check an area that was read from the storage: null for no area, or the four sides of a valid area. */
export function storedArea(stored: unknown): Area | null | undefined {
  if (stored === null) {
    return null;
  }
  return isArea(stored)
    ? { west: stored.west, south: stored.south, east: stored.east, north: stored.north }
    : undefined;
}

// The area is a part of the work that the browser keeps. It returns when the page opens.
keepInBrowser<Area | null>({
  key: AREA_KEY,
  title: "Area",
  description: "The area that was set in the Map tab.",
  read: () => areaStore.get(),
  check: storedArea,
  restore: (area) => areaStore.set(area),
  subscribe: areaStore.subscribe,
});
