import Feature from "ol/Feature";
import type OlMap from "ol/Map";
import { getWidth, intersects, type Extent } from "ol/extent";
import MultiPolygon from "ol/geom/MultiPolygon";
import VectorLayer from "ol/layer/Vector";
import type { ProjectionLike } from "ol/proj";
import VectorSource from "ol/source/Vector";
import { Fill, Stroke, Style } from "ol/style";
import type { Product } from "./products";

// The primary colour of the U.S. Web Design System, and the same colour at two strengths for the fill.
const OUTLINE = "#005ea2";
const PLAIN = new Style({
  stroke: new Stroke({ color: OUTLINE, width: 1 }),
  fill: new Fill({ color: "rgba(0, 94, 162, 0.05)" }),
});
const SELECTED = new Style({
  stroke: new Stroke({ color: OUTLINE, width: 3 }),
  fill: new Fill({ color: "rgba(0, 94, 162, 0.2)" }),
  zIndex: 1,
});

/** Return the outline of each product as a feature of the map, in the projection of the map. */
export function footprintFeatures(products: readonly Product[], projection: ProjectionLike): Feature<MultiPolygon>[] {
  return products.map(({ id, footprint }) => {
    const outline = new MultiPolygon(
      footprint.map((ring) => [ring.map(([longitude, latitude]) => [longitude, latitude])]),
    );
    outline.transform("EPSG:4326", projection);
    const feature = new Feature(outline);
    feature.setId(id);
    return feature;
  });
}

/** The layer of the outlines. Its property "selected" names the product whose outline is drawn stronger. */
export type FootprintLayer = VectorLayer<VectorSource<Feature<MultiPolygon>>>;

/** Create the layer that draws the outlines above every other layer. */
export function createFootprintLayer(): FootprintLayer {
  const layer: FootprintLayer = new VectorLayer({
    source: new VectorSource<Feature<MultiPolygon>>(),
    zIndex: 1000,
    style: (feature) => {
      const selected: unknown = layer.get("selected");
      return feature.getId() === selected ? SELECTED : PLAIN;
    },
  });
  return layer;
}

/** An outline narrower than this share of the view is too small to be told from its neighbours. */
const SMALLEST_SHARE = 1 / 8;

/**
 * Move the map to an outline that it does not show, or shows too small to be told from its neighbours. A map
 * that shows the outline, or a part of it from close by, stays as it is.
 */
export function showOutline(map: OlMap, outline: Extent, duration = 250): void {
  const view = map.getView();
  const shown = view.calculateExtent(map.getSize());
  if (!intersects(shown, outline) || getWidth(outline) < getWidth(shown) * SMALLEST_SHARE) {
    view.fit(outline, { size: map.getSize(), padding: [40, 40, 40, 40], duration });
  }
}
