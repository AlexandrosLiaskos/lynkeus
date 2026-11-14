import { COLOUR_TABLES } from "./colourTables";

/**
 * How the colours of a scale follow the values. A sequential scale runs from dark to light or from light to dark.
 * A diverging scale has a neutral colour in its middle, for values on both sides of a reference. A cyclic scale
 * ends with the colour that it starts with, for angles. A scale of classes has one colour for each whole number.
 */
export type ScaleKind = "sequential" | "diverging" | "cyclic" | "classes";

/** A colour scale that Lynkeus draws. */
export interface ColourScale {
  /** Name of the scale, as a layer description gives it. */
  name: string;
  kind: ScaleKind;
}

/** The colour scales that Lynkeus draws, in the order in which a list offers them. */
export const COLOUR_SCALES: readonly ColourScale[] = [
  { name: "grey", kind: "sequential" },
  { name: "viridis", kind: "sequential" },
  { name: "cividis", kind: "sequential" },
  { name: "batlow", kind: "sequential" },
  { name: "magma", kind: "sequential" },
  { name: "inferno", kind: "sequential" },
  { name: "plasma", kind: "sequential" },
  { name: "YlGnBu", kind: "sequential" },
  { name: "RdBu", kind: "diverging" },
  { name: "vik", kind: "diverging" },
  { name: "balance", kind: "diverging" },
  { name: "BrBG", kind: "diverging" },
  { name: "phase", kind: "cyclic" },
  { name: "romaO", kind: "cyclic" },
  { name: "tab10", kind: "classes" },
];

/** The scale that is drawn for a name that Lynkeus does not know. */
export const DEFAULT_SCALE = "grey";

/** The number of colours of a continuous scale. */
const LEVELS = 256;

const scales = new Map<string, readonly string[]>();

/** Tell whether Lynkeus has a colour scale of this name. */
export function isColourScale(name: string): boolean {
  return COLOUR_SCALES.some((scale) => scale.name === name);
}

/** Return how the colours of a scale follow the values. A name that is not known has the kind of the grey scale. */
export function scaleKind(name: string): ScaleKind {
  return COLOUR_SCALES.find((scale) => scale.name === name)?.kind ?? "sequential";
}

/** Return the greys from black to white. */
function greys(): string[] {
  return Array.from({ length: LEVELS }, (_, level) => `#${level.toString(16).padStart(2, "0").repeat(3)}`);
}

/**
 * Return the colours of a scale as CSS colours, from the lowest to the highest value. A continuous scale has 256
 * colours and a scale of classes has one colour for each class. A name that is not known gives the grey scale.
 */
export function colourScale(name: string): readonly string[] {
  const known = scales.get(name);
  if (known) {
    return known;
  }
  const table = COLOUR_TABLES[name];
  const colours = table === undefined ? greys() : (table.match(/.{6}/g) ?? []).map((colour) => `#${colour}`);
  scales.set(name, colours);
  return colours;
}
