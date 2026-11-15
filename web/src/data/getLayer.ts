import type { CellsLimit } from "../servers/choice";
import { isArea, type Area } from "../shared/area";
import type { LayerRequest, ProductType } from "../shared/layer";
import { createStore } from "../shared/store";
import type { SearchDraft } from "./search";
import { rectangleAround } from "./searchArea";
import { call } from "./service";

/** A layer of a product that Lynkeus receives, as the server lists it with the product. */
export interface LayerChoice {
  /** Name of the layer, as a layer request takes it. */
  name: string;
  /** Name of the layer for the visitor. */
  title: string;
  /** Smallest cell size of the layer in metres, when the server states it. The cells of a product are of this size or larger. */
  spacing?: number | null;
}

/** A ring of longitude and latitude pairs, in degrees. */
export type Ring = readonly (readonly [number, number])[];

/** What the form of Get layer needs to know about a product that the search found. */
export interface RequestProduct {
  /** Identifier of the product file in NASA's catalogue. */
  id: string;
  /** Name of the product file. */
  name: string;
  product: ProductType;
  /** Date of the acquisition, or the two dates of a pair, each as year-month-day. */
  dates: readonly string[];
  track: number;
  frame: number;
  /** Outline on the ground: one ring for each polygon. */
  footprint: readonly Ring[];
  /** The layers of the product that Lynkeus receives. */
  layers: readonly LayerChoice[];
}

/** The four sides of an area as the fields of the form hold them. */
export interface Sides {
  west: string;
  south: string;
  east: string;
  north: string;
}

/** One request that the form sends: a layer of a product, clipped to the area. Each request starts one job. */
export interface Planned {
  request: LayerRequest;
  product: RequestProduct;
  choice: LayerChoice;
}

/** How an area lies to the outline of a product. */
export type Coverage = "inside" | "partly" | "outside";

/** What a layer clipped to an area holds at most: the number of its cells and their size before compression. */
export interface Estimate {
  cells: number;
  /** Size in bytes of the cells as 32-bit numbers, which is the form in which Lynkeus writes a layer. */
  bytes: number;
}

/** The mean radius of the Earth (GRS 80), in metres. The server estimates the cells of a layer with the same radius. */
export const EARTH_RADIUS = 6_371_008.8;

/** The number of bytes of one cell of a layer: Lynkeus writes a layer as 32-bit floating-point numbers. */
const CELL_BYTES = 4;

const PROCESS = "/api/processes/get-layer";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Return the surface of an area on a sphere of the mean radius of the Earth, in square metres. */
export function surface(area: Area): number {
  const width = radians(area.east - area.west);
  const height = Math.sin(radians(area.north)) - Math.sin(radians(area.south));
  return EARTH_RADIUS ** 2 * width * height;
}

/**
 * Estimate what a layer clipped to an area holds at most, from the smallest cell size of the layer, or return
 * null for a layer without a stated cell size.
 */
export function estimate(area: Area, choice: LayerChoice): Estimate | null {
  if (!choice.spacing) {
    return null;
  }
  const cells = surface(area) / choice.spacing ** 2;
  return { cells, bytes: cells * CELL_BYTES };
}

/** Write a number of cells in the form "14 million cells" or "36,000 cells". */
export function formatCells(cells: number): string {
  if (cells >= 1e6) {
    return `${(cells / 1e6).toFixed(cells >= 1e7 ? 0 : 1)} million cells`;
  }
  const rounded = cells >= 1000 ? Math.round(cells / 1000) * 1000 : Math.max(1, Math.round(cells));
  return `${rounded.toLocaleString("en-US")} ${rounded === 1 ? "cell" : "cells"}`;
}

/** Write a surface given in square metres in square kilometres, as "1,429 km²" or "0.35 km²". */
export function formatSurface(squareMetres: number): string {
  const kilometres = squareMetres / 1e6;
  const digits = kilometres >= 100 ? 0 : kilometres >= 1 ? 1 : 2;
  return `${kilometres.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} km²`;
}

type Point = readonly [number, number];
type Edge = readonly [Point, Point];

function edgesOf(ring: Ring): Edge[] {
  return ring.map((point, index) => [point, ring[(index + 1) % ring.length] ?? point]);
}

// A point lies inside a ring when a line from it to the east crosses an odd number of edges.
function isInside([x, y]: Point, edges: readonly Edge[]): boolean {
  let crossings = 0;
  for (const [[x1, y1], [x2, y2]] of edges) {
    if (y1 > y !== y2 > y && x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) {
      crossings += 1;
    }
  }
  return crossings % 2 === 1;
}

function turn(a: Point, b: Point, c: Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function cross([a, b]: Edge, [c, d]: Edge): boolean {
  return turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0;
}

/**
 * Tell how an area lies to the outline of a product: inside one polygon of the outline, partly inside the
 * outline, or outside it. The server refuses a request whose area lies outside the product.
 */
export function coverage(area: Area, footprint: readonly Ring[]): Coverage {
  const { west, south, east, north } = area;
  const corners: Point[] = [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ];
  const sides = edgesOf(corners);
  let overlaps = false;
  for (const ring of footprint) {
    const edges = edgesOf(ring);
    const crosses = edges.some((edge) => sides.some((side) => cross(edge, side)));
    const holdsCorners = corners.map((corner) => isInside(corner, edges));
    const pointInArea = ring.some(([x, y]) => west <= x && x <= east && south <= y && y <= north);
    if (holdsCorners.every(Boolean) && !crosses && !pointInArea) {
      return "inside";
    }
    overlaps ||= crosses || pointInArea || holdsCorners.some(Boolean);
  }
  return overlaps ? "partly" : "outside";
}

const NO_NUMBERS = "Give the four sides of the area as numbers.";
const CROSSES =
  "A layer is not received for an area that crosses the meridian of 180 degrees. Choose an area on one side of it.";

/** Return the area that the four fields hold, or null when they do not hold one. */
export function areaOf(sides: Sides): Area | null {
  const side = (text: string) => (text.trim() === "" ? Number.NaN : Number(text));
  const area = { west: side(sides.west), south: side(sides.south), east: side(sides.east), north: side(sides.north) };
  return isArea(area) ? area : null;
}

/** Return what is wrong with the four fields of the area, in plain words, or null when they hold an area. */
export function sidesFault(sides: Sides): string | null {
  if (
    [sides.west, sides.south, sides.east, sides.north].some((text) => text.trim() === "" || Number.isNaN(Number(text)))
  ) {
    return NO_NUMBERS;
  }
  if (!areaOf(sides)) {
    return "The area is not valid. West must be smaller than east and south smaller than north. Longitude runs from -180 to 180 degrees and latitude from -90 to 90.";
  }
  return null;
}

/** The area of a layer request, as it follows from the area of the search. */
export interface RequestArea {
  /** The rectangle to which the layers are clipped, or null when the area gives none. */
  area: Area | null;
  /** Why the area gives no rectangle, in plain words, or null. */
  fault: string | null;
  /** Whether the rectangle is the one around an area of polygons. */
  around: boolean;
}

/**
 * Return the rectangle to which a layer is clipped, from the area of the search. A layer request takes a
 * rectangle that does not cross the meridian of 180 degrees: an area of polygons gives the rectangle around
 * them, and the whole Earth gives none.
 */
export function requestArea({ limited, area }: Pick<SearchDraft, "limited" | "area">): RequestArea {
  if (!limited) {
    return { area: null, fault: "A layer is not received for the whole Earth. Choose an area.", around: false };
  }
  const around = area.kind === "polygons";
  if (area.kind === "rectangle") {
    const fault = sidesFault(area);
    const sides = areaOf(area);
    if (sides || fault === null) {
      return { area: sides, fault: null, around };
    }
    const crosses =
      fault !== NO_NUMBERS && Number(area.west) > Number(area.east) && Number(area.south) < Number(area.north);
    return { area: null, fault: crosses ? CROSSES : fault, around };
  }
  if (area.rings.length === 0) {
    return { area: null, fault: "The area has no polygon. Choose an area.", around };
  }
  const sides = rectangleAround(area.rings);
  return isArea(sides) ? { area: sides, fault: null, around } : { area: null, fault: CROSSES, around };
}

/**
 * Return the requests for the chosen layers of the products, clipped to the area: one request for each layer of
 * each product, in the order of the products and of their layers. `chosen` holds, by the identifier of a
 * product, the names of its chosen layers.
 */
export function plan(
  products: readonly RequestProduct[],
  chosen: Readonly<Record<string, readonly string[] | undefined>>,
  area: Area,
): Planned[] {
  return products.flatMap((product) =>
    product.layers
      .filter((choice) => chosen[product.id]?.includes(choice.name))
      .map((choice) => ({
        request: { product: product.product, granule: product.name, layer: choice.name, area },
        product,
        choice,
      })),
  );
}

/**
 * Return the sentence for a layer that would hold more cells than the server of the job receives. The sentence
 * names that server and its limit: a server of the visitor by its name, and otherwise the project server, which
 * is Lynkeus itself for a visitor without a server of his own. When a connected server of the visitor
 * receives more cells, the sentence names it as the server to choose.
 */
export function tooLarge(title: string, cells: number, { limit, server, several, larger }: CellsLimit): string {
  const million = (count: number) => (count / 1e6).toLocaleString("en-US");
  const where = server !== null ? ` on your server "${server}"` : several ? " on the project server" : "";
  const who = server !== null ? "that server" : several ? "the project server" : "Lynkeus";
  const advice = larger
    ? `Choose a smaller area, or your server "${larger.name}", which receives at most ${million(larger.limit)} million.`
    : "Choose a smaller area.";
  return `The area is too large for the layer "${title}"${where}: the layer would have about ${formatCells(cells)}, and ${who} receives at most ${million(limit ?? 0)} million. ${advice}`;
}

/**
 * Return the largest number of cells of one layer that the server receives, from the description of the process
 * `get-layer` (its additional parameter `most-cells`), or null when the description does not state it.
 */
export function cellLimitOf(description: unknown): number | null {
  const additional: unknown = isRecord(description) ? description.additionalParameters : null;
  const parameters: unknown = isRecord(additional) ? additional.parameters : null;
  if (!Array.isArray(parameters)) {
    return null;
  }
  for (const parameter of parameters as unknown[]) {
    if (isRecord(parameter) && parameter.name === "most-cells" && Array.isArray(parameter.value)) {
      const limit: unknown = parameter.value[0];
      return typeof limit === "number" && Number.isFinite(limit) && limit > 0 ? limit : null;
    }
  }
  return null;
}

/** The largest number of cells of one layer that the server receives, or null while it is not known. */
export const cellLimitStore = createStore<number | null>(null);

/**
 * Read the limit on the cells of a layer from the server. Without an answer the limit stays unknown, and the
 * server alone checks the size of a request.
 */
export async function loadCellLimit(): Promise<void> {
  try {
    cellLimitStore.set(cellLimitOf(await call(PROCESS)));
  } catch {
    cellLimitStore.set(null);
  }
}
