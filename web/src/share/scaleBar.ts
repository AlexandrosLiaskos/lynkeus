// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type { Coordinate } from "ol/coordinate";
import { getPointResolution, type ProjectionLike } from "ol/proj";

/** A scale bar: a round length on the ground and the pixels that show it. */
export interface ScaleBar {
  /** Length on the ground, in metres. */
  length: number;
  /** Width of the bar, in pixels. */
  width: number;
  /** The length with its unit, as written at the end of the bar. */
  label: string;
  /** The number of equal parts of the bar. */
  divisions: number;
}

/** The parts of a bar for each leading digit of its length: 1 and 2 are halved, and 5 has five parts. */
const DIVISIONS = [
  [5, 5],
  [2, 2],
  [1, 2],
] as const;

function round(value: number): number {
  return Number(value.toPrecision(12));
}

/** Write a length in metres with the metric unit that suits it. */
export function lengthLabel(metres: number): string {
  if (metres >= 1000) {
    return `${String(round(metres / 1000))} km`;
  }
  if (metres >= 1) {
    return `${String(round(metres))} m`;
  }
  if (metres >= 0.01) {
    return `${String(round(metres * 100))} cm`;
  }
  return `${String(round(metres * 1000))} mm`;
}

/**
 * Return the longest scale bar that is not wider than the given width. Its length is 1, 2 or 5 times a power of
 * ten, the lengths that the scale line of OpenLayers uses.
 */
export function scaleBar(metresPerPixel: number, maxWidth: number): ScaleBar {
  const limit = metresPerPixel * maxWidth;
  const power = 10 ** Math.floor(Math.log10(limit));
  // The smallest length, 1 times the power of ten, always fits; it stands last in the list.
  const [digit, divisions] = DIVISIONS.find(([leading]) => leading * power <= limit) ?? [1, 2];
  const length = round(digit * power);
  return { length, width: length / metresPerPixel, label: lengthLabel(length), divisions };
}

/**
 * Return the length on the ground that one pixel shows at a point of the map, in metres. Web Mercator enlarges
 * the map with latitude, so the length differs from the resolution of the view; the scale line of OpenLayers
 * computes it with the same function.
 */
export function metresPerPixel(projection: ProjectionLike, resolution: number, point: Coordinate): number {
  return getPointResolution(projection, resolution, point, "m");
}

/**
 * Return the largest relative difference between the scale at the centre of a picture and the scale at any of
 * its corners. A scale bar is exact only at the latitude for which it was computed.
 */
export function scaleDifference(
  projection: ProjectionLike,
  resolution: number,
  centre: Coordinate,
  corners: readonly Coordinate[],
): number {
  const atCentre = metresPerPixel(projection, resolution, centre);
  return Math.max(
    0,
    ...corners.map((corner) => Math.abs(metresPerPixel(projection, resolution, corner) / atCentre - 1)),
  );
}

/**
 * Return the scale of a printed map as the number after "1:". One pixel of the picture shows `metresPerPixel`
 * on the ground and takes 25.4 / `dotsPerInch` millimetres on the paper.
 */
export function scaleDenominator(metresPerPixelOfPicture: number, dotsPerInch: number): number {
  return (metresPerPixelOfPicture * dotsPerInch) / 0.0254;
}
