// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type OlMap from "ol/Map";
import type { Pixel } from "ol/pixel";
import { toLonLat } from "ol/proj";
import { valueAt } from "../contents/display";
import { displayOf } from "../contents/state";
import { mapLayersStore } from "../shared/mapLayers";
import { createStore } from "../shared/store";

/** What one visible layer holds at the identified place. */
export interface IdentifiedLayer {
  id: string;
  title: string;
  quantity: string;
  unit: string;
  dates: readonly string[];
  /** The value of the layer at the place, in its unit, or null where the layer has no data. */
  value: number | null;
}

/** The place that was identified, and the value of every visible layer there, the top layer first. */
export interface Identified {
  /** Longitude and latitude of the place, in degrees. */
  place: readonly [number, number];
  layers: readonly IdentifiedLayer[];
}

/** The result of the last use of Identify, or null before the first one and after it is cleared. */
export const identifyStore = createStore<Identified | null>(null);

/**
 * Read the place under a pixel of the map and the value of every visible layer there. The layers are those of
 * the Contents pane, the top one first, as the pop-up of ArcGIS Pro lists them. Returns null when the map is not
 * drawn.
 */
export function identifyAt(map: OlMap, pixel: Pixel): Identified | null {
  const coordinate = map.getCoordinateFromPixel(pixel) as number[] | null;
  if (!coordinate) {
    return null;
  }
  const [longitude = 0, latitude = 0] = toLonLat(coordinate, map.getView().getProjection());
  const layers = [...mapLayersStore.get()]
    .reverse()
    .filter((layer) => displayOf(layer).visible)
    .map(({ id, title, quantity, unit, dates }) => ({
      id,
      title,
      quantity,
      unit,
      dates,
      value: valueAt(map, id, pixel),
    }));
  return { place: [longitude, latitude], layers };
}

/**
 * Write a value of a layer with six significant digits, which a number of 32 bits holds. A very small or a very
 * large value is written with a power of ten.
 */
export function formatValue(value: number): string {
  const size = Math.abs(value);
  const notation = size !== 0 && (size < 1e-4 || size >= 1e9) ? "scientific" : "standard";
  return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 6, notation }).format(value);
}
