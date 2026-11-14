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
}

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

/** Return a layer to its first display. */
export function resetDisplay(id: string): void {
  const displays = displayStore.get();
  if (id in displays) {
    displayStore.set(Object.fromEntries(Object.entries(displays).filter(([key]) => key !== id)));
  }
}
