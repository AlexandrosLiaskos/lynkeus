import { useEffect, useState } from "react";
import { useMap } from "../shared/map";
import { useStore } from "../shared/store";
import { createFootprintLayer, footprintFeatures, showOutline } from "./footprints";
import { productsStore, selectedProductStore } from "./state";

/** The outlines of the products found, on the map. */
export function Footprints() {
  const map = useMap();
  const found = useStore(productsStore);
  const selected = useStore(selectedProductStore);
  const [layer] = useState(createFootprintLayer);

  useEffect(() => {
    map.addLayer(layer);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, layer]);

  useEffect(() => {
    const source = layer.getSource();
    source?.clear();
    source?.addFeatures(footprintFeatures(found?.answer.products ?? [], map.getView().getProjection()));
  }, [map, layer, found]);

  // The outline of the selected product is drawn stronger, and the map moves to it when it is out of view or too small.
  useEffect(() => {
    layer.set("selected", selected);
    layer.changed();
    const outline = selected ? layer.getSource()?.getFeatureById(selected)?.getGeometry()?.getExtent() : undefined;
    if (outline) {
      showOutline(map, outline);
    }
  }, [map, layer, selected]);

  return null;
}
