// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { Fragment, useId, useState } from "react";
import { FieldTitle, infoId } from "../shared/field/FieldTitle";
import { useMap } from "../shared/map";
import { Notice } from "../shared/notice/Notice";
import { useStore } from "../shared/store";
import { ToolPane, type ToolPaneRun } from "../shared/toolpane/ToolPane";
import { formatAngle, parseAngle, type Axis } from "./coordinates";
import { describedBy, FieldError } from "./FieldError";
import { goTo, latitudeLimit, markStore } from "./mark";

export const GO_TO_FAULTS = {
  latitude: "Enter the latitude in degrees, from 90 S to 90 N, for example 42.8 N or 42° 48′ 30″ N.",
  longitude: "Enter the longitude in degrees, from 180 W to 180 E, for example 70.9 W or 70° 54′ 00″ W.",
  limit: (limit: number) =>
    `The map ends at ${limit.toFixed(2)} degrees north and south. Enter a latitude between these limits.`,
} as const;

/** The two fields of the pane, in the order shown, each with its explanation. */
const FIELDS = [
  {
    axis: "latitude",
    title: "Latitude",
    info: "The latitude of the place, from 90 degrees south to 90 degrees north. It is written in decimal degrees, as 42.8 or 42.8 N, or in degrees, minutes and seconds, as 42° 48′ 30″ N. A latitude south of the equator takes the letter S or a minus sign.",
  },
  {
    axis: "longitude",
    title: "Longitude",
    info: "The longitude of the place, from 180 degrees west to 180 degrees east. It is written in decimal degrees, as -70.9 or 70.9 W, or in degrees, minutes and seconds, as 70° 54′ 00″ W. A longitude west of the meridian of Greenwich takes the letter W or a minus sign.",
  },
] as const;

const NO_FAULTS: Readonly<Record<Axis, string | null>> = { latitude: null, longitude: null };

/**
 * The pane of the button Go to coordinates, after the Go To XY tool of ArcGIS Pro: a latitude and a longitude,
 * in decimal degrees or in degrees, minutes and seconds. The map moves to the place and keeps its scale, and a
 * mark stays on the place until it is removed. A text that is not a latitude or a longitude of the map is
 * refused under its field, after the field is left or the run button is pressed.
 */
export function GoToPane() {
  const map = useMap();
  const id = useId();
  const marked = useStore(markStore);
  const [texts, setTexts] = useState<Record<Axis, string>>({ latitude: "", longitude: "" });
  const [faults, setFaults] = useState(NO_FAULTS);
  const [mark, setMark] = useState(true);
  const [run, setRun] = useState<ToolPaneRun | null>(null);

  // The sentence that says why the text of a field is not an angle of the map, or null when it is one.
  const faultOf = (axis: Axis): string | null => {
    const angle = parseAngle(texts[axis], axis);
    if (angle === null) {
      return GO_TO_FAULTS[axis];
    }
    const limit = latitudeLimit(map);
    return axis === "latitude" && Math.abs(angle) > limit ? GO_TO_FAULTS.limit(limit) : null;
  };

  const go = () => {
    const found = { latitude: faultOf("latitude"), longitude: faultOf("longitude") };
    const north = parseAngle(texts.latitude, "latitude");
    const east = parseAngle(texts.longitude, "longitude");
    setFaults(found);
    if (found.latitude !== null || found.longitude !== null || north === null || east === null) {
      setRun(null);
      return;
    }
    goTo(map, [east, north]);
    if (mark) {
      markStore.set([east, north]);
    }
    setRun({
      state: "success",
      text: `The centre of the map is ${formatAngle(north, "latitude")}, ${formatAngle(east, "longitude")}.`,
    });
  };

  const empty = FIELDS.find(({ axis }) => texts[axis].trim() === "");

  return (
    <ToolPane
      id="go-to-coordinates"
      title="Go to coordinates"
      runLabel="Go to place"
      onRun={go}
      ready={empty === undefined}
      missing={empty ? `Enter the ${empty.axis}.` : undefined}
      run={run}
    >
      {FIELDS.map(({ axis, title, info }) => {
        const field = `${id}-${axis}`;
        const fault = faults[axis];
        return (
          <Fragment key={axis}>
            <FieldTitle field={field} title={title}>
              {info}
            </FieldTitle>
            <input
              className={fault ? "usa-input usa-input--error" : "usa-input"}
              id={field}
              aria-invalid={fault ? true : undefined}
              aria-describedby={describedBy(infoId(field), fault && `${field}-error`)}
              value={texts[axis]}
              onChange={(event) => {
                setTexts({ ...texts, [axis]: event.target.value });
                setFaults({ ...faults, [axis]: null });
              }}
              onBlur={() => {
                if (texts[axis].trim() !== "") {
                  setFaults({ ...faults, [axis]: faultOf(axis) });
                }
              }}
            />
            <FieldError id={`${field}-error`}>{fault}</FieldError>
          </Fragment>
        );
      })}
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
        <Notice kind="info" action={{ label: "Remove mark", onClick: () => markStore.set(null) }}>
          The mark is at {formatAngle(marked[1], "latitude")}, {formatAngle(marked[0], "longitude")}.
        </Notice>
      ) : null}
    </ToolPane>
  );
}
