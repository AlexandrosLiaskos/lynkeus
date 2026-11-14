import { useEffect, useState } from "react";
import type { BaseMapId } from "./baseMaps";
import { createMap, showBaseMap, showWorld, zoomBy } from "./map";
import { MapView } from "./MapView";
import { RibbonPanel, RibbonTabs, type ToolActions } from "./Ribbon";
import type { TabId } from "./ribbon";

/** The page of the application: the top bar with the ribbon of tools, the map and the notice. */
export function App() {
  const [map] = useState(createMap);
  const [baseMap, setBaseMap] = useState<BaseMapId>("blue-marble");
  const [tab, setTab] = useState<TabId>("map");

  useEffect(() => {
    showBaseMap(map, baseMap);
  }, [map, baseMap]);

  const actions: ToolActions = {
    "blue-marble": { run: () => setBaseMap("blue-marble"), pressed: baseMap === "blue-marble" },
    openstreetmap: { run: () => setBaseMap("openstreetmap"), pressed: baseMap === "openstreetmap" },
    "zoom-in": { run: () => zoomBy(map, 1) },
    "zoom-out": { run: () => zoomBy(map, -1) },
    "full-extent": { run: () => showWorld(map) },
  };

  return (
    <>
      <header className="site-header app-header">
        <h1 className="site-brand">
          <img src="/assets/lynkeus-mark.png" alt="" width="40" height="40" />
          <span className="site-name">Lynkeus</span>
        </h1>
        <RibbonTabs selected={tab} onSelect={setTab} />
        <nav aria-label="Site">
          <a href="/team-log/">Team log</a>
        </nav>
      </header>
      <RibbonPanel selected={tab} actions={actions} />
      <MapView map={map} />
      <footer className="app-footer">
        <p>
          Lynkeus is an independent project of Team Lynkeus, prepared for the{" "}
          <a href="https://www.spaceappschallenge.org/">2026 NASA Space Apps Challenge</a>, an international hackathon
          organised by <a href="https://www.nasa.gov/">NASA</a>. It is not sponsored or endorsed by the National
          Aeronautics and Space Administration (NASA).
        </p>
      </footer>
    </>
  );
}
