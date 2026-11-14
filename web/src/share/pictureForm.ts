import { SCREEN_RESOLUTION } from "./mapImage";

/** The resolutions that the forms offer, in dots per inch. The first one is the resolution of the screen. */
export const RESOLUTIONS = [SCREEN_RESOLUTION, 150, 300] as const;

/** Write a resolution as an option of a form. */
export function resolutionLabel(resolution: number): string {
  return resolution === SCREEN_RESOLUTION
    ? `${String(resolution)} dots per inch, as the screen`
    : `${String(resolution)} dots per inch`;
}

/**
 * What the form of the map image holds. The two sides are kept as the user typed them, so that a wrong entry
 * stays in its field until it is corrected.
 */
export interface PictureForm {
  /** Resolution in dots per inch. */
  resolution: number;
  /** "screen" follows the size of the map on the screen, and "custom" takes the two sides below. */
  size: "screen" | "custom";
  width: string;
  height: string;
  /** Whether a change of one side changes the other, so that the picture keeps the proportions of the map. */
  proportions: boolean;
  scaleBar: boolean;
  northArrow: boolean;
  legend: boolean;
}

/** The form as it first opens: the map as the screen shows it, with every element. */
export const FIRST_PICTURE_FORM: PictureForm = {
  resolution: SCREEN_RESOLUTION,
  size: "screen",
  width: "",
  height: "",
  proportions: true,
  scaleBar: true,
  northArrow: true,
  legend: true,
};

/**
 * Return the two sides of the picture that a form asks for, in pixels. With the size of the screen, the picture
 * shows the whole map, and a higher resolution gives it more pixels in proportion, as in QGIS. A side that is
 * not a number is returned as NaN.
 */
export function pictureSides(form: PictureForm, screen: readonly [number, number]): [number, number] {
  if (form.size === "screen") {
    const finer = form.resolution / SCREEN_RESOLUTION;
    return [Math.round(screen[0] * finer), Math.round(screen[1] * finer)];
  }
  const side = (text: string): number => (text.trim() === "" ? Number.NaN : Number(text));
  return [side(form.width), side(form.height)];
}

/** Return the form after the user has chosen a size. A custom size starts from the sides shown until then. */
export function withSize(form: PictureForm, size: PictureForm["size"], screen: readonly [number, number]): PictureForm {
  if (size === "custom" && form.size === "screen") {
    const [width, height] = pictureSides(form, screen);
    return { ...form, size, width: String(width), height: String(height) };
  }
  return { ...form, size };
}

/**
 * Return the form after the user has chosen a resolution. Custom sides change in proportion, so the picture
 * keeps its size on paper.
 */
export function withResolution(form: PictureForm, resolution: number): PictureForm {
  if (form.size === "screen") {
    return { ...form, resolution };
  }
  const scaled = (text: string): string => {
    const side = Number(text);
    return text.trim() === "" || !Number.isFinite(side)
      ? text
      : String(Math.round((side * resolution) / form.resolution));
  };
  return { ...form, resolution, width: scaled(form.width), height: scaled(form.height) };
}

/**
 * Return the form after the user has typed one side. While the proportions are kept, the other side follows in
 * the proportions of the map on the screen.
 */
export function withSide(
  form: PictureForm,
  side: "width" | "height",
  text: string,
  screen: readonly [number, number],
): PictureForm {
  const typed = { ...form, [side]: text };
  const value = Number(text);
  if (!form.proportions || text.trim() === "" || !Number.isFinite(value) || screen[0] <= 0 || screen[1] <= 0) {
    return typed;
  }
  return side === "width"
    ? { ...typed, height: String(Math.round((value * screen[1]) / screen[0])) }
    : { ...typed, width: String(Math.round((value * screen[0]) / screen[1])) };
}
