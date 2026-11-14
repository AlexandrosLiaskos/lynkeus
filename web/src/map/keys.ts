import type { Coordinate } from "ol/coordinate";
import { noModifierKeys, targetNotEditable } from "ol/events/condition";
import Interaction from "ol/interaction/Interaction";
import { createStore } from "../shared/store";

/**
 * What the keys do for the tool in use, while the map has the keyboard focus. A cross marks the centre of the
 * map, and the arrow keys move the map under it, so the cross can be brought to any place without a pointer.
 */
export interface ToolKeys {
  /** The Enter key: act at the place under the cross, as a click of the pointer does. */
  point: (place: Coordinate) => void;
  /** The Escape key: give up what is being drawn. Returns false when nothing was being drawn. */
  cancel: () => boolean;
  /** The Backspace key: take back the last point. */
  back?: () => void;
}

/** The keys of the tool in use, or null when no tool takes keys. */
export const toolKeysStore = createStore<ToolKeys | null>(null);

/**
 * Create the interaction that runs a command when its key is pressed on the map. The commands are named by
 * the key, a letter in lower case. A key that is pressed with Shift, Control, Alt or the Meta key, or inside
 * a text field, is left alone.
 */
export function createKeys(commands: Readonly<Record<string, (() => void) | undefined>>): Interaction {
  return new Interaction({
    handleEvent: (event) => {
      if (event.type !== "keydown" || !noModifierKeys(event) || !targetNotEditable(event)) {
        return true;
      }
      const original = event.originalEvent as KeyboardEvent;
      const key = original.key.length === 1 ? original.key.toLowerCase() : original.key;
      const command = Object.hasOwn(commands, key) ? commands[key] : undefined;
      if (!command) {
        return true;
      }
      command();
      original.preventDefault();
      return false;
    },
  });
}
