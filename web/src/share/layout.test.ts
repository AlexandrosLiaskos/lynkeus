import { fromLonLat } from "ol/proj";
import { expect, test } from "vitest";
import type { PictureView } from "./frame";
import {
  dateText,
  framePicture,
  millimetres,
  pageName,
  pageSides,
  printedResolution,
  projectionText,
  scaleText,
} from "./layout";

test("the pages have the sides of ISO 216, in the chosen orientation", () => {
  expect(pageSides("A4", "portrait")).toEqual([210, 297]);
  expect(pageSides("A4", "landscape")).toEqual([297, 210]);
  expect(pageSides("A3", "portrait")).toEqual([297, 420]);
  expect(pageSides("A3", "landscape")).toEqual([420, 297]);
  expect(pageName("A3", "landscape")).toBe("a3-landscape");
});

test("96 pixels of the screen are one inch, 25.4 millimetres", () => {
  expect(millimetres(96)).toBeCloseTo(25.4, 12);
  expect(millimetres(1000)).toBeCloseTo(264.583, 3);
});

test("at a resolution in dots per inch the picture has the pixels that the frame needs", () => {
  // A frame of 254 by 127 millimetres is 10 by 5 inches.
  expect(framePicture([254, 127], 150, [1052, 655])).toEqual([1500, 750]);
  expect(framePicture([254, 127], 300, [1052, 655])).toEqual([3000, 1500]);
});

test("at the resolution of the screen the picture is the largest part of the map with the proportions of the frame", () => {
  // The map is wider than the frame: the picture keeps the height of the map.
  expect(framePicture([200, 200], "screen", [1052, 655])).toEqual([655, 655]);
  // The map is narrower than the frame: the picture keeps the width of the map.
  expect(framePicture([400, 100], "screen", [1052, 655])).toEqual([1052, 263]);
  expect(framePicture([1052, 655], "screen", [1052, 655])).toEqual([1052, 655]);
});

test("a picture that fills a frame has the resolution of its pixels over the width of the frame", () => {
  expect(printedResolution(1500, 254)).toBeCloseTo(150, 9);
  expect(printedResolution(1052, 257)).toBeCloseTo(103.97, 2);
});

test("the scale of the page is written with the latitude at which it holds", () => {
  // At the equator, 26.4583 metres for a pixel at 96 dots per inch is the scale 1:100,000.
  const equator: PictureView = {
    projection: "EPSG:3857",
    center: [0, 0],
    resolution: 26.4583333,
    rotation: 0,
    size: [1000, 800],
  };
  expect(scaleText(equator, 96)).toBe("1:100,000 at latitude 0\u00b0");
  // At latitude 60 degrees a pixel of Web Mercator shows half the ground, so the same resolution is 1:50,000.
  expect(scaleText({ ...equator, center: fromLonLat([10, 60]) }, 96)).toBe("1:50,000 at latitude 60\u00b0 N");
  expect(scaleText({ ...equator, center: fromLonLat([10, -60]) }, 192)).toBe("1:100,000 at latitude 60\u00b0 S");
});

test("a projection is named with its code, and an unknown one by its code alone", () => {
  expect(projectionText("EPSG:3857")).toBe("WGS 84 / Pseudo-Mercator (EPSG:3857)");
  expect(projectionText("EPSG:32619")).toBe("EPSG:32619");
});

test("a date is written as day, month and year", () => {
  expect(dateText(new Date(2026, 10, 14))).toBe("14 November 2026");
});
