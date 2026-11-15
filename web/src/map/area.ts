// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type { Extent } from "ol/extent";
import { transformExtent, type ProjectionLike } from "ol/proj";
import { isArea, type Area } from "../shared/area";

/** The number of decimals of a side of the area, in degrees. Five decimals are about one metre on the ground. */
export const AREA_DECIMALS = 5;

/** An area that was read from the map or from typed text, or the sentence that says why there is none. */
export type AreaReading = { area: Area; fault: null } | { area: null; fault: string };

export const AREA_FAULTS = {
  empty: "The rectangle has no width or no height.",
  meridian: "The area crosses the meridian of 180 degrees. An area must lie on one side of that meridian.",
  numbers: "Enter the four sides of the area as numbers.",
  limits:
    "West must be smaller than east, and south smaller than north. Longitude runs from -180 to 180 degrees and latitude from -90 to 90 degrees.",
} as const;

function round(degrees: number): number {
  const factor = 10 ** AREA_DECIMALS;
  return Math.round(degrees * factor) / factor;
}

/** Return the four sides of an extent as numbers. */
export function sidesOf(extent: Extent): [number, number, number, number] {
  const [west = Number.NaN, south = Number.NaN, east = Number.NaN, north = Number.NaN] = extent;
  return [west, south, east, north];
}

/**
 * Read a rectangle of the map as an area. The map repeats the world towards the east and the west, so a
 * rectangle that lies in a repeated world is returned with its longitudes between -180 and 180 degrees. A
 * rectangle that is wider than the world becomes the whole range of longitude. A rectangle that crosses the
 * meridian of 180 degrees is not an area.
 */
export function areaOfExtent(extent: Extent, projection: ProjectionLike): AreaReading {
  const sides = sidesOf(transformExtent(extent, projection, "EPSG:4326"));
  const [, south, , north] = sides;
  let [west, , east] = sides;
  if (![west, south, east, north].every(Number.isFinite) || east <= west || north <= south) {
    return { area: null, fault: AREA_FAULTS.empty };
  }
  if (east - west >= 360) {
    west = -180;
    east = 180;
  } else {
    const turns = Math.floor((west + 180) / 360);
    west -= 360 * turns;
    east -= 360 * turns;
    // A rounding error of the projection must not turn the meridian itself into a crossing.
    if (east > 180 + 10 ** -AREA_DECIMALS / 2) {
      return { area: null, fault: AREA_FAULTS.meridian };
    }
  }
  const area: Area = {
    west: round(Math.max(-180, west)),
    south: round(Math.max(-90, south)),
    east: round(Math.min(180, east)),
    north: round(Math.min(90, north)),
  };
  return isArea(area) ? { area, fault: null } : { area: null, fault: AREA_FAULTS.empty };
}

/** Return the rectangle of an area in the projection of the map. */
export function extentOfArea(area: Area, projection: ProjectionLike): Extent {
  return transformExtent([area.west, area.south, area.east, area.north], "EPSG:4326", projection);
}

/** The names of the four sides, in the order in which the forms show them. */
export const SIDES = ["west", "south", "east", "north"] as const;
export type Side = (typeof SIDES)[number];

/** Read the four sides that the user typed, in degrees, as an area. */
export function areaOfText(sides: Readonly<Record<Side, string>>): AreaReading {
  const read = (side: Side) => (sides[side].trim() === "" ? Number.NaN : Number(sides[side]));
  const area = { west: read("west"), south: read("south"), east: read("east"), north: read("north") };
  if (!SIDES.every((side) => Number.isFinite(area[side]))) {
    return { area: null, fault: AREA_FAULTS.numbers };
  }
  return isArea(area) ? { area, fault: null } : { area: null, fault: AREA_FAULTS.limits };
}
