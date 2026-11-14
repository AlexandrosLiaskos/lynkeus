import { PRODUCT_TYPES, type ProductType } from "../shared/layer";

/** NASA's names of the product types, from the titles of their collections in NASA's catalogue. */
export const PRODUCT_NAMES: Record<ProductType, string> = {
  GCOV: "Geocoded Polarimetric Covariance",
  GUNW: "Geocoded Unwrapped Interferogram",
  GOFF: "Geocoded Pixel Offsets",
  SME2: "Soil Moisture",
};

/** The product types that are made from a pair of acquisitions. */
export const PAIR_PRODUCTS: readonly ProductType[] = ["GUNW", "GOFF"];

/** The product types whose records state a side frequency band (B). */
export const SIDE_BAND_PRODUCTS: readonly ProductType[] = ["GCOV", "SME2"];

/** The product types whose records state the range bandwidth. */
export const BANDWIDTH_PRODUCTS: readonly ProductType[] = ["GCOV", "GUNW", "GOFF"];

/** NASA's levels of validation of a collection, the most reliable first. */
export const MATURITIES = ["Validated", "Provisional", "Beta"] as const;
export type Maturity = (typeof MATURITIES)[number];

/** The polarisation channels that the records of the catalogue carry. */
export const CHANNELS = ["HH", "HV", "VH", "VV"] as const;
export type Channel = (typeof CHANNELS)[number];

/** The frequency bands of the L-band radar: A is the main band and B the side band. */
export const BANDS = ["A", "B"] as const;
export type Band = (typeof BANDS)[number];

/** The range bandwidths of the main frequency band that the records carry, in megahertz. */
export const BANDWIDTHS = [5, 20, 40, 77] as const;
export type Bandwidth = (typeof BANDWIDTHS)[number];

export type Direction = "ascending" | "descending";
export type Coverage = "full" | "partial";

/** The orders in which the catalogue returns the products, with the words that name them. */
export const SORTS = {
  newest: "Acquisition, latest first",
  oldest: "Acquisition, earliest first",
  name: "Product name",
  largest: "Size of all files, largest first",
  smallest: "Size of all files, smallest first",
  recorded: "Record in the catalogue, latest first",
} as const;
export type Sort = keyof typeof SORTS;

/** A ring of longitude and latitude pairs, in degrees. The last point repeats the first. */
export type Ring = readonly (readonly [number, number])[];

/** A product file found by a search, as the server describes it. */
export interface Product {
  /** Identifier of the product file in NASA's catalogue. */
  id: string;
  /** Name of the product file. */
  name: string;
  product: ProductType;
  /** NASA's short name of the collection that holds the product. */
  collection: string;
  /** NASA's level of validation of the collection. */
  maturity: Maturity;
  /** Date of the acquisition, or the two dates of a pair, each as year-month-day. */
  dates: readonly string[];
  /** Start and end of the acquisition in Coordinated Universal Time. For a pair: start of the first, end of the second. */
  start: string;
  end: string;
  track: number;
  frame: number;
  direction: Direction;
  /** Number of the 12-day cycle, from the product name. For a pair it is the cycle of the first acquisition. */
  cycle: number | null;
  /** Absolute orbit number. */
  orbit: number | null;
  /** Frequency bands of the product. */
  bands: readonly string[];
  /** Polarisation channels of the main frequency band (A). */
  channels: readonly string[];
  /** Polarisation channels of the side frequency band (B). */
  side_channels: readonly string[];
  /** Range bandwidth of the main and of the side frequency band, in megahertz. */
  bandwidth: number | null;
  side_bandwidth: number | null;
  /** Whether the product covers its whole frame. */
  coverage: Coverage | null;
  /** Whether the L-band and the S-band radar observed together. */
  joint: boolean | null;
  /** Version of the product. */
  version: string | null;
  /** Size of the product file in bytes, or null when the catalogue does not state it. */
  size: number | null;
  /** Outline on the ground: one ring for each polygon. */
  footprint: readonly Ring[];
}

/** The answer of a search: the number of products that match, and the products returned, in the order asked. */
export interface ProductsFound {
  found: number;
  products: readonly Product[];
}

/** An additional attribute of a record of the catalogue, with NASA's name for it. */
export interface Attribute {
  name: string;
  values: readonly string[];
}

/** A file of a product, with its address at the Alaska Satellite Facility. */
export interface ProductFile {
  name: string;
  kind: "data" | "browse" | "metadata" | "quality";
  url: string;
  size: number | null;
  format: string | null;
  checksum: string | null;
}

/** Everything that the record of a product file states. */
export interface ProductDetail {
  product: Product;
  attributes: readonly Attribute[];
  files: readonly ProductFile[];
  /** Names of the product files from which the product was made. */
  inputs: readonly string[];
  /** Kinds of surface and continents that the product covers. */
  localities: readonly string[];
  /** Side to which the radar looked. */
  look: string | null;
  /** Program that made the product, with its version. */
  software: string | null;
  /** Identifiers of the processing. */
  identifiers: readonly Attribute[];
  /** When the product was made and when its record last changed, in Coordinated Universal Time. */
  produced: string | null;
  recorded: string | null;
  /** Whether the server can show a small browse image of the product. */
  thumbnail: boolean;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

function isTexts(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((text) => typeof text === "string");
}

function isWholeOrNull(value: unknown): boolean {
  return value === null || Number.isInteger(value);
}

function isPoint(value: unknown): boolean {
  return Array.isArray(value) && value.length === 2 && value.every((number) => typeof number === "number");
}

/** Tell whether a value that the server sent is a product. */
export function isProduct(value: unknown): value is Product {
  if (!isRecord(value)) {
    return false;
  }
  const { dates, size, footprint, coverage, joint, version } = value;
  return (
    [value.id, value.name, value.collection].every(isText) &&
    PRODUCT_TYPES.some((type) => type === value.product) &&
    MATURITIES.some((maturity) => maturity === value.maturity) &&
    Array.isArray(dates) &&
    (dates.length === 1 || dates.length === 2) &&
    dates.every((day) => typeof day === "string" && DAY.test(day)) &&
    [value.start, value.end].every((moment) => typeof moment === "string" && MOMENT.test(moment)) &&
    Number.isInteger(value.track) &&
    Number.isInteger(value.frame) &&
    (value.direction === "ascending" || value.direction === "descending") &&
    [value.cycle, value.orbit, value.bandwidth, value.side_bandwidth].every(isWholeOrNull) &&
    [value.bands, value.channels, value.side_channels].every(isTexts) &&
    (coverage === null || coverage === "full" || coverage === "partial") &&
    (joint === null || typeof joint === "boolean") &&
    (version === null || typeof version === "string") &&
    (size === null || (typeof size === "number" && size >= 0)) &&
    Array.isArray(footprint) &&
    footprint.every((ring) => Array.isArray(ring) && ring.every(isPoint))
  );
}

/** Tell whether a value that the server sent is the answer of a search. */
export function isProductsFound(value: unknown): value is ProductsFound {
  return (
    isRecord(value) &&
    typeof value.found === "number" &&
    value.found >= 0 &&
    Array.isArray(value.products) &&
    value.products.every(isProduct)
  );
}

function isAttribute(value: unknown): value is Attribute {
  return isRecord(value) && isText(value.name) && isTexts(value.values);
}

function isTextOrNull(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isProductFile(value: unknown): value is ProductFile {
  return (
    isRecord(value) &&
    isText(value.name) &&
    isText(value.url) &&
    ["data", "browse", "metadata", "quality"].includes(value.kind as string) &&
    (value.size === null || typeof value.size === "number") &&
    isTextOrNull(value.format) &&
    isTextOrNull(value.checksum)
  );
}

/** Tell whether a value that the server sent is everything that the record of a product states. */
export function isProductDetail(value: unknown): value is ProductDetail {
  return (
    isRecord(value) &&
    isProduct(value.product) &&
    Array.isArray(value.attributes) &&
    value.attributes.every(isAttribute) &&
    Array.isArray(value.files) &&
    value.files.every(isProductFile) &&
    isTexts(value.inputs) &&
    isTexts(value.localities) &&
    [value.look, value.software, value.produced, value.recorded].every(isTextOrNull) &&
    Array.isArray(value.identifiers) &&
    value.identifiers.every(isAttribute) &&
    typeof value.thumbnail === "boolean"
  );
}

/** Return the address of the server that shows the small browse image of a product. */
export function browseAddress(id: string): string {
  return `/api/products/${encodeURIComponent(id)}/browse`;
}

/**
 * Ask the server and return its answer when the check accepts it. The promise is rejected with an error whose
 * message can be shown to the user.
 */
export async function ask<Answer>(
  address: string,
  isAnswer: (value: unknown) => value is Answer,
  signal?: AbortSignal,
): Promise<Answer> {
  let response: Response;
  try {
    response = await fetch(address, { headers: { Accept: "application/json" }, signal });
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    throw new Error("The server of Lynkeus did not answer. Check the connection and try again.", { cause: error });
  }
  const answer: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = isRecord(answer) && typeof answer.detail === "string" ? answer.detail : null;
    throw new Error(detail ?? `The search failed (the server answered ${String(response.status)}).`);
  }
  if (!isAnswer(answer)) {
    throw new Error("The answer of the server could not be read.");
  }
  return answer;
}

/** Ask the server for everything that NASA's catalogue states about one product. */
export function findProduct(id: string, signal?: AbortSignal): Promise<ProductDetail> {
  return ask(`/api/products/${encodeURIComponent(id)}`, isProductDetail, signal);
}

/** Return the number of days between the two acquisitions of a pair, or null for a product of one acquisition. */
export function pairDays({ dates }: Product): number | null {
  const [first, second] = dates;
  if (first === undefined || second === undefined) {
    return null;
  }
  return Math.round((Date.parse(`${second}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000);
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

/** Write a day given as year-month-day in the form "21 Oct 2026". */
export function formatDay(day: string): string {
  return DAY_FORMAT.format(new Date(`${day}T00:00:00Z`));
}

/** Write a moment of Coordinated Universal Time in the form "21 Oct 2026, 23:43:30 UTC". */
export function formatMoment(moment: string): string {
  const date = new Date(moment);
  return `${DAY_FORMAT.format(date)}, ${TIME_FORMAT.format(date)} UTC`;
}

/** Write a size in bytes in kilobytes, megabytes or gigabytes (1 GB is 1000 MB). */
export function formatSize(bytes: number): string {
  if (bytes >= 1e9) {
    return `${(bytes / 1e9).toFixed(1)} GB`;
  }
  return bytes >= 1e6 ? `${String(Math.round(bytes / 1e6))} MB` : `${String(Math.max(1, Math.round(bytes / 1e3)))} kB`;
}

/** Write a number with a comma between its thousands, as "13,172". */
export function formatCount(count: number): string {
  return count.toLocaleString("en-US");
}
