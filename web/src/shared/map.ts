import type OlMap from "ol/Map";
import { createContext, useContext } from "react";

/** The map of the application page. */
export const MapContext = createContext<OlMap | null>(null);

/** Return the map of the application page. */
export function useMap(): OlMap {
  const map = useContext(MapContext);
  if (!map) {
    throw new Error("The map is available only inside the application page.");
  }
  return map;
}
