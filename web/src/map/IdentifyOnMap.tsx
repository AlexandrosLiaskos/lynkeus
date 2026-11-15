// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useEffect, useState } from "react";
import { unByKey } from "ol/Observable";
import type { Pixel } from "ol/pixel";
import { openToolPane } from "../shared/dock/dock";
import { useMap } from "../shared/map";
import { useStore } from "../shared/store";
import { identifyAt, identifyStore } from "./identify";
import { toolKeysStore } from "./keys";
import { createMarkLayer, drawMark } from "./mark";
import { toolStore } from "./state";

/** The name of the layer that marks the identified place. */
export const IDENTIFY_LAYER_ID = "identify";

/**
 * The Identify tool on the map. While its button is on, a click, or the Enter key at the cross in the centre of
 * the map, reads the place and the value of every visible layer there, marks the place and opens the pane with
 * the result.
 */
export function IdentifyOnMap() {
  const map = useMap();
  const active = useStore(toolStore) === "identify";
  const found = useStore(identifyStore);
  const [layer] = useState(() => createMarkLayer(IDENTIFY_LAYER_ID));

  useEffect(() => {
    map.addLayer(layer);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, layer]);

  useEffect(() => {
    drawMark(layer, found?.place ?? null, map.getView().getProjection());
  }, [map, layer, found]);

  useEffect(() => {
    if (!active) {
      return;
    }
    const identify = (pixel: Pixel) => {
      const result = identifyAt(map, pixel);
      if (result) {
        identifyStore.set(result);
        openToolPane("identify");
      }
    };
    const click = map.on("singleclick", (event) => identify(event.pixel));
    toolKeysStore.set({
      point: (place) => {
        const pixel = map.getPixelFromCoordinate(place) as Pixel | null;
        if (pixel) {
          identify(pixel);
        }
      },
      cancel: () => false,
    });
    return () => {
      unByKey(click);
      toolKeysStore.set(null);
    };
  }, [map, active]);

  return null;
}
