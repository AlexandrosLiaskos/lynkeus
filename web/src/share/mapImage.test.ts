// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import OlMap from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import { expect, test } from "vitest";
import { BASE_MAPS } from "../map/baseMaps";
import { leftOut, makePicture, paperSize, pictureFault, showsTheScreen, sidesFault } from "./mapImage";

function createMap(shown: string): OlMap {
  const map = new OlMap({
    layers: BASE_MAPS.map(
      ({ id, createSource }) => new TileLayer({ source: createSource(), properties: { id }, visible: id === shown }),
    ),
    view: new View({ center: [0, 0], zoom: 4 }),
  });
  map.setSize([1052, 655]);
  return map;
}

test("a picture needs whole sides between 100 and 8000 pixels and a resolution between 72 and 600 dots per inch", () => {
  expect(pictureFault({ width: 1052, height: 655, resolution: 96 })).toBeNull();
  expect(pictureFault({ width: 100, height: 8000, resolution: 600 })).toBeNull();
  expect(pictureFault({ width: 99, height: 655, resolution: 96 })).toContain("width between 100 and 8000 pixels");
  expect(pictureFault({ width: 1052, height: 8001, resolution: 96 })).toContain("height between 100 and 8000 pixels");
  expect(pictureFault({ width: 1052.5, height: 655, resolution: 96 })).toContain("without decimals");
  expect(pictureFault({ width: Number.NaN, height: 655, resolution: 96 })).toContain("width");
  expect(pictureFault({ width: 1052, height: 655, resolution: 71 })).toContain("resolution between 72 and 600");
  expect(pictureFault({ width: 1052, height: 655, resolution: Number.NaN })).toContain("resolution");
});

test("the sides alone are checked for a picture whose resolution follows from a page", () => {
  expect(sidesFault({ width: 1152, height: 726 })).toBeNull();
  expect(sidesFault({ width: 50, height: 726 })).toContain("width between 100 and 8000 pixels");
});

test("a picture in which only OpenStreetMap would be left out is refused before anything is drawn", async () => {
  const choice = { resolution: 150, sources: true, scaleBar: true, northArrow: "rotated", legends: [] } as const;
  await expect(makePicture(createMap("openstreetmap"), { ...choice, width: 1644, height: 1023 })).rejects.toThrow(
    "OpenStreetMap is the only layer of the map",
  );
  await expect(makePicture(createMap("openstreetmap"), { ...choice, width: 50, height: 1023 })).rejects.toThrow(
    "Enter a width between 100 and 8000 pixels",
  );
});

test("the size on paper follows from the pixels and the dots per inch", () => {
  // 1052 pixels at 96 dots per inch are 10.958 inches, 278.3 millimetres.
  const [width, height] = paperSize(1052, 655, 96);
  expect(width).toBeCloseTo(278.34, 2);
  expect(height).toBeCloseTo(173.3, 2);
  expect(paperSize(3508, 2480, 300)[0]).toBeCloseTo(297, 0);
});

test("a picture shows the screen when it has the size of the map or is a part of it at the same scale", () => {
  expect(showsTheScreen([1052, 655], [1052, 655])).toBe(true);
  expect(showsTheScreen([1052, 655], [655, 655])).toBe(true);
  expect(showsTheScreen([1052, 655], [1052, 400])).toBe(true);
  expect(showsTheScreen([1052, 655], [2104, 1310])).toBe(false);
  expect(showsTheScreen([1052, 655], [526, 327])).toBe(false);
  expect(showsTheScreen([1052, 655], [1053, 655])).toBe(false);
  // The browser gives the map a height with a fraction of a pixel; the picture has the whole pixels.
  expect(showsTheScreen([1152, 744.5625], [1152, 745])).toBe(true);
});

test("OpenStreetMap is left out of a picture that is not made of the pixels of the screen", () => {
  const map = createMap("openstreetmap");
  expect(leftOut(map, [1052, 655])).toEqual([]);
  expect(leftOut(map, [2104, 1310])).toEqual(["openstreetmap"]);
  expect(leftOut(map, [800, 800])).toEqual(["openstreetmap"]);
});

test("Blue Marble stays in a picture of any size, and a hidden OpenStreetMap is not named", () => {
  const map = createMap("blue-marble");
  expect(leftOut(map, [2104, 1310])).toEqual([]);
});
