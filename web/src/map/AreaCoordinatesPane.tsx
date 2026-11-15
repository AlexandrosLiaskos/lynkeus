import { useId, useState } from "react";
import { areaStore, type Area } from "../shared/area";
import { Info } from "../shared/info/Info";
import { useMap } from "../shared/map";
import { useStore } from "../shared/store";
import { ToolPane, type ToolPaneRun } from "../shared/toolpane/ToolPane";
import { areaOfText, SIDES, type Side } from "./area";
import { zoomToArea } from "./commands";
import { describedBy, FieldError } from "./FieldError";

const SIDE_NAMES = { west: "West (°)", south: "South (°)", east: "East (°)", north: "North (°)" } as const;

function textOf(area: Area | null): Record<Side, string> {
  return {
    west: area ? String(area.west) : "",
    south: area ? String(area.south) : "",
    east: area ? String(area.east) : "",
    north: area ? String(area.north) : "",
  };
}

/**
 * The pane of the button From coordinates: the four sides of the area, in degrees. The fields show the area
 * that is set and follow it when another tool changes it. Sides that are not an area are refused under the
 * fields, and after the area is set the foot offers to show the whole of it.
 */
export function AreaCoordinatesPane() {
  const map = useMap();
  const id = useId();
  const area = useStore(areaStore);
  const [shown, setShown] = useState(area);
  const [sides, setSides] = useState(() => textOf(area));
  const [fault, setFault] = useState<string | null>(null);
  const [run, setRun] = useState<ToolPaneRun | null>(null);

  if (shown !== area) {
    setShown(area);
    setSides(textOf(area));
    setFault(null);
  }

  const setArea = () => {
    const reading = areaOfText(sides);
    setFault(reading.fault);
    if (reading.area) {
      areaStore.set(reading.area);
      setRun({
        state: "success",
        text: "The area was set.",
        action: { label: "Zoom to area", onClick: () => zoomToArea(map) },
      });
    } else {
      setRun(null);
    }
  };

  const empty = SIDES.find((side) => sides[side].trim() === "");

  return (
    <ToolPane
      id="area-from-coordinates"
      title="Area from coordinates"
      runLabel="Set area"
      onRun={setArea}
      ready={empty === undefined}
      missing={empty ? `Enter the ${empty} side of the area.` : undefined}
      run={run}
    >
      <fieldset
        className="usa-fieldset"
        aria-labelledby={`${id}-sides`}
        aria-describedby={describedBy(`${id}-sides-info`, fault && `${id}-sides-error`)}
      >
        <legend className="usa-legend">
          <span id={`${id}-sides`}>Sides of the area</span>
          <Info id={`${id}-sides-info`} about="Sides of the area">
            Each side is a number of decimal degrees of longitude or of latitude, for example -70.9. West and east lie
            between -180 and 180, and south and north between -90 and 90. West is smaller than east, and south is
            smaller than north.
          </Info>
        </legend>
        <div className="area-sides">
          {SIDES.map((side) => (
            <div key={side}>
              <label className="usa-label" htmlFor={`${id}-${side}`}>
                {SIDE_NAMES[side]}
              </label>
              <input
                className={fault ? "usa-input usa-input--error" : "usa-input"}
                id={`${id}-${side}`}
                aria-invalid={fault ? true : undefined}
                value={sides[side]}
                onChange={(event) => {
                  setSides({ ...sides, [side]: event.target.value });
                  setFault(null);
                }}
              />
            </div>
          ))}
        </div>
        <FieldError id={`${id}-sides-error`}>{fault}</FieldError>
      </fieldset>
    </ToolPane>
  );
}
