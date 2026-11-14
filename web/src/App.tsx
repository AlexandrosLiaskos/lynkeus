import { useState } from "react";
import { useAnalysisActions } from "./analysis/actions";
import { AnalysisDialogs } from "./analysis/AnalysisDialogs";
import { CatalogPane } from "./catalog/CatalogPane";
import { ContentsPane } from "./contents/ContentsPane";
import { ContentsTools } from "./contents/ContentsTools";
import { useDataActions } from "./data/actions";
import { DataDialogs } from "./data/DataDialogs";
import { EarthdataAccount } from "./data/EarthdataAccount";
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
import { Credits } from "./shared/credits/Credits";
import { Dock } from "./shared/dock/Dock";
import { MapContext, useMap } from "./shared/map";
import { Messages } from "./shared/messages/Messages";
import { useShareActions } from "./share/actions";
import { ShareDialogs } from "./share/ShareDialogs";
import { StatusBar } from "./statusbar/StatusBar";
import { useViewActions } from "./view/actions";
import { ViewDialogs } from "./view/ViewDialogs";

/**
 * The elements of the page, in their places: the header, the ribbon, the map between the panes of its two sides,
 * and the status bar. The credits that must stand on the map itself are drawn over its lower right corner. Each
 * element comes from the folder of its owner, and the ribbon receives the actions of every tab. The dialogs and
 * the tool panes of every tab are declared inside the right side, where a tool pane is drawn; a dialog is drawn
 * over the page wherever it is declared.
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
      <Header account={<EarthdataAccount />} />
      <Ribbon tabs={TABS} actions={actions} />
      <div className="workspace">
        <Dock side="left">
          <ContentsPane />
        </Dock>
        <div className="workspace-map">
          <MapView map={map} />
          <Credits place="map" />
          <Messages />
        </div>
        <Dock side="right">
          <CatalogPane />
          <ContentsTools />
          <MapDialogs />
          <DataDialogs />
          <AnalysisDialogs />
          <ViewDialogs />
          <ShareDialogs />
          <HelpDialogs />
        </Dock>
      </div>
      <StatusBar />
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
