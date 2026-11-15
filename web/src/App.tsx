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
import { keepMapView } from "./map/storedView";
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
import { Welcome } from "./welcome/Welcome";

/**
 * The icon of each pane on its tab at the edge of the window, where a side that hides its panes shows them. A
 * tool pane carries the name of the ribbon button that opens it, so it takes the icon of that button. The
 * Contents pane and the Catalog pane take the icons of their buttons of the View tab.
 */
const PANE_ICONS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    TABS.flatMap((tab) => tab.groups.flatMap((group) => group.tools.map(({ id, icon }) => [id, icon] as const))),
  ),
  contents: "list",
  catalog: "folder",
};

/**
 * The elements of the page, in their places: the header, the ribbon, the map between the panes of its two sides,
 * and the status bar. The welcome window opens over them when the page opens. The credits that must stand on the map itself are drawn over its lower right corner. Each
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
        <Dock side="left" icons={PANE_ICONS}>
          <ContentsPane />
        </Dock>
        <div className="workspace-map">
          <MapView map={map} />
          <Credits place="map" />
          <Messages />
        </div>
        <Dock side="right" icons={PANE_ICONS}>
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
      <Welcome />
    </>
  );
}

/**
 * Create the map of the page. Its view is kept in the browser from this moment, and the stored view is restored
 * before the page is drawn.
 */
function createPageMap() {
  const map = createMap();
  keepMapView(map);
  return map;
}

/** The page of the application. It creates the map once and gives it to every element. */
export function App() {
  const [map] = useState(createPageMap);
  return (
    <MapContext value={map}>
      <Page />
    </MapContext>
  );
}
