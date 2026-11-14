import { useEffect, useState } from "react";
import { useMap } from "../shared/map";
import { useStore } from "../shared/store";
import { toolKeysStore } from "./keys";
import { formatArea, formatDistance, measurementsStore, measureUnitsStore, type Measurement } from "./measure";
import { createMeasureLayer } from "./measureLayer";
import { startMeasureTool } from "./measureTool";
import { toolStore } from "./state";

/** What a screen reader is told about the last measurement, which a sighted user reads on the map. */
export function measureSentence(
  measurement: Measurement | undefined,
  units: ReturnType<typeof measureUnitsStore.get>,
): string {
  if (!measurement) {
    return "Nothing is measured.";
  }
  const length = formatDistance(measurement.length, units.distance);
  return measurement.area === null
    ? `The line is ${length} long.`
    : `The area is ${formatArea(measurement.area, units.area)}, and its perimeter is ${length}.`;
}

/**
 * The measurements on the map. While Measure distance or Measure area is on, the tool is in use. The finished
 * lines and polygons stay on their layer until the list of measurements is emptied.
 */
export function MeasureOnMap() {
  const map = useMap();
  const tool = useStore(toolStore);
  const units = useStore(measureUnitsStore);
  const measurements = useStore(measurementsStore);
  const [layer] = useState(() => createMeasureLayer(map.getView().getProjection()));
  const kind = tool === "measure-distance" ? "distance" : tool === "measure-area" ? "area" : null;

  useEffect(() => {
    map.addLayer(layer);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, layer]);

  // The labels are drawn again in the unit that the user has chosen.
  useEffect(() => {
    layer.changed();
  }, [layer, units]);

  useEffect(() => {
    if (measurements.length === 0) {
      layer.getSource()?.clear();
    }
  }, [layer, measurements]);

  useEffect(() => {
    if (!kind) {
      return;
    }
    const started = startMeasureTool(map, layer, kind);
    toolKeysStore.set({ point: started.point, cancel: started.cancel, back: started.back });
    return () => {
      toolKeysStore.set(null);
      started.stop();
    };
  }, [map, layer, kind]);

  return (
    <p className="map-live" role="status">
      {measureSentence(measurements.at(-1), units)}
    </p>
  );
}
