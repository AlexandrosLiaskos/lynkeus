import { useEffect, useRef } from "react";
import type OlMap from "ol/Map";

/** The area of the page that shows the map. */
export function MapView({ map }: { map: OlMap }) {
  const target = useRef<HTMLElement>(null);

  useEffect(() => {
    map.setTarget(target.current ?? undefined);
    return () => {
      map.setTarget(undefined);
    };
  }, [map]);

  return <main ref={target} className="map" aria-label="Map" tabIndex={0} />;
}
