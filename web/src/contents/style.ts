// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type { Style } from "ol/layer/WebGLTile";
import type { LayerClass } from "../shared/layer";
import { colourScale, scaleKind } from "./colours";

/** The value of the style variables of the mask while no value is hidden. */
export const NO_MASK = [-3e38, 3e38] as const;

/** The choices that give a layer another style. The range and the mask are style variables instead. */
export interface StyleChoices {
  /** Name of the colour scale. */
  colours: string;
  /** Whether the colour scale is turned round. */
  inverted: boolean;
  /** The colour of the cells without data, as # and six hexadecimal digits, or null for transparent cells. */
  noDataColour: string | null;
  /**
   * The classes of a layer of classes, or null. A layer of classes is drawn in the colours of its classes, and its
   * colour scale, its range and its mask are not used.
   */
  classes?: readonly LayerClass[] | null;
}

/** Return the red, green and blue of a colour written as # and six hexadecimal digits, each from 0 to 255, or null. */
export function colourParts(colour: string): [number, number, number] | null {
  const parts = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour);
  return parts ? [parseInt(parts[1] ?? "", 16), parseInt(parts[2] ?? "", 16), parseInt(parts[3] ?? "", 16)] : null;
}

/**
 * Return the style that draws the tiles of a `CogSource` with a colour scale. The first number of a cell is the
 * value that receives a colour, the last one tells whether the cell holds data, and the one before the last is
 * the value of the file. A continuous scale spreads its colours evenly between the variables `lowest` and
 * `highest`; values outside them receive the first or the last colour. A scale of classes gives each whole
 * number one colour, and the colours repeat. A cell whose value lies outside the variables `maskLowest` and
 * `maskHighest` is transparent, and so is every cell beyond the edge of the file. A layer of classes gives the
 * cells of each class the colour of that class, and a cell of a value that is no class is transparent.
 *
 * @param choices The colour scale, the colour of the cells without data and the classes of a layer of classes.
 * @param numbers How many numbers a cell of the source holds.
 */
export function layerStyle({ colours, inverted, noDataColour, classes }: StyleChoices, numbers: number): Style {
  const ofClasses = scaleKind(colours) === "classes";
  const palette = inverted && !ofClasses ? [...colourScale(colours)].reverse() : [...colourScale(colours)];
  const shown = ["band", 1];
  const value = ["band", numbers - 1];
  const present = ["band", numbers];
  const share = ["clamp", ["/", ["-", shown, ["var", "lowest"]], ["-", ["var", "highest"], ["var", "lowest"]]], 0, 1];
  const index = ofClasses ? ["%", ["round", shown], palette.length] : ["*", share, palette.length - 1];
  const transparent = ["color", 0, 0, 0, 0];
  const noData = noDataColour === null ? null : colourParts(noDataColour);
  if (classes) {
    const coloured = classes.flatMap((entry) => [entry.value, ["color", ...(colourParts(entry.colour) ?? []), 1]]);
    return {
      variables: { lowest: 0, highest: 1, maskLowest: NO_MASK[0], maskHighest: NO_MASK[1] },
      color: [
        "case",
        ["==", present, 0],
        transparent,
        ["<", present, 1],
        noData ? ["color", ...noData, 1] : transparent,
        ["match", ["round", value], ...coloured, transparent],
      ],
    };
  }
  return {
    variables: { lowest: 0, highest: 1, maskLowest: NO_MASK[0], maskHighest: NO_MASK[1] },
    color: [
      "case",
      ["==", present, 0],
      transparent,
      ["<", present, 1],
      noData ? ["color", ...noData, 1] : transparent,
      ["any", ["<", value, ["var", "maskLowest"]], [">", value, ["var", "maskHighest"]]],
      transparent,
      ["palette", index, palette],
    ],
  };
}
