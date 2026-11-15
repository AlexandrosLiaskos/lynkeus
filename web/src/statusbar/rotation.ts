// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type OlMap from "ol/Map";

/** Return the angle by which the map is turned clockwise, in degrees from -180 to 180 with one decimal. */
export function rotationInDegrees(radians: number): number {
  const degrees = (((((radians * 180) / Math.PI + 180) % 360) + 360) % 360) - 180;
  return Math.round(degrees * 10) / 10;
}

/** Turn the map so that north is at the top. */
export function showNorthUp(map: OlMap): void {
  const view = map.getView();
  view.cancelAnimations();
  view.setRotation(0);
}
