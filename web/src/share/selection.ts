// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { selectedLayerStore } from "../contents/state";
import type { LayerDescription } from "../shared/layer";
import { mapLayersStore } from "../shared/mapLayers";
import { useStore } from "../shared/store";

/** Return the layer that is selected in the Contents pane, or null when none is selected. */
export function selectedLayer(): LayerDescription | null {
  const id = selectedLayerStore.get();
  return mapLayersStore.get().find((layer) => layer.id === id) ?? null;
}

/** Return the layer that is selected in the Contents pane, and follow the selection. */
export function useSelectedLayer(): LayerDescription | null {
  const id = useStore(selectedLayerStore);
  return useStore(mapLayersStore).find((layer) => layer.id === id) ?? null;
}

/** The sentence that asks the user to select a layer. */
export const SELECT_A_LAYER = "No layer is selected. Select a layer in the Contents pane first.";

/** Return whether the map has a layer, and follow the layers of the map. */
export function useHasLayers(): boolean {
  return useStore(mapLayersStore).length > 0;
}

/**
 * Return the sentence that states what a tool of the selected layer lacks while no layer is selected: a layer on
 * the map, or the selection of one.
 */
export function layerMissing(hasLayers: boolean): string {
  return hasLayers ? "Select a layer in the Contents pane." : "Get a layer first.";
}
