// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type { Coordinate } from "ol/coordinate";
import type OlMap from "ol/Map";
import { unByKey } from "ol/Observable";
import type { Pixel } from "ol/pixel";
import type Projection from "ol/proj/Projection";
import { useEffect, useState } from "react";

/** The place of the pointer over the map: its pixel, and the point of the map under it. */
export interface Pointer {
  pixel: Pixel;
  coordinate: Coordinate;
}

/** What the status bar reads from the map. */
export interface MapState {
  projection: Projection;
  /** Size of one pixel of the map, in the units of the projection. */
  resolution: number;
  /** The point at the centre of the map, in the projection of the map. */
  centre: Coordinate;
  /** Angle by which the map is turned clockwise, in radians. */
  rotation: number;
  /** Whether the map is still loading images or layers. */
  loading: boolean;
  /** The place of the pointer, or null while the pointer is not over the map. */
  pointer: Pointer | null;
}

/** Read the state of the map. A map whose view has no centre or no resolution has no state. */
export function readMapState(map: OlMap, loading: boolean, pointer: Pointer | null): MapState | null {
  const view = map.getView();
  const centre = view.getCenter();
  const resolution = view.getResolution();
  if (!centre || resolution === undefined) {
    return null;
  }
  // When the map moves under a pointer that rests, the point under the pointer changes. A map that is not yet
  // drawn cannot give it, and the point of the last movement is kept.
  const moved: Coordinate | null = pointer && map.getCoordinateFromPixel(pointer.pixel);
  return {
    projection: view.getProjection(),
    resolution,
    centre,
    rotation: view.getRotation(),
    loading,
    pointer: pointer && { pixel: pointer.pixel, coordinate: moved ?? pointer.coordinate },
  };
}

/**
 * Follow the map: call the listener with the new state whenever the view, the place of the pointer or the
 * loading changes. The function returned ends the following.
 */
export function watchMap(map: OlMap, listener: (state: MapState | null) => void): () => void {
  let loading = false;
  let pointer: Pointer | null = null;
  const update = () => listener(readMapState(map, loading, pointer));
  const followView = () => map.getView().on(["change:center", "change:resolution", "change:rotation"], update);

  let viewKeys = followView();
  const mapKeys = [
    map.on("change:view", () => {
      unByKey(viewKeys);
      viewKeys = followView();
      update();
    }),
    map.on("pointermove", (event) => {
      pointer = { pixel: event.pixel, coordinate: event.coordinate };
      update();
    }),
    map.on("loadstart", () => {
      loading = true;
      update();
    }),
    map.on("loadend", () => {
      loading = false;
      update();
    }),
  ];
  const viewport = map.getViewport();
  const onLeave = () => {
    pointer = null;
    update();
  };
  viewport?.addEventListener("pointerleave", onLeave);

  return () => {
    unByKey(viewKeys);
    unByKey(mapKeys);
    viewport?.removeEventListener("pointerleave", onLeave);
  };
}

/** Read the state of the map in a component. The component is drawn again when the state changes. */
export function useMapState(map: OlMap): MapState | null {
  const [state, setState] = useState(() => readMapState(map, false, null));
  useEffect(() => watchMap(map, setState), [map]);
  return state;
}
