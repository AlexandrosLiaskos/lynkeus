import { formatDay } from "../data/products";
import type { LayerDescription } from "../shared/layer";

/**
 * The analysis tools that are finished, by the names of their buttons. The server offers a process of the same
 * name for each of them. Each one has a method sheet in `docs/methods/`.
 */
export const FINISHED_TOOLS = ["backscatter-state", "backscatter-change", "coherence-state"] as const;
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
 * layer). The server accepts the same names, in `api/src/lynkeus/analysis/coherence.py`.
 */
const COHERENCE_LAYER = /^(unwrappedInterferogram|wrappedInterferogram)\/(HH|VV)\/coherenceMagnitude$/;

/** The spacing of the cells of the two coherence layers of a GUNW product, by the group of the interferogram. */
const COHERENCE_SPACING: Record<string, string> = { unwrappedInterferogram: "80 m", wrappedInterferogram: "20 m" };

/** The largest length of the name of a result, in characters, as the server takes it (`MAX_TITLE_LENGTH`). */
export const MOST_TITLE = 200;

/** What a tool reads. */
interface Reads {
  /** The type of the NISAR product of each input layer. */
  product: "GCOV" | "GUNW";
  /** The number of input layers. */
  count: 1 | 2;
  /** The number of dates of each input layer: one for an acquisition, two for a pair. */
  dates: 1 | 2;
  /** Tells whether the tool reads the layer of this name inside the product. */
  names: (name: string) => boolean;
}

function isTerm(name: string): boolean {
  return BACKSCATTER_TERMS.some((term) => term === name);
}

/** What each finished tool reads, as its method sheet states it. */
export const READS: Record<FinishedTool, Reads> = {
  "backscatter-state": { product: "GCOV", count: 1, dates: 1, names: isTerm },
  "backscatter-change": { product: "GCOV", count: 2, dates: 1, names: isTerm },
  "coherence-state": { product: "GUNW", count: 1, dates: 2, names: (name) => COHERENCE_LAYER.test(name) },
};

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
 * Why a tool does not read a layer: it is not a layer received from one product of the type that the tool
 * reads ("product"), its description does not record its name inside the product ("unnamed"), that name is not
 * one that the tool reads ("name"), it does not carry the unit `1` ("unit"), or it does not have the number of
 * dates of the tool ("dates"). The checks stand in the order in which the server makes them, in
 * `api/src/lynkeus/analysis/inputs.py`.
 */
export type Unfit = "product" | "unnamed" | "name" | "unit" | "dates";

/** Return why a tool does not read a layer, or null for a layer that it reads. */
export function unfit(tool: FinishedTool, layer: LayerDescription): Unfit | null {
  const reads = READS[tool];
  if (acquisitionOfLayer(layer)?.product !== reads.product) {
    return "product";
  }
  if (typeof layer.layer !== "string") {
    return "unnamed";
  }
  if (!reads.names(layer.layer)) {
    return "name";
  }
  if (layer.unit !== "1") {
    return "unit";
  }
  return layer.dates.length === reads.dates ? null : "dates";
}

/** Return the layers that a tool reads, in the order of the list. */
export function accepted(tool: FinishedTool, layers: readonly LayerDescription[]): LayerDescription[] {
  return layers.filter((layer) => unfit(tool, layer) === null);
}

/**
 * Return the number of layers that a tool could read if their descriptions recorded their names inside the
 * product: the layers received from one product of the type of the tool, with the unit `1` and the number of
 * dates of the tool, whose description has no name. The server records the name for the layers that it
 * receives; a layer stored before it did so has null or no field, and the server refuses it.
 */
export function unnamed(tool: FinishedTool, layers: readonly LayerDescription[]): number {
  return layers.filter(
    (layer) => unfit(tool, layer) === "unnamed" && layer.unit === "1" && layer.dates.length === READS[tool].dates,
  ).length;
}

/**
 * Tell whether two layers can be the two inputs of Backscatter, Change: two different layers of the same name
 * inside the product, and of products of the same instrument, track, direction of the orbit and frame.
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

/** Return the layers that can stand beside a layer as the second input of Backscatter, Change. */
export function partners(first: LayerDescription, layers: readonly LayerDescription[]): LayerDescription[] {
  return accepted("backscatter-change", layers).filter((layer) => matches(first, layer));
}

/** Return the first date of a layer. Every layer description has at least one date. */
function dayOf(layer: LayerDescription): string {
  return layer.dates[0] ?? "";
}

/**
 * Return two layers with the layer of the earlier date first, as Backscatter, Change takes them, or null when
 * the two layers have the same date. A date is written as year-month-day, so the order of the texts is the
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

/**
 * Propose the name of the result of a tool from its input layers, which stand in the order in which the tool
 * takes them: the quantity, the channel and the date or dates. The name is empty while an input is missing.
 */
export function defaultTitle(tool: FinishedTool, inputs: readonly LayerDescription[]): string {
  const [first, second] = inputs;
  if (typeof first?.layer !== "string" || inputs.length !== READS[tool].count) {
    return "";
  }
  const days = (layers: readonly LayerDescription[]) =>
    layers
      .flatMap((layer) => layer.dates)
      .map(formatDay)
      .join(" to ");
  if (tool === "coherence-state") {
    const [, group = "", channel = ""] = COHERENCE_LAYER.exec(first.layer) ?? [];
    return `Coherence magnitude ${channel}, ${COHERENCE_SPACING[group] ?? ""}, ${days([first])}`;
  }
  // The first two letters of a diagonal term name its channel: the term HHHH is the term of the channel HH.
  const channel = first.layer.slice(0, 2);
  return tool === "backscatter-state" || !second
    ? `Backscatter ${channel} in dB, ${days([first])}`
    : `Change of backscatter ${channel} in dB, ${days([first, second])}`;
}

/** Why the tool cannot run while the session holds no layer that it reads. The foot of the form states it. */
export const NO_INPUT = "No layer of this session can be used by the tool.";

/** The fault of the second field of Backscatter, Change when no layer of the session can stand beside the first. */
export const NO_PARTNER = "No other date of this layer is in the session.";

/** What the form of a tool holds at one moment. */
export interface Choices {
  tool: FinishedTool;
  /** The layers of the session. */
  layers: readonly LayerDescription[];
  /** The id of the layer of the first field, or null. */
  first: string | null;
  /** The id of the layer of the second field of Backscatter, Change, or null. */
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
  /** The input layers that are chosen and in order, with the earlier date first for Backscatter, Change. */
  layers: readonly LayerDescription[];
  faults: Faults;
  /** What the form sends, or null while a field has a fault. */
  inputs: Inputs | null;
}

/**
 * Check the choices of the form of a tool. A layer that is chosen must still be a layer of the session that the
 * tool reads. For Backscatter, Change the second layer must match the first and have another date, and the
 * layer of the earlier date is put first. The name of the result must have 1 to 200 characters.
 */
export function check({ tool, layers, first, second, title }: Choices): Checked {
  const two = READS[tool].count === 2;
  const offered = accepted(tool, layers);
  const one = offered.find((layer) => layer.id === first);
  const faults: Faults = { first: null, second: null, title: null };
  let chosen: readonly LayerDescription[] = [];
  if (!one) {
    faults.first = "Choose a layer.";
  } else if (!two) {
    chosen = [one];
  } else {
    const beside = partners(one, layers);
    const other = beside.find((layer) => layer.id === second);
    const ordered = other ? inOrder(one, other) : null;
    if (beside.length === 0) {
      faults.second = NO_PARTNER;
    } else if (!other) {
      faults.second = "Choose the layer of the other date.";
    } else if (!ordered) {
      faults.second = "Choose a layer of another date.";
    } else {
      chosen = ordered;
    }
  }
  const name = title.trim();
  if (name === "") {
    faults.title = "Give a name.";
  } else if (name.length > MOST_TITLE) {
    faults.title = `The name is longer than ${String(MOST_TITLE)} characters.`;
  }
  const sound = faults.first === null && faults.second === null && faults.title === null;
  return { layers: chosen, faults, inputs: sound ? { inputs: chosen.map((layer) => layer.id), title: name } : null };
}

/** Return the first fault of the form in the order of its fields, or null when the tool can run. */
export function missingOf({ first, second, title }: Faults): string | null {
  return first ?? second ?? title;
}
