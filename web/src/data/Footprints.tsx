import { useEffect, useState } from "react";
import type OlMap from "ol/Map";
import type MapBrowserEvent from "ol/MapBrowserEvent";
import { useMap } from "../shared/map";
import { createStore, useStore } from "../shared/store";
import {
  createFootprintLayer,
  footprintFeatures,
  isDrawing,
  nextSelection,
  outlinesExtent,
  productsAt,
  showOutline,
  zoomTo,
  type FootprintLayer,
} from "./footprints";
import { hoveredProductStore, outlinesStore, productsStore, selectedProductStore } from "./state";

/** The layer of the outlines, once the map holds it. The Catalog pane reads it to move the map to products. */
const layerStore = createStore<FootprintLayer | null>(null);

/** Move the map to the outline of one product, or to the outlines of every product found. */
export function zoomToProducts(map: OlMap, id?: string, duration?: number): void {
  const layer = layerStore.get();
  if (layer) {
    zoomTo(map, outlinesExtent(layer, id === undefined ? undefined : [id]), duration);
  }
}

/**
 * The outlines of the products found, on the map. The outline under the pointer and the outline of the selected
 * product are drawn stronger, and a click on an outline selects its product.
 */
export function Footprints() {
  const map = useMap();
  const results = useStore(productsStore);
  const selected = useStore(selectedProductStore);
  const hovered = useStore(hoveredProductStore);
  const visible = useStore(outlinesStore);
  const [layer] = useState(createFootprintLayer);

  useEffect(() => {
    map.addLayer(layer);
    layerStore.set(layer);
    return () => {
      layerStore.set(null);
      map.removeLayer(layer);
    };
  }, [map, layer]);

  const products = results?.products;
  useEffect(() => {
    const source = layer.getSource();
    source?.clear();
    source?.addFeatures(footprintFeatures(products ?? [], map.getView().getProjection()));
  }, [map, layer, products]);

  // After a search the map moves to the products found, when it does not show them or shows them too small.
  const search = results?.search;
  useEffect(() => {
    if (search) {
      showOutline(map, outlinesExtent(layer));
    }
  }, [map, layer, search]);

  useEffect(() => {
    layer.setVisible(visible);
  }, [layer, visible]);

  // The outline of the selected product is drawn strongest, and the map moves to it when it is out of view or too small.
  useEffect(() => {
    layer.set("selected", selected);
    layer.changed();
    const outline = selected ? layer.getSource()?.getFeatureById(selected)?.getGeometry()?.getExtent() : undefined;
    if (outline) {
      showOutline(map, outline);
    }
  }, [map, layer, selected]);

  useEffect(() => {
    layer.set("hovered", hovered);
    layer.changed();
  }, [layer, hovered]);

  // The pointer finds the outlines only while they are shown and while no shape is being drawn on the map.
  useEffect(() => {
    if (!visible) {
      return;
    }
    const projection = map.getView().getProjection();
    const onMove = (event: MapBrowserEvent) => {
      const under = event.dragging || isDrawing(map) ? [] : productsAt(layer, event.coordinate, projection);
      const selectedNow = selectedProductStore.get();
      hoveredProductStore.set(selectedNow !== null && under.includes(selectedNow) ? selectedNow : (under[0] ?? null));
      map.getTargetElement()?.style.setProperty("cursor", under.length > 0 ? "pointer" : "");
    };
    const onClick = (event: MapBrowserEvent) => {
      if (isDrawing(map)) {
        return;
      }
      const under = productsAt(layer, event.coordinate, projection);
      if (under.length > 0) {
        selectedProductStore.set(nextSelection(under, selectedProductStore.get()));
      }
    };
    map.on("pointermove", onMove);
    map.on("singleclick", onClick);
    return () => {
      map.un("pointermove", onMove);
      map.un("singleclick", onClick);
      hoveredProductStore.set(null);
      map.getTargetElement()?.style.removeProperty("cursor");
    };
  }, [map, layer, visible]);

  return null;
}
