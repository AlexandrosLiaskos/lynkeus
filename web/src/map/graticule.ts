import Graticule from "ol/layer/Graticule";
import LayerGroup from "ol/layer/Group";
import { Fill, Stroke, Text } from "ol/style";

/** The name of the layer that draws the lines of latitude and longitude. */
export const GRATICULE_LAYER_ID = "graticule";

// The colours "ink" and "white" of the U.S. Web Design System, and the fonts of the page.
const INK = "#1b1b1b";
const WHITE = "#ffffff";
const FONT = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function label(place: Partial<{ textBaseline: CanvasTextBaseline; textAlign: CanvasTextAlign }>): Text {
  return new Text({
    font: FONT,
    fill: new Fill({ color: INK }),
    stroke: new Stroke({ color: WHITE, width: 3 }),
    ...place,
  });
}

/**
 * Create the lines of latitude and longitude, with their values in degrees, minutes and seconds along the edge
 * of the map. OpenLayers chooses the interval between the lines from the scale of the map. Each line is a dark
 * line on a wider white line, so that it stays visible on a background map of any colour. The lines start hidden.
 */
export function createGraticule(): LayerGroup {
  return new LayerGroup({
    visible: false,
    properties: { id: GRATICULE_LAYER_ID },
    layers: [
      new Graticule({ strokeStyle: new Stroke({ color: "rgba(255, 255, 255, 0.7)", width: 3 }), zIndex: 1000 }),
      new Graticule({
        strokeStyle: new Stroke({ color: INK, width: 1 }),
        showLabels: true,
        lonLabelStyle: label({ textBaseline: "bottom" }),
        latLabelStyle: label({ textAlign: "end" }),
        zIndex: 1001,
      }),
    ],
  });
}
