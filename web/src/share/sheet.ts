import type { LayerDescription } from "../shared/layer";
import { createStore } from "../shared/store";
import type { FrameTick } from "./frame";
import type { LayoutForm } from "./layout";
import type { Picture } from "./picture";

/** The page of a layout, as it is given to the printer of the browser. */
export interface Sheet {
  form: LayoutForm;
  /** The picture of the map, or null while the page is measured for it. */
  picture: Picture | null;
  /** The marks of the coordinate frame. */
  ticks: readonly FrameTick[];
  /** The layers whose legends stand under the map. */
  layers: readonly LayerDescription[];
  /** The lines under the map: the scale, the projection and the date. */
  facts: readonly string[];
  /** The lines of sources. */
  credits: readonly string[];
}

/** The page that is being printed, or null. The page stands outside the screen and shows only in a print. */
export const sheetStore = createStore<Sheet | null>(null);
