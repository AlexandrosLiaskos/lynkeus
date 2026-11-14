import Feature from "ol/Feature";
import type OlMap from "ol/Map";
import { createEmpty, extend, getWidth, intersects, isEmpty, type Extent } from "ol/extent";
import MultiPolygon from "ol/geom/MultiPolygon";
import Draw from "ol/interaction/Draw";
import VectorLayer from "ol/layer/Vector";
import { wrapX, type Coordinate } from "ol/coordinate";
import { get as getProjection, type ProjectionLike } from "ol/proj";
import VectorSource from "ol/source/Vector";
import { Fill, Stroke, Style } from "ol/style";
import type { Product } from "./products";

// The primary colour of the U.S. Web Design System. An outline has no visible fill, so that many outlines over
// one place do not hide the map; the fill without colour lets the pointer find an outline by its inside.
const OUTLINE = "#005ea2";
const PLAIN = new Style({
  stroke: new Stroke({ color: OUTLINE, width: 1 }),
  fill: new Fill({ color: "rgba(0, 94, 162, 0)" }),
});
const HOVERED = new Style({
  stroke: new Stroke({ color: OUTLINE, width: 2 }),
  fill: new Fill({ color: "rgba(0, 94, 162, 0.1)" }),
  zIndex: 1,
});
const SELECTED = new Style({
  stroke: new Stroke({ color: "#1a4480", width: 3 }),
  fill: new Fill({ color: "rgba(0, 94, 162, 0.2)" }),
  zIndex: 2,
});

/**
 * Return the outline of each product as a feature of the map, in the projection of the map. A feature carries
 * the place of its product in the list as its property "order".
 */
export function footprintFeatures(products: readonly Product[], projection: ProjectionLike): Feature<MultiPolygon>[] {
  return products.map(({ id, footprint }, order) => {
    const outline = new MultiPolygon(
      footprint.map((ring) => [ring.map(([longitude, latitude]) => [longitude, latitude])]),
    );
    outline.transform("EPSG:4326", projection);
    const feature = new Feature(outline);
    feature.setId(id);
    feature.set("order", order);
    return feature;
  });
}

/**
 * The layer of the outlines. Its properties "selected" and "hovered" name the products whose outlines are
 * drawn stronger.
 */
export type FootprintLayer = VectorLayer<VectorSource<Feature<MultiPolygon>>>;

/** Create the layer that draws the outlines above every other layer. */
export function createFootprintLayer(): FootprintLayer {
  const layer: FootprintLayer = new VectorLayer({
    source: new VectorSource<Feature<MultiPolygon>>(),
    zIndex: 1000,
    style: (feature) => {
      const id = feature.getId();
      return id === layer.get("selected") ? SELECTED : id === layer.get("hovered") ? HOVERED : PLAIN;
    },
  });
  return layer;
}

/**
 * Return the identifiers of the products whose outlines hold a place of the map, in the order of the list. The
 * place is given in the projection of the map; a place on a repeated copy of the world counts as the same place
 * on the first one.
 */
export function productsAt(layer: FootprintLayer, place: Coordinate, projection: ProjectionLike): string[] {
  const known = getProjection(projection);
  const inWorld = known ? wrapX([...place], known) : place;
  const features = layer.getSource()?.getFeaturesAtCoordinate(inWorld) ?? [];
  return features
    .sort((one, other) => Number(one.get("order")) - Number(other.get("order")))
    .map((feature) => String(feature.getId()));
}

/**
 * Return the product that a click selects among those under the pointer: the first one, or, when the selected
 * product is among them, the one after it. Repeated clicks on one place so pass through every product there,
 * and a click on the only product there ends its selection.
 */
export function nextSelection(under: readonly string[], selected: string | null): string | null {
  const index = selected === null ? -1 : under.indexOf(selected);
  if (index === -1) {
    return under[0] ?? null;
  }
  return under.length === 1 ? null : (under[(index + 1) % under.length] ?? null);
}

/** Tell whether the user is drawing a shape on the map, with a tool of any part of Lynkeus. */
export function isDrawing(map: OlMap): boolean {
  return map
    .getInteractions()
    .getArray()
    .some((interaction) => interaction instanceof Draw && interaction.getActive());
}

/** An outline narrower than this share of the view is too small to be told from its neighbours. */
const SMALLEST_SHARE = 1 / 8;

/**
 * Move the map to an outline that it does not show, or shows too small to be told from its neighbours. A map
 * that shows the outline, or a part of it from close by, stays as it is.
 */
export function showOutline(map: OlMap, outline: Extent, duration = 250): void {
  if (isEmpty(outline)) {
    return;
  }
  const view = map.getView();
  const shown = view.calculateExtent(map.getSize());
  if (!intersects(shown, outline) || getWidth(outline) < getWidth(shown) * SMALLEST_SHARE) {
    zoomTo(map, outline, duration);
  }
}

/** Move the map so that it shows an extent, with a margin around it. */
export function zoomTo(map: OlMap, extent: Extent, duration = 250): void {
  if (!isEmpty(extent)) {
    map.getView().fit(extent, { size: map.getSize(), padding: [40, 40, 40, 40], duration });
  }
}

/** Return the extent of the outlines of the given products, or of every product when none is named. */
export function outlinesExtent(layer: FootprintLayer, ids?: readonly string[]): Extent {
  const extent = createEmpty();
  layer
    .getSource()
    ?.getFeatures()
    .forEach((feature) => {
      const geometry = feature.getGeometry();
      if (geometry && (!ids || ids.includes(String(feature.getId())))) {
        extend(extent, geometry.getExtent());
      }
    });
  return extent;
}
