import type OlMap from "ol/Map";
import { fromLonLat, get as getProjection, toLonLat } from "ol/proj";
import { BASE_MAPS, baseMapStore, type BaseMapId } from "../map/baseMaps";
import { IMAGERY, imageryFault, imageryStore, utcDay, type ImageryChoice } from "../map/imagery";
import { areaStore, isArea, type Area } from "../shared/area";

/** The word that a link writes for a map without a background map. */
const NO_BASE_MAP = "none";

/** What a link to a map holds: the view, the background map and the area. */
export interface MapState {
  /** Zoom level of the view. */
  zoom: number;
  /** Centre of the view, in degrees (WGS 84). */
  latitude: number;
  longitude: number;
  /** Rotation of the map in degrees, clockwise. North is up at 0. */
  rotation: number;
  /** The background map, or null when none is shown. */
  baseMap: BaseMapId | null;
  /** The image that is shown when the background map is the imagery of a date, and null with any other. */
  imagery: ImageryChoice | null;
  area: Area | null;
}

/** The parts of a link, as they are named in the address. */
export type LinkPart = "map" | "rotation" | "basemap" | "imagery" | "area";

/** What was read from an address: the parts that are valid, and the names of the parts that are not. */
export interface LinkReading {
  state: Partial<MapState>;
  faults: readonly LinkPart[];
}

/** The zoom levels that a link may give. */
export interface ZoomLimits {
  minZoom: number;
  maxZoom: number;
}

/** A number written with digits only: no exponent, no spaces and no words such as Infinity. */
const NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * The highest latitude of Web Mercator, the projection of the map, in degrees. The centre of a view cannot lie
 * beyond it.
 */
function highestLatitude(): number {
  const extent = getProjection("EPSG:3857")?.getExtent();
  return extent ? (toLonLat([0, extent[3] ?? 0])[1] ?? 0) : 0;
}

function numbers(text: string, separator: string, count: number): number[] | null {
  const parts = text.split(separator);
  return parts.length === count && parts.every((part) => NUMBER.test(part)) ? parts.map(Number) : null;
}

function decimals(value: number, digits: number): string {
  return String(Number(value.toFixed(digits)));
}

/** Bring an angle in degrees into the range from -180, exclusive, to 180, inclusive. */
export function normalRotation(degrees: number): number {
  const turned = ((degrees % 360) + 360) % 360;
  return turned > 180 ? turned - 360 : turned;
}

/**
 * Write a map state as the fragment of an address, the part after `#`. The view is written as OpenStreetMap
 * writes it, `map=zoom/latitude/longitude`. The zoom level has two decimals, and the centre five, which is about
 * one metre. The rotation is written only when the map is rotated and the area only when one is set. The area
 * is written as west, south, east and north, the order of a bounding box in the standards of the Open
 * Geospatial Consortium. The imagery of a date is written as the name of its layer in NASA GIBS and its day.
 */
export function writeLink({ zoom, latitude, longitude, rotation, baseMap, imagery, area }: MapState): string {
  const parts = [`map=${decimals(zoom, 2)}/${decimals(latitude, 5)}/${decimals(longitude, 5)}`];
  const turned = Number(normalRotation(rotation).toFixed(2));
  if (turned !== 0) {
    parts.push(`rotation=${String(turned)}`);
  }
  parts.push(`basemap=${baseMap ?? NO_BASE_MAP}`);
  if (imagery) {
    parts.push(`imagery=${imagery.layer},${imagery.date}`);
  }
  if (area) {
    parts.push(`area=${[area.west, area.south, area.east, area.north].map(String).join(",")}`);
  }
  return `#${parts.join("&")}`;
}

/**
 * Read the fragment of an address. Every part is checked as any other input: a number must be written with
 * digits, the zoom level must lie inside the limits of the view, the centre inside Web Mercator, the rotation
 * between -360 and 360 degrees, the background map must be one of those that Lynkeus offers, the image of a date
 * must be one that NASA GIBS serves for a day up to `today`, and the area must be a valid area. A part that fails
 * is named in `faults` and is not returned. A part with an unknown name is ignored, because it may belong to
 * another function of the page.
 */
export function readLink(fragment: string, limits: ZoomLimits, today: string = utcDay(new Date())): LinkReading {
  const given = new URLSearchParams(fragment.replace(/^#/, ""));
  const state: Partial<MapState> = {};
  const faults: LinkPart[] = [];

  const view = given.get("map");
  if (view !== null) {
    const [zoom, latitude, longitude] = numbers(view, "/", 3) ?? [];
    if (
      zoom !== undefined &&
      latitude !== undefined &&
      longitude !== undefined &&
      zoom >= limits.minZoom &&
      zoom <= limits.maxZoom &&
      Math.abs(latitude) <= highestLatitude() &&
      Math.abs(longitude) <= 180
    ) {
      Object.assign(state, { zoom, latitude, longitude });
    } else {
      faults.push("map");
    }
  }

  const rotation = given.get("rotation");
  if (rotation !== null) {
    if (NUMBER.test(rotation) && Math.abs(Number(rotation)) <= 360) {
      state.rotation = normalRotation(Number(rotation));
    } else {
      faults.push("rotation");
    }
  }

  const baseMap = given.get("basemap");
  if (baseMap !== null) {
    const known = BASE_MAPS.find(({ id }) => id === baseMap);
    if (known) {
      state.baseMap = known.id;
    } else if (baseMap === NO_BASE_MAP) {
      state.baseMap = null;
    } else {
      faults.push("basemap");
    }
  }

  const image = given.get("imagery");
  if (image !== null) {
    const [name, date, ...rest] = image.split(",");
    const layer = IMAGERY.find(({ id }) => id === name)?.id;
    if (
      layer !== undefined &&
      date !== undefined &&
      rest.length === 0 &&
      imageryFault({ layer, date }, today) === null
    ) {
      state.imagery = { layer, date };
    } else {
      faults.push("imagery");
    }
  }

  const sides = given.get("area");
  if (sides !== null) {
    const [west, south, east, north] = numbers(sides, ",", 4) ?? [];
    const area = { west, south, east, north };
    if (isArea(area)) {
      state.area = area;
    } else {
      faults.push("area");
    }
  }

  return { state, faults };
}

const PARTS: readonly LinkPart[] = ["map", "rotation", "basemap", "imagery", "area"];

/** The names of the parts of a link, as a message writes them. */
const PART_NAMES: Readonly<Record<LinkPart, string>> = {
  map: "a view",
  rotation: "a rotation",
  basemap: "a background map",
  imagery: "an image of a date",
  area: "an area",
};

/** Return the fragment of an address without the parts of a link. A part of another function stays. */
export function withoutLink(fragment: string): string {
  const given = new URLSearchParams(fragment.replace(/^#/, ""));
  PARTS.forEach((part) => given.delete(part));
  const rest = given.toString();
  return rest === "" ? "" : `#${rest}`;
}

/** Return the sentence that tells the user which parts of an address could not be read. */
export function faultMessage(faults: readonly LinkPart[]): string {
  const names = faults.map((fault) => PART_NAMES[fault]);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}` : (names[0] ?? "");
  return `The address of the page gives ${list} that Lynkeus cannot read. ${
    names.length > 1 ? "These parts were" : "This part was"
  } ignored.`;
}

/** Return the state of the map now: its view, the background map shown and the area set. */
export function mapState(map: OlMap): MapState | null {
  const view = map.getView();
  const center = view.getCenter();
  const zoom = view.getZoom();
  if (!center || zoom === undefined) {
    return null;
  }
  const [longitude, latitude] = toLonLat(center, view.getProjection());
  if (longitude === undefined || latitude === undefined) {
    return null;
  }
  const baseMap = baseMapStore.get();
  return {
    zoom,
    latitude,
    longitude,
    rotation: normalRotation((view.getRotation() * 180) / Math.PI),
    baseMap,
    imagery: baseMap === "imagery" ? imageryStore.get() : null,
    area: areaStore.get(),
  };
}

/** Return the address that opens Lynkeus with the state of the map now, or null when the map has no view yet. */
export function mapLink(map: OlMap, page: string): string | null {
  const state = mapState(map);
  return state ? `${page.replace(/#.*$/, "")}${writeLink(state)}` : null;
}

/**
 * Bring the map to the state that the fragment of an address gives, and return the names of the parts that
 * could not be read. A part that the address does not give, or gives wrongly, stays as it is.
 */
export function openLink(map: OlMap, fragment: string): readonly LinkPart[] {
  const view = map.getView();
  const { state, faults } = readLink(fragment, { minZoom: view.getMinZoom(), maxZoom: view.getMaxZoom() });
  if (state.zoom !== undefined && state.latitude !== undefined && state.longitude !== undefined) {
    view.setCenter(fromLonLat([state.longitude, state.latitude], view.getProjection()));
    view.setZoom(state.zoom);
    // An address without a rotation shows the map with north up, as the map was when the address was written.
    view.setRotation(((state.rotation ?? 0) * Math.PI) / 180);
  } else if (state.rotation !== undefined) {
    view.setRotation((state.rotation * Math.PI) / 180);
  }
  if (state.imagery) {
    imageryStore.set(state.imagery);
  }
  if (state.baseMap !== undefined) {
    baseMapStore.set(state.baseMap);
  }
  if (state.area !== undefined) {
    areaStore.set(state.area);
  }
  return faults;
}
