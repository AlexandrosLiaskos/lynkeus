// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type { Coordinate } from "ol/coordinate";
import type OlMap from "ol/Map";
import { getPointResolution, type ProjectionLike } from "ol/proj";

/**
 * The size of one pixel of the screen that the scale assumes, in metres. It is the standardized rendering pixel
 * size of the Open Geospatial Consortium, 0.28 millimetres, which the scale bar of OpenLayers also assumes.
 */
export const PIXEL_SIZE = 0.00028;

/** The scales that the list offers, each as the number n of the scale 1 : n, from the smallest scale to the largest. */
export const SCALES: readonly number[] = [
  100_000_000, 50_000_000, 25_000_000, 10_000_000, 5_000_000, 2_500_000, 1_000_000, 500_000, 250_000, 100_000, 50_000,
  25_000, 10_000, 5_000, 2_500, 1_000, 500,
];

/**
 * Return the number n of the scale 1 : n at a point of the map. The resolution is the size of one pixel of the
 * map in the units of the projection. The length of that pixel on the ground at the point, in metres, is divided
 * by the size of a pixel of the screen.
 */
export function scaleAt(projection: ProjectionLike, resolution: number, point: Coordinate): number {
  return getPointResolution(projection, resolution, point, "m") / PIXEL_SIZE;
}

/**
 * Return the resolution at which the map shows the scale 1 : n at a point. The present resolution of the map
 * gives the ratio between a length on the ground and a length in the projection at that point.
 */
export function resolutionForScale(
  projection: ProjectionLike,
  scale: number,
  point: Coordinate,
  resolution: number,
): number {
  return (scale * PIXEL_SIZE * resolution) / getPointResolution(projection, resolution, point, "m");
}

/**
 * Show the map at the scale 1 : n at its centre. Return false when the map cannot show that scale; the map then
 * shows the nearest scale that it can.
 */
export function showScale(map: OlMap, scale: number): boolean {
  const view = map.getView();
  const centre = view.getCenter();
  const resolution = view.getResolution();
  if (!centre || resolution === undefined) {
    return false;
  }
  const wanted = resolutionForScale(view.getProjection(), scale, centre, resolution);
  view.cancelAnimations();
  view.setResolution(wanted);
  const reached = view.getResolution();
  return reached !== undefined && Math.abs(reached - wanted) <= wanted * 1e-9;
}

const WHOLE_NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Write a scale as 1:25,000. */
export function formatScale(scale: number): string {
  return `1:${WHOLE_NUMBER.format(scale)}`;
}

const SCALE_TEXT = /^(?:1\s*[:/]\s*)?(\d[\d,\s]*(?:\.\d+)?)$/;

/**
 * Read a scale that the user typed, such as 1:25,000, 1/25000 or 25000. Return the number n of the scale 1 : n,
 * or null when the text is not a scale.
 */
export function parseScale(text: string): number | null {
  const digits = SCALE_TEXT.exec(text.trim())?.[1];
  const scale = digits === undefined ? NaN : Number(digits.replace(/[,\s]/g, ""));
  return Number.isFinite(scale) && scale >= 1 ? scale : null;
}
