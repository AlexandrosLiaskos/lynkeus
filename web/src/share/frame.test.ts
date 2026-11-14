import { fromLonLat, toLonLat } from "ol/proj";
import { expect, test } from "vitest";
import {
  angleLabel,
  coordinateAt,
  cornersOf,
  frameTicks,
  intervalFor,
  type FrameTick,
  type PictureView,
} from "./frame";

// The radius of the sphere of Web Mercator, in metres, and the formulas of the projection, written out here so
// that the places of the marks are computed without the functions that the frame itself uses.
const RADIUS = 6378137;
const mercatorX = (longitude: number): number => (RADIUS * longitude * Math.PI) / 180;
const mercatorY = (latitude: number): number => RADIUS * Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));

// A picture of 1000 by 800 pixels over the sample area, at the resolution of zoom level 11.
const RESOLUTION = (2 * Math.PI * RADIUS) / 256 / 2 ** 11;
const VIEW: PictureView = {
  projection: "EPSG:3857",
  center: fromLonLat([-70.975, 42.775]),
  resolution: RESOLUTION,
  rotation: 0,
  size: [1000, 800],
};

function on(ticks: readonly FrameTick[], side: FrameTick["side"]): FrameTick[] {
  return ticks.filter((tick) => tick.side === side).sort((a, b) => a.at - b.at);
}

test("the centre of a picture shows the centre of its view, and north is up without a rotation", () => {
  expect(coordinateAt(VIEW, [500, 400])).toEqual(VIEW.center);
  const [x, y] = coordinateAt(VIEW, [500, 0]);
  expect(x).toBeCloseTo(VIEW.center[0] ?? 0, 6);
  expect(y).toBeCloseTo((VIEW.center[1] ?? 0) + 400 * RESOLUTION, 6);
});

test("with a rotation of 90 degrees clockwise, north is at the right of the picture", () => {
  const turned = { ...VIEW, rotation: Math.PI / 2 };
  const [x, y] = coordinateAt(turned, [1000, 400]);
  expect(x).toBeCloseTo(VIEW.center[0] ?? 0, 6);
  expect(y).toBeCloseTo((VIEW.center[1] ?? 0) + 500 * RESOLUTION, 6);
});

test("the corners of a picture span its width and height on the ground", () => {
  const [topLeft, topRight, bottomRight, bottomLeft] = cornersOf(VIEW);
  expect((topRight[0] ?? 0) - (topLeft[0] ?? 0)).toBeCloseTo(1000 * RESOLUTION, 6);
  expect((topLeft[1] ?? 0) - (bottomLeft[1] ?? 0)).toBeCloseTo(800 * RESOLUTION, 6);
  expect(bottomRight).toEqual([topRight[0], bottomLeft[1]]);
});

test.each([
  [360, 90],
  [100, 20],
  [8, 2],
  [4, 1],
  [3.9, 0.5],
  [0.6866, 10 / 60],
  [0.4, 5 / 60],
  [0.02, 10 / 3600],
  [0.0001, 1 / 3600],
])("a span of %d degrees is divided in steps of %d degrees", (span, interval) => {
  expect(intervalFor(span)).toBeCloseTo(interval, 12);
});

test.each([
  [-71, "longitude", 1, "71\u00b0W"],
  [22.5, "longitude", 0.5, "22\u00b030\u2032E"],
  [-70.75, "longitude", 5 / 60, "70\u00b045\u2032W"],
  [42.6, "latitude", 5 / 60, "42\u00b036\u2032N"],
  [-33.5125, "latitude", 5 / 3600, "33\u00b030\u203245\u2033S"],
  [0, "latitude", 10, "0\u00b0"],
  [0, "longitude", 0.5, "0\u00b000\u2032"],
  [180, "longitude", 30, "180\u00b0"],
  [-180, "longitude", 30, "180\u00b0"],
  [190, "longitude", 10, "170\u00b0W"],
  [-200, "longitude", 10, "160\u00b0E"],
  [42.99999999, "latitude", 1, "43\u00b0N"],
] as const)("the angle %d of a %s with a step of %d degrees is written %j", (degrees, kind, interval, label) => {
  expect(angleLabel(degrees, kind, interval)).toBe(label);
});

test("without a rotation the meridians meet the top and the bottom, and the parallels the left and the right", () => {
  const ticks = frameTicks(VIEW);
  const left = mercatorX(-70.975) - 500 * RESOLUTION;
  const top = mercatorY(42.775) + 400 * RESOLUTION;

  // The picture is 0.6866 degrees wide, so the meridians stand every 10 minutes.
  const meridians = [-71 - 10 / 60, -71, -70 - 50 / 60, -70 - 40 / 60];
  for (const side of ["top", "bottom"] as const) {
    const found = on(ticks, side);
    expect(found.map(({ label }) => label)).toEqual([
      "71\u00b010\u2032W",
      "71\u00b000\u2032W",
      "70\u00b050\u2032W",
      "70\u00b040\u2032W",
    ]);
    found.forEach(({ at }, index) => {
      expect(at).toBeCloseTo((mercatorX(meridians[index] ?? 0) - left) / (1000 * RESOLUTION), 7);
    });
  }

  // The picture is 0.40 degrees high, so the parallels stand every 5 minutes, from north to south.
  const parallels = [42 + 55 / 60, 42 + 50 / 60, 42 + 45 / 60, 42 + 40 / 60, 42 + 35 / 60];
  for (const side of ["left", "right"] as const) {
    const found = on(ticks, side);
    expect(found.map(({ label }) => label)).toEqual([
      "42\u00b055\u2032N",
      "42\u00b050\u2032N",
      "42\u00b045\u2032N",
      "42\u00b040\u2032N",
      "42\u00b035\u2032N",
    ]);
    found.forEach(({ at }, index) => {
      expect(at).toBeCloseTo((top - mercatorY(parallels[index] ?? 0)) / (800 * RESOLUTION), 7);
    });
  }
  expect(ticks).toHaveLength(18);
});

test("every mark of a rotated map lies on the line that its label names", () => {
  const turned: PictureView = { ...VIEW, rotation: Math.PI / 6 };
  const [width, height] = turned.size;
  const ticks = frameTicks(turned);
  expect(ticks.length).toBeGreaterThan(8);
  for (const { side, at, label } of ticks) {
    const pixel: [number, number] =
      side === "top"
        ? [at * width, 0]
        : side === "bottom"
          ? [at * width, height]
          : side === "left"
            ? [0, at * height]
            : [width, at * height];
    const [longitude, latitude] = toLonLat(coordinateAt(turned, pixel));
    const value = label.endsWith("W") ? longitude : latitude;
    expect(angleLabel(value ?? 0, label.endsWith("W") ? "longitude" : "latitude", 1 / 60)).toBe(label);
  }
  // Each side carries one kind of line: at 30 degrees the meridians still run across the top and the bottom.
  for (const side of ["top", "bottom"] as const) {
    expect(new Set(on(ticks, side).map(({ label }) => label.at(-1)))).toEqual(new Set(["W"]));
  }
  for (const side of ["left", "right"] as const) {
    expect(new Set(on(ticks, side).map(({ label }) => label.at(-1)))).toEqual(new Set(["N"]));
  }
});

test("a map that is turned by more than 45 degrees has the parallels on its top and its bottom", () => {
  const ticks = frameTicks({ ...VIEW, rotation: (Math.PI * 50) / 180 });
  expect(new Set(on(ticks, "top").map(({ label }) => label.at(-1)))).toEqual(new Set(["N"]));
  expect(new Set(on(ticks, "right").map(({ label }) => label.at(-1)))).toEqual(new Set(["W"]));
  // Turned by 180 degrees, the map has the meridians on its top again.
  const upsideDown = frameTicks({ ...VIEW, rotation: Math.PI });
  expect(new Set(on(upsideDown, "top").map(({ label }) => label.at(-1)))).toEqual(new Set(["W"]));
});

test("with a rotation of 90 degrees the parallels meet the top and the bottom", () => {
  const ticks = frameTicks({ ...VIEW, rotation: Math.PI / 2 });
  expect(on(ticks, "top").every(({ label }) => label.endsWith("N"))).toBe(true);
  expect(on(ticks, "left").every(({ label }) => label.endsWith("W"))).toBe(true);
  // North is at the right, so the latitude grows along the top side.
  expect(on(ticks, "top").map(({ label }) => label)).toEqual([...on(ticks, "top").map(({ label }) => label)].sort());
});

test("a meridian through a corner of the picture is marked once on each side that it meets", () => {
  // The left side of the picture lies on the meridian of 71 degrees west.
  const center = [mercatorX(-71) + 500 * RESOLUTION, mercatorY(42.775)];
  const ticks = frameTicks({ ...VIEW, center });
  for (const side of ["top", "bottom"] as const) {
    const first = on(ticks, side)[0];
    expect(first?.label).toBe("71\u00b000\u2032W");
    expect(first?.at).toBeCloseTo(0, 7);
    expect(on(ticks, side).filter(({ label }) => label === "71\u00b000\u2032W")).toHaveLength(1);
  }
  expect(on(ticks, "left").every(({ label }) => label.endsWith("N"))).toBe(true);
});

test("a picture of the whole world is marked every 90 degrees of longitude", () => {
  const world: PictureView = { ...VIEW, center: [0, 0], resolution: (2 * Math.PI * RADIUS) / 1000, size: [1000, 500] };
  expect(on(frameTicks(world), "top").map(({ label }) => label)).toEqual([
    "180\u00b0",
    "90\u00b0W",
    "0\u00b0",
    "90\u00b0E",
    "180\u00b0",
  ]);
});
