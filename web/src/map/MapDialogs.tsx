// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { AreaCoordinatesPane } from "./AreaCoordinatesPane";
import { AreaOnMap } from "./AreaOnMap";
import { BookmarksPane } from "./BookmarksPane";
import { GoToPane } from "./GoToPane";
import { GraticuleOnMap } from "./GraticuleOnMap";
import { IdentifyOnMap } from "./IdentifyOnMap";
import { IdentifyPane } from "./IdentifyPane";
import { ImageryPane } from "./ImageryPane";
import { MapKeys } from "./MapKeys";
import { MarkOnMap } from "./MarkOnMap";
import { MeasureOnMap } from "./MeasureOnMap";
import { MeasurePane } from "./MeasurePane";
import { SwipeOnMap } from "./SwipeOnMap";
import { SwipePane } from "./SwipePane";
import { ToolCross } from "./ToolCross";

/**
 * What the Map tab adds to the page besides its buttons: the keys of the map; the area, the lines of latitude
 * and longitude, the marks of places, the measurements and the swipe line on the map; the cross of the tool in
 * use; and the panes of its tools. The page holds them once.
 */
export function MapDialogs() {
  return (
    <>
      <MapKeys />
      <AreaOnMap />
      <GraticuleOnMap />
      <MarkOnMap />
      <MeasureOnMap />
      <IdentifyOnMap />
      <SwipeOnMap />
      <ToolCross />
      <AreaCoordinatesPane />
      <GoToPane />
      <BookmarksPane />
      <ImageryPane />
      <MeasurePane kind="distance" />
      <MeasurePane kind="area" />
      <IdentifyPane />
      <SwipePane />
    </>
  );
}
