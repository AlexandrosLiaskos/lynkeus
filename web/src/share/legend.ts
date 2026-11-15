// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { colourScale, scaleKind } from "../contents/colours";
import { formatNumber, formatUnit, legendTicks } from "../contents/legendValues";
import { displayOf, displayStore } from "../contents/state";
import type { LayerDescription } from "../shared/layer";
import { mapLayersStore } from "../shared/mapLayers";
import { useStore } from "../shared/store";
import type { PictureLegend } from "./decorations";

/** The largest number of classes that a legend lists, as in the Contents pane. */
const MOST_CLASSES = 10;

/** Return the layers of the map that are shown, the highest one first, as the Contents pane lists them. */
export function visibleLayers(): LayerDescription[] {
  return [...mapLayersStore.get()].reverse().filter((layer) => displayOf(layer).visible);
}

/** Return the layers of the map that are shown, and follow their changes. */
export function useVisibleLayers(): LayerDescription[] {
  useStore(mapLayersStore);
  useStore(displayStore);
  return visibleLayers();
}

/**
 * Return the legend of a layer as it is drawn on a picture: the same quantity, unit, colours and values as the
 * legend of the Contents pane, for the display that the layer has now.
 */
export function pictureLegend(layer: LayerDescription): PictureLegend {
  const { range, colours: name } = displayOf(layer);
  const [lowest, highest] = range;
  const unit = formatUnit(layer.unit);
  const colours = colourScale(name);
  const base = { title: layer.title, caption: unit === "" ? layer.quantity : `${layer.quantity} (${unit})` };
  if (scaleKind(name) === "classes") {
    const first = Math.ceil(lowest);
    const count = Math.max(0, Math.floor(highest) - first + 1);
    const values = Array.from({ length: Math.min(count, MOST_CLASSES) }, (_unused, index) => first + index);
    return {
      ...base,
      ramp: null,
      classes: values.map((value) => ({
        colour: colours[((value % colours.length) + colours.length) % colours.length] ?? "",
        label: String(value),
      })),
      note: count > MOST_CLASSES ? "The colours repeat every ten values." : null,
    };
  }
  const marks = [
    { value: lowest, label: formatNumber(lowest) },
    ...legendTicks(lowest, highest),
    { value: highest, label: formatNumber(highest) },
  ];
  return {
    ...base,
    ramp: { colours, marks: marks.map(({ value, label }) => ({ at: (value - lowest) / (highest - lowest), label })) },
    classes: [],
    note: null,
  };
}
