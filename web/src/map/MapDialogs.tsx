import { AreaCoordinatesPane } from "./AreaCoordinatesPane";
import { AreaOnMap } from "./AreaOnMap";
import { BookmarksPane } from "./BookmarksPane";
import { GoToPane } from "./GoToPane";
import { GraticuleOnMap } from "./GraticuleOnMap";
import { ImageryPane } from "./ImageryPane";
import { MapKeys } from "./MapKeys";
import { MarkOnMap } from "./MarkOnMap";
import { MeasureOnMap } from "./MeasureOnMap";
import { MeasurePane } from "./MeasurePane";
import { ToolCross } from "./ToolCross";

/**
 * What the Map tab adds to the page besides its buttons: the keys of the map; the area, the lines of latitude
 * and longitude, the mark of a place and the measurements on the map; the cross of the tool in use; and the
 * panes of its tools. The page holds them once.
 */
export function MapDialogs() {
  return (
    <>
      <MapKeys />
      <AreaOnMap />
      <GraticuleOnMap />
      <MarkOnMap />
      <MeasureOnMap />
      <ToolCross />
      <AreaCoordinatesPane />
      <GoToPane />
      <BookmarksPane />
      <ImageryPane />
      <MeasurePane kind="distance" />
      <MeasurePane kind="area" />
    </>
  );
}
