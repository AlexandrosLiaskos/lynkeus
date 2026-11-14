import { useEffect, useState } from "react";
import { useMap } from "../shared/map";
import { useStore } from "../shared/store";
import { createGraticule } from "./graticule";
import { graticuleStore } from "./state";

/** The lines of latitude and longitude on the map. The Graticule button shows and hides them. */
export function GraticuleOnMap() {
  const map = useMap();
  const shown = useStore(graticuleStore);
  const [graticule] = useState(createGraticule);

  useEffect(() => {
    map.addLayer(graticule);
    return () => {
      map.removeLayer(graticule);
    };
  }, [map, graticule]);

  useEffect(() => {
    graticule.setVisible(shown);
  }, [graticule, shown]);

  return null;
}
