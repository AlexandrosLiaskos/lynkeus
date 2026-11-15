import type OlMap from "ol/Map";
import type Geometry from "ol/geom/Geometry";
import Draw, { createBox } from "ol/interaction/Draw";
import { Circle, Fill, Stroke, Style } from "ol/style";

/** A shape that the user draws on the map: a rectangle, with one drag, or a polygon, with one click for each point. */
export type ShapeKind = "rectangle" | "polygon";

/** What the user is told while a shape is drawn. */
export const DRAWING_HINTS: Record<ShapeKind, string> = {
  rectangle: "Press on the map, move the pointer and release. The Escape key ends the drawing.",
  polygon: "Click on the map for each point, and twice for the last. The Escape key ends the drawing.",
};

/**
 * Put a drawing tool on the map. A rectangle follows one drag, from the press to the release, and a polygon takes
 * one click for each point and a double click for the last. The sketch is a broken line in the colour given, with a
 * dot at the place of the pointer. `onShape` receives the shape that was drawn, in the projection of the map, and
 * `onEnd` is called when the drawing ends: after a shape, or with the Escape key, which ends it without a shape.
 * Return the function that takes the tool off the map.
 */
export function drawShape(
  map: OlMap,
  kind: ShapeKind,
  colour: string,
  onShape: (shape: Geometry) => void,
  onEnd: () => void,
): () => void {
  const style = new Style({
    stroke: new Stroke({ color: colour, width: 2, lineDash: [6, 4] }),
    image: new Circle({ radius: 4, fill: new Fill({ color: colour }) }),
  });
  // A freehand drawing begins at the press and ends at the release, so the rectangle follows one drag.
  const draw =
    kind === "rectangle"
      ? new Draw({ type: "Circle", geometryFunction: createBox(), freehand: true, style })
      : new Draw({ type: "Polygon", style });
  draw.on("drawend", (event) => {
    const shape = event.feature.getGeometry();
    if (shape) {
      onShape(shape);
    }
    onEnd();
  });
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      onEnd();
    }
  };
  map.addInteraction(draw);
  document.addEventListener("keydown", onKeyDown);
  return () => {
    document.removeEventListener("keydown", onKeyDown);
    map.removeInteraction(draw);
  };
}
