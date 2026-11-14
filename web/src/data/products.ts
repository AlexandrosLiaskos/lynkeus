import { isArea, type Area } from "../shared/area";
import { PRODUCT_TYPES, type ProductType } from "../shared/layer";

/** NASA's names of the product types, from the titles of their collections in NASA's catalogue. */
export const PRODUCT_NAMES: Record<ProductType, string> = {
  GCOV: "Geocoded Polarimetric Covariance",
  GUNW: "Geocoded Unwrapped Interferogram",
  GOFF: "Geocoded Pixel Offsets",
  SME2: "Soil Moisture",
};

/** The choices of a search. The days are written as year-month-day, in Coordinated Universal Time. */
export interface ProductSearch {
  product: ProductType;
  area: Area;
  start: string;
  end: string;
}

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
  maturity: "Validated" | "Provisional";
  /** Date of the acquisition, or the two dates of a pair, each as year-month-day. */
  dates: readonly string[];
  track: number;
  frame: number;
  direction: "ascending" | "descending";
  /** Polarisation channels of the main frequency band. */
  channels: readonly string[];
  /** Size of the product file in bytes, or null when the catalogue does not state it. */
  size: number | null;
  /** Outline on the ground: one ring of longitude and latitude pairs, in degrees, for each polygon. */
  footprint: readonly (readonly (readonly [number, number])[])[];
}

/** The answer of a search: the number of products that match, and the products returned, the latest first. */
export interface ProductsFound {
  found: number;
  products: readonly Product[];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPoint(value: unknown): boolean {
  return Array.isArray(value) && value.length === 2 && value.every((number) => typeof number === "number");
}

/** Tell whether a value that the server sent is a product. */
export function isProduct(value: unknown): value is Product {
  if (!isRecord(value)) {
    return false;
  }
  const { dates, channels, size, footprint } = value;
  return (
    [value.id, value.name, value.collection].every((text) => typeof text === "string" && text !== "") &&
    PRODUCT_TYPES.some((type) => type === value.product) &&
    (value.maturity === "Validated" || value.maturity === "Provisional") &&
    Array.isArray(dates) &&
    (dates.length === 1 || dates.length === 2) &&
    dates.every((day) => typeof day === "string" && DAY.test(day)) &&
    Number.isInteger(value.track) &&
    Number.isInteger(value.frame) &&
    (value.direction === "ascending" || value.direction === "descending") &&
    Array.isArray(channels) &&
    channels.every((channel) => typeof channel === "string") &&
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

/** Return what is wrong with the choices of a search, in plain words, or null when they can be sent. */
export function searchFault(search: ProductSearch): string | null {
  const { west, south, east, north } = search.area;
  if (![west, south, east, north].every(Number.isFinite)) {
    return "Give the four sides of the area as numbers.";
  }
  if (!isArea(search.area)) {
    return "The area is not valid. West must be smaller than east and south smaller than north. Longitude runs from -180 to 180 degrees and latitude from -90 to 90.";
  }
  if (!DAY.test(search.start) || !DAY.test(search.end)) {
    return "Give the first and the last day of the period.";
  }
  if (search.start > search.end) {
    return "The first day of the period is after the last.";
  }
  return null;
}

/** Return the address of the server that answers a search. */
export function searchAddress({ product, area, start, end }: ProductSearch): string {
  const choices = new URLSearchParams({
    product,
    west: String(area.west),
    south: String(area.south),
    east: String(area.east),
    north: String(area.north),
    start,
    end,
  });
  return `/api/products?${choices.toString()}`;
}

/**
 * Ask the server for the products of a search. The promise is rejected with an error whose message can be shown
 * to the user.
 */
export async function findProducts(search: ProductSearch, signal?: AbortSignal): Promise<ProductsFound> {
  let response: Response;
  try {
    response = await fetch(searchAddress(search), { headers: { Accept: "application/json" }, signal });
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
  if (!isProductsFound(answer)) {
    throw new Error("The answer of the server could not be read.");
  }
  return answer;
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Write a day given as year-month-day in the form "21 Oct 2026". */
export function formatDay(day: string): string {
  return DAY_FORMAT.format(new Date(`${day}T00:00:00Z`));
}

/** Write a size in bytes in megabytes or gigabytes (1 GB is 1000 MB). */
export function formatSize(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${String(Math.round(bytes / 1e6))} MB`;
}
