import { createStore } from "../shared/store";

/** The name of the pane Getting started, which is also the name of the ribbon button that opens it. */
export const GETTING_STARTED_PANE = "help-getting-started";

/** Whether the dialog About is open. */
export const aboutDialogStore = createStore(false);

/** Whether the dialog Sources is open. */
export const sourcesDialogStore = createStore(false);
