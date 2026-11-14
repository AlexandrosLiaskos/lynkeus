import { passFocus } from "../shared/dock/dock";
import { createStore } from "../shared/store";

/** The id of the layer whose tools are shown in the list of layers, or null. */
export const openLayerStore = createStore<string | null>(null);

/**
 * Give the keyboard focus to the heading of a section after the element that held the focus has left the page,
 * as the row of a removed job or layer does. When the section has left the page as well, the focus goes to the
 * map. The focus stays where it is when the visitor has moved it meanwhile.
 */
export function keepFocus(heading: () => HTMLElement | null): void {
  window.setTimeout(() => {
    if (document.activeElement === null || document.activeElement === document.body) {
      passFocus(heading() ?? undefined);
    }
  });
}
