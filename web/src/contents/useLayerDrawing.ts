import { useEffect, useState } from "react";
import { useMap } from "../shared/map";
import { mapLayersStore } from "../shared/mapLayers";
import { useStore } from "../shared/store";
import { LayerDrawing } from "./drawing";
import { forgetAbsentLayers } from "./order";
import { displayStore } from "./state";

/** Keep the layers of the Contents pane drawn on the map, as the stores of the layers and of their displays say. */
export function useLayerDrawing(): void {
  const map = useMap();
  const layers = useStore(mapLayersStore);
  const displays = useStore(displayStore);
  const [drawing] = useState(() => new LayerDrawing(map));

  useEffect(() => {
    drawing.update(layers, displays);
  }, [drawing, layers, displays]);

  // A layer that another part of the page took off the map loses its display and its selection.
  useEffect(forgetAbsentLayers, [layers]);

  useEffect(() => () => drawing.clear(), [drawing]);
}
