import { transform } from "ol/proj";
import { cornersOf } from "./frame";
import type { Picture } from "./picture";
import { metresPerPixel, scaleBar, scaleDifference } from "./scaleBar";

/** The colours of the elements drawn on a picture: the ink and the white of the U.S. Web Design System. */
const INK = "#1b1b1b";
const PAPER = "#ffffff";

/**
 * The largest difference of scale inside a picture for which the scale bar stands without a latitude. Above it
 * the bar names the latitude at which it is exact.
 */
export const SCALE_TOLERANCE = 0.01;

/** The legend of one layer, as it is drawn on a picture. */
export interface PictureLegend {
  /** Name of the layer. */
  title: string;
  /** What the values are, with their unit. */
  caption: string;
  /** The colours of the scale, from the lowest value to the highest. */
  colours: readonly string[];
  /** The lowest and the highest value, as written under the two ends of the scale. */
  low: string;
  high: string;
}

/** The elements drawn on a picture of the map. */
export interface Decorations {
  /** The lines of sources. A layout writes them under the map and not on it. */
  sources: boolean;
  scaleBar: boolean;
  northArrow: boolean;
  legends: readonly PictureLegend[];
}

/**
 * Break a text into lines that are not wider than a given width. The text is broken between words, and a word
 * that is wider than the width stands alone on its line.
 */
export function wrapText(text: string, maxWidth: number, widthOf: (text: string) => number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter((part) => part !== "")) {
    const longer = line === "" ? word : `${line} ${word}`;
    if (line !== "" && widthOf(longer) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = longer;
    }
  }
  return line === "" ? lines : [...lines, line];
}

/** Return the latitude at which the scale bar of a picture is exact, written as "at latitude 42.8° N". */
export function scaleLatitude(picture: Picture): string {
  const [, latitude = 0] = transform(picture.view.center, picture.view.projection, "EPSG:4326");
  const tenths = Math.round(Math.abs(latitude) * 10) / 10;
  return `at latitude ${String(tenths)}\u00b0${tenths === 0 ? "" : latitude < 0 ? " S" : " N"}`;
}

/** Tell whether the scale differs enough inside a picture for its scale bar to name a latitude. */
export function scaleVaries({ view }: Picture): boolean {
  return scaleDifference(view.projection, view.resolution, view.center, cornersOf(view)) > SCALE_TOLERANCE;
}

/**
 * Draw the chosen elements on a picture of the map: the legends at the top left, the north arrow at the top
 * right, the scale bar at the bottom left and the line of sources at the bottom right. Each element stands on a
 * white plate, so that its text keeps its contrast over any map. `unit` is the number of pixels of the picture
 * for one pixel of the style sheet, the resolution of the picture divided by 96 dots per inch; every size
 * below is multiplied by it, so the elements keep their size on paper at any resolution.
 */
export function decorate(
  picture: Picture,
  unit: number,
  { sources, scaleBar: withScaleBar, northArrow, legends }: Decorations,
): void {
  const { canvas, view, credits } = picture;
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  const margin = 8 * unit;
  const padding = 6 * unit;
  const textSize = 11 * unit;
  const lineHeight = 14 * unit;
  const font = (weight: "normal" | "bold" = "normal") => `${weight} ${String(textSize)}px ${family}`;
  const plate = (x: number, y: number, width: number, height: number) => {
    context.fillStyle = PAPER;
    context.fillRect(x, y, width, height);
    context.strokeStyle = INK;
    context.lineWidth = unit;
    context.strokeRect(x + unit / 2, y + unit / 2, width - unit, height - unit);
    context.fillStyle = INK;
  };

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.textBaseline = "alphabetic";
  context.font = font();

  // The line of sources, at the bottom right. Its lines end at the right edge of the plate.
  let creditsTop = canvas.height - margin;
  let creditsLeft = canvas.width;
  if (sources && credits.length > 0) {
    const widest = canvas.width - 2 * margin - 2 * padding;
    const lines = credits.flatMap((credit) => wrapText(credit, widest, (text) => context.measureText(text).width));
    const width = Math.max(...lines.map((line) => context.measureText(line).width)) + 2 * padding;
    const height = lines.length * lineHeight + padding;
    creditsLeft = canvas.width - margin - width;
    creditsTop = canvas.height - margin - height;
    plate(creditsLeft, creditsTop, width, height);
    context.textAlign = "right";
    lines.forEach((line, index) => {
      context.fillText(
        line,
        canvas.width - margin - padding,
        creditsTop + padding / 2 + (index + 1) * lineHeight - 3 * unit,
      );
    });
  }

  // The scale bar, at the bottom left: a bar of equal parts, black and white in turn, with 0 at its start and
  // its length at its end. It stands above the line of sources when the two would meet.
  if (withScaleBar) {
    const groundOfPixel = metresPerPixel(view.projection, view.resolution, view.center);
    const bar = scaleBar(groundOfPixel, Math.max(40 * unit, Math.min(240 * unit, canvas.width * 0.3)));
    const note = scaleVaries(picture) ? scaleLatitude(picture) : null;
    const endWidth = context.measureText(bar.label).width;
    const zeroWidth = context.measureText("0").width;
    const inner = Math.max(zeroWidth / 2 + bar.width + endWidth / 2, note ? context.measureText(note).width : 0);
    const width = inner + 2 * padding;
    const barHeight = 6 * unit;
    const height = lineHeight + barHeight + (note ? lineHeight : 0) + 2 * padding;
    const meets = margin + width + margin > creditsLeft;
    const top = (meets ? creditsTop - margin / 2 : canvas.height - margin) - height;
    plate(margin, top, width, height);
    const barLeft = margin + padding + zeroWidth / 2;
    const barTop = top + padding + lineHeight;
    context.textAlign = "center";
    context.fillText("0", barLeft, barTop - 4 * unit);
    context.fillText(bar.label, barLeft + bar.width, barTop - 4 * unit);
    const part = bar.width / bar.divisions;
    for (let index = 0; index < bar.divisions; index += 1) {
      context.fillStyle = index % 2 === 0 ? INK : PAPER;
      context.fillRect(barLeft + index * part, barTop, part, barHeight);
    }
    context.strokeRect(barLeft, barTop + unit / 2, bar.width, barHeight - unit);
    context.fillStyle = INK;
    if (note) {
      context.textAlign = "left";
      context.fillText(note, margin + padding, barTop + barHeight + lineHeight - 2 * unit);
    }
  }

  // The north arrow, at the top right: an arrow that points to north, with the letter N beyond its tip.
  if (northArrow) {
    const side = 60 * unit;
    const left = canvas.width - margin - side;
    plate(left, margin, side, side);
    const centreX = left + side / 2;
    const centreY = margin + side / 2;
    context.save();
    context.translate(centreX, centreY);
    context.rotate(view.rotation);
    context.beginPath();
    context.moveTo(0, -14 * unit);
    context.lineTo(8 * unit, 12 * unit);
    context.lineTo(0, 6 * unit);
    context.lineTo(-8 * unit, 12 * unit);
    context.closePath();
    context.fill();
    context.restore();
    context.font = font("bold");
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("N", centreX + Math.sin(view.rotation) * 22 * unit, centreY - Math.cos(view.rotation) * 22 * unit);
    context.textBaseline = "alphabetic";
    context.font = font();
  }

  // The legends, at the top left, one under the other: the name of the layer, what its values are, the colour
  // scale, and the lowest and the highest value under its two ends.
  let legendTop = margin;
  const scaleWidth = 160 * unit;
  for (const { title, caption, colours, low, high } of legends) {
    const widest = Math.max(scaleWidth, canvas.width * 0.4 - 2 * padding);
    context.font = font("bold");
    const titleLines = wrapText(title, widest, (text) => context.measureText(text).width);
    const titleWidth = Math.max(...titleLines.map((line) => context.measureText(line).width));
    context.font = font();
    const captionLines = wrapText(caption, widest, (text) => context.measureText(text).width);
    const captionWidth = Math.max(0, ...captionLines.map((line) => context.measureText(line).width));
    const width = Math.max(scaleWidth, titleWidth, captionWidth) + 2 * padding;
    const scaleHeight = 10 * unit;
    const height = (titleLines.length + captionLines.length + 1) * lineHeight + scaleHeight + 2 * padding + 2 * unit;
    plate(margin, legendTop, width, height);
    const left = margin + padding;
    let baseline = legendTop + padding + lineHeight - 3 * unit;
    context.textAlign = "left";
    context.font = font("bold");
    for (const line of titleLines) {
      context.fillText(line, left, baseline);
      baseline += lineHeight;
    }
    context.font = font();
    for (const line of captionLines) {
      context.fillText(line, left, baseline);
      baseline += lineHeight;
    }
    const scaleTop = baseline - lineHeight + 5 * unit;
    if (colours.length > 0) {
      const gradient = context.createLinearGradient(left, 0, left + scaleWidth, 0);
      colours.forEach((colour, index) =>
        gradient.addColorStop(colours.length === 1 ? 0 : index / (colours.length - 1), colour),
      );
      context.fillStyle = gradient;
      context.fillRect(left, scaleTop, scaleWidth, scaleHeight);
      context.strokeRect(left + unit / 2, scaleTop + unit / 2, scaleWidth - unit, scaleHeight - unit);
      context.fillStyle = INK;
    }
    context.fillText(low, left, scaleTop + scaleHeight + lineHeight - 2 * unit);
    context.textAlign = "right";
    context.fillText(high, left + scaleWidth, scaleTop + scaleHeight + lineHeight - 2 * unit);
    legendTop += height + margin / 2;
  }
  context.textAlign = "start";
}
