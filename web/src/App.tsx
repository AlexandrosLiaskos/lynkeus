import { useEffect, useState } from "react";
import { Footer } from "./footer/Footer";
import { Header } from "./header/Header";
import type { BaseMapId } from "./map/baseMaps";
import { createMap, showBaseMap, showWorld, zoomBy } from "./map/map";
import { MapView } from "./map/MapView";
import { Ribbon, type ToolActions } from "./ribbon/Ribbon";

/** The page of the application. It places the elements of the interface and connects the ribbon to the map. */
export function App() {
  const [map] = useState(createMap);
  const [baseMap, setBaseMap] = useState<BaseMapId>("blue-marble");

  useEffect(() => {
    showBaseMap(map, baseMap);
  }, [map, baseMap]);

  const actions: ToolActions = {
    "full-extent": { run: () => showWorld(map) },
    "zoom-in": { run: () => zoomBy(map, 1) },
    "zoom-out": { run: () => zoomBy(map, -1) },
    "blue-marble": { run: () => setBaseMap("blue-marble"), pressed: baseMap === "blue-marble" },
    openstreetmap: { run: () => setBaseMap("openstreetmap"), pressed: baseMap === "openstreetmap" },
  };

  return (
    <>
      <Header />
      <Ribbon actions={actions} />
      <MapView map={map} />
      <Footer />
    </>
  );
}
