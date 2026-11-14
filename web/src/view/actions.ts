import type { ToolAction, ToolActions } from "../ribbon/types";
import { closeToolPane, dockStore, frontOf, showPane, sideOf, type DockState } from "../shared/dock/dock";
import { useMap } from "../shared/map";
import { report } from "../shared/messages/messages";
import { panesStore, resetPanes, setPaneOpen, type PaneId } from "../shared/panes";
import { useStore } from "../shared/store";
import { statusBarStore } from "../statusbar/state";
import { canFillScreen, toggleFullScreen, useFullScreenElement } from "./fullScreen";
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
 * What the button of the Contents pane or of the Catalog pane does. The button is pressed while the pane is on
 * the page, so that it shows what the user sees: a pane that is open but has nothing to show is not on the page.
 * A press hides a pane that stands in front of its side and brings a pane that stands behind another one to the
 * front. A press on the button of a pane that is not on the page opens the pane; when the pane has nothing to
 * show, a message says so, and the pane appears with its first content.
 */
export function paneAction(id: PaneId, title: string, open: boolean, dock: DockState): ToolAction {
  const onPage = open && dock.panes.some((pane) => pane.id === id);
  const inFront = frontOf(dock, sideOf(id)) === id;
  return {
    pressed: onPage,
    run: () => {
      if (onPage && inFront) {
        setPaneOpen(id, false);
      } else if (onPage) {
        showPane(id);
      } else if (open) {
        report("info", `The ${title} pane has nothing to show yet.`);
      } else {
        setPaneOpen(id, true);
      }
    },
  };
}

/**
 * What the finished buttons of the View tab do. A button that shows and hides an element stays pressed while
 * the element is shown. The Full screen button is inactive in a browser that cannot fill the screen.
 */
export function useViewActions(): ToolActions<ViewToolId> {
  const map = useMap();
  const { contents, catalog } = useStore(panesStore);
  const dock = useStore(dockStore);
  const statusBar = useStore(statusBarStore);
  const fullScreen = useFullScreenElement();

  const actions: ToolActions<ViewToolId> = {
    "view-contents": paneAction("contents", "Contents", contents.open, dock),
    "view-catalog": paneAction("catalog", "Catalog", catalog.open, dock),
    "view-reset-panes": { run: resetAllPanes },
    "view-status-bar": { run: () => statusBarStore.set(!statusBar), pressed: statusBar },
  };
  if (canFillScreen()) {
    actions["view-full-screen"] = { run: () => toggleFullScreen(map), pressed: fullScreen !== null };
  }
  return actions;
}
