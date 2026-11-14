import type { ProductType } from "../shared/layer";
import { dayOfYear, formatSeasonDay, periodDays, seasonDay, type PeriodId, type SeasonDay } from "./period";
import {
  ask,
  BANDWIDTH_PRODUCTS,
  formatDay,
  isProductsFound,
  PAIR_PRODUCTS,
  PRODUCT_NAMES,
  SIDE_BAND_PRODUCTS,
  type Band,
  type Bandwidth,
  type Channel,
  type Coverage,
  type Direction,
  type Maturity,
  type ProductsFound,
  type Sort,
} from "./products";
import { areaFault, describeArea, ringText, type SearchArea } from "./searchArea";

/** The number of products that one answer of the server holds. The server holds the same number. */
export const PAGE = 200;

/** The largest number of product names in one search. The server holds the same number. */
export const MOST_NAMES = 50;

/** The numbers of the tracks of the orbit and of the frames along one track. */
export const TRACKS = 173;
export const FRAMES = 176;

/** The first and the last number of a range. */
export type Span = readonly [number, number];

/** The choices of a search, checked and ready to be sent. A choice that is null or empty does not limit the search. */
export interface ProductSearch {
  /** Product type, or null for every type in a search by product names. */
  product: ProductType | null;
  maturity: readonly Maturity[];
  area: SearchArea | null;
  /** First and last day of the period, each as year-month-day in Coordinated Universal Time. */
  start: string | null;
  end: string | null;
  /** First and last day of the year of the season. */
  season: Span | null;
  /** For a pair: whether both acquisitions must lie inside the period. */
  pairInside: boolean;
  track: Span | null;
  frame: Span | null;
  orbit: Span | null;
  direction: Direction | null;
  /** Channels that the main frequency band (A) and the side frequency band (B) must have. */
  channels: readonly Channel[];
  sideChannels: readonly Channel[];
  bands: readonly Band[];
  bandwidth: Bandwidth | null;
  coverage: Coverage | null;
  joint: boolean | null;
  cycle: number | null;
  /** Product names, with * and ? as wildcards. */
  names: readonly string[];
  sort: Sort;
}

/** The choices of the form as the user types them. Numbers and names are text until the search is checked. */
export interface SearchDraft {
  /** Whether the search is by area, period and properties, or by product names. */
  by: "properties" | "names";
  product: ProductType;
  maturity: readonly Maturity[];
  /** Whether the search is limited to an area. */
  limited: boolean;
  /** The four sides of a rectangular area as text, or the polygons of the area. */
  area:
    | { kind: "rectangle"; west: string; south: string; east: string; north: string }
    | Extract<SearchArea, { kind: "polygons" }>;
  period: PeriodId;
  start: string;
  end: string;
  /** The first and the last day of the season, or null for the whole year. */
  season: { start: SeasonDay; end: SeasonDay } | null;
  pairInside: boolean;
  track: string;
  frame: string;
  orbit: string;
  cycle: string;
  direction: Direction | "";
  channels: readonly Channel[];
  sideChannels: readonly Channel[];
  bands: readonly Band[];
  bandwidth: Bandwidth | "";
  coverage: Coverage | "";
  joint: "" | "yes" | "no";
  names: string;
}

/** Return the choices with which the form starts: backscatter products of the last 30 days in the given area. */
export function firstDraft(area: SearchDraft["area"], today = new Date()): SearchDraft {
  return {
    by: "properties",
    product: "GCOV",
    maturity: ["Validated", "Provisional"],
    limited: true,
    area,
    period: "30-days",
    ...(periodDays("30-days", today) ?? { start: "", end: "" }),
    season: null,
    pairInside: false,
    track: "",
    frame: "",
    orbit: "",
    cycle: "",
    direction: "",
    channels: [],
    sideChannels: [],
    bands: [],
    bandwidth: "",
    coverage: "",
    joint: "",
    names: "",
  };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SPAN = /^(\d{1,6})(?:\s*-\s*(\d{1,6}))?$/;
const NAME = /^[A-Za-z0-9_.*?-]+$/;

/** Read one whole number, or a range written as "12-15". Return null for an empty text and "wrong" for other text. */
function span(text: string, largest: number): Span | null | "wrong" {
  if (text.trim() === "") {
    return null;
  }
  const [, first, last] = SPAN.exec(text.trim()) ?? [];
  if (first === undefined) {
    return "wrong";
  }
  const range = [Number(first), Number(last ?? first)] as const;
  return range[0] >= 1 && range[0] <= range[1] && range[1] <= largest ? range : "wrong";
}

function side(text: string): number {
  return text.trim() === "" ? Number.NaN : Number(text);
}

/** Return the product names of a text, which are divided by commas, spaces or line ends. */
export function namesOf(text: string): string[] {
  const names = text.split(/[\s,;]+/).map((name) => name.replace(/\.h5$/, ""));
  return [...new Set(names.filter((name) => name !== ""))];
}

function areaOf(draft: SearchDraft): SearchArea | null {
  if (!draft.limited) {
    return null;
  }
  const { area } = draft;
  return area.kind === "polygons"
    ? area
    : {
        kind: "rectangle",
        west: side(area.west),
        south: side(area.south),
        east: side(area.east),
        north: side(area.north),
      };
}

/**
 * Check the choices of the form. Return the search that they make, or, in plain words, what is wrong with
 * them.
 */
export function searchOfDraft(draft: SearchDraft, sort: Sort = "newest"): ProductSearch | string {
  if (draft.maturity.length === 0) {
    return "Choose at least one level of validation.";
  }
  const none = {
    area: null,
    start: null,
    end: null,
    season: null,
    pairInside: false,
    track: null,
    frame: null,
    orbit: null,
    direction: null,
    channels: [],
    sideChannels: [],
    bands: [],
    bandwidth: null,
    coverage: null,
    joint: null,
    cycle: null,
    names: [],
  };
  if (draft.by === "names") {
    const names = namesOf(draft.names);
    if (names.length === 0) {
      return "Give at least one product name.";
    }
    if (names.length > MOST_NAMES) {
      return `A search takes at most ${String(MOST_NAMES)} product names, and ${String(names.length)} were given.`;
    }
    const wrong = names.find((name) => !NAME.test(name));
    if (wrong !== undefined) {
      return `"${wrong}" is not a product name. A name holds letters, digits and the signs _ . - and the wildcards * and ?.`;
    }
    return { ...none, product: null, maturity: draft.maturity, names, sort };
  }

  const area = areaOf(draft);
  const fault = area ? areaFault(area) : null;
  if (fault) {
    return fault;
  }
  if (!DAY.test(draft.start) || !DAY.test(draft.end)) {
    return "Give the first and the last day of the period.";
  }
  if (draft.start > draft.end) {
    return "The first day of the period is after the last.";
  }
  let season: Span | null = null;
  if (draft.season) {
    const [first, last] = [dayOfYear(draft.season.start), dayOfYear(draft.season.end)];
    if (first === null || last === null) {
      return "A day of the season does not exist in its month.";
    }
    season = [first, last];
  }
  const track = span(draft.track, TRACKS);
  if (track === "wrong") {
    return `Give the track as a number from 1 to ${String(TRACKS)}, or as a range such as 12-15.`;
  }
  const frame = span(draft.frame, FRAMES);
  if (frame === "wrong") {
    return `Give the frame as a number from 1 to ${String(FRAMES)}, or as a range such as 60-70.`;
  }
  const orbit = span(draft.orbit, 999_999);
  if (orbit === "wrong") {
    return "Give the orbit as a whole number, or as a range such as 6460-6468.";
  }
  const cycle = span(draft.cycle, 999);
  if (cycle === "wrong" || (cycle && cycle[0] !== cycle[1])) {
    return "Give the cycle as one whole number from 1 to 999.";
  }
  const { product } = draft;
  const hasSideBand = SIDE_BAND_PRODUCTS.includes(product);
  return {
    ...none,
    product,
    maturity: draft.maturity,
    area,
    start: draft.start,
    end: draft.end,
    season,
    pairInside: draft.pairInside && PAIR_PRODUCTS.includes(product),
    track,
    frame,
    orbit,
    direction: draft.direction === "" ? null : draft.direction,
    channels: draft.channels,
    sideChannels: hasSideBand ? draft.sideChannels : [],
    bands: hasSideBand ? draft.bands : [],
    bandwidth: draft.bandwidth === "" || !BANDWIDTH_PRODUCTS.includes(product) ? null : draft.bandwidth,
    coverage: draft.coverage === "" ? null : draft.coverage,
    joint: draft.joint === "" ? null : draft.joint === "yes",
    cycle: cycle ? cycle[0] : null,
    sort,
  };
}

function spanText([first, last]: Span): string {
  return first === last ? String(first) : `${String(first)}-${String(last)}`;
}

/** Return the address of the server that answers a search, from the given number of products onwards. */
export function searchAddress(search: ProductSearch, offset = 0): string {
  const choices = new URLSearchParams();
  const add = (name: string, value: string | number | boolean | null) => {
    if (value !== null) {
      choices.append(name, String(value));
    }
  };
  add("product", search.product);
  search.maturity.forEach((maturity) => add("maturity", maturity));
  if (search.area?.kind === "rectangle") {
    add("west", search.area.west);
    add("south", search.area.south);
    add("east", search.area.east);
    add("north", search.area.north);
  } else if (search.area) {
    search.area.rings.forEach((ring) => add("polygon", ringText(ring)));
  }
  add("start", search.start);
  add("end", search.end);
  if (search.season) {
    add("season_start", search.season[0]);
    add("season_end", search.season[1]);
  }
  if (search.pairInside) {
    add("pair", "inside");
  }
  add("track", search.track && spanText(search.track));
  add("frame", search.frame && spanText(search.frame));
  add("orbit", search.orbit && spanText(search.orbit));
  add("direction", search.direction);
  search.channels.forEach((channel) => add("channel", channel));
  search.sideChannels.forEach((channel) => add("side_channel", channel));
  search.bands.forEach((band) => add("band", band));
  add("bandwidth", search.bandwidth);
  add("coverage", search.coverage);
  add("joint", search.joint);
  add("cycle", search.cycle);
  search.names.forEach((name) => add("name", name));
  if (search.sort !== "newest") {
    add("sort", search.sort);
  }
  if (offset > 0) {
    add("offset", offset);
  }
  return `/api/products?${choices.toString()}`;
}

/**
 * Ask the server for the products of a search, from the given number of products onwards. The promise is
 * rejected with an error whose message can be shown to the user.
 */
export function findProducts(search: ProductSearch, offset = 0, signal?: AbortSignal): Promise<ProductsFound> {
  return ask(searchAddress(search, offset), isProductsFound, signal);
}

function list(words: readonly string[]): string {
  return words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1) ?? ""}`;
}

/**
 * State in words what a search asked for: one sentence for the products, the area and the period, and one for
 * each kind of further choice. The order of the products is not part of the statement.
 */
export function describeSearch(search: ProductSearch): string[] {
  const maturity = list(search.maturity.map((level) => level.toLowerCase()));
  if (search.names.length > 0) {
    const count = search.names.length === 1 ? "1 product name" : `${String(search.names.length)} product names`;
    return [`Products of every type (${maturity}) that match ${count}: ${search.names.join(", ")}.`];
  }
  const type = search.product ? `${search.product} (${PRODUCT_NAMES[search.product]})` : "Products of every type";
  const period =
    search.start && search.end ? `from ${formatDay(search.start)} to ${formatDay(search.end)}` : "of every date";
  const place = search.area ? `in ${describeArea(search.area)}` : "over the whole Earth";
  const sentences = [`${type}, ${maturity}, ${place}, ${period}.`];
  if (search.season) {
    const [first, last] = search.season.map((day) => formatSeasonDay(seasonDay(day)));
    sentences.push(`Only from ${first ?? ""} to ${last ?? ""} of each year.`);
  }
  if (search.pairInside) {
    sentences.push("Both acquisitions of a pair lie inside the period.");
  }
  const limits = [
    search.track && `track ${spanText(search.track)}`,
    search.frame && `frame ${spanText(search.frame)}`,
    search.direction,
    search.cycle !== null && `cycle ${String(search.cycle)}`,
    search.orbit && `orbit ${spanText(search.orbit)}`,
    search.channels.length > 0 && `${list(search.channels)} in band A`,
    search.sideChannels.length > 0 && `${list(search.sideChannels)} in band B`,
    search.bands.length > 0 && `band ${list(search.bands)}`,
    search.bandwidth !== null && `bandwidth ${String(search.bandwidth)} MHz`,
    search.coverage && `${search.coverage} frame`,
    search.joint !== null && (search.joint ? "observed with the S-band radar" : "not observed with the S-band radar"),
  ].filter((limit): limit is string => typeof limit === "string");
  if (limits.length > 0) {
    sentences.push(`Limited to: ${limits.join("; ")}.`);
  }
  return sentences;
}
