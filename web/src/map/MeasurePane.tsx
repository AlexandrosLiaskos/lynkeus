// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { useId } from "react";
import { EmptyState } from "../shared/empty/EmptyState";
import { PropertyList, type Property } from "../shared/properties/PropertyList";
import { Section } from "../shared/section/Section";
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
const NOUNS = { distance: "line", area: "polygon" } as const;
const SKETCH_TITLES = { distance: "Line being drawn", area: "Polygon being drawn" } as const;

/**
 * Return the rows of one measurement in the chosen units: the length of a line, or the area and the perimeter
 * of a polygon, and under them the length of each segment or side. The whole values can be copied.
 */
export function measurementRows(
  { area, length, segments }: Measurement,
  units: { distance: DistanceUnit; area: AreaUnit },
): Property[] {
  const whole: Property[] =
    area === null
      ? [{ name: "Length", value: formatDistance(length, units.distance), copy: true }]
      : [
          { name: "Area", value: formatArea(area, units.area), copy: true },
          { name: "Perimeter", value: formatDistance(length, units.distance), copy: true },
        ];
  const part = area === null ? "Segment" : "Side";
  return [
    ...whole,
    ...segments.map((segment, index) => ({
      name: `${part} ${String(index + 1)}`,
      value: formatDistance(segment, units.distance),
    })),
  ];
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
  const noun = NOUNS[kind];

  return (
    <ToolPane
      id={`measure-${kind}`}
      title={TITLES[kind]}
      runLabel="Clear measurements"
      onRun={() => measurementsStore.set([])}
      ready={measurements.length > 0}
      missing="There is no measurement to clear."
      info={
        <>
          Click the points of the {noun} on the map, and click twice on the last point to end it. With the keyboard
          focus on the map, the Enter key adds a point at the cross and, pressed twice at one place, ends the {noun}.
          The Backspace key removes the last point, and the Escape key discards the {noun}.
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
      {sketch ? (
        <Section title={SKETCH_TITLES[sketch.kind]}>
          <PropertyList groups={[{ rows: measurementRows(sketch, units) }]} />
        </Section>
      ) : null}
      <Section
        title="Measurements"
        count={measurements.length}
        info={
          <>
            The lengths and the areas are measured on a sphere with a radius of{" "}
            {new Intl.NumberFormat("en-US").format(EARTH_RADIUS)} metres, the mean radius of the WGS 84 ellipsoid. Each
            segment is the great circle between its two points. On the ellipsoid itself a length differs by up to 0.6
            percent and an area by up to 0.9 percent.
          </>
        }
      >
        {measurements.length === 0 ? (
          <EmptyState
            title="No measurements"
            text={`Click the points of a ${noun} on the map, and click twice on the last point.`}
          />
        ) : (
          <PropertyList
            groups={measurements.map((measurement, index) => ({
              title: `${measurement.area === null ? "Distance" : "Area"} ${String(index + 1)}`,
              rows: measurementRows(measurement, units),
            }))}
          />
        )}
      </Section>
    </ToolPane>
  );
}
