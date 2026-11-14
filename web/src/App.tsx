import { useState } from "react";
import { useAnalysisActions } from "./analysis/actions";
import { AnalysisDialogs } from "./analysis/AnalysisDialogs";
import { CatalogPane } from "./catalog/CatalogPane";
import { ContentsPane } from "./contents/ContentsPane";
import { useDataActions } from "./data/actions";
import { DataDialogs } from "./data/DataDialogs";
import { Header } from "./header/Header";
import { useHelpActions } from "./help/actions";
import { HelpDialogs } from "./help/HelpDialogs";
import { useMapActions } from "./map/actions";
import { createMap } from "./map/map";
import { MapDialogs } from "./map/MapDialogs";
import { MapView } from "./map/MapView";
import { Ribbon } from "./ribbon/Ribbon";
import { TABS } from "./ribbon/tabs";
import type { ToolActions } from "./ribbon/types";
import { MapContext, useMap } from "./shared/map";
import { Messages } from "./shared/messages/Messages";
import { useShareActions } from "./share/actions";
import { ShareDialogs } from "./share/ShareDialogs";
import { StatusBar } from "./statusbar/StatusBar";
import { useViewActions } from "./view/actions";
import { ViewDialogs } from "./view/ViewDialogs";

/**
 * The elements of the page, in their places: the header, the ribbon, the map between the two panes, and the
 * status bar. Each element comes from the folder of its owner, and the ribbon receives the actions of every tab.
 */
function Page() {
  const map = useMap();
  const actions: ToolActions = {
    ...useMapActions(),
    ...useDataActions(),
    ...useAnalysisActions(),
    ...useViewActions(),
    ...useShareActions(),
    ...useHelpActions(),
  };

  return (
    <>
      <Header />
      <Ribbon tabs={TABS} actions={actions} />
      <div className="workspace">
        <ContentsPane />
        <div className="workspace-map">
          <MapView map={map} />
          <Messages />
        </div>
        <CatalogPane />
      </div>
      <StatusBar />
      <MapDialogs />
      <DataDialogs />
      <AnalysisDialogs />
      <ViewDialogs />
      <ShareDialogs />
      <HelpDialogs />
    </>
  );
}

/** The page of the application. It creates the map once and gives it to every element. */
export function App() {
  const [map] = useState(createMap);
  return (
    <MapContext value={map}>
      <Page />
    </MapContext>
  );
}
