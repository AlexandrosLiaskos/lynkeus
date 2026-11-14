import { fromLonLat } from "ol/proj";
import { expect, test } from "vitest";
import {
  decimalsFor,
  formatDegrees,
  formatSexagesimal,
  formatUtm,
  NO_UTM_ZONE,
  toDegrees,
  toUtm,
  writeCoordinate,
} from "./coordinates";

// Longitude, latitude, zone, hemisphere, easting and northing in metres, computed with pyproj 3.7.2 (PROJ 9.8.1)
// from EPSG:4326 to the EPSG code of the zone: the pilot area, Athens, Rio de Janeiro, Tromso, a point on the
// edge of a zone at the equator, Sydney, and a point near the northern limit.
const UTM_REFERENCE = [
  [-70.975, 42.775, 19, true, 338432.3320757691, 4737720.920528565],
  [23.7275, 37.9838, 34, true, 739542.0288401059, 4207528.059146706],
  [-43.1729, -22.9068, 23, false, 687394.5932911221, 7465634.127714328],
  [18.9553, 69.6492, 34, true, 420653.59408477886, 7728081.222099982],
  [5.999, 0.001, 31, true, 833867.1282180964, 110.68265408006413],
  [151.2093, -33.8688, 56, false, 334368.633648097, 6250948.345385009],
  [-179.9, 83.9, 1, true, 465609.16873004654, 9317795.753332414],
] as const;

test("the number of decimals follows the size of a pixel", () => {
  expect(decimalsFor(0.35, 7)).toBe(1);
  expect(decimalsFor(0.001, 7)).toBe(3);
  expect(decimalsFor(0.0010078, 7)).toBe(3);
  expect(decimalsFor(2e-6, 7)).toBe(6);
  expect(decimalsFor(1e-12, 7)).toBe(7);
  expect(decimalsFor(40, 2)).toBe(0);
  expect(decimalsFor(0, 2)).toBe(2);
});

test("a point of the map is given in degrees, with the longitude inside one turn", () => {
  const [longitude, latitude] = toDegrees(fromLonLat([-70.975, 42.775]), "EPSG:3857");
  expect(longitude).toBeCloseTo(-70.975, 9);
  expect(latitude).toBeCloseTo(42.775, 9);
  // One world further east on a map that repeats the world: 40,075,016.69 metres.
  const [x = 0, y = 0] = fromLonLat([-70.975, 42.775]);
  expect(toDegrees([x + 2 * Math.PI * 6378137, y], "EPSG:3857")[0]).toBeCloseTo(-70.975, 9);
});

test("decimal degrees are written with the latitude first and the letters of the hemispheres", () => {
  expect(formatDegrees(-70.975, 42.775, 5)).toEqual(["42.77500°N", "70.97500°W"]);
  expect(formatDegrees(151.2093, -33.8688, 4)).toEqual(["33.8688°S", "151.2093°E"]);
  expect(formatDegrees(0, 0, 2)).toEqual(["0.00°N", "0.00°E"]);
  // A small negative angle that is written as zero takes the positive letter.
  expect(formatDegrees(-0.001, -0.001, 2)).toEqual(["0.00°N", "0.00°E"]);
});

test("degrees, minutes and seconds are written as the standard ISO 6709 shows", () => {
  // The example of the standard: 50.0795725 decimal degrees is 50 degrees, 04 minutes and 46.461 seconds.
  expect(formatSexagesimal(0, 50.0795725, 3)[0]).toBe("50°04′46.461″N");
  expect(formatSexagesimal(-70.975, 42.775, 0)).toEqual(["42°46′30″N", "70°58′30″W"]);
  expect(formatSexagesimal(23.7275, 37.9838, 1)).toEqual(["37°59′01.7″N", "23°43′39.0″E"]);
  expect(formatSexagesimal(-43.1729, -22.9068, 2)).toEqual(["22°54′24.48″S", "43°10′22.44″W"]);
});

test("seconds that round up to sixty are carried to the minutes and the degrees", () => {
  expect(formatSexagesimal(0.9999999, 59.99999, 0)).toEqual(["60°00′00″N", "1°00′00″E"]);
  expect(formatSexagesimal(-0.9999999, -0.00000001, 2)).toEqual(["0°00′00.00″N", "1°00′00.00″W"]);
});

test("the zone, the easting and the northing agree with pyproj to less than a centimetre", () => {
  for (const [longitude, latitude, zone, north, easting, northing] of UTM_REFERENCE) {
    const position = toUtm(longitude, latitude);
    expect(position?.zone).toBe(zone);
    expect(position?.north).toBe(north);
    expect(position?.easting).toBeCloseTo(easting, 2);
    expect(position?.northing).toBeCloseTo(northing, 2);
  }
});

test("the zones are six degrees wide, from 180 degrees west", () => {
  expect(toUtm(-180, 10)?.zone).toBe(1);
  expect(toUtm(-174.0001, 10)?.zone).toBe(1);
  expect(toUtm(-174, 10)?.zone).toBe(2);
  expect(toUtm(0, 10)?.zone).toBe(31);
  expect(toUtm(179.9999, 10)?.zone).toBe(60);
  expect(toUtm(180, 10)?.zone).toBe(60);
  expect(toUtm(10, 0)?.north).toBe(true);
  expect(toUtm(10, -0.0001)?.north).toBe(false);
});

test("outside 80 degrees south and 84 degrees north there is no zone", () => {
  expect(toUtm(10, 84)).not.toBeNull();
  expect(toUtm(10, 84.0001)).toBeNull();
  expect(toUtm(10, -80)).not.toBeNull();
  expect(toUtm(10, -80.0001)).toBeNull();
  expect(toUtm(NaN, NaN)).toBeNull();
});

test("a position in a zone is written with the hemisphere as a word", () => {
  expect(formatUtm({ zone: 19, north: true, easting: 338432.332, northing: 4737720.921 }, 0)).toEqual([
    "Zone 19 North",
    "338432 m E",
    "4737721 m N",
  ]);
  expect(formatUtm({ zone: 23, north: false, easting: 687394.5933, northing: 7465634.1277 }, 2)).toEqual([
    "Zone 23 South",
    "687394.59 m E",
    "7465634.13 m N",
  ]);
});

// At zoom level 10 one pixel of the map is 152.874 metres of the projection, which at latitude 42.775 degrees is
// 112.2 metres on the ground, 0.001008 degrees or 3.6 seconds of latitude.
const POINT = fromLonLat([-70.975, 42.775]);
const RESOLUTION = (2 * Math.PI * 6378137) / 256 / 2 ** 10;

test("the coordinates of a point are written in each of the four ways, as finely as the map shows them", () => {
  expect(writeCoordinate(POINT, "EPSG:3857", RESOLUTION, "degrees").parts).toEqual(["42.775°N", "70.975°W"]);
  expect(writeCoordinate(POINT, "EPSG:3857", RESOLUTION, "dms").parts).toEqual(["42°46′30″N", "70°58′30″W"]);
  expect(writeCoordinate(POINT, "EPSG:3857", RESOLUTION, "utm").parts).toEqual([
    "Zone 19 North",
    "338432 m E",
    "4737721 m N",
  ]);
  // The coordinates of the point in EPSG:3857, computed with pyproj: -7900900.859, 5277787.019.
  expect(writeCoordinate(POINT, "EPSG:3857", RESOLUTION, "map").parts).toEqual(["X -7900901 m", "Y 5277787 m"]);
});

test("a finer map writes more decimals", () => {
  const fine = RESOLUTION / 2 ** 9;
  expect(writeCoordinate(POINT, "EPSG:3857", fine, "degrees").parts).toEqual(["42.775000°N", "70.975000°W"]);
  expect(writeCoordinate(POINT, "EPSG:3857", fine, "dms").parts).toEqual(["42°46′30.000″N", "70°58′30.000″W"]);
  expect(writeCoordinate(POINT, "EPSG:3857", fine, "utm").parts).toEqual([
    "Zone 19 North",
    "338432.3 m E",
    "4737720.9 m N",
  ]);
  expect(writeCoordinate(POINT, "EPSG:3857", fine, "map").parts).toEqual(["X -7900900.9 m", "Y 5277787.0 m"]);
});

test("the widest texts of each part are given, so that a field can keep one width", () => {
  expect(writeCoordinate(POINT, "EPSG:3857", RESOLUTION, "degrees").widest).toEqual([["88.500°N"], ["178.500°W"]]);
  expect(writeCoordinate(POINT, "EPSG:3857", RESOLUTION, "dms").widest).toEqual([["88°30′00″N"], ["178°30′00″W"]]);
  expect(writeCoordinate(POINT, "EPSG:3857", RESOLUTION, "utm").widest).toEqual([
    ["Zone 60 North", "Zone 60 South"],
    ["888888 m E"],
    ["8888888 m N"],
  ]);
  expect(writeCoordinate(POINT, "EPSG:3857", RESOLUTION, "map").widest).toEqual([["X -88888888 m"], ["Y -88888888 m"]]);
});

test("a point outside the zones keeps the three fields", () => {
  const polar = fromLonLat([10, 84.5]);
  expect(writeCoordinate(polar, "EPSG:3857", RESOLUTION, "utm").parts).toEqual([NO_UTM_ZONE, "", ""]);
});

test("a point of a repeated world is written inside the first world", () => {
  const [x = 0, y = 0] = POINT;
  const repeated = [x - 2 * Math.PI * 6378137, y];
  expect(writeCoordinate(repeated, "EPSG:3857", RESOLUTION, "map").parts).toEqual(["X -7900901 m", "Y 5277787 m"]);
  expect(writeCoordinate(repeated, "EPSG:3857", RESOLUTION, "degrees").parts).toEqual(["42.775°N", "70.975°W"]);
});

test("a coordinate that is written as zero carries no minus sign", () => {
  expect(writeCoordinate([-0.2, -0], "EPSG:3857", RESOLUTION, "map").parts).toEqual(["X 0 m", "Y 0 m"]);
  expect(writeCoordinate([-0.2, -0.04], "EPSG:3857", 0.3, "map").parts).toEqual(["X -0.2 m", "Y 0.0 m"]);
});

test("a map in degrees writes its own coordinates in degrees", () => {
  expect(writeCoordinate([-70.975, 42.775], "EPSG:4326", 0.001, "map").parts).toEqual(["X -70.975°", "Y 42.775°"]);
});
