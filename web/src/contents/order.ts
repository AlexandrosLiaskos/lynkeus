// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { mapLayersStore, removeFromMap } from "../shared/mapLayers";
import { layerOrderStore, setLayerOrder, shapeLayersStore, type ShapeLayer } from "../shared/shapeLayers";
import { displayStore, propertiesStore, resetDisplay, selectedLayerStore } from "./state";

/** A change of the place of a layer in the drawing order. */
export type Move = "up" | "down" | "top" | "bottom";

/**
 * Return the layers in the order of the Contents pane: the layer that is drawn on top stands first. The stores
 * keep them in drawing order, the bottom layer first.
 */
export function listedLayers<Layer>(layers: readonly Layer[]): Layer[] {
  return [...layers].reverse();
}

/**
 * Return the place of a layer in the list of the Contents pane, from 0 for the top layer, or -1. The list holds
 * the layers of `mapLayersStore` and the shape layers, in the one drawing order of the map.
 */
export function placeOf(id: string): number {
  return listedLayers(layerOrderStore.get()).indexOf(id);
}

/**
 * Put a layer at a place of the list of the Contents pane, from 0 for the top layer. The other layers keep their
 * order. The layer and its neighbours may be of either kind, so a shape layer can stand under a layer of
 * `mapLayersStore`.
 */
export function placeLayer(id: string, place: number): void {
  const listed = listedLayers(layerOrderStore.get());
  if (!listed.includes(id)) {
    return;
  }
  const others = listed.filter((other) => other !== id);
  const target = Math.min(Math.max(Math.round(place), 0), others.length);
  const next = [...others.slice(0, target), id, ...others.slice(target)];
  if (next.some((other, index) => other !== listed[index])) {
    setLayerOrder(listedLayers(next));
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
    placeLayer(id, placeAfter(place, move, layerOrderStore.get().length));
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

/**
 * Remove a shape layer: the part of the interface that owns it takes it off the map. The result tells whether the
 * layer has left the list of the Contents pane. A layer that has left loses its selection.
 */
export function removeShapeLayer(layer: ShapeLayer): boolean {
  layer.remove();
  const gone = !shapeLayersStore.get().some(({ id }) => id === layer.id);
  if (gone && selectedLayerStore.get() === layer.id) {
    selectedLayerStore.set(null);
  }
  return gone;
}

/**
 * Forget the display of every layer of `mapLayersStore` that is no longer on the map, and the selection of a
 * layer that is neither in that store nor among the shape layers. The Properties window of such a layer closes
 * for good, so that it does not open again when a shape layer of the same id returns to the map.
 */
export function forgetAbsentLayers(): void {
  const ids = new Set(mapLayersStore.get().map((layer) => layer.id));
  for (const id of Object.keys(displayStore.get())) {
    if (!ids.has(id)) {
      resetDisplay(id);
    }
  }
  const selected = selectedLayerStore.get();
  const absent = (id: string) => !ids.has(id) && !shapeLayersStore.get().some((shape) => shape.id === id);
  if (selected !== null && absent(selected)) {
    selectedLayerStore.set(null);
  }
  const shown = propertiesStore.get();
  if (shown !== null && absent(shown.id)) {
    propertiesStore.set(null);
  }
}
