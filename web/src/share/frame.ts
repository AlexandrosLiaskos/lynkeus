// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type { Coordinate } from "ol/coordinate";
import { transform, type ProjectionLike } from "ol/proj";

/** The view of a drawn picture of the map. */
export interface PictureView {
  projection: ProjectionLike;
  /** Centre of the picture, in the units of the projection. */
  center: Coordinate;
  /** Units of the projection that one pixel of the picture shows. */
  resolution: number;
  /** Rotation of the map in radians, clockwise, as OpenLayers defines it. */
  rotation: number;
  /** Width and height of the picture, in pixels. */
  size: readonly [number, number];
}

/**
 * Return the coordinate of the map at a pixel of a picture. The pixel is counted from the top left corner. With
 * a rotation, north points away from the top of the picture by the angle of the rotation, clockwise.
 */
export function coordinateAt(
  { center, resolution, rotation, size }: PictureView,
  [x, y]: readonly [number, number],
): Coordinate {
  const east = (x - size[0] / 2) * resolution;
  const north = (size[1] / 2 - y) * resolution;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return [(center[0] ?? 0) + east * cos - north * sin, (center[1] ?? 0) + east * sin + north * cos];
}

/** Return the four corners of a picture as coordinates of the map: top left, top right, bottom right, bottom left. */
export function cornersOf(view: PictureView): [Coordinate, Coordinate, Coordinate, Coordinate] {
  const [width, height] = view.size;
  return [
    coordinateAt(view, [0, 0]),
    coordinateAt(view, [width, 0]),
    coordinateAt(view, [width, height]),
    coordinateAt(view, [0, height]),
  ];
}

/**
 * The steps between two lines of a coordinate frame, in degrees: from 90 degrees to 1 second. They are the
 * steps of the graticule of OpenLayers.
 */
export const INTERVALS = [
  90,
  45,
  30,
  20,
  10,
  5,
  2,
  1,
  30 / 60,
  20 / 60,
  10 / 60,
  5 / 60,
  2 / 60,
  1 / 60,
  30 / 3600,
  20 / 3600,
  10 / 3600,
  5 / 3600,
  2 / 3600,
  1 / 3600,
] as const;

/** The smallest number of steps that a span of the frame is divided into. */
const FEWEST_STEPS = 4;

/** Return the largest step that divides a span of degrees into at least four parts. */
export function intervalFor(span: number): number {
  return INTERVALS.find((interval) => span / interval >= FEWEST_STEPS) ?? 1 / 3600;
}

/**
 * Write an angle of the frame in degrees, minutes and seconds, with the letter of its hemisphere. Minutes are
 * written when the step of the frame is smaller than one degree, and seconds when it is smaller than one minute.
 */
export function angleLabel(degrees: number, kind: "longitude" | "latitude", interval: number): string {
  // A longitude beyond 180 degrees is the same meridian as one inside the limits.
  const angle = kind === "longitude" ? ((((degrees + 180) % 360) + 360) % 360) - 180 : degrees;
  const seconds = Math.round(Math.abs(angle) * 3600);
  const parts = [`${String(Math.floor(seconds / 3600))}\u00b0`];
  if (interval < 1) {
    parts.push(`${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}\u2032`);
  }
  if (interval < 1 / 60) {
    parts.push(`${String(seconds % 60).padStart(2, "0")}\u2033`);
  }
  const letter =
    seconds === 0 || (kind === "longitude" && seconds === 180 * 3600)
      ? ""
      : kind === "longitude"
        ? angle < 0
          ? "W"
          : "E"
        : angle < 0
          ? "S"
          : "N";
  return `${parts.join("")}${letter}`;
}

export type FrameSide = "top" | "right" | "bottom" | "left";

/** A mark on the frame of a picture: where a meridian or a parallel meets one side. */
export interface FrameTick {
  side: FrameSide;
  /** Place along the side, from 0 at its left or top end to 1 at its right or bottom end. */
  at: number;
  /** The longitude or the latitude of the line, written as an angle. */
  label: string;
}

/** The number of equal pieces into which a side is cut to find the lines that cross it. */
const PIECES = 64;

/** The number of halvings that bring a crossing to its place: 2 to the power of -30 of a piece. */
const HALVINGS = 30;

/**
 * Return the marks of the coordinate frame of a picture: the places where the meridians and the parallels of a
 * round step meet its four sides, with their angles in WGS 84. The step of the meridians follows from the span
 * of longitude of the picture, and the step of the parallels from its span of latitude. Each side is followed in
 * small pieces, and a crossing inside a piece is found by halving, so the marks are right for a rotated map too.
 * Each side is marked with one kind of line, so that two marks do not stand in one place: the top and the bottom
 * with the meridians and the left and the right with the parallels, or the other way round when the map is
 * turned by more than 45 degrees from north.
 */
export function frameTicks(view: PictureView): FrameTick[] {
  const [topLeft, topRight, bottomRight, bottomLeft] = cornersOf(view);
  const sides: [FrameSide, Coordinate, Coordinate][] = [
    ["top", topLeft, topRight],
    ["right", topRight, bottomRight],
    ["bottom", bottomLeft, bottomRight],
    ["left", topLeft, bottomLeft],
  ];
  const degreesAt = (from: Coordinate, to: Coordinate, at: number): Coordinate =>
    transform(
      [(from[0] ?? 0) + at * ((to[0] ?? 0) - (from[0] ?? 0)), (from[1] ?? 0) + at * ((to[1] ?? 0) - (from[1] ?? 0))],
      view.projection,
      "EPSG:4326",
    );

  const corners = [topLeft, topRight, bottomRight, bottomLeft].map((corner) => degreesAt(corner, corner, 0));
  const span = (axis: 0 | 1): number => {
    const values = corners.map((corner) => corner[axis] ?? 0);
    return Math.max(...values) - Math.min(...values);
  };
  const intervals = [intervalFor(span(0)), intervalFor(span(1))] as const;

  // The lines that run across a side: meridians across the top and the bottom of a map with north up.
  const turned = Math.abs(Math.sin(view.rotation)) > Math.SQRT1_2;
  const ticks: FrameTick[] = [];
  for (const [side, from, to] of sides) {
    const horizontal = side === "top" || side === "bottom";
    for (const axis of [horizontal === turned ? 1 : 0] as const) {
      const interval = intervals[axis];
      const valueAt = (at: number): number => degreesAt(from, to, at)[axis] ?? 0;
      for (let piece = 0; piece < PIECES; piece += 1) {
        const first = valueAt(piece / PIECES);
        const last = valueAt((piece + 1) / PIECES);
        const tolerance = interval * 1e-9;
        // A side that runs along a line of the frame meets no line of that kind.
        if (Math.abs(last - first) <= tolerance) {
          continue;
        }
        const rising = last > first;
        const lowest = Math.ceil((Math.min(first, last) - tolerance) / interval);
        const highest = Math.floor((Math.max(first, last) + tolerance) / interval);
        for (let line = lowest; line <= highest; line += 1) {
          const angle = line * interval;
          // A line through the start of a piece was found at the end of the piece before it.
          if (piece > 0 && Math.abs(angle - first) <= tolerance) {
            continue;
          }
          let start = piece / PIECES;
          let end = (piece + 1) / PIECES;
          for (let step = 0; step < HALVINGS; step += 1) {
            const middle = (start + end) / 2;
            if (valueAt(middle) < angle === rising) {
              start = middle;
            } else {
              end = middle;
            }
          }
          ticks.push({
            side,
            at: (start + end) / 2,
            label: angleLabel(angle, axis === 0 ? "longitude" : "latitude", interval),
          });
        }
      }
    }
  }
  return ticks;
}
