import type { LayerDescription } from "../shared/layer";
import { createStore } from "../shared/store";

/** The id of the layer that is selected in the Contents pane, or null when no layer is selected. */
export const selectedLayerStore = createStore<string | null>(null);

/** How a layer is drawn on the map. */
export interface LayerDisplay {
  visible: boolean;
  /** From 0, which is transparent, to 1. */
  opacity: number;
  /** The values that receive the first and the last colour of the scale, in the unit of the layer. */
  range: readonly [number, number];
  /** Name of the colour scale. */
  colours: string;
  /**
   * Whether the colour scale is applied to the decibels of the values. Only a layer whose values are a power on
   * a linear scale offers it, and such a layer is shown in decibels until this says otherwise.
   */
  decibels?: boolean;
  /** Whether the colour scale is turned round, so that the lowest value receives its last colour. */
  inverted?: boolean;
  /** The colour of the cells without data, as # and six hexadecimal digits. Without it they are transparent. */
  noDataColour?: string;
  /** The lowest and the highest value that is drawn, in the unit of the layer. Cells outside them are hidden. */
  mask?: readonly [number, number];
  /** How the range was last set in the Symbology pane. */
  stretch?: Stretch;
}

/**
 * A rule that gives the range of a colour scale from the values of a layer: its lowest and highest value, the
 * values that leave out a percent of the cells at each end, or the mean and a number of standard deviations on
 * each side of it. "typed" marks a range that the user typed.
 */
export type Stretch =
  | { kind: "extremes" }
  | { kind: "percent"; percent: number }
  | { kind: "deviations"; count: number }
  | { kind: "typed" };

/** The display of each layer on the map, by the id of the layer. A layer without an entry has its first display. */
export const displayStore = createStore<Readonly<Record<string, LayerDisplay>>>({});

/** Return the display that a layer has when it is put on the map: shown, opaque, with the range and scale of its description. */
export function firstDisplay(layer: LayerDescription): LayerDisplay {
  return { visible: true, opacity: 1, range: layer.range, colours: layer.colours };
}

/** Return the display of a layer: the stored one, or the first one. */
export function displayOf(layer: LayerDescription): LayerDisplay {
  return displayStore.get()[layer.id] ?? firstDisplay(layer);
}

/** Change part of the display of a layer. */
export function setDisplay(layer: LayerDescription, change: Partial<LayerDisplay>): void {
  displayStore.set({ ...displayStore.get(), [layer.id]: { ...displayOf(layer), ...change } });
}

/** The ids of the layers whose legend is folded in the Contents pane. */
export const foldedStore = createStore<readonly string[]>([]);

/** Fold or unfold the legend of a layer. */
export function setFolded(id: string, folded: boolean): void {
  const others = foldedStore.get().filter((other) => other !== id);
  foldedStore.set(folded ? [...others, id] : others);
}

/** The display that the command Copy display has taken from a layer, or null. */
export const copiedDisplayStore = createStore<LayerDisplay | null>(null);

/** Keep the display of a layer for the command Paste display. */
export function copyDisplay(layer: LayerDescription): void {
  copiedDisplayStore.set(displayOf(layer));
}

/**
 * Give a layer the copied display: its range, its colour scale and the other choices of the Symbology pane. The
 * layer keeps its own visibility and opacity.
 */
export function pasteDisplay(layer: LayerDescription): void {
  const copied = copiedDisplayStore.get();
  if (copied) {
    const { visible, opacity } = displayOf(layer);
    displayStore.set({ ...displayStore.get(), [layer.id]: { ...copied, visible, opacity } });
  }
}

/** The layer that the Symbology pane or the Properties window shows, and how often it was opened. */
export interface Shown {
  id: string;
  /** A new number each time the pane or the window opens, so that it starts again. */
  time: number;
}

/** The name of the Symbology pane among the tool panes. */
export const SYMBOLOGY_PANE = "symbology";

export const symbologyStore = createStore<Shown | null>(null);
export const propertiesStore = createStore<Shown | null>(null);

/** Return a layer to its first display. */
export function resetDisplay(id: string): void {
  const displays = displayStore.get();
  if (id in displays) {
    displayStore.set(Object.fromEntries(Object.entries(displays).filter(([key]) => key !== id)));
  }
}
