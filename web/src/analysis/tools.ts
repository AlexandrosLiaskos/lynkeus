// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { formatDay } from "../data/products";
import type { LayerDescription } from "../shared/layer";

/**
 * The analysis tools that are finished, by the names of their buttons. The server offers a process of the same
 * name for each of them. Each one has a method sheet in `docs/methods/`.
 */
export const FINISHED_TOOLS = [
  "backscatter-state",
  "backscatter-change",
  "coherence-state",
  "coherence-change",
  "displacement-state",
  "soil-moisture-state",
  "soil-moisture-change",
] as const;
export type FinishedTool = (typeof FINISHED_TOOLS)[number];

/**
 * The diagonal terms of the covariance matrix of a GCOV product, which the two backscatter tools read
 * (`docs/methods/backscatter-state.md`, section Input layers). The server accepts the same names, in
 * `api/src/lynkeus/analysis/backscatter.py`.
 */
export const BACKSCATTER_TERMS = ["HHHH", "HVHV", "VHVH", "VVVV", "RHRH", "RVRV"] as const;

/**
 * The names of the four layers `coherenceMagnitude` of a GUNW product, as a layer request gives them: the group
 * of the interferogram, the channel and the name of the layer (`docs/methods/coherence-state.md`, section Input
 * layer). The two coherence tools read them. The server accepts the same names, in
 * `api/src/lynkeus/analysis/coherence.py`.
 */
const COHERENCE_LAYER = /^(unwrappedInterferogram|wrappedInterferogram)\/(HH|VV)\/coherenceMagnitude$/;

/** The spacing of the cells of the two coherence layers of a GUNW product, by the group of the interferogram. */
const COHERENCE_SPACING: Record<string, string> = { unwrappedInterferogram: "80 m", wrappedInterferogram: "20 m" };

/**
 * The names of the layers `unwrappedPhase` and `connectedComponents` of a GUNW product, as a layer request gives
 * them: the group of the unwrapped interferogram, the channel and the name of the layer
 * (`docs/methods/displacement-state.md`, section Input layers). Surface displacement, One pair reads them. The
 * server accepts the same names, in `api/src/lynkeus/analysis/displacement.py`.
 */
const PHASE_LAYER = /^unwrappedInterferogram\/(HH|VV)\/unwrappedPhase$/;
const COMPONENTS_LAYER = /^unwrappedInterferogram\/(HH|VV)\/connectedComponents$/;

/**
 * The name of the layer of the soil moisture of an SME2 product, which the two soil moisture tools read, and the
 * unit that its layer description carries (`docs/methods/soil-moisture-state.md`, section Input layer). The
 * server accepts the same name and the same unit, in `api/src/lynkeus/analysis/soil_moisture.py`.
 */
export const SOIL_MOISTURE_LAYER = "soilMoisture";
export const SOIL_MOISTURE_UNIT = "m3 m-3";

/**
 * The name of the layer of an SME2 product whose lowest bit marks the cells where the mission does not recommend
 * the retrieval of the soil moisture (`docs/methods/soil-moisture-state.md`, section Input layers). The soil
 * moisture tools take it beside each layer of the soil moisture and leave those cells out. The server reads the same
 * name, in `api/src/lynkeus/analysis/soil_moisture.py`.
 */
export const QUALITY_FLAG_LAYER = "retrievalQualityFlag";

/** The largest length of the name of a result, in characters, as the server takes it (`MAX_TITLE_LENGTH`). */
export const MOST_TITLE = 200;

/** A layer that a tool reads: the unit of its description and its name inside the product. */
interface Kind {
  /** The unit that the description of the layer carries. */
  unit: string;
  /** Tells whether the tool reads the layer of this name inside the product. */
  names: (name: string) => boolean;
}

/** What a tool reads. `unit` and `names` describe each input layer, or the first one of a tool with `beside`. */
interface Reads extends Kind {
  /** The type of the NISAR product of each input layer. */
  product: "GCOV" | "GUNW" | "SME2";
  /** The number of input layers. */
  count: 1 | 2;
  /** The number of dates of each input layer: one for an acquisition, two for a pair. */
  dates: 1 | 2;
  /**
   * The second input layer of a tool whose two inputs are two different layers of one product file. A tool of
   * two inputs without it compares the same layer of two dates or of two pairs of dates.
   */
  beside?: Kind;
  /**
   * The layer of the same product file that the tool takes after each input layer, which the form finds by itself:
   * the retrieval quality flag of an SME2 product. `count` does not count it.
   */
  quality?: Kind;
}

function isTerm(name: string): boolean {
  return BACKSCATTER_TERMS.some((term) => term === name);
}

function isCoherence(name: string): boolean {
  return COHERENCE_LAYER.test(name);
}

function isSoilMoisture(name: string): boolean {
  return name === SOIL_MOISTURE_LAYER;
}

function isQualityFlag(name: string): boolean {
  return name === QUALITY_FLAG_LAYER;
}

/** The retrieval quality flag that the soil moisture tools take beside each layer of the soil moisture. */
const QUALITY: Kind = { unit: "1", names: isQualityFlag };

function isPhase(name: string): boolean {
  return PHASE_LAYER.test(name);
}

function isComponents(name: string): boolean {
  return COMPONENTS_LAYER.test(name);
}

/** What each finished tool reads, as its method sheet states it. */
export const READS: Record<FinishedTool, Reads> = {
  "backscatter-state": { product: "GCOV", count: 1, dates: 1, unit: "1", names: isTerm },
  "backscatter-change": { product: "GCOV", count: 2, dates: 1, unit: "1", names: isTerm },
  "coherence-state": { product: "GUNW", count: 1, dates: 2, unit: "1", names: isCoherence },
  "coherence-change": { product: "GUNW", count: 2, dates: 2, unit: "1", names: isCoherence },
  "displacement-state": {
    product: "GUNW",
    count: 2,
    dates: 2,
    unit: "rad",
    names: isPhase,
    beside: { unit: "1", names: isComponents },
  },
  "soil-moisture-state": {
    product: "SME2",
    count: 1,
    dates: 1,
    unit: SOIL_MOISTURE_UNIT,
    names: isSoilMoisture,
    quality: QUALITY,
  },
  "soil-moisture-change": {
    product: "SME2",
    count: 2,
    dates: 1,
    unit: SOIL_MOISTURE_UNIT,
    names: isSoilMoisture,
    quality: QUALITY,
  },
};

/**
 * What a tool of two inputs compares: the layers of two dates ("dates") or the layers of two pairs of dates
 * ("pairs"). A tool of one input compares nothing, and neither does Surface displacement, One pair, whose two
 * inputs are two layers of one product; the answer is null for them.
 */
export type Comparison = "dates" | "pairs";

/** Return what a tool compares, or null for a tool that compares nothing. */
export function comparisonOf(tool: FinishedTool): Comparison | null {
  const { count, dates, beside } = READS[tool];
  if (count === 1 || beside) {
    return null;
  }
  return dates === 1 ? "dates" : "pairs";
}

/**
 * The start of the name of a NISAR product file: the mission, the instrument and the level, the processing type,
 * the product type, the cycle, the track, the direction of the orbit and the frame (SDS Product File Naming
 * Conventions, JPL D-102255 Rev C, sections 3.7 and 3.8). The server reads the same fields with the same
 * pattern, in `api/src/lynkeus/analysis/inputs.py`.
 */
const PRODUCT_FILE = /^NISAR_([LS])\d_(?:PR|UR|OD)_([A-Z0-9]{4})_\d{3}_(\d{3})_([AD])_(\d{3})_/;

/** Where and with which instrument a product was acquired, and its type, as the name of its file states them. */
export interface Acquisition {
  /** `L` for L-SAR, `S` for S-SAR. */
  instrument: string;
  /** The product type, for example `GCOV`. */
  product: string;
  track: number;
  /** `A` for an ascending orbit, `D` for a descending one. */
  direction: string;
  frame: number;
}

/** Read the acquisition from the name of a product file, or return null for a name of another form. */
export function acquisitionOf(file: string): Acquisition | null {
  const found = PRODUCT_FILE.exec(file);
  if (!found) {
    return null;
  }
  const [, instrument = "", product = "", track = "", direction = "", frame = ""] = found;
  return { instrument, product, track: Number(track), direction, frame: Number(frame) };
}

/** Return the acquisition of a layer that was received from one product file, or null for any other layer. */
function acquisitionOfLayer(layer: LayerDescription): Acquisition | null {
  const [file] = layer.inputs;
  return layer.kind === "layer" && layer.inputs.length === 1 && file !== undefined ? acquisitionOf(file) : null;
}

/**
 * The name of the product file of a pair of dates up to the bandwidth mode code of its two bands: four digits
 * after the second cycle number, which state the width of the frequency band that the radar used (the same
 * naming conventions, section 3.8). The server reads the code with the same pattern, in
 * `api/src/lynkeus/analysis/coherence.py`.
 */
const PAIR_FILE = /^NISAR_[LS]\d_[A-Z]{2}_[A-Z0-9]{4}_\d{3}_\d{3}_[AD]_\d{3}_\d{3}_(\d{4})_/;

/** Read the bandwidth mode code from the name of the product file of a pair, or return null for another name. */
export function bandwidthModeOf(file: string): string | null {
  return PAIR_FILE.exec(file)?.[1] ?? null;
}

/**
 * Why a tool does not read a layer: it is not a layer received from one product of the type that the tool
 * reads ("product"), its description does not record its name inside the product ("unnamed"), that name is not
 * one that the tool reads ("name"), it does not carry the unit of the tool ("unit"), or it does not have the
 * number of dates of the tool ("dates"). The checks stand in the order in which the server makes them, in
 * `api/src/lynkeus/analysis/inputs.py`.
 */
export type Unfit = "product" | "unnamed" | "name" | "unit" | "dates";

/** Return why a layer is not the layer of one kind that a tool reads, or null for a layer that is. */
function unfitAs(tool: FinishedTool, kind: Kind, layer: LayerDescription): Unfit | null {
  const reads = READS[tool];
  if (acquisitionOfLayer(layer)?.product !== reads.product) {
    return "product";
  }
  if (typeof layer.layer !== "string") {
    return "unnamed";
  }
  if (!kind.names(layer.layer)) {
    return "name";
  }
  if (layer.unit !== kind.unit) {
    return "unit";
  }
  return layer.dates.length === reads.dates ? null : "dates";
}

/**
 * Return why a tool does not read a layer as its first input, or null for a layer that it reads. The first input
 * of Surface displacement, One pair is the layer `unwrappedPhase`.
 */
export function unfit(tool: FinishedTool, layer: LayerDescription): Unfit | null {
  return unfitAs(tool, READS[tool], layer);
}

/** Return the layers that a tool reads, in the order of the list. */
export function accepted(tool: FinishedTool, layers: readonly LayerDescription[]): LayerDescription[] {
  return layers.filter((layer) => unfit(tool, layer) === null);
}

/**
 * Return the number of layers that a tool could read if their descriptions recorded their names inside the
 * product: the layers received from one product of the type of the tool, with the unit and the number of dates
 * of the tool, whose description has no name. The server records the name for the layers that it
 * receives; a layer stored before it did so has null or no field, and the server refuses it.
 */
export function unnamed(tool: FinishedTool, layers: readonly LayerDescription[]): number {
  return layers.filter(
    (layer) =>
      unfit(tool, layer) === "unnamed" && layer.unit === READS[tool].unit && layer.dates.length === READS[tool].dates,
  ).length;
}

/**
 * Tell whether two layers can stand side by side as the two inputs of a tool that compares: two different
 * layers of the same name inside the product, and of products of the same instrument, track, direction of the
 * orbit and frame.
 */
export function matches(first: LayerDescription, second: LayerDescription): boolean {
  const one = acquisitionOfLayer(first);
  const other = acquisitionOfLayer(second);
  return (
    first.id !== second.id &&
    typeof first.layer === "string" &&
    first.layer === second.layer &&
    one !== null &&
    other !== null &&
    one.instrument === other.instrument &&
    one.track === other.track &&
    one.direction === other.direction &&
    one.frame === other.frame
  );
}

/** Return the layers that a tool reads and that can stand beside a layer as its second input. */
export function partners(
  tool: FinishedTool,
  first: LayerDescription,
  layers: readonly LayerDescription[],
): LayerDescription[] {
  return accepted(tool, layers).filter((layer) => matches(first, layer));
}

/** Return the channel of a layer `unwrappedPhase` or `connectedComponents`, for example `HH`, or null. */
function channelOf(layer: LayerDescription): string | null {
  const name = typeof layer.layer === "string" ? layer.layer : "";
  return (PHASE_LAYER.exec(name) ?? COMPONENTS_LAYER.exec(name))?.[1] ?? null;
}

/**
 * Return the layers that can stand beside a layer `unwrappedPhase` as the second input of Surface displacement,
 * One pair: the layers `connectedComponents` of the same product file and of the same channel. The server
 * refuses two layers of different product files or channels, in `api/src/lynkeus/analysis/displacement.py`.
 */
export function componentsOf(phase: LayerDescription, layers: readonly LayerDescription[]): LayerDescription[] {
  const kind = READS["displacement-state"].beside;
  const channel = channelOf(phase);
  return kind === undefined || channel === null
    ? []
    : layers.filter(
        (layer) =>
          unfitAs("displacement-state", kind, layer) === null &&
          layer.inputs[0] === phase.inputs[0] &&
          channelOf(layer) === channel,
      );
}

/**
 * Return the layers that can stand beside a first layer as the second input of a tool of two inputs: the same
 * layer of another date or pair for a tool that compares, and the layer `connectedComponents` of the product of
 * the first for Surface displacement, One pair.
 */
export function besideOf(
  tool: FinishedTool,
  first: LayerDescription,
  layers: readonly LayerDescription[],
): LayerDescription[] {
  return READS[tool].beside ? componentsOf(first, layers) : partners(tool, first, layers);
}

/**
 * Return the layer that a tool takes after an input layer, which the form finds by itself: the retrieval quality
 * flag of the same product file, or null when the session holds none or the tool takes none. When the session holds
 * more than one, the form takes the first of the list, which is the one received last. The server refuses a flag of
 * another product file, in `api/src/lynkeus/analysis/soil_moisture.py`.
 */
export function qualityOf(
  tool: FinishedTool,
  layer: LayerDescription,
  layers: readonly LayerDescription[],
): LayerDescription | null {
  const kind = READS[tool].quality;
  return kind === undefined
    ? null
    : (layers.find((other) => unfitAs(tool, kind, other) === null && other.inputs[0] === layer.inputs[0]) ?? null);
}

/**
 * Tell whether the description of a layer records the centre frequency of its radar band. The server records it
 * for a layer `unwrappedPhase` that it receives, and Surface displacement, One pair refuses a layer without it.
 */
export function hasFrequency(layer: LayerDescription): boolean {
  return typeof layer.frequency === "number";
}

/** Return the first date of a layer. Every layer description has at least one date. */
function dayOf(layer: LayerDescription): string {
  return layer.dates[0] ?? "";
}

/**
 * Return two layers with the layer of the earlier date first, as a tool that compares two dates takes them, or
 * null when the two layers have the same date. A date is written as year-month-day, so the order of the texts is the
 * order of the dates.
 */
export function inOrder(
  one: LayerDescription,
  other: LayerDescription,
): readonly [LayerDescription, LayerDescription] | null {
  if (dayOf(one) === dayOf(other)) {
    return null;
  }
  return dayOf(one) < dayOf(other) ? [one, other] : [other, one];
}

/** Return the earliest and the latest date of a layer. For a layer of one date the two are the same. */
function endsOf(layer: LayerDescription): readonly [string, string] {
  const days = [...layer.dates].sort();
  return [days[0] ?? "", days[days.length - 1] ?? ""];
}

/**
 * Return the layers of two pairs of dates with the earlier pair first, as Coherence, Change takes them: the pair
 * that ends on or before the first date of the other. Two pairs may share that date. The answer is null when
 * the intervals of the two pairs overlap, which is also the case of two layers of one pair.
 */
export function pairsInOrder(
  one: LayerDescription,
  other: LayerDescription,
): readonly [LayerDescription, LayerDescription] | null {
  const [oneStart, oneEnd] = endsOf(one);
  const [otherStart, otherEnd] = endsOf(other);
  if (oneEnd <= otherStart) {
    return [one, other];
  }
  return otherEnd <= oneStart ? [other, one] : null;
}

/** Return the number of days between the earliest and the latest date of a layer. */
export function spanOf(layer: LayerDescription): number {
  const [start, end] = endsOf(layer);
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
}

/** Return the bandwidth mode code of the product of a layer, or null when the name of its file holds none. */
function modeOfLayer(layer: LayerDescription): string | null {
  return bandwidthModeOf(layer.inputs[0] ?? "");
}

/** The fault of the second field when its layer has the date of the first, for a tool that compares two dates. */
export const SAME_DATE = "Choose a layer of another date.";

/** The fault of the second field of Coherence, Change when the intervals of the two pairs of dates overlap. */
export const OVERLAP = "Choose a pair of dates that does not overlap the pair of the first layer.";

/** The fault of the second field of Coherence, Change when the two products have different bandwidth modes. */
export function modesSentence(first: string, second: string): string {
  return `The two pairs were acquired with different radar bandwidths (mode codes ${first} and ${second}), and the tool compares pairs of one bandwidth.`;
}

/** The fault of the second field of Coherence, Change when the two pairs span different numbers of days. */
export function spansSentence(earlier: number, later: number): string {
  return `The two pairs span ${String(earlier)} and ${String(later)} days, and the tool compares pairs of the same number of days.`;
}

/**
 * Put two layers that stand side by side in the order in which a tool that compares takes them, the earlier
 * date or pair first, or say in one sentence why the tool does not compare them. The sentences cover the
 * refusals of the server that a visitor meets by choosing layers, in the order in which the server makes its
 * checks (`docs/methods/`, section What the tool refuses, of each tool): for two dates, the same date; for two
 * pairs of dates, different bandwidth modes, intervals that overlap, and different numbers of days.
 */
export function compared(
  tool: FinishedTool,
  one: LayerDescription,
  other: LayerDescription,
): readonly [LayerDescription, LayerDescription] | string {
  if (comparisonOf(tool) !== "pairs") {
    return inOrder(one, other) ?? SAME_DATE;
  }
  const first = modeOfLayer(one);
  const second = modeOfLayer(other);
  if (first !== null && second !== null && first !== second) {
    return modesSentence(first, second);
  }
  const ordered = pairsInOrder(one, other);
  if (!ordered) {
    return OVERLAP;
  }
  const [earlier, later] = ordered;
  return spanOf(earlier) === spanOf(later) ? ordered : spansSentence(spanOf(earlier), spanOf(later));
}

/** Name the acquisition of a layer for a list: its track, its frame and the direction of its orbit. */
export function acquisitionWords(layer: LayerDescription): string {
  const acquisition = acquisitionOfLayer(layer);
  if (!acquisition) {
    return "";
  }
  const { track, frame, direction } = acquisition;
  return `track ${String(track)}, frame ${String(frame)}, ${direction === "A" ? "ascending" : "descending"}`;
}

/** Name a layer in the list of a field: its name, and the acquisition of its product. */
export function layerOption(layer: LayerDescription): string {
  const words = acquisitionWords(layer);
  return words === "" ? layer.title : `${layer.title} (${words})`;
}

/** Write the dates of a layer for a name or a row: one date, or the two dates of a pair joined by "to". */
function daysOf(layer: LayerDescription): string {
  return layer.dates.map(formatDay).join(" to ");
}

/**
 * Write the dates of the input layers of a tool, which stand in the order in which the tool takes them: two
 * dates are joined by "to", and two pairs of dates by "then", each pair with its own "to".
 */
export function datesWords(tool: FinishedTool, inputs: readonly LayerDescription[]): string {
  return inputs.map(daysOf).join(comparisonOf(tool) === "pairs" ? ", then " : " to ");
}

/**
 * Propose the name of the result of a tool from its input layers, which stand in the order in which the tool
 * takes them: the quantity, the channel where the layer has one, and the date or dates. The name is empty while
 * an input is missing.
 */
export function defaultTitle(tool: FinishedTool, inputs: readonly LayerDescription[]): string {
  const [first] = inputs;
  if (typeof first?.layer !== "string" || inputs.length !== READS[tool].count) {
    return "";
  }
  const days = datesWords(tool, inputs);
  if (tool === "displacement-state") {
    // The two layers are of one product, so the dates of the first are the dates of the pair.
    return `Surface displacement ${channelOf(first) ?? ""}, ${daysOf(first)}`;
  }
  if (tool === "soil-moisture-state") {
    return `Volumetric soil moisture, ${days}`;
  }
  if (tool === "soil-moisture-change") {
    return `Change of soil moisture, ${days}`;
  }
  if (tool === "coherence-state" || tool === "coherence-change") {
    const [, group = "", channel = ""] = COHERENCE_LAYER.exec(first.layer) ?? [];
    const layer = `${channel}, ${COHERENCE_SPACING[group] ?? ""}`;
    return tool === "coherence-state"
      ? `Coherence magnitude ${layer}, ${days}`
      : `Change of coherence magnitude ${layer}, ${days}`;
  }
  // The first two letters of a diagonal term name its channel: the term HHHH is the term of the channel HH.
  const channel = first.layer.slice(0, 2);
  return tool === "backscatter-state"
    ? `Backscatter ${channel} in dB, ${days}`
    : `Change of backscatter ${channel} in dB, ${days}`;
}

/** Why the tool cannot run while the session holds no layer that it reads. The foot of the form states it. */
export const NO_INPUT = "No layer of this session can be used by the tool.";

/**
 * The fault of the second field of a tool that compares two dates when no layer of the session can stand beside
 * the first.
 */
export const NO_PARTNER = "No other date of this layer is in the session.";

/** The same fault for Coherence, Change, which compares two pairs of dates. */
export const NO_OTHER_PAIR = "No other pair of dates of this layer is in the session.";

/** The faults of the second field while it has no layer, by what the tool compares. */
const SECOND_FAULTS: Record<Comparison, { none: string; choose: string }> = {
  dates: { none: NO_PARTNER, choose: "Choose the layer of the other date." },
  pairs: { none: NO_OTHER_PAIR, choose: "Choose the layer of the other pair." },
};

/**
 * The fault of the first field of Surface displacement, One pair when the description of the chosen layer does
 * not record the centre frequency of its radar band. The server refuses such a layer.
 */
export const NO_FREQUENCY = "This layer does not record the frequency of the radar, so get it again with Get layer.";

/** The fault of the second field of Surface displacement, One pair when no layer can stand beside the first. */
export const NO_COMPONENTS = "The Connected components layer of this product is not in the session.";

/** The fault of the second field of Surface displacement, One pair while a layer can be chosen and none is. */
export const CHOOSE_COMPONENTS = "Choose the Connected components layer.";

/** The fault of a field of a soil moisture tool when the session holds no retrieval quality flag of its product. */
export const NO_QUALITY = "The Retrieval quality flag layer of this product is not in the session.";

/** What the form of a tool holds at one moment. */
export interface Choices {
  tool: FinishedTool;
  /** The layers of the session. */
  layers: readonly LayerDescription[];
  /** The id of the layer of the first field, or null. */
  first: string | null;
  /** The id of the layer of the second field of a tool of two inputs, or null. */
  second: string | null;
  /** The name of the result, as the field holds it. */
  title: string;
}

/** What is wrong with each field of the form, in one sentence, or null for a field that is in order. */
export interface Faults {
  first: string | null;
  second: string | null;
  title: string | null;
}

/** What the form sends to the server: the id of each input layer, in the order of the tool, and the name of the result. */
export interface Inputs {
  inputs: string[];
  title: string;
}

/** The outcome of the check of the choices: the layers in the order of the tool, and the faults of the fields. */
export interface Checked {
  /**
   * The input layers that are chosen and in order: the earlier date or pair first for a tool that compares, and
   * the layer `unwrappedPhase` first for Surface displacement, One pair.
   */
  layers: readonly LayerDescription[];
  faults: Faults;
  /** What the form sends, or null while a field has a fault. */
  inputs: Inputs | null;
}

/**
 * Check the choices of the form of a tool. A layer that is chosen must still be a layer of the session that the
 * tool reads. For a tool that compares, the second layer must stand beside the first and the tool must be able
 * to compare the two (`compared`), and the layer of the earlier date or pair is put first. For Surface
 * displacement, One pair the first layer must record the centre frequency of its radar band, and the second must
 * be the layer `connectedComponents` of the same product file and channel. A soil moisture tool needs the
 * retrieval quality flag of the product of each chosen layer (`qualityOf`), and the form sends each flag after its
 * layer. The name of the result must have 1 to 200 characters.
 */
export function check({ tool, layers, first, second, title }: Choices): Checked {
  const comparison = comparisonOf(tool);
  const offered = accepted(tool, layers);
  const one = offered.find((layer) => layer.id === first);
  const faults: Faults = { first: null, second: null, title: null };
  let chosen: readonly LayerDescription[] = [];
  if (!one) {
    faults.first = "Choose a layer.";
  } else if (READS[tool].beside) {
    const beside = componentsOf(one, layers);
    const other = beside.find((layer) => layer.id === second);
    if (!hasFrequency(one)) {
      faults.first = NO_FREQUENCY;
    }
    if (beside.length === 0) {
      faults.second = NO_COMPONENTS;
    } else if (!other) {
      faults.second = CHOOSE_COMPONENTS;
    } else if (faults.first === null) {
      chosen = [one, other];
    }
  } else if (comparison === null) {
    chosen = [one];
  } else {
    const beside = partners(tool, one, layers);
    const other = beside.find((layer) => layer.id === second);
    const ordered = other ? compared(tool, one, other) : null;
    if (beside.length === 0) {
      faults.second = SECOND_FAULTS[comparison].none;
    } else if (ordered === null) {
      faults.second = SECOND_FAULTS[comparison].choose;
    } else if (typeof ordered === "string") {
      faults.second = ordered;
    } else {
      chosen = ordered;
    }
  }
  // The flag of the product of each chosen layer, in the same order, for a tool that takes one.
  const flags = chosen.map((layer) => qualityOf(tool, layer, layers));
  if (READS[tool].quality) {
    chosen.forEach((layer, index) => {
      if (flags[index] === null) {
        if (layer.id === first) {
          faults.first = NO_QUALITY;
        } else {
          faults.second = NO_QUALITY;
        }
      }
    });
  }
  const name = title.trim();
  if (name === "") {
    faults.title = "Give a name.";
  } else if (name.length > MOST_TITLE) {
    faults.title = `The name is longer than ${String(MOST_TITLE)} characters.`;
  }
  const sound = faults.first === null && faults.second === null && faults.title === null;
  const sent = chosen.flatMap((layer, index) => {
    const flag = flags[index];
    return flag ? [layer.id, flag.id] : [layer.id];
  });
  return { layers: chosen, faults, inputs: sound ? { inputs: sent, title: name } : null };
}

/** Return the first fault of the form in the order of its fields, or null when the tool can run. */
export function missingOf({ first, second, title }: Faults): string | null {
  return first ?? second ?? title;
}
