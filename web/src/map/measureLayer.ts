import type { Coordinate } from "ol/coordinate";
import type { FeatureLike } from "ol/Feature";
import LineString from "ol/geom/LineString";
import MultiPoint from "ol/geom/MultiPoint";
import Point from "ol/geom/Point";
import Polygon from "ol/geom/Polygon";
import VectorLayer from "ol/layer/Vector";
import type Projection from "ol/proj/Projection";
import VectorSource from "ol/source/Vector";
import { Circle, Fill, Stroke, Style, Text } from "ol/style";
import { arcBetween, formatArea, formatDistance, measurePolygon, measureUnitsStore, segmentLengths } from "./measure";

/** The name of the layer that draws the measurements. */
export const MEASURE_LAYER_ID = "measure";

// The colours "ink", "white" and "primary" of the U.S. Web Design System, and the fonts of the page.
const INK = "#1b1b1b";
const WHITE = "#ffffff";
const PRIMARY = "#005ea2";
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const CASING = new Stroke({ color: WHITE, width: 5 });
const LINE = new Stroke({ color: PRIMARY, width: 3 });
const TINT = new Fill({ color: "rgba(0, 94, 162, 0.15)" });
const VERTEX = new Circle({
  radius: 4,
  fill: new Fill({ color: WHITE }),
  stroke: new Stroke({ color: PRIMARY, width: 2 }),
});

/** The label of a segment: dark text with a white edge. */
function segmentLabel(text: string): Text {
  return new Text({
    text,
    font: `12px ${FONT}`,
    fill: new Fill({ color: INK }),
    stroke: new Stroke({ color: WHITE, width: 4 }),
    overflow: true,
  });
}

/** The label of the whole measurement: dark text in a white box with a dark edge, above its point. */
function totalLabel(text: string, above: boolean): Text {
  return new Text({
    text,
    font: `bold 12px ${FONT}`,
    fill: new Fill({ color: INK }),
    backgroundFill: new Fill({ color: WHITE }),
    backgroundStroke: new Stroke({ color: INK, width: 1 }),
    padding: [3, 5, 2, 5],
    offsetY: above ? -18 : 0,
    overflow: true,
  });
}

/** Return the middle of a list of points along a line. */
function middleOf(points: readonly Coordinate[]): Coordinate {
  const middle = (points.length - 1) / 2;
  const [x1 = 0, y1 = 0] = points[Math.floor(middle)] ?? [];
  const [x2 = 0, y2 = 0] = points[Math.ceil(middle)] ?? [];
  return [(x1 + x2) / 2, (y1 + y2) / 2];
}

/**
 * Return the function that draws a measured line or polygon. Each segment is drawn along its great circle, which
 * is the line that is measured, and carries its length. The end of a line carries its whole length, and the
 * inside of a polygon its area. A polygon of fewer than three points and a line of one point carry no label.
 */
export function measureStyle(projection: Projection): (feature: FeatureLike, resolution: number) => Style[] {
  return (feature, resolution) => {
    const geometry = feature.getGeometry();
    if (geometry instanceof Point) {
      return [new Style({ image: VERTEX })];
    }
    const polygon = geometry instanceof Polygon ? geometry : null;
    const points =
      geometry instanceof LineString ? geometry.getCoordinates() : (polygon?.getLinearRing(0)?.getCoordinates() ?? []);
    if (points.length < 2) {
      return [];
    }
    const units = measureUnitsStore.get();
    const lengths = segmentLengths(points, projection);
    const arcs = points
      .slice(1)
      .map((point, index) => arcBetween(points[index] ?? point, point, projection, resolution));
    const path = arcs.flatMap((arc, index) => (index === 0 ? arc : arc.slice(1)));
    const outline = polygon ? new Polygon([path]) : new LineString(path);
    const styles = [
      new Style({ geometry: outline, stroke: CASING }),
      new Style({ geometry: outline, stroke: LINE, fill: polygon ? TINT : undefined }),
      new Style({ geometry: new MultiPoint(points), image: VERTEX }),
    ];
    // A sketch that is one segment long shows its length once, as the whole.
    const labelled = polygon ? points.length > 3 : points.length > 2;
    arcs.forEach((arc, index) => {
      const length = lengths[index] ?? 0;
      if (labelled && length > 0) {
        styles.push(
          new Style({ geometry: new Point(middleOf(arc)), text: segmentLabel(formatDistance(length, units.distance)) }),
        );
      }
    });
    if (polygon && points.length > 3) {
      const { area } = measurePolygon(polygon, projection);
      styles.push(
        new Style({ geometry: polygon.getInteriorPoint(), text: totalLabel(formatArea(area ?? 0, units.area), false) }),
      );
    } else if (!polygon) {
      const total = lengths.reduce((sum, length) => sum + length, 0);
      styles.push(
        new Style({
          geometry: new Point(points.at(-1) ?? [0, 0]),
          text: totalLabel(formatDistance(total, units.distance), true),
        }),
      );
    }
    return styles;
  };
}

export type MeasureLayer = VectorLayer<VectorSource>;

/** Create the layer that draws the measurements above the layers of the map and above the area. */
export function createMeasureLayer(projection: Projection): MeasureLayer {
  return new VectorLayer({
    source: new VectorSource(),
    zIndex: 1020,
    properties: { id: MEASURE_LAYER_ID },
    style: measureStyle(projection),
  });
}
