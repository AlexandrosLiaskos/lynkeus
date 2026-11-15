// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import Graticule from "ol/layer/Graticule";
import LayerGroup from "ol/layer/Group";
import { Fill, Stroke, Text } from "ol/style";

/** The name of the layer that draws the lines of latitude and longitude. */
export const GRATICULE_LAYER_ID = "graticule";

// The colours "ink" and "white" of the U.S. Web Design System, and the fonts of the page.
const INK = "#1b1b1b";
const WHITE = "#ffffff";
const FONT = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** The dark line of the graticule, 1 pixel wide. */
export const LINE = new Stroke({ color: INK, width: 1 });

/** The white line under the dark one, 2 pixels wide. It shows as an edge of half a pixel on each side of the dark line. */
export const LINE_EDGE = new Stroke({ color: WHITE, width: 2 });

/**
 * Create the style of the values: dark text with a white edge. The edge is a line of 2 pixels along the outline
 * of the letters, of which 1 pixel shows outside them.
 */
export function label(
  place: Partial<{ textBaseline: CanvasTextBaseline; textAlign: CanvasTextAlign; offsetX: number; offsetY: number }>,
): Text {
  return new Text({
    font: FONT,
    fill: new Fill({ color: INK }),
    stroke: new Stroke({ color: WHITE, width: 2 }),
    ...place,
  });
}

/**
 * The distance in pixels between a value and its line. The value stands clear of the line and of both white edges:
 * 4 pixels less 1 pixel of the white line on each side of the line's centre and 1 pixel of the white edge of the
 * text leave a gap of 2 pixels.
 */
export const LABEL_GAP = 4;

/** The style of a value of longitude: at the top edge of the map, to the right of its line. */
export const LONGITUDE_LABEL = label({
  textBaseline: "top",
  textAlign: "start",
  offsetX: LABEL_GAP,
  offsetY: LABEL_GAP,
});

/**
 * The style of a value of latitude: at the left edge of the map, above its line. The values have no letters that
 * reach below the base line of the text, so the base line stands at the gap above the line.
 */
export const LATITUDE_LABEL = label({
  textBaseline: "alphabetic",
  textAlign: "start",
  offsetX: LABEL_GAP,
  offsetY: -LABEL_GAP,
});

/**
 * Create the lines of latitude and longitude, with their values in degrees, minutes and seconds along the top
 * and the left edge of the map. OpenLayers chooses the interval between the lines from the scale of the map. Each line is a dark
 * line on a white line that is 1 pixel wider. The dark line shows on a light background map and the white edge
 * on a dark one. The lines start hidden.
 */
export function createGraticule(): LayerGroup {
  return new LayerGroup({
    visible: false,
    properties: { id: GRATICULE_LAYER_ID },
    layers: [
      new Graticule({ strokeStyle: LINE_EDGE, zIndex: 1000 }),
      new Graticule({
        strokeStyle: LINE,
        showLabels: true,
        // The values stand along the top and the left edge of the map, clear of the credit that a background
        // map may need in the lower right corner, and beside their lines, never on them.
        lonLabelPosition: 1,
        lonLabelStyle: LONGITUDE_LABEL,
        latLabelPosition: 0,
        latLabelStyle: LATITUDE_LABEL,
        zIndex: 1001,
      }),
    ],
  });
}
