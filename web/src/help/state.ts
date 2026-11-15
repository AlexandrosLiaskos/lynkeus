import type { SheetTool } from "../analysis/series";
import { createStore } from "../shared/store";

/** The name of the pane Getting started, which is also the name of the ribbon button that opens it. */
export const GETTING_STARTED_PANE = "help-getting-started";

/** Whether the dialog About is open. */
export const aboutDialogStore = createStore(false);

/** Whether the dialog Sources is open. */
export const sourcesDialogStore = createStore(false);

/**
 * Whether the dialog Methods is open, and the tool whose sheet it was asked for: the form of a tool asks for the
 * sheet of that tool, and the button Methods of the ribbon for all sheets (null).
 */
export const methodsStore = createStore<{ open: boolean; tool: SheetTool | null }>({ open: false, tool: null });
