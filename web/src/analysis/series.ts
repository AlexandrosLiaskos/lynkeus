import { formatDay } from "../data/products";
import { parseAngle } from "../map/coordinates";
import type { LayerDescription } from "../shared/layer";
import type { SeriesInputs } from "../shared/series";
import {
  accepted,
  acquisitionOf,
  acquisitionWords,
  componentsOf,
  defaultTitle,
  FINISHED_TOOLS,
  hasFrequency,
  MOST_TITLE,
  type FinishedTool,
} from "./tools";

/**
 * The analysis tools of the kind Series that are finished, by the names of their buttons. The server offers a
 * process of the same name for each of them, whose result is a series and not a layer. Each one has a method
 * sheet in `docs/methods/`.
 */
export const SERIES_TOOLS = ["backscatter-series", "coherence-series", "displacement-series"] as const;
export type SeriesTool = (typeof SERIES_TOOLS)[number];

/** Every finished tool that has a method sheet, in the order of the page Methods: the maps, then the series. */
export const SHEET_TOOLS = [...FINISHED_TOOLS, ...SERIES_TOOLS] as const;
export type SheetTool = (typeof SHEET_TOOLS)[number];

/**
 * The tool of one date, or of one pair, that reads the same layers as each Series tool: the server makes the
 * same checks on each layer of a series (`api/src/lynkeus/analysis/series.py`).
 */
export const READS_AS: Record<SeriesTool, FinishedTool> = {
  "backscatter-series": "backscatter-state",
  "coherence-series": "coherence-state",
  "displacement-series": "displacement-state",
};

/**
 * Tell whether the values of a Series tool are relative to a reference point that the visitor gives. Surface
 * displacement, Series is such a tool: it gives the series of a point only, because the mean of an area of values
 * relative to one point has no meaning of its own (`docs/methods/displacement-series.md`). Its form takes the
 * layers `unwrappedPhase` of the pairs and finds the layer `connectedComponents` of each product, as the form of
 * Surface displacement, One pair does.
 */
export function isRelative(tool: SeriesTool): boolean {
  return tool === "displacement-series";
}

/**
 * The two start times in the name of the product file of a pair: of the reference and of the secondary
 * acquisition (SDS Product File Naming Conventions, JPL D-102255 Rev C, section 3.8). The server reads them with
 * the same pattern, in `api/src/lynkeus/analysis/displacement.py`.
 */
const PAIR_TIMES = /_(\d{4})(\d{2})(\d{2})T\d{6}_\d{8}T\d{6}_(\d{4})(\d{2})(\d{2})T\d{6}_\d{8}T\d{6}_/;

/** Return the two dates of the product file of a pair as year-month-day, or no date for a name of another form. */
export function pairDatesOf(file: string): string[] {
  const found = PAIR_TIMES.exec(file);
  return found
    ? [`${found[1] ?? ""}-${found[2] ?? ""}-${found[3] ?? ""}`, `${found[4] ?? ""}-${found[5] ?? ""}-${found[6] ?? ""}`]
    : [];
}

/** Tell whether pairs of dates link all their dates into one network, through pairs that share a date. */
export function linksAllDates(pairs: readonly (readonly string[])[]): boolean {
  const days = [...new Set(pairs.flat())];
  const reached = new Set(days.slice(0, 1));
  let grown = true;
  while (grown) {
    grown = false;
    for (const pair of pairs) {
      if (pair.some((day) => reached.has(day)) && !pair.every((day) => reached.has(day))) {
        pair.forEach((day) => reached.add(day));
        grown = true;
      }
    }
  }
  return reached.size === days.length;
}

/** The smallest and the largest number of layers of one series, as the server takes them (`SeriesInputs`). */
export const FEWEST_LAYERS = 2;
export const MOST_LAYERS = 50;

/**
 * The release of the processing software at the end of the name of a product file, the composite release
 * identifier (SDS Product File Naming Conventions, JPL D-102255 Rev C, section 4.1). Its first three characters
 * are the environment and the major release. The server reads it with the same pattern, in
 * `api/src/lynkeus/analysis/series.py`.
 */
const RELEASE = /_(([A-Z]\d{2})\d{3})_[A-Z]_[A-Z]_[A-Z]_\d{3}(?:\.h5)?$/;

/** Return the environment and the major release of the product of a layer, for example "P05", or null. */
export function majorRelease(layer: LayerDescription): string | null {
  return RELEASE.exec(layer.inputs[0] ?? "")?.[2] ?? null;
}

/** The dates of a layer as one text, so that the order of the texts is the order in time. */
function datesKey(layer: LayerDescription): string {
  return layer.dates.join(" ");
}

/** Write the dates of a layer for reading: "21 Oct 2026", or "9 Oct 2026 to 21 Oct 2026" for a pair. */
export function daysWords(dates: readonly string[]): string {
  return dates.map(formatDay).join(" to ");
}

/** Layers that a Series tool can read together: the same layer of products of one acquisition and release. */
export interface SeriesGroup {
  /** A text that names the group among the groups of the session. */
  key: string;
  /** The name of the group in the field Layer. */
  name: string;
  /** The layers of the group, the earliest dates first. */
  layers: readonly LayerDescription[];
}

/**
 * Divide the layers that a Series tool reads into the groups that it can read together: the same layer inside
 * the product, of products of the same instrument, track, direction of the orbit, frame and major release of
 * the processing software. These are the checks of the server on the layers of one series. A group needs two
 * layers of different dates, so a smaller group is left out. The groups stand in the order of their names.
 */
export function seriesGroups(tool: SeriesTool, layers: readonly LayerDescription[]): SeriesGroup[] {
  const groups = new Map<string, { name: string; layers: LayerDescription[] }>();
  for (const layer of accepted(READS_AS[tool], layers)) {
    const acquisition = acquisitionOf(layer.inputs[0] ?? "");
    const major = majorRelease(layer);
    if (!acquisition || major === null || typeof layer.layer !== "string") {
      continue;
    }
    const { instrument, track, direction, frame } = acquisition;
    const key = [layer.layer, instrument, String(track), direction, String(frame), major].join(" ");
    const group = groups.get(key);
    if (group) {
      group.layers.push(layer);
    } else {
      groups.set(key, { name: `${layer.layer}, ${acquisitionWords(layer)}, release ${major}`, layers: [layer] });
    }
  }
  return [...groups]
    .map(([key, { name, layers: members }]) => ({
      key,
      name,
      layers: [...members].sort((a, b) => datesKey(a).localeCompare(datesKey(b))),
    }))
    .filter((group) => new Set(group.layers.map(datesKey)).size >= FEWEST_LAYERS)
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}

/**
 * Return the layers of a group that the form chooses at first: every layer, and of two layers of the same
 * dates the first one, up to the largest number of layers of a series.
 */
export function firstChoice(group: SeriesGroup): string[] {
  const seen = new Set<string>();
  const chosen: string[] = [];
  for (const layer of group.layers) {
    if (!seen.has(datesKey(layer)) && chosen.length < MOST_LAYERS) {
      seen.add(datesKey(layer));
      chosen.push(layer.id);
    }
  }
  return chosen;
}

/**
 * Propose the name of a series from its layers, which stand in the order of their dates: the quantity and the
 * channel, as the tool of one date names them, and the first and the last date. The name is empty without layers.
 */
export function seriesTitle(tool: SeriesTool, layers: readonly LayerDescription[]): string {
  const first = layers[0];
  const last = layers.at(-1);
  if (!first || !last) {
    return "";
  }
  const one = defaultTitle(READS_AS[tool], [first]);
  const head = one.slice(0, one.length - daysWords(first.dates).length - 2);
  const from = formatDay(first.dates[0] ?? "");
  const to = formatDay(last.dates.at(-1) ?? "");
  return `Series of ${head.charAt(0).toLowerCase()}${head.slice(1)}, ${from} to ${to}`;
}

/** Where a series is computed: the mean of the whole area of the layers, or the cell that holds a point. */
export const PLACES = { area: "Whole area", point: "At a point" } as const;
export type Place = keyof typeof PLACES;

/**
 * The faults of the two fields of the point, in the words of the pane Go to coordinates (`GO_TO_FAULTS` in
 * `web/src/map/GoToPane.tsx`). A test requires the two to be equal.
 */
export const ANGLE_FAULTS = {
  latitude: "Enter the latitude in degrees, from 90 S to 90 N, for example 42.8 N or 42° 48′ 30″ N.",
  longitude: "Enter the longitude in degrees, from 180 W to 180 E, for example 70.9 W or 70° 54′ 00″ W.",
} as const;

/** The faults of the two fields of the reference point of Surface displacement, Series. */
export const REFERENCE_FAULTS = {
  latitude: "Enter the latitude of the reference point in degrees, from 90 S to 90 N, for example 42.8 N.",
  longitude: "Enter the longitude of the reference point in degrees, from 180 W to 180 E, for example 70.9 W.",
} as const;

/** Why the tool cannot run while the session holds no two layers that it reads together. */
export const NO_LAYERS = "No two layers of this session can be used together by the tool.";

/** The fault of the layers of Surface displacement, Series when a chosen layer has no frequency of the radar. */
export function noFrequencySentence(layer: LayerDescription): string {
  return `The layer "${layer.title}" does not record the frequency of the radar, so get it again with Get layer.`;
}

/** The fault of the layers of Surface displacement, Series when the session lacks the partner of a chosen layer. */
export function noComponentsSentence(layer: LayerDescription): string {
  return `The Connected components layer of the product of "${layer.title}" is not in the session.`;
}

/** The fault of the layers of Surface displacement, Series when the chosen layers have two radar frequencies. */
export const FREQUENCIES =
  "The chosen layers were acquired at different radar frequencies, so choose layers of one frequency.";

/** The fault of the layers of Surface displacement, Series when the chosen pairs do not link all their dates. */
export const UNLINKED = "The chosen pairs do not link all their dates into one network, so add a pair that joins them.";

/** What the form of a Series tool holds at one moment. */
export interface SeriesChoices {
  /** The layers of the group that the form shows, the earliest dates first. */
  group: readonly LayerDescription[];
  /** The ids of the layers that are chosen. */
  chosen: readonly string[];
  place: Place;
  /** The latitude and the longitude of the point, as the fields hold them. */
  latitude: string;
  longitude: string;
  /** The name of the series, as the field holds it. */
  title: string;
  /**
   * For a tool whose values are relative to a reference point (`isRelative`): the layers of the session, among
   * which the form finds the layer `connectedComponents` of each chosen layer, and the latitude and the longitude
   * of the reference point, as the fields hold them. The place of such a series is always a point.
   */
  relative?: {
    session: readonly LayerDescription[];
    latitude: string;
    longitude: string;
  };
}

/** What is wrong with each field of the form, in one sentence, or null for a field that is in order. */
export interface SeriesFaults {
  layers: string | null;
  latitude: string | null;
  longitude: string | null;
  /** The faults of the fields of the reference point, for a tool whose values are relative to one. */
  referenceLatitude?: string | null;
  referenceLongitude?: string | null;
  title: string | null;
}

/** The outcome of the check of the choices: the layers in the order of their dates, and the faults of the fields. */
export interface SeriesChecked {
  layers: readonly LayerDescription[];
  faults: SeriesFaults;
  /** What the form sends, or null while a field has a fault. */
  inputs: SeriesInputs | null;
}

/**
 * Return the fault of the layers of Surface displacement, Series, or null: each chosen layer `unwrappedPhase`
 * must record the frequency of the radar, the session must hold the layer `connectedComponents` of its product,
 * the layers must share one frequency, and the pairs must link all their dates into one network. The server
 * makes the same checks, in `api/src/lynkeus/analysis/displacement.py`.
 */
function relativeFault(layers: readonly LayerDescription[], session: readonly LayerDescription[]): string | null {
  const silent = layers.find((layer) => !hasFrequency(layer));
  if (silent) {
    return noFrequencySentence(silent);
  }
  const alone = layers.find((layer) => componentsOf(layer, session).length === 0);
  if (alone) {
    return noComponentsSentence(alone);
  }
  if (new Set(layers.map((layer) => layer.frequency)).size > 1) {
    return FREQUENCIES;
  }
  return linksAllDates(layers.map((layer) => layer.dates)) ? null : UNLINKED;
}

/**
 * Check the choices of the form of a Series tool. A series takes 2 to 50 layers of the group, each of other
 * dates. At a point, the latitude and the longitude must be angles in degrees. The name of the series must have
 * 1 to 200 characters. Whether the point lies inside the area of the layers is checked by the server. A series
 * relative to a reference point is a series at a point, and it needs the reference point as well; its layers must
 * pass the checks of `relativeFault`, and the form sends beside each chosen layer the layer `connectedComponents`
 * of its product.
 */
export function checkSeries({
  group,
  chosen,
  place,
  latitude,
  longitude,
  title,
  relative,
}: SeriesChoices): SeriesChecked {
  const layers = group.filter((layer) => chosen.includes(layer.id));
  const faults: SeriesFaults = { layers: null, latitude: null, longitude: null, title: null };
  if (layers.length < FEWEST_LAYERS) {
    faults.layers = "Choose at least two layers.";
  } else if (layers.length > MOST_LAYERS) {
    faults.layers = `Choose at most ${String(MOST_LAYERS)} layers.`;
  } else if (new Set(layers.map(datesKey)).size < layers.length) {
    faults.layers = "Two of the chosen layers have the same dates. Choose one of them.";
  } else if (relative) {
    faults.layers = relativeFault(layers, relative.session);
  }
  const atPoint = relative !== undefined || place === "point";
  const north = atPoint ? parseAngle(latitude, "latitude") : null;
  const east = atPoint ? parseAngle(longitude, "longitude") : null;
  if (atPoint) {
    faults.latitude = north === null ? ANGLE_FAULTS.latitude : null;
    faults.longitude = east === null ? ANGLE_FAULTS.longitude : null;
  }
  const baseNorth = relative ? parseAngle(relative.latitude, "latitude") : null;
  const baseEast = relative ? parseAngle(relative.longitude, "longitude") : null;
  if (relative) {
    faults.referenceLatitude = baseNorth === null ? REFERENCE_FAULTS.latitude : null;
    faults.referenceLongitude = baseEast === null ? REFERENCE_FAULTS.longitude : null;
  }
  const name = title.trim();
  if (name === "") {
    faults.title = "Give a name.";
  } else if (name.length > MOST_TITLE) {
    faults.title = `The name is longer than ${String(MOST_TITLE)} characters.`;
  }
  const sound = Object.values(faults).every((fault) => fault === null || fault === undefined);
  const session = relative?.session ?? [];
  const sent = relative
    ? layers.flatMap((layer) => [
        layer.id,
        ...componentsOf(layer, session)
          .slice(0, 1)
          .map(({ id }) => id),
      ])
    : layers.map((layer) => layer.id);
  const inputs: SeriesInputs | null = sound
    ? {
        inputs: sent,
        title: name,
        ...(north !== null && east !== null ? { point: { longitude: east, latitude: north } } : {}),
        ...(baseNorth !== null && baseEast !== null ? { reference: { longitude: baseEast, latitude: baseNorth } } : {}),
      }
    : null;
  return { layers, faults, inputs };
}

/** Return the first fault of the form in the order of its fields, or null when the tool can run. */
export function missingOfSeries({
  layers,
  latitude,
  longitude,
  referenceLatitude,
  referenceLongitude,
  title,
}: SeriesFaults): string | null {
  return layers ?? latitude ?? longitude ?? referenceLatitude ?? referenceLongitude ?? title;
}
