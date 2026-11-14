import { useId, useState } from "react";
import { areaStore, type Area } from "../shared/area";
import { Info } from "../shared/info/Info";
import { useStore } from "../shared/store";
import { ToolPane, type ToolPaneRun } from "../shared/toolpane/ToolPane";
import { areaOfText, SIDES, type Side } from "./area";

const SIDE_NAMES = { west: "West", south: "South", east: "East", north: "North" } as const;

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
 * that is set and follow it when another tool changes it.
 */
export function AreaCoordinatesPane() {
  const id = useId();
  const area = useStore(areaStore);
  const [shown, setShown] = useState(area);
  const [sides, setSides] = useState(() => textOf(area));
  const [run, setRun] = useState<ToolPaneRun | null>(null);

  if (shown !== area) {
    setShown(area);
    setSides(textOf(area));
  }

  const setArea = () => {
    const reading = areaOfText(sides);
    if (reading.area) {
      areaStore.set(reading.area);
      setRun({ state: "success", text: "The area was set." });
    } else {
      setRun({ state: "error", text: reading.fault });
    }
  };

  return (
    <ToolPane id="area-from-coordinates" title="Area from coordinates" runLabel="Set area" onRun={setArea} run={run}>
      <fieldset className="usa-fieldset" aria-labelledby={`${id}-sides`} aria-describedby={`${id}-sides-info`}>
        <legend className="usa-legend">
          <span id={`${id}-sides`}>Sides of the area</span>
          <Info id={`${id}-sides-info`} about="Sides of the area">
            Each side is a number of decimal degrees of longitude or of latitude, for example -70.9. West and east lie
            between -180 and 180, and south and north between -90 and 90. West is smaller than east, and south is
            smaller than north.
          </Info>
        </legend>
        {SIDES.map((side) => (
          <div key={side}>
            <label className="usa-label" htmlFor={`${id}-${side}`}>
              {SIDE_NAMES[side]}
            </label>
            <input
              className="usa-input"
              id={`${id}-${side}`}
              value={sides[side]}
              onChange={(event) => setSides({ ...sides, [side]: event.target.value })}
            />
          </div>
        ))}
      </fieldset>
    </ToolPane>
  );
}
