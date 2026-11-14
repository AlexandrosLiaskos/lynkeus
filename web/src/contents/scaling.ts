import type { LayerDescription } from "../shared/layer";
import { decibels } from "./cog";
import { formatUnit } from "./legendValues";
import type { LayerDisplay } from "./state";

/**
 * Tell whether the values of a layer are a power on a linear scale, as the radar backscatter of a GCOV product
 * is. The description of such a layer says so in its quantity and gives the unit 1.
 */
export function isLinearPower(layer: LayerDescription): boolean {
  return layer.unit === "1" && /\blinear power\b/.test(layer.quantity);
}

/**
 * Tell whether the colour scale of a layer is applied to the decibels of its values. Only a power on a linear
 * scale is shown in decibels. A range that starts at zero or below has no decibels, so such a range is drawn on
 * the linear scale.
 */
export function inDecibels(layer: LayerDescription, display: LayerDisplay): boolean {
  return isLinearPower(layer) && display.decibels !== false && display.range[0] > 0;
}

/** Return the values that receive the first and the last colour, in the unit in which the layer is shown. */
export function shownRange(layer: LayerDescription, display: LayerDisplay): readonly [number, number] {
  const [lowest, highest] = display.range;
  return inDecibels(layer, display) ? [decibels(lowest), decibels(highest)] : [lowest, highest];
}

/** The power that has a value in decibels. */
export function fromDecibels(value: number): number {
  return 10 ** (value / 10);
}

/** Return the unit in which a layer is shown, written for the reader. */
export function shownUnit(layer: LayerDescription, display: LayerDisplay): string {
  return inDecibels(layer, display) ? "dB" : formatUnit(layer.unit);
}
