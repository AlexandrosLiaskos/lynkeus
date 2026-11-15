import { useEffect } from "react";
import type BaseLayer from "ol/layer/Base";
import {
  FIRST_SHAPE_DISPLAY,
  FIRST_Z_INDEX,
  layerOrderStore,
  shapeDisplayStore,
  type ShapeDisplay,
} from "./shapeLayers";
import { useStore } from "./store";

/**
 * Keep a layer of the map drawn as the Contents pane says for the shape layer with this id: shown or hidden,
 * with its opacity, and at its place in the drawing order. The part that owns the layer calls this once, and
 * receives the display, for what else depends on the layer being shown.
 */
export function useShapeLayer(layer: BaseLayer, id: string): ShapeDisplay {
  const display = useStore(shapeDisplayStore)[id] ?? FIRST_SHAPE_DISPLAY;
  const place = useStore(layerOrderStore).indexOf(id);

  useEffect(() => {
    layer.setVisible(display.visible);
    layer.setOpacity(display.opacity);
  }, [layer, display]);

  useEffect(() => {
    if (place >= 0) {
      layer.setZIndex(FIRST_Z_INDEX + place);
    }
  }, [layer, place]);

  return display;
}
