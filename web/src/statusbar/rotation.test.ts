import OlMap from "ol/Map";
import View from "ol/View";
import { expect, test } from "vitest";
import { rotationInDegrees, showNorthUp } from "./rotation";

test("the rotation is given in degrees clockwise, from -180 to 180", () => {
  expect(rotationInDegrees(0)).toBe(0);
  expect(rotationInDegrees(Math.PI / 6)).toBe(30);
  expect(rotationInDegrees(-Math.PI / 2)).toBe(-90);
  expect(rotationInDegrees((3 * Math.PI) / 2)).toBe(-90);
  expect(rotationInDegrees(2 * Math.PI + 0.2155)).toBe(12.3);
  // A rotation too small to be written counts as none.
  expect(rotationInDegrees(0.0005)).toBe(0);
});

test("north is brought to the top", () => {
  const map = new OlMap({ view: new View({ center: [0, 0], zoom: 2, rotation: 1 }) });
  showNorthUp(map);
  expect(map.getView().getRotation()).toBe(0);
});
