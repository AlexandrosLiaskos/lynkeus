import { AreaOnMap } from "./AreaOnMap";
import { GraticuleOnMap } from "./GraticuleOnMap";
import { MapKeys } from "./MapKeys";
import { ToolCross } from "./ToolCross";

/**
 * What the Map tab adds to the page besides its buttons: the keys of the map, the area and the lines of latitude
 * and longitude on the map, and the cross of the tool in use. The page holds them once.
 */
export function MapDialogs() {
  return (
    <>
      <MapKeys />
      <AreaOnMap />
      <GraticuleOnMap />
      <ToolCross />
    </>
  );
}
