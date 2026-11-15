import { isArea, type Area } from "./area";

/** A point on the Earth, in degrees of longitude and latitude (WGS 84). */
export interface Point {
  /** Longitude, from -180 to 180 degrees, positive to the east. */
  longitude: number;
  /** Latitude, from -90 to 90 degrees, positive to the north. */
  latitude: number;
}

/** A cell of the grid of a layer: its row and column, counted from 0, and its centre in degrees (WGS 84). */
export interface Cell {
  row: number;
  column: number;
  longitude: number;
  latitude: number;
}

/** One date of a series: the value of one input layer. */
export interface SeriesEntry {
  /** Date or dates of the layer, each as year-month-day: one date for an acquisition, two for a pair. */
  dates: readonly string[];
  /** Value of the quantity, in the unit of the series, or null when no cell holds a value. */
  value: number | null;
  /** Number of cells from which the value was made: 0 or 1 at a point. */
  cells: number;
}

/** How the value of a date is made from the cells of its layer, as the server names it. */
export const REDUCTIONS = ["mean", "mean-power"] as const;
export type Reduction = (typeof REDUCTIONS)[number];

/**
 * The description of a series: the result of a tool of the kind Series. It holds the whole series; a series has
 * no file. The fields are those of `SeriesDescription` in `api/src/lynkeus/layers.py`.
 */
export interface SeriesDescription {
  /** Unique name of the series. */
  id: string;
  /** Name shown in the panes. */
  title: string;
  /** Always "series". It tells a series from a layer description. */
  kind: "series";
  /** What the values are. */
  quantity: string;
  /** Unit of the values. */
  unit: string;
  /** "mean" for the mean of the cells; "mean-power" for the decibels of the mean of the linear power of the cells. */
  reduction: Reduction;
  /** Lowest and highest value of the axis of the values, when the quantity has fixed limits, or null. */
  range: readonly [number, number] | null;
  /** The point of the request, for a series at a point, or null for a series of the whole area of the layers. */
  point: Point | null;
  /** The cell of the grid of the layers that holds the point. It is given when, and only when, `point` is. */
  cell: Cell | null;
  /** The smallest rectangle in longitude and latitude that holds the grid of the input layers. */
  area: Area;
  /** The dates of the series with their values, the earliest first. */
  entries: readonly SeriesEntry[];
  /** Names of the product files used, in the order of `entries`. */
  inputs: readonly string[];
  /** Name of the layer inside each product, for example "HHHH". */
  layer: string;
  /** Program and version that produced the series. */
  program: string;
  /** Reference of the method. */
  method: string;
}

/** What the form of a Series tool sends to the server. The answer is a job, whose result is a series description. */
export interface SeriesInputs {
  /** The id of each input layer, in any order: 2 to 50 layers, each once. */
  inputs: readonly string[];
  /** Name of the series. */
  title: string;
  /** The point of the series, or no field for the whole area of the layers. */
  point?: Point;
}

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Tell whether a value is a point: a longitude from -180 to 180 and a latitude from -90 to 90 degrees. */
export function isPoint(value: unknown): value is Point {
  return (
    isRecord(value) &&
    isNumber(value.longitude) &&
    isNumber(value.latitude) &&
    Math.abs(value.longitude) <= 180 &&
    Math.abs(value.latitude) <= 90
  );
}

/** Tell whether a value is a cell of a grid. */
export function isCell(value: unknown): value is Cell {
  return isPoint(value) && isRecord(value) && isCount(value.row) && isCount(value.column);
}

/** Tell whether a value is an entry of a series. An entry has a value when, and only when, it has cells. */
export function isSeriesEntry(value: unknown): value is SeriesEntry {
  if (!isRecord(value)) {
    return false;
  }
  const { dates, cells } = value;
  const amount = value.value;
  return (
    Array.isArray(dates) &&
    dates.length > 0 &&
    dates.every((date) => typeof date === "string" && DATE.test(date)) &&
    isCount(cells) &&
    (amount === null ? cells === 0 : isNumber(amount) && cells > 0)
  );
}

/** The dates of an entry as one text, so that the order of the texts is the order of the entries. */
function datesKey(entry: SeriesEntry): string {
  return entry.dates.join(" ");
}

/**
 * Tell whether a value that the server sent is a series description. The checks are those that the server makes
 * on its own format: the point and the cell stand together, each entry has one product file, and the entries
 * have different dates, the earliest first.
 */
export function isSeriesDescription(value: unknown): value is SeriesDescription {
  if (!isRecord(value)) {
    return false;
  }
  const { id, kind, reduction, entries, inputs } = value;
  const range = value.range ?? null;
  const point = value.point ?? null;
  const cell = value.cell ?? null;
  if (
    typeof id !== "string" ||
    !ID.test(id) ||
    kind !== "series" ||
    ![value.title, value.quantity, value.unit, value.layer, value.program, value.method].every(isText) ||
    !REDUCTIONS.some((known) => known === reduction) ||
    !isArea(value.area) ||
    !Array.isArray(entries) ||
    entries.length === 0 ||
    !entries.every(isSeriesEntry) ||
    !Array.isArray(inputs) ||
    inputs.length !== entries.length ||
    !inputs.every(isText)
  ) {
    return false;
  }
  if (
    range !== null &&
    !(Array.isArray(range) && range.length === 2 && isNumber(range[0]) && isNumber(range[1]) && range[0] < range[1])
  ) {
    return false;
  }
  if (point === null ? cell !== null : !isPoint(point) || !isCell(cell)) {
    return false;
  }
  const keys = entries.map(datesKey);
  return keys.every((key, index) => index === 0 || (keys[index - 1] ?? "") < key);
}
