// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type { LayerDescription } from "../shared/layer";
import { decibels } from "./cog";
import { isColourScale } from "./colours";
import { fromDecibels, inDecibels, isLinearPower } from "./scaling";
import type { LayerDisplay, Stretch } from "./state";
import { colourParts } from "./style";

/** The percent that a percent clip leaves out at each end, and the number of standard deviations, at the start. */
export const FIRST_PERCENT = 2;
export const FIRST_DEVIATIONS = 2;

/** What the Symbology pane holds while the user changes it. The numbers are texts, as they are typed. */
export interface Draft {
  colours: string;
  inverted: boolean;
  /** Whether the layer is shown in decibels. The range and the mask are then typed in decibels. */
  decibels: boolean;
  stretch: Stretch["kind"];
  percent: string;
  deviations: string;
  lowest: string;
  highest: string;
  noData: boolean;
  noDataColour: string;
  masked: boolean;
  maskLowest: string;
  maskHighest: string;
}

/** The fields of the pane in which a value can be wrong. */
export type Field =
  "colours" | "percent" | "deviations" | "lowest" | "highest" | "noDataColour" | "maskLowest" | "maskHighest";

/** A value that the pane cannot use: the field, and what is wrong in one sentence. */
export interface Problem {
  field: Field;
  text: string;
}

/** Write a number for a field: six significant digits, without zeros at its end. */
export function numberText(value: number): string {
  return String(Number(value.toPrecision(6)));
}

/** Read the number of a field, or NaN when the text is not a number. */
export function numberOf(text: string): number {
  return text.trim() === "" ? Number.NaN : Number(text.trim());
}

/** Return what the pane shows for a layer and its display. */
export function draftOf(layer: LayerDescription, display: LayerDisplay): Draft {
  const inDb = inDecibels(layer, display);
  const shown = (value: number) => numberText(inDb ? decibels(value) : value);
  const stretch = display.stretch ?? { kind: "typed" };
  const [maskLowest, maskHighest] = display.mask ?? display.range;
  return {
    colours: display.colours,
    inverted: display.inverted ?? false,
    decibels: inDb,
    stretch: stretch.kind,
    percent: String(stretch.kind === "percent" ? stretch.percent : FIRST_PERCENT),
    deviations: String(stretch.kind === "deviations" ? stretch.count : FIRST_DEVIATIONS),
    lowest: shown(display.range[0]),
    highest: shown(display.range[1]),
    noData: display.noDataColour !== undefined,
    noDataColour: display.noDataColour ?? "#000000",
    masked: display.mask !== undefined,
    // A layer in decibels whose mask starts at zero or below has no decibels for that limit.
    maskLowest: inDb && maskLowest <= 0 ? "" : shown(maskLowest),
    maskHighest: shown(maskHighest),
  };
}

/** Return the stretch that a draft names, or the problem with its number. */
export function stretchOf(draft: Draft): Stretch | Problem {
  switch (draft.stretch) {
    case "percent": {
      const percent = numberOf(draft.percent);
      return percent >= 0 && percent < 50
        ? { kind: "percent", percent }
        : { field: "percent", text: "Type a percent from 0 to below 50." };
    }
    case "deviations": {
      const count = numberOf(draft.deviations);
      return count > 0 && Number.isFinite(count)
        ? { kind: "deviations", count }
        : { field: "deviations", text: "Type a number of standard deviations above 0." };
    }
    default:
      return { kind: draft.stretch };
  }
}

/** Read two fields that hold a lowest and a highest value. */
function rangeOf(
  low: { field: Field; text: string },
  high: { field: Field; text: string },
  inDb: boolean,
): readonly [number, number] | Problem {
  const lowest = numberOf(low.text);
  const highest = numberOf(high.text);
  if (!Number.isFinite(lowest)) {
    return { field: low.field, text: "Type a number." };
  }
  if (!Number.isFinite(highest)) {
    return { field: high.field, text: "Type a number." };
  }
  if (lowest >= highest) {
    return { field: high.field, text: "The highest value must be larger than the lowest value." };
  }
  return inDb ? [fromDecibels(lowest), fromDecibels(highest)] : [lowest, highest];
}

/**
 * Return the change that a draft makes to the display of a layer, or the first problem among its values. The
 * range and the mask of the display are in the unit of the layer, whatever unit the draft is typed in. A layer of
 * classes keeps the colours of its classes, so a draft changes only the colour of its cells without data.
 */
export function changeOf(layer: LayerDescription, draft: Draft): Partial<LayerDisplay> | Problem {
  if (layer.classes) {
    if (draft.noData && !colourParts(draft.noDataColour)) {
      return { field: "noDataColour", text: "Choose a colour." };
    }
    return { noDataColour: draft.noData ? draft.noDataColour.toLowerCase() : undefined };
  }
  if (!isColourScale(draft.colours)) {
    return { field: "colours", text: "Choose a colour scale of the list." };
  }
  const stretch = stretchOf(draft);
  if ("field" in stretch) {
    return stretch;
  }
  const power = isLinearPower(layer);
  const inDb = power && draft.decibels;
  const range = rangeOf({ field: "lowest", text: draft.lowest }, { field: "highest", text: draft.highest }, inDb);
  if ("field" in range) {
    return range;
  }
  if (draft.noData && !colourParts(draft.noDataColour)) {
    return { field: "noDataColour", text: "Choose a colour." };
  }
  let mask: readonly [number, number] | undefined;
  if (draft.masked) {
    const limits = rangeOf(
      { field: "maskLowest", text: draft.maskLowest },
      { field: "maskHighest", text: draft.maskHighest },
      inDb,
    );
    if ("field" in limits) {
      return limits;
    }
    mask = limits;
  }
  return {
    colours: draft.colours,
    inverted: draft.inverted,
    decibels: power ? draft.decibels : undefined,
    range,
    stretch,
    noDataColour: draft.noData ? draft.noDataColour.toLowerCase() : undefined,
    mask,
  };
}
