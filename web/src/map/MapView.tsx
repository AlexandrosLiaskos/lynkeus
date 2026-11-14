import { useEffect, useId, useRef } from "react";
import type OlMap from "ol/Map";

/** What the keys do on the map. A screen reader reads it when the map receives the keyboard focus. */
export const MAP_KEYS =
  "Keys on the map: the arrow keys move the map, the plus and minus keys change the scale, the comma and period keys return to the previous and the next view, the A and D keys turn the map, the N key returns north to the top, and the Insert key shows the whole world. While a tool of the Map tab is in use, a cross marks the centre of the map: the Enter key acts at the cross, the Backspace key takes back the last point, and the Escape key gives up the drawing or ends the tool.";

/** The map view: the area of the page that shows the map. */
export function MapView({ map }: { map: OlMap }) {
  const target = useRef<HTMLElement>(null);
  const keysId = useId();

  useEffect(() => {
    map.setTarget(target.current ?? undefined);
    return () => {
      map.setTarget(undefined);
    };
  }, [map]);

  return (
    <>
      <main ref={target} className="map" aria-label="Map" aria-describedby={keysId} tabIndex={0} />
      <p id={keysId} hidden>
        {MAP_KEYS}
      </p>
    </>
  );
}
