import { expect, test } from "vitest";
import { pictureGeometry } from "./picture";

// A map of 1052 by 655 pixels, at the resolution of zoom level 10.
const RESOLUTION = 152.8740565703525;
const SCREEN = { size: [1052, 655], resolution: RESOLUTION } as const;

test("a picture of the size of the map is drawn at the resolution of the screen", () => {
  expect(pictureGeometry(SCREEN, [1052, 655])).toEqual({ resolution: RESOLUTION, scaling: 1 });
});

test("a picture with twice the pixels shows the same ground at half the resolution", () => {
  const geometry = pictureGeometry(SCREEN, [2104, 1310]);
  expect(geometry).toEqual({ resolution: RESOLUTION / 2, scaling: 2 });
  // The ground width of the picture is the ground width of the map on the screen.
  expect(2104 * geometry.resolution).toBeCloseTo(1052 * RESOLUTION, 6);
});

test("a picture of other proportions is filled by the map and shows less at two sides", () => {
  // A square of 655 pixels keeps the height of the map and shows the middle 655 of its 1052 pixels of width.
  const square = pictureGeometry(SCREEN, [655, 655]);
  expect(square).toEqual({ resolution: RESOLUTION, scaling: 1 });
  // A tall picture keeps the height of the map on the ground and shows a part of its width.
  const tall = pictureGeometry(SCREEN, [1000, 2000]);
  expect(tall.scaling).toBeCloseTo(2000 / 655, 12);
  expect(2000 * tall.resolution).toBeCloseTo(655 * RESOLUTION, 6);
  expect(1000 * tall.resolution).toBeLessThan(1052 * RESOLUTION);
});

test("a smaller picture shows the same ground with fewer pixels", () => {
  const geometry = pictureGeometry(SCREEN, [526, 327.5]);
  expect(geometry).toEqual({ resolution: RESOLUTION * 2, scaling: 0.5 });
});

test("the size of the map is counted in whole pixels", () => {
  // A map of 744.5625 pixels of height is drawn on the screen as 745 pixels.
  expect(pictureGeometry({ size: [1152, 744.5625], resolution: RESOLUTION }, [1152, 745])).toEqual({
    resolution: RESOLUTION,
    scaling: 1,
  });
});
