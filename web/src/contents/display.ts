import type OlMap from "ol/Map";
import { isEmpty, type Extent } from "ol/extent";
import type BaseLayer from "ol/layer/Base";
import Layer from "ol/layer/Layer";
import WebGLTileLayer from "ol/layer/WebGLTile";
import type { Pixel } from "ol/pixel";
import { transformExtent } from "ol/proj";
import type Source from "ol/source/Source";
import TileSource from "ol/source/Tile";
import VectorSource from "ol/source/Vector";
import { mapLayersStore } from "../shared/mapLayers";

/** The number of points on each side of an extent that are moved to the projection of the view. */
const POINTS_ON_A_SIDE = 16;

/** Return the layer of the map that carries this id, or undefined when the map has none. */
export function findLayer(map: OlMap, id: string): BaseLayer | undefined {
  return map.getAllLayers().find((layer) => layer.get("id") === id);
}

/** Return the source of a layer, or null for a layer without one. */
function sourceOf(layer: BaseLayer | undefined): Source | null {
  return layer instanceof Layer ? (layer.getSource() as Source | null) : null;
}

/** Wait until a source has read what it needs to state its extent. The result tells whether it could be read. */
function whenReady(source: Source): Promise<boolean> {
  return new Promise((resolve) => {
    const check = () => {
      const state = source.getState();
      if (state === "ready" || state === "error") {
        source.un("change", check);
        resolve(state === "ready");
      }
    };
    source.on("change", check);
    check();
  });
}

/**
 * Return the extent of a layer in the projection of the view, or null when the map has no such layer, the layer
 * could not be read or it is empty. The extent of a layer in another projection is the rectangle around its
 * outline, of which 16 points on each side are moved to the projection of the view.
 */
export async function extentOf(map: OlMap, id: string): Promise<Extent | null> {
  const source = sourceOf(findLayer(map, id));
  if (!source || !(await whenReady(source))) {
    return null;
  }
  const view = map.getView().getProjection();
  if (source instanceof VectorSource) {
    const extent = source.getExtent();
    return !extent || isEmpty(extent) ? null : extent;
  }
  if (source instanceof TileSource) {
    const projection = source.getProjection() ?? view;
    const extent = (source.getTileGrid() ?? source.getTileGridForProjection(projection)).getExtent();
    return !extent || isEmpty(extent) ? null : transformExtent(extent, projection, view, POINTS_ON_A_SIDE);
  }
  return null;
}

/**
 * Return the value of a layer of the Contents pane at a pixel of the map, in the unit of the layer. The result is
 * null where the layer has no data, where its file has not yet been read, and when the layer is hidden or is not
 * on the map. The value is the one drawn: at a small scale it is the mean of the cells that one drawn cell covers.
 */
export function valueAt(map: OlMap, id: string, pixel: Pixel): number | null {
  if (!mapLayersStore.get().some((layer) => layer.id === id)) {
    return null;
  }
  const layer = findLayer(map, id);
  if (!(layer instanceof WebGLTileLayer) || !layer.getVisible()) {
    return null;
  }
  // The drawn data of a layer hold two numbers for each cell: the value, and 0 where the cell has no data.
  const data = layer.getData(pixel);
  if (!(data instanceof Float32Array)) {
    return null;
  }
  const [value, present] = data;
  return value === undefined || present === undefined || present === 0 || Number.isNaN(value) ? null : value;
}
