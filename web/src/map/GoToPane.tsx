import { useId, useState } from "react";
import { useMap } from "../shared/map";
import { useStore } from "../shared/store";
import { ToolPane, type ToolPaneRun } from "../shared/toolpane/ToolPane";
import { formatAngle, parseAngle } from "./coordinates";
import { goTo, latitudeLimit, markStore } from "./mark";

export const GO_TO_FAULTS = {
  latitude: "Give the latitude in degrees from 90 S to 90 N, for example 42.8, 42.8 N or 42° 48′ 30″ N.",
  longitude: "Give the longitude in degrees from 180 W to 180 E, for example -70.9, 70.9 W or 70° 54′ 00″ W.",
  limit: (limit: number) => `The map ends at ${limit.toFixed(2)} degrees of latitude, north and south.`,
} as const;

/**
 * The pane of the button Go to coordinates, after the Go To XY tool of ArcGIS Pro: a latitude and a longitude,
 * in decimal degrees or in degrees, minutes and seconds. The map moves to the place and keeps its scale, and a
 * mark stays on the place until it is removed.
 */
export function GoToPane() {
  const map = useMap();
  const id = useId();
  const marked = useStore(markStore);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [mark, setMark] = useState(true);
  const [run, setRun] = useState<ToolPaneRun | null>(null);

  const go = () => {
    const north = parseAngle(latitude, "latitude");
    const east = parseAngle(longitude, "longitude");
    const limit = latitudeLimit(map);
    if (north === null || east === null) {
      setRun({ state: "error", text: north === null ? GO_TO_FAULTS.latitude : GO_TO_FAULTS.longitude });
    } else if (Math.abs(north) > limit) {
      setRun({ state: "error", text: GO_TO_FAULTS.limit(limit) });
    } else {
      goTo(map, [east, north]);
      if (mark) {
        markStore.set([east, north]);
      }
      setRun({
        state: "success",
        text: `The centre of the map is ${formatAngle(north, "latitude")}, ${formatAngle(east, "longitude")}.`,
      });
    }
  };

  return (
    <ToolPane id="go-to-coordinates" title="Go to coordinates" runLabel="Go to" onRun={go} run={run}>
      <label className="usa-label" htmlFor={`${id}-latitude`}>
        Latitude
      </label>
      <span className="usa-hint" id={`${id}-latitude-hint`}>
        For example 42.8, 42.8 N or 42° 48′ 30″ N. South is S or a minus sign.
      </span>
      <input
        className="usa-input"
        id={`${id}-latitude`}
        aria-describedby={`${id}-latitude-hint`}
        value={latitude}
        onChange={(event) => setLatitude(event.target.value)}
      />
      <label className="usa-label" htmlFor={`${id}-longitude`}>
        Longitude
      </label>
      <span className="usa-hint" id={`${id}-longitude-hint`}>
        For example -70.9, 70.9 W or 70° 54′ 00″ W. West is W or a minus sign.
      </span>
      <input
        className="usa-input"
        id={`${id}-longitude`}
        aria-describedby={`${id}-longitude-hint`}
        value={longitude}
        onChange={(event) => setLongitude(event.target.value)}
      />
      <div className="usa-checkbox">
        <input
          className="usa-checkbox__input"
          id={`${id}-mark`}
          type="checkbox"
          checked={mark}
          onChange={(event) => setMark(event.target.checked)}
        />
        <label className="usa-checkbox__label" htmlFor={`${id}-mark`}>
          Mark the place on the map
        </label>
      </div>
      {marked ? (
        <p className="map-pane-line">
          A mark stands at {formatAngle(marked[1], "latitude")}, {formatAngle(marked[0], "longitude")}.{" "}
          <button type="button" className="usa-button usa-button--unstyled" onClick={() => markStore.set(null)}>
            Remove the mark
          </button>
        </p>
      ) : null}
    </ToolPane>
  );
}
