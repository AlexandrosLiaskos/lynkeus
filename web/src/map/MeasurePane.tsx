import { useId } from "react";
import { Info } from "../shared/info/Info";
import { useStore } from "../shared/store";
import { ToolPane } from "../shared/toolpane/ToolPane";
import {
  AREA_UNITS,
  DISTANCE_UNITS,
  EARTH_RADIUS,
  formatArea,
  formatDistance,
  measurementsStore,
  measureUnitsStore,
  type AreaUnit,
  type DistanceUnit,
  type Measurement,
} from "./measure";
import { sketchStore, type MeasureKind } from "./measureTool";

const TITLES = { distance: "Measure distance", area: "Measure area" } as const;

/** One measurement: the whole, and under it the length of each segment or side. */
function MeasurementLines({ measurement, name }: { measurement: Measurement; name: string }) {
  const units = useStore(measureUnitsStore);
  const { area, length, segments } = measurement;
  return (
    <>
      <strong>
        {name}:{" "}
        {area === null
          ? formatDistance(length, units.distance)
          : `${formatArea(area, units.area)}, perimeter ${formatDistance(length, units.distance)}`}
      </strong>
      <ol className="measure-segments" aria-label={area === null ? `Segments of ${name}` : `Sides of ${name}`}>
        {segments.map((segment, index) => (
          <li key={index}>{formatDistance(segment, units.distance)}</li>
        ))}
      </ol>
    </>
  );
}

/**
 * The pane of Measure distance or of Measure area, after the measure window of ArcGIS Pro: the units, the line
 * or polygon that is being drawn, and the finished measurements, which stay until they are cleared.
 */
export function MeasurePane({ kind }: { kind: MeasureKind }) {
  const id = useId();
  const units = useStore(measureUnitsStore);
  const measurements = useStore(measurementsStore);
  const sketch = useStore(sketchStore);
  const noun = kind === "distance" ? "line" : "polygon";

  return (
    <ToolPane
      id={`measure-${kind}`}
      title={TITLES[kind]}
      runLabel="Clear results"
      onRun={() => measurementsStore.set([])}
      ready={measurements.length > 0}
      info={
        <>
          Click the points of the {noun} on the map, and click twice on the last point. With the keyboard focus on the
          map, the Enter key adds a point at the cross and, pressed twice at one place, ends the {noun}. The Backspace
          key takes back the last point, and the Escape key gives up the {noun}.
        </>
      }
    >
      <label className="usa-label" htmlFor={`${id}-distance`}>
        Unit of length
      </label>
      <select
        className="usa-select"
        id={`${id}-distance`}
        value={units.distance}
        onChange={(event) => measureUnitsStore.set({ ...units, distance: event.target.value as DistanceUnit })}
      >
        {Object.entries(DISTANCE_UNITS).map(([unit, { name, symbol }]) => (
          <option key={unit} value={unit}>
            {name} ({symbol})
          </option>
        ))}
      </select>
      {kind === "area" ? (
        <>
          <label className="usa-label" htmlFor={`${id}-area`}>
            Unit of area
          </label>
          <select
            className="usa-select"
            id={`${id}-area`}
            value={units.area}
            onChange={(event) => measureUnitsStore.set({ ...units, area: event.target.value as AreaUnit })}
          >
            {Object.entries(AREA_UNITS).map(([unit, { name, symbol }]) => (
              <option key={unit} value={unit}>
                {name} ({symbol})
              </option>
            ))}
          </select>
        </>
      ) : null}
      <div className="info-title map-pane-heading">
        <h3>Results</h3>
        <Info id={`${id}-results-info`} about="Results">
          The lengths and the areas are measured on a sphere with a radius of{" "}
          {new Intl.NumberFormat("en-US").format(EARTH_RADIUS)} metres, the mean radius of the WGS 84 ellipsoid. Each
          segment is the great circle between its two points. On the ellipsoid itself a length differs by up to 0.6
          percent and an area by up to 0.9 percent.
        </Info>
      </div>
      {sketch ? (
        <div className="measure-result">
          <MeasurementLines measurement={sketch} name={`The ${noun} being drawn`} />
        </div>
      ) : null}
      {measurements.length === 0 && !sketch ? <p className="usa-hint">Nothing is measured.</p> : null}
      <ol className="measure-results" aria-label="Finished measurements" aria-describedby={`${id}-results-info`}>
        {measurements.map((measurement, index) => (
          <li key={index} className="measure-result">
            <MeasurementLines
              measurement={measurement}
              name={`${measurement.area === null ? "Distance" : "Area"} ${String(index + 1)}`}
            />
          </li>
        ))}
      </ol>
    </ToolPane>
  );
}
