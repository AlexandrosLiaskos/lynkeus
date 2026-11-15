// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { mapLayersStore } from "./mapLayers";
import { createStore } from "./store";

/**
 * One symbol of the legend of a shape layer: a line and, where the shapes have one, the fill inside it. The
 * Contents pane draws it beside its label.
 */
export interface ShapeSymbol {
  /** What the symbol stands for, for example "Outline of a product". */
  label: string;
  /** Colour of the line. */
  line: string;
  /** Width of the line, in pixels. */
  width: number;
  /** Lengths of the dashes and of the gaps of a broken line, in pixels. A solid line has none. */
  dash?: readonly number[];
  /** Colour of a wider line that is drawn under the line, so that the line shows on any background. */
  casing?: string;
  /** Colour of the fill, with its transparency. Shapes without a fill have none. */
  fill?: string;
}

/** One shape of a group, which the Contents pane lists under the row of the group. */
export interface ShapeMember {
  id: string;
  /** Name shown in the row of the member. */
  title: string;
  /** Secondary line under the name. */
  line?: string;
}

/** The members of a group, with what the Contents pane can do with one of them. */
export interface ShapeMembers {
  /** What the members are, for the header of their list, for example "Products". Without it the header says "Shapes". */
  name?: string;
  /** The members, in the order of their list. */
  items: readonly ShapeMember[];
  /** The id of the selected member, or null. Its shape is drawn in the colour of the selection. */
  selected: string | null;
  /** The ids of the members whose shapes are hidden. */
  hidden: readonly string[];
  /** Select a member, or end the selection with null. */
  select: (id: string | null) => void;
  /** Show or hide the shape of a member. */
  setVisible: (id: string, visible: boolean) => void;
  /** Move the map to the shape of a member. */
  zoomTo: (id: string) => void;
}

/**
 * A layer of shapes that a part of the interface draws on the map: the area, the area of the search, or the
 * outlines of the products found. The part that draws the shapes owns the layer of the map, which carries the
 * same id as its property "id", and describes it here. The Contents pane lists the description with the other
 * layers: its box shows or hides the layer, its menu moves it in the drawing order, zooms to it and removes it.
 */
export interface ShapeLayer {
  /** Unique name of the layer. The layer of the map carries it as its property "id". */
  id: string;
  /** Name shown in the Contents pane. */
  title: string;
  /** Secondary line under the name. */
  line?: string;
  /** The symbols of the legend. */
  symbols: readonly ShapeSymbol[];
  /** What the Properties window states about the layer, as names and values. */
  properties: readonly { name: string; value: string }[];
  /** Take the layer off the map. The part that owns the layer decides what else ends with it. */
  remove: () => void;
  /** The shapes of a group. A layer with members is listed as a group that folds and unfolds them. */
  members?: ShapeMembers;
}

/** The shape layers on the map. The Contents pane lists them with the layers of `mapLayersStore`. */
export const shapeLayersStore = createStore<readonly ShapeLayer[]>([]);

/** Put a shape layer on the map. A layer that is already there takes the new description in its place. */
export function putShapeLayer(layer: ShapeLayer): void {
  const layers = shapeLayersStore.get();
  shapeLayersStore.set(
    layers.some(({ id }) => id === layer.id)
      ? layers.map((other) => (other.id === layer.id ? layer : other))
      : [...layers, layer],
  );
}

/** Take a shape layer out of the list of the Contents pane, and forget its display. */
export function dropShapeLayer(id: string): void {
  const layers = shapeLayersStore.get();
  if (layers.some((layer) => layer.id === id)) {
    shapeLayersStore.set(layers.filter((layer) => layer.id !== id));
  }
  const displays = shapeDisplayStore.get();
  if (id in displays) {
    shapeDisplayStore.set(Object.fromEntries(Object.entries(displays).filter(([key]) => key !== id)));
  }
}

/** How a shape layer is drawn on the map. */
export interface ShapeDisplay {
  visible: boolean;
  /** From 0, which is transparent, to 1. */
  opacity: number;
}

/** The display of a shape layer when it is put on the map: shown and opaque. */
export const FIRST_SHAPE_DISPLAY: ShapeDisplay = { visible: true, opacity: 1 };

/** The display of each shape layer, by the id of the layer. A layer without an entry has its first display. */
export const shapeDisplayStore = createStore<Readonly<Record<string, ShapeDisplay>>>({});

/** Return the display of a shape layer: the stored one, or the first one. */
export function shapeDisplayOf(id: string): ShapeDisplay {
  return shapeDisplayStore.get()[id] ?? FIRST_SHAPE_DISPLAY;
}

/** Change part of the display of a shape layer. */
export function setShapeDisplay(id: string, change: Partial<ShapeDisplay>): void {
  shapeDisplayStore.set({ ...shapeDisplayStore.get(), [id]: { ...shapeDisplayOf(id), ...change } });
}

/** The z-index of the bottom layer of the drawing order. The background maps are drawn under it. */
export const FIRST_Z_INDEX = 100;

/**
 * The ids of all the layers of the map, those of `mapLayersStore` and the shape layers, in drawing order: the
 * first one is drawn at the bottom. The Contents pane lists the layers in this order, the top layer first.
 */
export const layerOrderStore = createStore<readonly string[]>([]);

/**
 * Return the drawing order after the layers on the map have changed. A layer that has left the map leaves the
 * order. A new layer of `mapLayersStore` is put directly above the topmost of these layers, or at the bottom when
 * there is none, so that it stays under the shapes; a new shape layer is put on top. The layers of
 * `mapLayersStore` keep the order of their own store among themselves.
 */
export function orderAfter(order: readonly string[], layers: readonly string[], shapes: readonly string[]): string[] {
  const ofStore = new Set(layers);
  const present = new Set([...layers, ...shapes]);
  const next = order.filter((id) => present.has(id));
  const known = new Set(next);
  const added = layers.filter((id) => !known.has(id));
  if (added.length > 0) {
    const top = next.reduce((found, id, index) => (ofStore.has(id) ? index : found), -1);
    next.splice(top + 1, 0, ...added);
  }
  next.push(...shapes.filter((id) => !known.has(id)));
  let place = 0;
  return next.map((id) => (ofStore.has(id) ? (layers[place++] ?? id) : id));
}

function sameOrder(one: readonly string[], other: readonly string[]): boolean {
  return one.length === other.length && one.every((id, index) => id === other[index]);
}

/** Bring the drawing order in line with the layers that are on the map. */
function followLayers(): void {
  const next = orderAfter(
    layerOrderStore.get(),
    mapLayersStore.get().map(({ id }) => id),
    shapeLayersStore.get().map(({ id }) => id),
  );
  if (!sameOrder(next, layerOrderStore.get())) {
    layerOrderStore.set(next);
  }
}

mapLayersStore.subscribe(followLayers);
shapeLayersStore.subscribe(followLayers);
followLayers();

/**
 * Set the drawing order, the bottom layer first. The order must name every layer of the map once; another list
 * changes nothing. The layers of `mapLayersStore` are put in the same order in their own store.
 */
export function setLayerOrder(order: readonly string[]): void {
  const current = layerOrderStore.get();
  if (
    order.length !== current.length ||
    new Set(order).size !== order.length ||
    order.some((id) => !current.includes(id))
  ) {
    return;
  }
  if (!sameOrder(order, current)) {
    layerOrderStore.set([...order]);
  }
  const layers = mapLayersStore.get();
  const sorted = [...layers].sort((one, other) => order.indexOf(one.id) - order.indexOf(other.id));
  if (sorted.some((layer, index) => layer !== layers[index])) {
    mapLayersStore.set(sorted);
  }
}

/** Return the z-index of a layer of the drawing order, or undefined for a layer that is not on the map. */
export function zIndexOf(id: string): number | undefined {
  const place = layerOrderStore.get().indexOf(id);
  return place < 0 ? undefined : FIRST_Z_INDEX + place;
}
