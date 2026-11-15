import type OlMap from "ol/Map";
import { BASE_MAPS } from "../map/baseMaps";
import { decorate, type PictureLegend } from "./decorations";
import { drawMap, isReadable, pictureGeometry, type Picture } from "./picture";
import { pngWithResolution } from "./png";

/** The resolution of a screen in the terms of a style sheet, in dots per inch: an inch holds 96 pixels. */
export const SCREEN_RESOLUTION = 96;

/** The limits of a picture: its sides in pixels and its resolution in dots per inch. */
export const PICTURE_LIMITS = {
  smallestSide: 100,
  largestSide: 8000,
  lowestResolution: 72,
  highestResolution: 600,
} as const;

/**
 * The background maps whose service permits only the images that the user is viewing. The tile usage policy of
 * OpenStreetMap forbids every request for tiles "other than those a user is actively viewing"
 * (https://operations.osmfoundation.org/policies/tiles/), so such a map enters a picture only when the picture
 * is made of the pixels that the screen shows.
 */
const VIEWED_ONLY: readonly string[] = ["openstreetmap"];

/** What the user chooses for a picture of the map. */
export interface PictureChoice {
  /** Width and height of the picture, in pixels. */
  width: number;
  height: number;
  /** Resolution of the picture, in dots per inch. It gives the size of the picture on paper. */
  resolution: number;
  /** Whether the lines of sources are written on the picture. A layout writes them under the map. */
  sources: boolean;
  scaleBar: boolean;
  /** Whether the north arrow is drawn on a rotated map only ("rotated"), on any map ("always") or not at all. */
  northArrow: "rotated" | "always" | "never";
  legends: readonly PictureLegend[];
}

/** A finished picture, with what the user must be told about it. */
export interface FinishedPicture {
  picture: Picture;
  /** The names of the background maps that were left out, with the reason. */
  notes: readonly string[];
}

/** Return the fault of the two sides of a picture in words, or null when a picture of this size can be drawn. */
export function sidesFault({ width, height }: Pick<PictureChoice, "width" | "height">): string | null {
  const { smallestSide, largestSide } = PICTURE_LIMITS;
  for (const [name, side] of [
    ["width", width],
    ["height", height],
  ] as const) {
    if (!Number.isInteger(side) || side < smallestSide || side > largestSide) {
      return `Enter a ${name} between ${String(smallestSide)} and ${String(largestSide)} pixels, without decimals.`;
    }
  }
  return null;
}

/** Return the fault of a choice of the form in words, or null when the picture can be made. */
export function pictureFault(choice: Pick<PictureChoice, "width" | "height" | "resolution">): string | null {
  const { lowestResolution, highestResolution } = PICTURE_LIMITS;
  const { resolution } = choice;
  const fault = sidesFault(choice);
  if (fault !== null) {
    return fault;
  }
  if (!Number.isFinite(resolution) || resolution < lowestResolution || resolution > highestResolution) {
    return `Enter a resolution between ${String(lowestResolution)} and ${String(highestResolution)} dots per inch.`;
  }
  return null;
}

/** Return the size that a picture takes on paper at its resolution, in millimetres. */
export function paperSize(width: number, height: number, resolution: number): [number, number] {
  return [(width / resolution) * 25.4, (height / resolution) * 25.4];
}

/**
 * Tell whether a picture of the given size is made of the pixels that the screen shows: it has the scale of the
 * map on the screen and shows nothing beyond it.
 */
export function showsTheScreen(screen: readonly [number, number], picture: readonly [number, number]): boolean {
  return pictureGeometry({ size: screen, resolution: 1 }, picture).scaling === 1;
}

/** Return the id of each layer that the map shows, or null for a layer without an id. */
function shownLayers(map: OlMap): (string | null)[] {
  return map
    .getAllLayers()
    .filter((layer) => layer.getVisible())
    .map((layer) => {
      const id: unknown = layer.get("id");
      return typeof id === "string" ? id : null;
    });
}

/** Return the ids of the shown layers that a picture of the given size must leave out. */
export function leftOut(map: OlMap, picture: readonly [number, number]): string[] {
  const [width = 0, height = 0] = map.getSize() ?? [];
  if (showsTheScreen([width, height], picture)) {
    return [];
  }
  return shownLayers(map).filter((id): id is string => id !== null && VIEWED_ONLY.includes(id));
}

/** Tell whether a background map enters a picture only when the picture is made of the pixels of the screen. */
export function isViewedOnly(id: string | null): boolean {
  return id !== null && VIEWED_ONLY.includes(id);
}

/** The sentence that tells the user why OpenStreetMap is not in a picture. */
export const VIEWED_ONLY_NOTE =
  "OpenStreetMap is left out of a picture that is not made of the pixels that the screen shows, because its tile " +
  "usage policy permits only the images that the user is viewing.";

/** The sentence that refuses a picture in which nothing would be left. */
export const ONLY_VIEWED_ONLY =
  "OpenStreetMap is the only layer of the map, and it cannot enter a picture of this size or resolution. " +
  "Choose the map as the screen shows it, at 96 dots per inch, or another basemap.";

/**
 * Draw the map as a picture with the chosen size and elements. A background map whose service does not permit
 * the picture is left out and named in the notes. When the browser refuses to read the picture, because a
 * layer comes from a site that does not allow it, the picture is drawn once more without the background maps.
 */
export async function makePicture(map: OlMap, choice: PictureChoice): Promise<FinishedPicture> {
  const fault = sidesFault(choice);
  if (fault !== null) {
    throw new Error(fault);
  }
  const size = [choice.width, choice.height] as const;
  const without = leftOut(map, size);
  if (without.length > 0 && shownLayers(map).every((id) => id !== null && without.includes(id))) {
    throw new Error(ONLY_VIEWED_ONLY);
  }
  const notes = without.length > 0 ? [VIEWED_ONLY_NOTE] : [];
  let picture = await drawMap(map, size, without);
  if (!isReadable(picture.canvas)) {
    picture = await drawMap(
      map,
      size,
      BASE_MAPS.map(({ id }) => id),
    );
    if (!isReadable(picture.canvas)) {
      throw new Error(
        "The picture cannot be made, because a layer comes from a site that does not let the page read its images.",
      );
    }
    notes.push("The basemap is not in the picture, because its service does not let the page read its images.");
  }
  decorate(picture, choice.resolution / SCREEN_RESOLUTION, {
    sources: choice.sources,
    scaleBar: choice.scaleBar,
    northArrow: choice.northArrow === "always" || (choice.northArrow === "rotated" && picture.view.rotation !== 0),
    legends: choice.legends,
  });
  return { picture, notes };
}

/** Return a picture as the content of a PNG file that states its resolution. */
export async function pictureFile({ canvas }: Picture, resolution: number): Promise<Blob> {
  const image = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("The browser could not write the picture as a PNG image."));
      }
    }, "image/png");
  });
  return new Blob([pngWithResolution(new Uint8Array(await image.arrayBuffer()), resolution)], { type: "image/png" });
}
