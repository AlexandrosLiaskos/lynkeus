// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useEffect } from "react";
import { useMap } from "../shared/map";
import { showNextView, showPreviousView } from "./commands";
import { viewStepsOf } from "./history";
import { createKeys, toolKeysStore } from "./keys";
import { northUp, rotateBy, ROTATION_STEP, showWorld } from "./map";
import { toolStore } from "./state";

/**
 * The keys of the map, which act while the map has the keyboard focus. OpenLayers itself moves the map with the
 * arrow keys and changes the scale with the plus and minus keys. The keys added here are those of ArcGIS Pro:
 * comma and period for the previous and the next view, A and D to turn the map, N for north and Insert for the
 * whole world. The Enter, Backspace and Escape keys go to the tool in use.
 */
export function MapKeys() {
  const map = useMap();

  useEffect(() => {
    // The views are recorded from the start of the page.
    viewStepsOf(map);
    const keys = createKeys({
      ",": () => showPreviousView(map),
      ".": () => showNextView(map),
      a: () => rotateBy(map, -ROTATION_STEP),
      d: () => rotateBy(map, ROTATION_STEP),
      n: () => northUp(map),
      Insert: () => showWorld(map),
      Enter: () => {
        const center = map.getView().getCenter();
        if (center) {
          toolKeysStore.get()?.point(center);
        }
      },
      Backspace: () => toolKeysStore.get()?.back?.(),
      // The Escape key gives up what is being drawn or, when nothing is being drawn, ends the tool.
      Escape: () => {
        if (!toolKeysStore.get()?.cancel()) {
          toolStore.set(null);
        }
      },
    });
    map.addInteraction(keys);
    return () => {
      map.removeInteraction(keys);
    };
  }, [map]);

  return null;
}
