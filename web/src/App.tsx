import { useState } from "react";
import { BASE_MAPS, type BaseMapId } from "./baseMaps";
import { MapView } from "./MapView";

/** The page of the application: the top bar, the tools of the map, the map and the notice. */
export function App() {
  const [baseMap, setBaseMap] = useState<BaseMapId>("blue-marble");

  return (
    <>
      <header className="site-header app-header">
        <h1 className="site-brand">
          <img src="/assets/lynkeus-mark.png" alt="" width="40" height="40" />
          <span className="site-name">Lynkeus</span>
        </h1>
        <nav aria-label="Site">
          <a href="/team-log/">Team log</a>
        </nav>
      </header>
      <div className="toolbar" role="group" aria-labelledby="base-map-label">
        <span id="base-map-label">Base map</span>
        <ul className="usa-button-group usa-button-group--segmented">
          {BASE_MAPS.map(({ id, label }) => (
            <li key={id} className="usa-button-group__item">
              <button
                type="button"
                className={id === baseMap ? "usa-button" : "usa-button usa-button--outline"}
                aria-pressed={id === baseMap}
                onClick={() => {
                  setBaseMap(id);
                }}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <MapView baseMap={baseMap} />
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
