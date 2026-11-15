import { useEffect, useState } from "react";
import { useMap } from "../shared/map";
import { mapLayersStore } from "../shared/mapLayers";
import { layerOrderStore, shapeLayersStore } from "../shared/shapeLayers";
import { useStore } from "../shared/store";
import { LayerDrawing } from "./drawing";
import { forgetAbsentLayers } from "./order";
import { displayStore } from "./state";

/**
 * Keep the layers of the Contents pane drawn on the map, as the stores of the layers and of their displays say,
 * each at its place in the drawing order that it shares with the shape layers.
 */
export function useLayerDrawing(): void {
  const map = useMap();
  const layers = useStore(mapLayersStore);
  const displays = useStore(displayStore);
  const order = useStore(layerOrderStore);
  const shapes = useStore(shapeLayersStore);
  const [drawing] = useState(() => new LayerDrawing(map));

  useEffect(() => {
    drawing.update(layers, displays, order);
  }, [drawing, layers, displays, order]);

  // A layer of either kind that another part of the page took off the map loses its display and its selection.
  useEffect(forgetAbsentLayers, [layers, shapes]);

  useEffect(() => () => drawing.clear(), [drawing]);
}
