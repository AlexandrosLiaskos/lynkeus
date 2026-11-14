import { useId, useState } from "react";
import { areaStore, type Area } from "../shared/area";
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
      <fieldset className="usa-fieldset">
        <legend className="usa-legend">Sides of the area</legend>
        <span className="usa-hint">
          In degrees of longitude and latitude. West and east run from -180 to 180, south and north from -90 to 90.
        </span>
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
