// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { getWidth } from "ol/extent";
import type Geometry from "ol/geom/Geometry";
import Polygon from "ol/geom/Polygon";
import { get as getProjection, transform } from "ol/proj";
import { formatNumber } from "../contents/legendValues";
import type { Ring } from "../data/products";
import { areaProperties, rectangleAround } from "../data/searchArea";
import { AREA_FAULTS } from "../map/area";
import type { ShapeKind } from "../shared/drawShape";
import { MOST_CORNERS, type AreaStatistics, type Shape } from "../shared/layer";
import type { Property } from "../shared/properties/PropertyList";
import { createStore } from "../shared/store";

/**
 * The area drawn on the map for the analysis tools, or null when there is none. Every form of the Analysis tab
 * shows the same area: a tool that maps computes its statistics inside it, and a series is made of its cells.
 */
export const analysisAreaStore = createStore<Shape | null>(null);

/** The shape that is being drawn as the area of the analysis, or null while none is. */
export const analysisDrawingStore = createStore<ShapeKind | null>(null);

/** Why a drawn shape is not taken as the area, in the words of a message. */
export const SHAPE_FAULTS = {
  empty: "The rectangle has no area. Press, move the pointer and release.",
  corners: "A polygon needs at least three corners.",
  crossing: "The sides of the polygon cross each other. Draw it again without crossing sides.",
  meridian: AREA_FAULTS.meridian,
} as const;

/** State that a polygon has more corners than an area takes. */
export function cornersSentence(count: number): string {
  return `The polygon has ${String(count)} corners. An area takes at most ${String(MOST_CORNERS)}.`;
}

type Corner = readonly [number, number];

/** Round a coordinate of the map to the centimetre. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Return the corners of a ring without its last point, which repeats the first, and without repeated points. */
function cornersOf(ring: readonly Corner[]): Corner[] {
  const corners: Corner[] = [];
  for (const [x, y] of ring.slice(0, -1)) {
    const last = corners.at(-1);
    if (!last || last[0] !== x || last[1] !== y) {
      corners.push([x, y]);
    }
  }
  const [first] = corners;
  const last = corners.at(-1);
  if (corners.length > 1 && first && last && first[0] === last[0] && first[1] === last[1]) {
    corners.pop();
  }
  return corners;
}

function turn(a: Corner, b: Corner, c: Corner): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function between(a: Corner, b: Corner, c: Corner): boolean {
  return (
    Math.min(a[0], b[0]) <= c[0] &&
    c[0] <= Math.max(a[0], b[0]) &&
    Math.min(a[1], b[1]) <= c[1] &&
    c[1] <= Math.max(a[1], b[1])
  );
}

function meet(a: Corner, b: Corner, c: Corner, d: Corner): boolean {
  const [one, two, three, four] = [turn(a, b, c), turn(a, b, d), turn(c, d, a), turn(c, d, b)];
  if (one * two < 0 && three * four < 0) {
    return true;
  }
  return (
    (one === 0 && between(a, b, c)) ||
    (two === 0 && between(a, b, d)) ||
    (three === 0 && between(c, d, a)) ||
    (four === 0 && between(c, d, b))
  );
}

function foldsBack(a: Corner, b: Corner, c: Corner): boolean {
  return turn(a, b, c) === 0 && (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) < 0;
}

/**
 * Tell whether two sides of a polygon meet anywhere but at the corner that joins two neighbouring sides, or two
 * neighbouring sides turn back along each other, as corners on one line do. The server makes the same check, on
 * the same numbers, in `api/src/lynkeus/layers.py`: the corners are moved so that the first lies at the origin.
 */
export function crossesItself(corners: readonly Corner[]): boolean {
  const [x0, y0] = corners[0] ?? [0, 0];
  const moved = corners.map(([x, y]) => [x - x0, y - y0] as const);
  const count = moved.length;
  for (let first = 0; first < count; first += 1) {
    for (let second = first + 1; second < count; second += 1) {
      const a = moved[first];
      const b = moved[(first + 1) % count];
      const c = moved[second];
      const d = moved[(second + 1) % count];
      if (!a || !b || !c || !d) {
        continue;
      }
      let crossing: boolean;
      if (second === first + 1) {
        crossing = foldsBack(a, b, d);
      } else if (first === 0 && second === count - 1) {
        crossing = foldsBack(c, a, b);
      } else {
        crossing = meet(a, b, c, d);
      }
      if (crossing) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Turn a shape drawn on the map into the area of the analysis, in the coordinates of the map, rounded to the
 * centimetre. The map repeats the world towards the east and the west, so a shape drawn in a repeated world is
 * moved into the first one. Return the area, or the sentence that says why the shape is not one: a rectangle
 * without size, a polygon of fewer than three corners or of more than the most that an area takes, a polygon whose
 * sides cross, or a shape across the meridian of 180 degrees.
 */
export function shapeOfGeometry(geometry: Geometry, kind: ShapeKind, projection: string): Shape | string {
  const ring = geometry instanceof Polygon ? (geometry.getLinearRing(0)?.getCoordinates() ?? []) : [];
  let points: Corner[] = ring.map(([x = 0, y = 0]) => [round(x), round(y)] as const);
  const world = getProjection(projection)?.getExtent();
  if (world && points.length > 0) {
    const left = world[0] ?? 0;
    const right = world[2] ?? 0;
    const width = getWidth(world);
    const turns = Math.floor((Math.min(...points.map(([x]) => x)) - left) / width);
    if (turns !== 0) {
      points = points.map(([x, y]) => [round(x - turns * width), y] as const);
    }
    // A rounding of the projection must not turn the meridian itself into a crossing.
    if (Math.max(...points.map(([x]) => x)) > right + 0.01) {
      return SHAPE_FAULTS.meridian;
    }
  }
  const corners = cornersOf(points);
  if (kind === "rectangle") {
    const across = new Set(corners.map(([x]) => x)).size;
    const up = new Set(corners.map(([, y]) => y)).size;
    if (corners.length !== 4 || across !== 2 || up !== 2) {
      return SHAPE_FAULTS.empty;
    }
  } else if (corners.length < 3) {
    return SHAPE_FAULTS.corners;
  }
  if (corners.length > MOST_CORNERS) {
    return cornersSentence(corners.length);
  }
  if (crossesItself(corners)) {
    return SHAPE_FAULTS.crossing;
  }
  const [first] = corners;
  return { crs: projection, kind, points: first ? [...corners, first] : corners };
}

/** Name an area drawn on the map: "rectangle", or "polygon of 5 corners". */
export function shapeName(shape: Shape): string {
  return shape.kind === "rectangle" ? "rectangle" : `polygon of ${String(shape.points.length - 1)} corners`;
}

/** Say what an area drawn on the map is, as a list and a property name it: "The rectangle drawn on the map". */
export function shapeWords(shape: Shape): string {
  return `The ${shapeName(shape)} drawn on the map`;
}

/** Round a degree to five decimals, about one metre on the ground. */
function degrees(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

/**
 * Return what the Properties window states about the layer of the area, as the layer of the area of the search
 * states it: its kind, the four sides of the rectangle around it in degrees and, for a polygon, its corners.
 */
export function shapeProperties(shape: Shape): { name: string; value: string }[] {
  const ring: Ring = shape.points.map(([x, y]) => {
    const [longitude = 0, latitude = 0] = transform([x, y], shape.crs, "EPSG:4326");
    return [degrees(longitude), degrees(latitude)] as const;
  });
  return shape.kind === "rectangle"
    ? areaProperties({ kind: "rectangle", ...rectangleAround([ring]) })
    : areaProperties({ kind: "polygons", rings: [ring] });
}

const COUNT = new Intl.NumberFormat("en-GB");

/** The explanation of the row that counts the cells of the statistics. */
export const CELLS_INFO = "The cells of the result whose centre lies inside the area and that hold a value.";

/**
 * Return the rows of the statistics of a result inside the area of its run: the area, the number of cells with
 * data, and their mean, standard deviation, lowest value, median and highest value in `unit`, the unit of the
 * result as the legend writes it. Without a cell with data, a row states that there are no statistics.
 */
export function statisticsRows(statistics: AreaStatistics, unit: string): Property[] {
  const write = (value: number | null) => (value === null ? "None" : `${formatNumber(value)}${unit && ` ${unit}`}`);
  const rows: Property[] = [
    { name: "Area", value: shapeWords(statistics.area) },
    { name: "Cells with data", value: COUNT.format(statistics.cells), info: CELLS_INFO },
  ];
  if (statistics.cells === 0) {
    return [...rows, { name: "Statistics", value: "None", info: "No cell with data lies inside the area." }];
  }
  return [
    ...rows,
    { name: "Mean", value: write(statistics.mean) },
    { name: "Standard deviation", value: write(statistics.deviation) },
    { name: "Lowest value", value: write(statistics.minimum) },
    { name: "Median", value: write(statistics.median) },
    { name: "Highest value", value: write(statistics.maximum) },
  ];
}
