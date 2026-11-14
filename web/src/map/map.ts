import OlMap from "ol/Map";
import View from "ol/View";
import { Attribution, ScaleLine } from "ol/control";
import TileLayer from "ol/layer/Tile";
import { fromLonLat } from "ol/proj";
import { BASE_MAPS, type BaseMapId } from "./baseMaps";

/** The view that shows the whole world. */
const WORLD = { center: fromLonLat([0, 20]), zoom: 2 };

/** Create the map, with one layer for each background map. */
export function createMap(): OlMap {
  return new OlMap({
    layers: BASE_MAPS.map(({ id, createSource }) => new TileLayer({ source: createSource(), properties: { id } })),
    view: new View(WORLD),
    controls: [new Attribution({ collapsible: false }), new ScaleLine()],
  });
}

/** Show the chosen background map and hide the others. */
export function showBaseMap(map: OlMap, baseMap: BaseMapId): void {
  map.getLayers().forEach((layer) => {
    layer.setVisible(layer.get("id") === baseMap);
  });
}

/** Zoom in by a number of levels, or out when the number is negative. */
export function zoomBy(map: OlMap, levels: number): void {
  const view = map.getView();
  const zoom = view.getZoom();
  if (zoom !== undefined) {
    view.animate({ zoom: zoom + levels, duration: 250 });
  }
}

/** Return to the view of the whole world. */
export function showWorld(map: OlMap): void {
  map.getView().animate({ ...WORLD, duration: 250 });
}
