import type OlMap from "ol/Map";
import { areaStore } from "../shared/area";
import { PRODUCT_TYPES } from "../shared/layer";
import { keepInBrowser } from "../shared/storage/storage";
import { rectangleText } from "./AreaFields";
import { daysOfMonth, PERIODS, periodDays } from "./period";
import { BANDS, BANDWIDTHS, CHANNELS, MATURITIES } from "./products";
import { firstDraft, type SearchDraft } from "./search";
import { areaFault, viewArea } from "./searchArea";
import { searchDraftStore } from "./state";

/** The name under which the form of the search is kept in the local storage of the browser. */
export const SEARCH_KEY = "lynkeus.search";

/** The largest number of characters of a field that takes a number or a range, and of the field of the names. */
const FIELD_LENGTH = 40;
const NAMES_LENGTH = 20_000;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The fields of the form, by name. A stored form holds each of them and no other. */
const FIELDS = [
  "by",
  "product",
  "maturity",
  "limited",
  "area",
  "period",
  "start",
  "end",
  "season",
  "pairInside",
  "track",
  "frame",
  "orbit",
  "cycle",
  "direction",
  "channels",
  "sideChannels",
  "bands",
  "bandwidth",
  "coverage",
  "joint",
  "names",
] as const satisfies readonly (keyof SearchDraft)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf(value: unknown, choices: readonly unknown[]): boolean {
  return choices.includes(value);
}

/** Tell whether a value is a list whose items are all among the choices, each at most once. */
function isListOf(value: unknown, choices: readonly unknown[]): boolean {
  return Array.isArray(value) && value.every((item) => choices.includes(item)) && new Set(value).size === value.length;
}

function isShortText(value: unknown, length = FIELD_LENGTH): boolean {
  return typeof value === "string" && value.length <= length;
}

/** Tell whether a value is a day of a season: a month from 1 to 12 and a day of that month. */
function isSeasonDay(value: unknown): boolean {
  if (!isRecord(value) || Object.keys(value).length !== 2) {
    return false;
  }
  const { month, day } = value;
  return (
    typeof month === "number" &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12 &&
    typeof day === "number" &&
    Number.isInteger(day) &&
    day >= 1 &&
    day <= daysOfMonth(month)
  );
}

/** Tell whether a value is a point: a longitude and a latitude, in degrees. */
function isPoint(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 2) {
    return false;
  }
  const [longitude, latitude] = value as unknown[];
  return (
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    Math.abs(longitude) <= 360 &&
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    Math.abs(latitude) <= 90
  );
}

/**
 * Tell whether a value is the area of a form: the four sides of a rectangle as text, or polygons of points, of
 * the numbers that a search takes.
 */
function isDraftArea(value: unknown): value is SearchDraft["area"] {
  if (!isRecord(value)) {
    return false;
  }
  if (value.kind === "rectangle") {
    return (
      Object.keys(value).length === 5 &&
      [value.west, value.south, value.east, value.north].every((side) => isShortText(side))
    );
  }
  const { rings } = value;
  return (
    value.kind === "polygons" &&
    Object.keys(value).length === 2 &&
    Array.isArray(rings) &&
    rings.every((ring) => Array.isArray(ring) && ring.every(isPoint)) &&
    areaFault({ kind: "polygons", rings: rings as [number, number][][] }) === null
  );
}

/**
 * Tell whether a value that was read from the storage is the form of the search: it holds every field of the
 * form and no other, and each field has its type and one of its choices. A text is checked for its length only,
 * because the form shows it as the user typed it and the search checks it again.
 */
export function isSearchDraft(value: unknown): value is SearchDraft {
  if (!isRecord(value)) {
    return false;
  }
  const names = Object.keys(value);
  if (names.length !== FIELDS.length || FIELDS.some((field) => !names.includes(field))) {
    return false;
  }
  const { season } = value;
  return (
    isOneOf(value.by, ["properties", "names"]) &&
    isOneOf(value.product, PRODUCT_TYPES) &&
    isListOf(value.maturity, MATURITIES) &&
    typeof value.limited === "boolean" &&
    isDraftArea(value.area) &&
    PERIODS.some(({ id }) => id === value.period) &&
    [value.start, value.end].every((day) => typeof day === "string" && (day === "" || DAY.test(day))) &&
    (season === null ||
      (isRecord(season) && Object.keys(season).length === 2 && isSeasonDay(season.start) && isSeasonDay(season.end))) &&
    typeof value.pairInside === "boolean" &&
    [value.track, value.frame, value.orbit, value.cycle].every((text) => isShortText(text)) &&
    isOneOf(value.direction, ["", "ascending", "descending"]) &&
    isListOf(value.channels, CHANNELS) &&
    isListOf(value.sideChannels, CHANNELS) &&
    isListOf(value.bands, BANDS) &&
    isOneOf(value.bandwidth, ["", ...BANDWIDTHS]) &&
    isOneOf(value.coverage, ["", "full", "partial"]) &&
    isOneOf(value.joint, ["", "yes", "no"]) &&
    isShortText(value.names, NAMES_LENGTH)
  );
}

/**
 * The form of the search as a part of the work that the browser keeps. It is stored after every change, and it
 * is not restored when the page opens: the area of the search is a layer of the map, which must not show before
 * the user opens the search. `startDraft` gives the stored form when a pane first needs the form.
 */
const kept = keepInBrowser<SearchDraft>({
  key: SEARCH_KEY,
  title: "Search form",
  description:
    "The choices of the form of the search with its area, which return when the search pane or the pane Get layer is first opened.",
  read: () => searchDraftStore.get() ?? undefined,
  check: (stored) => (isSearchDraft(stored) ? stored : undefined),
  subscribe: searchDraftStore.subscribe,
});

/**
 * Return the form with which the search starts when its pane, or the pane Get layer, is first opened: the form
 * that the browser keeps or, without one, the first form in the area of the Map tab or in the view of the map.
 * A stored form with one of the offered periods takes the days of that period as they are today.
 */
export function startDraft(map: OlMap, today = new Date()): SearchDraft {
  const stored = kept.stored();
  return stored
    ? { ...stored, ...periodDays(stored.period, today) }
    : firstDraft(rectangleText(areaStore.get() ?? viewArea(map)), today);
}
