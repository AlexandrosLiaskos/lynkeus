import { dockStore } from "../shared/dock/dock";
import { PANE_WIDTH, panesStore, type PaneState } from "../shared/panes";
import { keepInBrowser } from "../shared/storage/storage";
import { statusBarStore } from "../statusbar/state";

/** The name under which the panes are kept in the local storage of the browser. */
export const PANES_KEY = "lynkeus.panes";

/**
 * The panes as the browser keeps them. The tool panes that are open are not kept: a tool starts when the user
 * asks for it.
 */
export interface StoredPanes {
  contents: PaneState;
  catalog: PaneState;
  /** The names of the panes that hide automatically. */
  hidden: readonly string[];
  /** Whether the status bar is shown. */
  statusBar: boolean;
}

/** The form of the name of a pane, and the largest number of names that a stored list may hold. */
const PANE_NAME = /^[a-z][a-z0-9-]{0,63}$/;
const MOST_NAMES = 200;

function paneState(stored: unknown): PaneState | undefined {
  if (typeof stored !== "object" || stored === null) {
    return undefined;
  }
  const { open, width } = stored as Record<string, unknown>;
  return typeof open === "boolean" &&
    typeof width === "number" &&
    Number.isInteger(width) &&
    width >= PANE_WIDTH.smallest &&
    width <= PANE_WIDTH.largest
    ? { open, width }
    : undefined;
}

/**
 * Check the panes that were read from the storage: each pane is open or not and has a width inside the limits
 * of a side, the names of the panes that hide automatically have the form of a name and stand once each, and
 * the status bar is shown or not. The value returned holds these fields only.
 */
export function storedPanes(stored: unknown): StoredPanes | undefined {
  if (typeof stored !== "object" || stored === null) {
    return undefined;
  }
  const { hidden, statusBar } = stored as Record<string, unknown>;
  const contents = paneState((stored as Record<string, unknown>).contents);
  const catalog = paneState((stored as Record<string, unknown>).catalog);
  if (
    !contents ||
    !catalog ||
    typeof statusBar !== "boolean" ||
    !Array.isArray(hidden) ||
    hidden.length > MOST_NAMES ||
    !hidden.every((name): name is string => typeof name === "string" && PANE_NAME.test(name)) ||
    new Set(hidden).size !== hidden.length
  ) {
    return undefined;
  }
  return { contents, catalog, hidden: [...hidden], statusBar };
}

// The panes are a part of the work that the browser keeps. They return when the page opens.
keepInBrowser<StoredPanes>({
  key: PANES_KEY,
  title: "Panes",
  description:
    "Which of the Contents pane and the Catalog pane are open, the widths of the two sides, the panes that hide automatically and whether the status bar shows.",
  read: () => {
    const { contents, catalog } = panesStore.get();
    return { contents, catalog, hidden: dockStore.get().hidden, statusBar: statusBarStore.get() };
  },
  check: storedPanes,
  restore: ({ contents, catalog, hidden, statusBar }) => {
    panesStore.set({ contents, catalog });
    dockStore.set({ ...dockStore.get(), hidden, revealed: { left: null, right: null } });
    statusBarStore.set(statusBar);
  },
  subscribe: (listener) => {
    // The dock changes with every pane that opens or comes to the front; only its pins are kept.
    let hidden = dockStore.get().hidden;
    const ends = [
      panesStore.subscribe(listener),
      statusBarStore.subscribe(listener),
      dockStore.subscribe(() => {
        const next = dockStore.get().hidden;
        if (next !== hidden) {
          hidden = next;
          listener();
        }
      }),
    ];
    return () => ends.forEach((end) => end());
  },
});
