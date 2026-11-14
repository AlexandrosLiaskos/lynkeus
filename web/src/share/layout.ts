import { getPointResolution, transform } from "ol/proj";
import type { PictureView } from "./frame";
import { SCREEN_RESOLUTION } from "./mapImage";
import { scaleDenominator } from "./scaleBar";

export type Paper = "A4" | "A3";
export type Orientation = "portrait" | "landscape";

/** The two sides of the paper sizes of ISO 216, in millimetres, the shorter side first. */
export const PAPER_SIDES: Readonly<Record<Paper, readonly [number, number]>> = {
  A4: [210, 297],
  A3: [297, 420],
};

/** What the form of the layout holds. */
export interface LayoutForm {
  title: string;
  paper: Paper;
  orientation: Orientation;
  /**
   * Resolution of the map on the page, in dots per inch. "screen" takes the pixels that the screen shows, so
   * that no other image is asked from the service of the background map.
   */
  resolution: number | "screen";
  legend: boolean;
  scaleBar: boolean;
  northArrow: boolean;
  /** The coordinate frame: the longitudes and latitudes written around the map. */
  frame: boolean;
}

/** The form as it first opens: an A4 page, with every element. */
export const FIRST_LAYOUT_FORM: LayoutForm = {
  title: "",
  paper: "A4",
  orientation: "landscape",
  resolution: "screen",
  legend: true,
  scaleBar: true,
  northArrow: true,
  frame: true,
};

/** The longest title of a layout, in characters. */
export const TITLE_LENGTH = 120;

/** Return the width and the height of a page, in millimetres. */
export function pageSides(paper: Paper, orientation: Orientation): [number, number] {
  const [short, long] = PAPER_SIDES[paper];
  return orientation === "portrait" ? [short, long] : [long, short];
}

/** Return the name of a page in the style sheet, for example "a4-landscape". */
export function pageName(paper: Paper, orientation: Orientation): string {
  return `${paper.toLowerCase()}-${orientation}`;
}

/** Return a length of the screen in millimetres. A style sheet counts 96 pixels to the inch of 25.4 millimetres. */
export function millimetres(pixels: number): number {
  return (pixels * 25.4) / SCREEN_RESOLUTION;
}

/**
 * Return the two sides in pixels of the picture that fills the map frame of a page. At a resolution in dots
 * per inch, the sides follow from the size of the frame. At the resolution of the screen, the picture is the
 * largest part of the map on the screen that has the proportions of the frame, at the scale of the screen.
 */
export function framePicture(
  frame: readonly [number, number],
  resolution: number | "screen",
  screen: readonly [number, number],
): [number, number] {
  if (resolution !== "screen") {
    return [Math.round((frame[0] / 25.4) * resolution), Math.round((frame[1] / 25.4) * resolution)];
  }
  const proportion = frame[0] / frame[1];
  return screen[0] / screen[1] >= proportion
    ? [Math.round(screen[1] * proportion), Math.round(screen[1])]
    : [Math.round(screen[0]), Math.round(screen[0] / proportion)];
}

/** Return the resolution that a picture has on the page when it fills a frame of the given width, in dots per inch. */
export function printedResolution(pictureWidth: number, frameWidth: number): number {
  return pictureWidth / (frameWidth / 25.4);
}

/** The names of the projections of the map in the registry of the EPSG, by their code. */
const PROJECTION_NAMES: Readonly<Partial<Record<string, string>>> = {
  "EPSG:3857": "WGS 84 / Pseudo-Mercator",
  "EPSG:4326": "WGS 84",
};

/**
 * Return the scale of the map on the page, as "1:250,000 at latitude 42.8° N". The scale holds at the centre of
 * the map, because Web Mercator enlarges the map with latitude, and on a page that is printed at its full size.
 */
export function scaleText(view: PictureView, resolution: number): string {
  const ground = getPointResolution(view.projection, view.resolution, view.center, "m");
  const [, latitude = 0] = transform(view.center, view.projection, "EPSG:4326");
  const tenths = Math.round(Math.abs(latitude) * 10) / 10;
  const side = tenths === 0 ? "" : latitude < 0 ? " S" : " N";
  const denominator = Math.round(scaleDenominator(ground, resolution)).toLocaleString("en-US");
  return `1:${denominator} at latitude ${String(tenths)}\u00b0${side}`;
}

/** Return the name of a projection with its code, for example "WGS 84 / Pseudo-Mercator (EPSG:3857)". */
export function projectionText(code: string): string {
  const name = PROJECTION_NAMES[code];
  return name === undefined ? code : `${name} (${code})`;
}

/** Write a date as day, month and year, for example "14 November 2026". */
export function dateText(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
