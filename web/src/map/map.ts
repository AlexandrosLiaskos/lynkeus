import OlMap from "ol/Map";
import View from "ol/View";
import { Attribution, ScaleLine } from "ol/control";
import type { Extent } from "ol/extent";
import TileLayer from "ol/layer/Tile";
import { fromLonLat } from "ol/proj";
import { BASE_MAPS, type BaseMapId } from "./baseMaps";

/** The view that shows the whole world. */
const WORLD = { center: fromLonLat([0, 20]), zoom: 2 };

/** The time that the map takes to move to a new view, in milliseconds. */
const DURATION = 250;

/** The margin that is left around a rectangle shown as a whole, in pixels. */
const MARGIN = 40;

/** The angle by which one press of a key or of the Rotate button turns the map, in degrees. */
export const ROTATION_STEP = 15;

/** Create the map, with one layer for each background map. The background maps are drawn under every other layer. */
export function createMap(): OlMap {
  return new OlMap({
    layers: BASE_MAPS.map(
      ({ id, createSource }) => new TileLayer({ source: createSource(), zIndex: 0, properties: { id } }),
    ),
    view: new View(WORLD),
    controls: [new Attribution({ collapsible: false }), new ScaleLine()],
  });
}

/** Show the chosen background map and hide the other background maps. Every other layer stays as it is. */
export function showBaseMap(map: OlMap, baseMap: BaseMapId): void {
  map.getLayers().forEach((layer) => {
    const id: unknown = layer.get("id");
    if (BASE_MAPS.some((background) => background.id === id)) {
      layer.setVisible(id === baseMap);
    }
  });
}

/** Zoom in by a number of levels, or out when the number is negative. */
export function zoomBy(map: OlMap, levels: number): void {
  const view = map.getView();
  const zoom = view.getZoom();
  if (zoom !== undefined) {
    view.animate({ zoom: zoom + levels, duration: DURATION });
  }
}

/** Return to the view of the whole world. */
export function showWorld(map: OlMap, duration = DURATION): void {
  map.getView().animate({ ...WORLD, duration });
}

/** Show the whole of a rectangle, which is given in the projection of the map, with a margin around it. */
export function showExtent(map: OlMap, extent: Extent, duration = DURATION): void {
  map.getView().fit(extent, { size: map.getSize(), padding: [MARGIN, MARGIN, MARGIN, MARGIN], duration });
}

/** Turn the map about its centre by an angle in degrees, clockwise when the angle is positive. */
export function rotateBy(map: OlMap, degrees: number, duration = DURATION): void {
  const view = map.getView();
  view.animate({ rotation: view.getRotation() + (degrees * Math.PI) / 180, duration });
}

/** Return north to the top of the map. */
export function northUp(map: OlMap, duration = DURATION): void {
  map.getView().animate({ rotation: 0, duration });
}
