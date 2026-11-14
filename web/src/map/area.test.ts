import { fromLonLat, transformExtent } from "ol/proj";
import { expect, test } from "vitest";
import { AREA_FAULTS, areaOfExtent, areaOfText, extentOfArea } from "./area";

const MERCATOR = "EPSG:3857";
/** The width of the world in Web Mercator, in metres: the equator of a sphere with a radius of 6378137 metres. */
const WORLD = 2 * Math.PI * 6378137;

function extent(west: number, south: number, east: number, north: number) {
  return transformExtent([west, south, east, north], "EPSG:4326", MERCATOR);
}

test("a rectangle of the map is read as an area in degrees with five decimals", () => {
  expect(areaOfExtent(extent(-71.2, 42.6, -70.75, 42.95), MERCATOR)).toEqual({
    area: { west: -71.2, south: 42.6, east: -70.75, north: 42.95 },
    fault: null,
  });
  expect(areaOfExtent(extent(22.123456789, 36.4, 22.6, 36.9), MERCATOR).area?.west).toBe(22.12346);
});

test("a rectangle in a repeated world is returned with its longitudes between -180 and 180 degrees", () => {
  const [west = 0, south = 0, east = 0, north = 0] = extent(-71.2, 42.6, -70.75, 42.95);
  expect(areaOfExtent([west + WORLD, south, east + WORLD, north], MERCATOR).area).toEqual({
    west: -71.2,
    south: 42.6,
    east: -70.75,
    north: 42.95,
  });
  expect(areaOfExtent([west - 2 * WORLD, south, east - 2 * WORLD, north], MERCATOR).area?.east).toBe(-70.75);
});

test("a rectangle that crosses the meridian of 180 degrees is refused", () => {
  const [west = 0, south = 0] = fromLonLat([170, -10]);
  const [east = 0, north = 0] = fromLonLat([180, 10]);
  expect(areaOfExtent([west, south, east + WORLD / 36, north], MERCATOR)).toEqual({
    area: null,
    fault: AREA_FAULTS.meridian,
  });
});

test("a rectangle that ends on the meridian of 180 degrees is an area", () => {
  expect(areaOfExtent(extent(170, -10, 180, 10), MERCATOR).area).toEqual({
    west: 170,
    south: -10,
    east: 180,
    north: 10,
  });
});

test("a rectangle wider than the world becomes the whole range of longitude", () => {
  expect(areaOfExtent([-1.5 * WORLD, -1e6, 1.5 * WORLD, 1e6], MERCATOR).area).toMatchObject({ west: -180, east: 180 });
});

test("a rectangle without width or height is refused", () => {
  expect(areaOfExtent([100, 100, 100, 200], MERCATOR).fault).toBe(AREA_FAULTS.empty);
  expect(areaOfExtent([100, 100, 100.1, 100.1], MERCATOR).fault).toBe(AREA_FAULTS.empty);
});

test("an area gives back its rectangle on the map", () => {
  const area = { west: -71.2, south: 42.6, east: -70.75, north: 42.95 };
  expect(areaOfExtent(extentOfArea(area, MERCATOR), MERCATOR).area).toEqual(area);
});

test("typed sides are read as an area", () => {
  expect(areaOfText({ west: " -71.2", south: "42.6", east: "-70.75 ", north: "42.95" }).area).toEqual({
    west: -71.2,
    south: 42.6,
    east: -70.75,
    north: 42.95,
  });
});

test.each([
  ["a side is empty", { west: "", south: "0", east: "1", north: "1" }, AREA_FAULTS.numbers],
  ["a side is not a number", { west: "west", south: "0", east: "1", north: "1" }, AREA_FAULTS.numbers],
  ["west is not smaller than east", { west: "2", south: "0", east: "1", north: "1" }, AREA_FAULTS.limits],
  ["a latitude is outside the limits", { west: "0", south: "0", east: "1", north: "91" }, AREA_FAULTS.limits],
])("typed sides are refused when %s", (_reason, sides, fault) => {
  expect(areaOfText(sides)).toEqual({ area: null, fault });
});
