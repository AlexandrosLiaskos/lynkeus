import type { ToolAction, ToolActions } from "../ribbon/types";
import { closeToolPane, dockStore, isShown, pinAllPanes, showPane, type DockState } from "../shared/dock/dock";
import { useMap } from "../shared/map";
import { panesStore, resetPanes, setPaneOpen, type PaneId } from "../shared/panes";
import { useStore } from "../shared/store";
import { statusBarStore } from "../statusbar/state";
import { canFillScreen, toggleFullScreen, useFullScreenElement } from "./fullScreen";
// The panes are kept in the browser from the moment at which the View tab is loaded.
import "./storedPanes";
import type { ViewToolId } from "./tab";

/**
 * Return the panes beside the map to their first state, as Reset Panes for Mapping does in ArcGIS Pro: the
 * Contents pane and the Catalog pane are open at their first width, no pane hides automatically, and the pane
 * of every tool is closed.
 */
export function resetAllPanes(): void {
  dockStore.get().tools.forEach(closeToolPane);
  pinAllPanes();
  resetPanes();
}

/**
 * What the button of the Contents pane or of the Catalog pane does. Each of the two panes has something to show
 * whenever it is open, so the button is pressed while its pane is on the page, which is what the user sees. A
 * press hides a pane that is visible, shows a pane that stands behind another one or is hidden at the edge of
 * the window, and opens a pane that is not on the page.
 */
export function paneAction(id: PaneId, open: boolean, dock: DockState): ToolAction {
  const onPage = open && dock.panes.some((pane) => pane.id === id);
  const visible = isShown(dock, id);
  return {
    pressed: onPage,
    run: () => {
      if (onPage && visible) {
        setPaneOpen(id, false);
      } else if (onPage) {
        showPane(id);
      } else {
        setPaneOpen(id, true);
      }
    },
  };
}

/** What the Full screen button says in a browser that cannot show an element over the whole screen. */
export const NO_FULL_SCREEN = "This browser does not allow a page to fill the screen.";

/**
 * What the finished buttons of the View tab do. A button that shows and hides an element stays pressed while
 * the element is shown. In a browser that cannot fill the screen the Full screen button is inactive and says so.
 */
export function useViewActions(): ToolActions<ViewToolId> {
  const map = useMap();
  const { contents, catalog } = useStore(panesStore);
  const dock = useStore(dockStore);
  const statusBar = useStore(statusBarStore);
  const fullScreen = useFullScreenElement();

  return {
    "view-contents": paneAction("contents", contents.open, dock),
    "view-catalog": paneAction("catalog", catalog.open, dock),
    "view-reset-panes": { run: resetAllPanes },
    "view-full-screen": canFillScreen()
      ? { run: () => toggleFullScreen(map), pressed: fullScreen !== null }
      : { run: () => undefined, missing: NO_FULL_SCREEN },
    "view-status-bar": { run: () => statusBarStore.set(!statusBar), pressed: statusBar },
  };
}
