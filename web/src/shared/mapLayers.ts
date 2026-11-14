import type { LayerDescription } from "./layer";
import { createStore } from "./store";

/** The layers on the map, in drawing order: the first one is drawn at the bottom. The Contents pane lists them. */
export const mapLayersStore = createStore<readonly LayerDescription[]>([]);

/** Put a layer on the map, above the others. A layer that is already on the map is replaced in its place. */
export function addToMap(layer: LayerDescription): void {
  const layers = mapLayersStore.get();
  mapLayersStore.set(
    layers.some(({ id }) => id === layer.id)
      ? layers.map((other) => (other.id === layer.id ? layer : other))
      : [...layers, layer],
  );
}

/** Take a layer off the map. */
export function removeFromMap(id: string): void {
  mapLayersStore.set(mapLayersStore.get().filter((layer) => layer.id !== id));
}
