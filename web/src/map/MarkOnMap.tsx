import { useEffect, useState } from "react";
import { useMap } from "../shared/map";
import { useStore } from "../shared/store";
import { createMarkLayer, drawMark, markStore } from "./mark";

/** The mark of the place that Go to coordinates has set, on the map. */
export function MarkOnMap() {
  const map = useMap();
  const place = useStore(markStore);
  const [layer] = useState(createMarkLayer);

  useEffect(() => {
    map.addLayer(layer);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, layer]);

  useEffect(() => {
    drawMark(layer, place, map.getView().getProjection());
  }, [map, layer, place]);

  return null;
}
