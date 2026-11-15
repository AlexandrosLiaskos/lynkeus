import type OlMap from "ol/Map";
import { fromLonLat, get as getProjection, toLonLat } from "ol/proj";
import { keepInBrowser, type KeptPart } from "../shared/storage/storage";
import { BASE_MAPS, baseMapStore, type BaseMapId } from "./baseMaps";
import { IMAGERY, imageryFault, imageryStore, utcDay, type ImageryChoice } from "./imagery";
import { graticuleStore } from "./state";

/** The name under which the view of the map is kept in the local storage of the browser. */
export const VIEW_KEY = "lynkeus.view";

/** The view of the map as the browser keeps it. */
export interface StoredView {
  /** Longitude and latitude of the centre of the view, in degrees. */
  center: readonly [number, number];
  /** Zoom level of the view. */
  zoom: number;
  /** Rotation of the view in radians, clockwise, from -π to π. */
  rotation: number;
  /** The basemap, or null when none is shown. */
  baseMap: BaseMapId | null;
  /** The image that is shown when the basemap is the imagery of a date, and null with any other. */
  imagery: ImageryChoice | null;
  /** Whether the lines of latitude and longitude are shown. */
  graticule: boolean;
}

/** The zoom levels that a stored view may have. */
export interface ZoomLimits {
  minZoom: number;
  maxZoom: number;
}

/** The highest latitude of Web Mercator, the projection of the map, in degrees. */
function highestLatitude(): number {
  const extent = getProjection("EPSG:3857")?.getExtent();
  return extent ? (toLonLat([0, extent[3] ?? 0])[1] ?? 0) : 0;
}

/** Bring an angle in radians into the range from -π to π. */
function normalRotation(rotation: number): number {
  const turn = 2 * Math.PI;
  const turned = (((rotation + Math.PI) % turn) + turn) % turn;
  return turned - Math.PI;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Check a view that was read from the storage. The centre must lie inside Web Mercator, the zoom level inside
 * the limits of the map and the rotation inside one turn; the basemap must be one that Lynkeus offers, and the
 * image of a date one that NASA GIBS serves for a day up to `today`. The view returned holds these fields only.
 */
export function storedView(
  stored: unknown,
  limits: ZoomLimits,
  today: string = utcDay(new Date()),
): StoredView | undefined {
  if (typeof stored !== "object" || stored === null) {
    return undefined;
  }
  const { center, zoom, rotation, baseMap, imagery, graticule } = stored as Record<string, unknown>;
  if (!Array.isArray(center) || center.length !== 2) {
    return undefined;
  }
  const [longitude, latitude] = center as unknown[];
  if (
    !isNumber(longitude) ||
    !isNumber(latitude) ||
    Math.abs(longitude) > 180 ||
    Math.abs(latitude) > highestLatitude() ||
    !isNumber(zoom) ||
    zoom < limits.minZoom ||
    zoom > limits.maxZoom ||
    !isNumber(rotation) ||
    Math.abs(rotation) > Math.PI ||
    typeof graticule !== "boolean"
  ) {
    return undefined;
  }
  const known = baseMap === null ? null : BASE_MAPS.find(({ id }) => id === baseMap)?.id;
  if (known === undefined) {
    return undefined;
  }
  let image: ImageryChoice | null = null;
  if (imagery !== null) {
    if (typeof imagery !== "object") {
      return undefined;
    }
    const { layer, date } = imagery as Record<string, unknown>;
    const name = IMAGERY.find(({ id }) => id === layer)?.id;
    if (name === undefined || typeof date !== "string" || imageryFault({ layer: name, date }, today) !== null) {
      return undefined;
    }
    image = { layer: name, date };
  }
  return { center: [longitude, latitude], zoom, rotation, baseMap: known, imagery: image, graticule };
}

/** Return the view that the map shows now, or undefined while the map has no view. */
export function viewOf(map: OlMap): StoredView | undefined {
  const view = map.getView();
  const center = view.getCenter();
  const zoom = view.getZoom();
  if (!center || zoom === undefined) {
    return undefined;
  }
  const [longitude, latitude] = toLonLat(center, view.getProjection());
  if (!isNumber(longitude) || !isNumber(latitude)) {
    return undefined;
  }
  const baseMap = baseMapStore.get();
  return {
    center: [longitude, latitude],
    zoom,
    rotation: normalRotation(view.getRotation()),
    baseMap,
    imagery: baseMap === "imagery" ? imageryStore.get() : null,
    graticule: graticuleStore.get(),
  };
}

/**
 * Keep the view of a map in the browser: its centre, its zoom level and its rotation, the basemap with the
 * image of a date, and whether the graticule shows. The stored view is restored at this moment, before the page
 * is drawn and so before a link in the address of the page is read; the state of a link therefore replaces the
 * stored one. Afterwards the view is stored at the end of every move of the map and after every change of the
 * basemap or of the graticule.
 */
export function keepMapView(map: OlMap): KeptPart<StoredView> {
  const view = map.getView();
  return keepInBrowser<StoredView>({
    key: VIEW_KEY,
    title: "Map view",
    description: "The centre, the scale and the rotation of the map, the basemap and whether the graticule shows.",
    read: () => viewOf(map),
    check: (stored) => storedView(stored, { minZoom: view.getMinZoom(), maxZoom: view.getMaxZoom() }),
    restore: ({ center, zoom, rotation, baseMap, imagery, graticule }) => {
      view.setCenter(fromLonLat([...center], view.getProjection()));
      view.setZoom(zoom);
      view.setRotation(rotation);
      if (imagery) {
        imageryStore.set(imagery);
      }
      baseMapStore.set(baseMap);
      graticuleStore.set(graticule);
    },
    subscribe: (listener) => {
      map.on("moveend", listener);
      const ends = [
        baseMapStore.subscribe(listener),
        imageryStore.subscribe(listener),
        graticuleStore.subscribe(listener),
      ];
      return () => {
        map.un("moveend", listener);
        ends.forEach((end) => end());
      };
    },
  });
}
