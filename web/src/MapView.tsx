import { useEffect, useRef } from "react";
import OlMap from "ol/Map";
import View from "ol/View";
import { defaults as defaultControls, ScaleLine } from "ol/control";
import TileLayer from "ol/layer/Tile";
import { fromLonLat } from "ol/proj";
import { BASE_MAPS, type BaseMapId } from "./baseMaps";

interface MapViewProps {
  /** The background map to show. */
  baseMap: BaseMapId;
}

/** The map. It holds one layer for each background map and shows the chosen one. */
export function MapView({ baseMap }: MapViewProps) {
  const target = useRef<HTMLElement>(null);
  const map = useRef<OlMap>(null);

  useEffect(() => {
    const created = new OlMap({
      target: target.current ?? undefined,
      layers: BASE_MAPS.map(({ id, createSource }) => new TileLayer({ source: createSource(), properties: { id } })),
      view: new View({ center: fromLonLat([0, 20]), zoom: 2 }),
      controls: defaultControls().extend([new ScaleLine()]),
    });
    map.current = created;
    return () => {
      created.setTarget(undefined);
      map.current = null;
    };
  }, []);

  useEffect(() => {
    map.current?.getLayers().forEach((layer) => {
      layer.setVisible(layer.get("id") === baseMap);
    });
  }, [baseMap]);

  return <main ref={target} className="map" aria-label="Map" tabIndex={0} />;
}
