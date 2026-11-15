// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
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
import type { ShapeSymbol } from "../shared/shapeLayers";
import type { Product } from "./products";

/** The id of the shape layer of the outlines of the products found. The layer of the map carries it. */
export const PRODUCTS_LAYER_ID = "products";

// The primary colour of the U.S. Web Design System.
const OUTLINE = "#005ea2";

/**
 * How the map draws the outline of a product, which is also its symbol in the legend of the layer. An outline
 * has no visible fill, so that many outlines over one place do not hide the map.
 */
export const OUTLINE_SYMBOL = { label: "Outline of a product", line: OUTLINE, width: 1 } satisfies ShapeSymbol;

/**
 * How the map draws the outline of the selected product, which is also its symbol in the legend of the layer:
 * in cyan, the colour of a selection in ArcGIS Pro, over a casing in the colour of the text, so that the line
 * shows on a dark background and on a light one alike.
 */
export const SELECTED_SYMBOL = {
  label: "Selected product",
  line: "#00ffff",
  width: 3,
  casing: "#1b1b1b",
  fill: "rgba(0, 255, 255, 0.2)",
} satisfies ShapeSymbol;

/** The width of the casing under the line of the selected outline, in pixels. */
export const CASING_WIDTH = 5;

// The fill without colour lets the pointer find an outline by its inside.
const PLAIN = new Style({
  stroke: new Stroke({ color: OUTLINE_SYMBOL.line, width: OUTLINE_SYMBOL.width }),
  fill: new Fill({ color: "rgba(0, 94, 162, 0)" }),
});
const HOVERED = new Style({
  stroke: new Stroke({ color: OUTLINE, width: 2 }),
  fill: new Fill({ color: "rgba(0, 94, 162, 0.1)" }),
  zIndex: 1,
});
// The selected outline is drawn above the others: its casing first, then its line and its fill.
const SELECTED = [
  new Style({ stroke: new Stroke({ color: SELECTED_SYMBOL.casing, width: CASING_WIDTH }), zIndex: 2 }),
  new Style({
    stroke: new Stroke({ color: SELECTED_SYMBOL.line, width: SELECTED_SYMBOL.width }),
    fill: new Fill({ color: SELECTED_SYMBOL.fill }),
    zIndex: 3,
  }),
];

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
 * drawn stronger, and its property "hidden" holds the set of the products whose outlines are not drawn.
 */
export type FootprintLayer = VectorLayer<VectorSource<Feature<MultiPolygon>>>;

/** Tell whether the outline of a product is hidden on the layer. */
function isHidden(layer: FootprintLayer, id: string | number | undefined): boolean {
  const hidden: unknown = layer.get("hidden");
  return hidden instanceof Set && hidden.has(id);
}

/**
 * Create the layer that draws the outlines. It carries the id of its shape layer, and takes its place in the
 * drawing order from the Contents pane. A hidden outline has no style, so it is not drawn.
 */
export function createFootprintLayer(): FootprintLayer {
  const layer: FootprintLayer = new VectorLayer({
    source: new VectorSource<Feature<MultiPolygon>>(),
    properties: { id: PRODUCTS_LAYER_ID },
    style: (feature) => {
      const id = feature.getId();
      if (isHidden(layer, id)) {
        return undefined;
      }
      return id === layer.get("selected") ? SELECTED : id === layer.get("hovered") ? HOVERED : PLAIN;
    },
  });
  return layer;
}

/**
 * Return the identifiers of the products whose outlines hold a place of the map, in the order of the list. The
 * place is given in the projection of the map; a place on a repeated copy of the world counts as the same place
 * on the first one. A hidden outline is not found.
 */
export function productsAt(layer: FootprintLayer, place: Coordinate, projection: ProjectionLike): string[] {
  const known = getProjection(projection);
  const inWorld = known ? wrapX([...place], known) : place;
  const features = layer.getSource()?.getFeaturesAtCoordinate(inWorld) ?? [];
  return features
    .filter((feature) => !isHidden(layer, feature.getId()))
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
