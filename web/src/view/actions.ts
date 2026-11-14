import type { ToolActions } from "../ribbon/types";
import { closeToolPane, dockStore } from "../shared/dock/dock";
import { useMap } from "../shared/map";
import { panesStore, resetPanes, setPaneOpen } from "../shared/panes";
import { useStore } from "../shared/store";
import { statusBarStore } from "../statusbar/state";
import { canFillScreen, toggleFullScreen, useFullScreenElement } from "./fullScreen";
import { useScaleBar } from "./scaleBar";
import type { ViewToolId } from "./tab";

/**
 * Return the panes beside the map to their first state, as Reset Panes for Mapping does in ArcGIS Pro: the
 * Contents pane and the Catalog pane are open at their first width, and the pane of every tool is closed.
 */
export function resetAllPanes(): void {
  dockStore.get().tools.forEach(closeToolPane);
  resetPanes();
}

/**
 * What the finished buttons of the View tab do. A button that shows and hides an element stays pressed while
 * the element is shown. The Full screen button is inactive in a browser that cannot fill the screen, and the
 * Scale bar button on a map that has no scale bar.
 */
export function useViewActions(): ToolActions<ViewToolId> {
  const map = useMap();
  const { contents, catalog } = useStore(panesStore);
  const statusBar = useStore(statusBarStore);
  const fullScreen = useFullScreenElement();
  const scaleBar = useScaleBar(map);

  const actions: ToolActions<ViewToolId> = {
    "view-contents": { run: () => setPaneOpen("contents", !contents.open), pressed: contents.open },
    "view-catalog": { run: () => setPaneOpen("catalog", !catalog.open), pressed: catalog.open },
    "view-reset-panes": { run: resetAllPanes },
    "view-status-bar": { run: () => statusBarStore.set(!statusBar), pressed: statusBar },
  };
  if (canFillScreen()) {
    actions["view-full-screen"] = { run: () => toggleFullScreen(map), pressed: fullScreen !== null };
  }
  if (scaleBar) {
    actions["view-scale-bar"] = { run: scaleBar.toggle, pressed: scaleBar.shown };
  }
  return actions;
}
