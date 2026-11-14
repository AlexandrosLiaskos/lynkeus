import { mapLayersStore, removeFromMap } from "../shared/mapLayers";
import { displayStore, resetDisplay, selectedLayerStore } from "./state";

/** A change of the place of a layer in the drawing order. */
export type Move = "up" | "down" | "top" | "bottom";

/**
 * Return the layers in the order of the Contents pane: the layer that is drawn on top stands first. The store
 * keeps them in drawing order, the bottom layer first.
 */
export function listedLayers<Layer>(layers: readonly Layer[]): Layer[] {
  return [...layers].reverse();
}

/** Return the place of a layer in the list of the Contents pane, from 0 for the top layer, or -1. */
export function placeOf(id: string): number {
  return listedLayers(mapLayersStore.get()).findIndex((layer) => layer.id === id);
}

/** Put a layer at a place of the list of the Contents pane, from 0 for the top layer. The other layers keep their order. */
export function placeLayer(id: string, place: number): void {
  const listed = listedLayers(mapLayersStore.get());
  const layer = listed.find((other) => other.id === id);
  if (!layer) {
    return;
  }
  const others = listed.filter((other) => other.id !== id);
  const target = Math.min(Math.max(Math.round(place), 0), others.length);
  const next = [...others.slice(0, target), layer, ...others.slice(target)];
  if (next.some((other, index) => other !== listed[index])) {
    mapLayersStore.set(listedLayers(next));
  }
}

/** Return the place that a move gives to a layer, or the place it has when the move changes nothing. */
export function placeAfter(place: number, move: Move, count: number): number {
  switch (move) {
    case "up":
      return Math.max(place - 1, 0);
    case "down":
      return Math.min(place + 1, count - 1);
    case "top":
      return 0;
    case "bottom":
      return count - 1;
  }
}

/** Move a layer in the drawing order: one place up or down, to the top or to the bottom. */
export function moveLayer(id: string, move: Move): void {
  const place = placeOf(id);
  if (place >= 0) {
    placeLayer(id, placeAfter(place, move, mapLayersStore.get().length));
  }
}

/** Give a layer another name. The name is kept without spaces at its ends, and an empty name changes nothing. */
export function renameLayer(id: string, title: string): void {
  const name = title.trim();
  const layers = mapLayersStore.get();
  if (name !== "" && layers.some((layer) => layer.id === id && layer.title !== name)) {
    mapLayersStore.set(layers.map((layer) => (layer.id === id ? { ...layer, title: name } : layer)));
  }
}

/** Take a layer off the map, and forget its display and its selection. */
export function removeLayer(id: string): void {
  removeFromMap(id);
  resetDisplay(id);
  if (selectedLayerStore.get() === id) {
    selectedLayerStore.set(null);
  }
}

/** Forget the display of every layer that is no longer on the map. */
export function forgetAbsentLayers(): void {
  const ids = new Set(mapLayersStore.get().map((layer) => layer.id));
  for (const id of Object.keys(displayStore.get())) {
    if (!ids.has(id)) {
      resetDisplay(id);
    }
  }
  const selected = selectedLayerStore.get();
  if (selected !== null && !ids.has(selected)) {
    selectedLayerStore.set(null);
  }
}
