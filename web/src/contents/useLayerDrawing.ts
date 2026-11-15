// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useEffect, useState } from "react";
import { useMap } from "../shared/map";
import { mapLayersStore } from "../shared/mapLayers";
import { layerOrderStore, shapeLayersStore } from "../shared/shapeLayers";
import { useStore } from "../shared/store";
import { drawAgainStore, LayerDrawing } from "./drawing";
import { fileProblem } from "./fileProblem";
import { fileOf } from "./files";
import { fileGone, watchKept } from "./kept";
import { forgetAbsentLayers } from "./order";
import { displayStore } from "./state";

/**
 * Keep the layers of the Contents pane drawn on the map, as the stores of the layers and of their displays say,
 * each at its place in the drawing order that it shares with the shape layers. Only the layers that are ready
 * are in the store of the map (`kept.ts`): a layer that waits for the sign-in or that the server removed is not
 * drawn, and the states of the kept layers are followed while the page is open.
 */
export function useLayerDrawing(): void {
  const map = useMap();
  const layers = useStore(mapLayersStore);
  const displays = useStore(displayStore);
  const again = useStore(drawAgainStore);
  const order = useStore(layerOrderStore);
  const shapes = useStore(shapeLayersStore);
  const [drawing] = useState(() => new LayerDrawing(map, fileOf, true, fileProblem, fileGone));

  useEffect(watchKept, []);

  useEffect(() => {
    drawing.update(layers, displays, order, again);
  }, [drawing, layers, displays, order, again]);

  // A layer of either kind that another part of the page took off the map loses its display and its selection.
  useEffect(forgetAbsentLayers, [layers, shapes]);

  useEffect(() => () => drawing.clear(), [drawing]);
}
