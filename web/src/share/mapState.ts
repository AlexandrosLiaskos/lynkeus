// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type OlMap from "ol/Map";
import { useCallback, useSyncExternalStore } from "react";
import { isDrawing } from "./picture";

let lastSize = "0 0";
let lastView = "";

/**
 * Return the width and the height of the map on the screen, in whole pixels, and follow their changes. While a
 * picture of the map is drawn, the map takes the size of the picture for a moment; that size is not reported.
 */
export function useMapSize(map: OlMap): [number, number] {
  const subscribe = useCallback(
    (listener: () => void) => {
      map.on("change:size", listener);
      return () => map.un("change:size", listener);
    },
    [map],
  );
  const size = useSyncExternalStore(subscribe, () => {
    if (!isDrawing()) {
      lastSize = (map.getSize() ?? [0, 0]).map(Math.round).join(" ");
    }
    return lastSize;
  });
  const [width = 0, height = 0] = size.split(" ").map(Number);
  return [width, height];
}

/**
 * Follow the view of the map: the component is drawn again after the map has moved, zoomed or turned. The
 * value returned changes with the view and has no other meaning.
 */
export function useMapView(map: OlMap): string {
  const subscribe = useCallback(
    (listener: () => void) => {
      map.on("moveend", listener);
      return () => map.un("moveend", listener);
    },
    [map],
  );
  return useSyncExternalStore(subscribe, () => {
    if (!isDrawing()) {
      const view = map.getView();
      lastView = [view.getCenter()?.join(" "), view.getZoom(), view.getRotation()].join(" ");
    }
    return lastView;
  });
}
