import type { Ring } from "./products";

/** What a shapefile holds: the outer rings of its polygons, and the number of its shapes of other kinds. */
export interface ShapefileShapes {
  rings: Ring[];
  others: number;
  /** The corners of the rectangle around every shape: west, south, east, north. */
  box: [number, number, number, number];
}

const FILE_CODE = 9994;
// The shape types of a polygon: plain, with heights (Z) and with measures (M).
const POLYGONS = [5, 15, 25];

/** Return twice the area of a ring, negative when its points run clockwise. */
function signedArea(ring: Ring): number {
  return ring.reduce((sum, [x, y], index) => {
    const [nextX, nextY] = ring[index + 1] ?? [x, y];
    return sum + x * nextY - nextX * y;
  }, 0);
}

/**
 * Read the main file (.shp) of a shapefile, as the ESRI Shapefile Technical Description of July 1998 defines
 * it. A polygon lists the points of its outer rings clockwise and those of its holes counter-clockwise; the
 * holes are left out.
 */
export function readShapefile(file: ArrayBuffer): ShapefileShapes {
  const view = new DataView(file);
  if (file.byteLength < 100 || view.getInt32(0, false) !== FILE_CODE) {
    throw new Error("The .shp file of the shapefile cannot be read.");
  }
  const box: [number, number, number, number] = [
    view.getFloat64(36, true),
    view.getFloat64(44, true),
    view.getFloat64(52, true),
    view.getFloat64(60, true),
  ];
  const rings: Ring[] = [];
  let others = 0;
  let place = 100;
  while (place + 12 <= file.byteLength) {
    // The length of a record counts words of two bytes and leaves out the eight bytes of its header.
    const length = view.getInt32(place + 4, false) * 2;
    const start = place + 8;
    place = start + length;
    if (length < 4 || place > file.byteLength) {
      throw new Error("The .shp file of the shapefile is damaged.");
    }
    const type = view.getInt32(start, true);
    if (type === 0) {
      continue;
    }
    if (!POLYGONS.includes(type)) {
      others += 1;
      continue;
    }
    const partCount = view.getInt32(start + 36, true);
    const pointCount = view.getInt32(start + 40, true);
    const points = start + 44 + 4 * partCount;
    if (partCount < 0 || pointCount < 0 || points + 16 * pointCount > place) {
      throw new Error("The .shp file of the shapefile is damaged.");
    }
    for (let part = 0; part < partCount; part += 1) {
      const first = view.getInt32(start + 44 + 4 * part, true);
      const next = part + 1 < partCount ? view.getInt32(start + 44 + 4 * (part + 1), true) : pointCount;
      const ring: [number, number][] = [];
      for (let point = first; point < next; point += 1) {
        ring.push([view.getFloat64(points + 16 * point, true), view.getFloat64(points + 16 * point + 8, true)]);
      }
      // Some programs write every ring counter-clockwise, so the first ring of a polygon always counts as outer.
      if (ring.length >= 4 && (part === 0 || signedArea(ring) < 0)) {
        rings.push(ring);
      }
    }
  }
  return { rings, others, box };
}

/**
 * Tell whether the projection file (.prj) of a shapefile names geographic coordinates on the WGS 84 datum. A
 * projected system starts with PROJCS or PROJCRS.
 */
export function isWgs84(projection: string): boolean {
  return /^\s*GEOG(CS|CRS|RAPHICCRS)\s*\[/i.test(projection) && /WGS[_ ]?(19)?84/i.test(projection);
}
