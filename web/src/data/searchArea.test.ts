import OlMap from "ol/Map";
import View from "ol/View";
import { getWidth } from "ol/extent";
import LineString from "ol/geom/LineString";
import MultiPolygon from "ol/geom/MultiPolygon";
import Polygon from "ol/geom/Polygon";
import { fromLonLat } from "ol/proj";
import { expect, test } from "vitest";
import type { Ring } from "./products";
import {
  areaExtent,
  areaFault,
  areaGeometry,
  areaKind,
  areaProperties,
  densify,
  describeArea,
  fitRings,
  isRectangle,
  MOST_POINTS,
  pointCount,
  rectangleAround,
  rectangleOfExtent,
  ringsOfGeometry,
  ringText,
  sameArea,
  viewArea,
  wrapLongitude,
} from "./searchArea";

const SQUARE: Ring = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
  [0, 0],
];

function mapAt(longitude: number, latitude: number, zoom: number, size: [number, number] = [800, 600]): OlMap {
  const map = new OlMap({ view: new View({ center: fromLonLat([longitude, latitude]), zoom }) });
  map.setSize(size);
  return map;
}

test("a longitude is brought between -180 and 180 degrees", () => {
  expect(wrapLongitude(0)).toBe(0);
  expect(wrapLongitude(190)).toBe(-170);
  expect(wrapLongitude(-190)).toBe(170);
  expect(wrapLongitude(540)).toBe(180);
  expect(wrapLongitude(180)).toBe(180);
  expect(wrapLongitude(-180)).toBe(-180);
});

test("the view of the map is returned as a rectangle around its centre", () => {
  const area = viewArea(mapAt(-70.9, 42.8, 10));
  expect(isRectangle(area)).toBe(true);
  expect((area.west + area.east) / 2).toBeCloseTo(-70.9, 3);
  expect(area.south).toBeLessThan(42.8);
  expect(area.north).toBeGreaterThan(42.8);
  // At zoom level 10 one pixel of Web Mercator is 152.87 metres at the equator, so 800 pixels are 1.0986 degrees.
  expect(area.east - area.west).toBeCloseTo(1.0986, 3);
});

test("a view wider than the Earth gives every longitude", () => {
  const area = viewArea(mapAt(0, 0, 0, [2000, 2000]));
  expect(isRectangle(area)).toBe(true);
  expect([area.west, area.east]).toEqual([-180, 180]);
  // Web Mercator ends at 85.0511 degrees of latitude, and the view reaches past it.
  expect(area.south).toBeLessThanOrEqual(-85.0511);
  expect(area.north).toBeGreaterThanOrEqual(85.0511);
});

test("a view across the meridian of 180 degrees gives a rectangle whose west is larger than its east", () => {
  const area = viewArea(mapAt(179.5, -17, 8));
  expect(isRectangle(area)).toBe(true);
  expect(area.west).toBeGreaterThan(170);
  expect(area.east).toBeLessThan(-170);
  // At zoom level 8 the 800 pixels are 4.3945 degrees.
  expect(area.east + 360 - area.west).toBeCloseTo(4.3945, 3);
});

test("an extent in degrees gives a rectangle inside the limits of latitude", () => {
  expect(rectangleOfExtent([-200, -95, -100, 95])).toEqual({ west: 160, south: -90, east: -100, north: 90 });
  expect(rectangleOfExtent([-10.123456, 1, 10, 2])).toEqual({ west: -10.1235, south: 1, east: 10, north: 2 });
});

test("a rectangle is checked", () => {
  expect(isRectangle({ west: 170, south: -20, east: -170, north: -10 })).toBe(true);
  expect(isRectangle({ west: 5, south: 0, east: 5, north: 10 })).toBe(false);
  expect(isRectangle({ west: 0, south: 10, east: 5, north: 10 })).toBe(false);
  expect(isRectangle({ west: -181, south: 0, east: 5, north: 10 })).toBe(false);
  expect(isRectangle({ west: 0, south: 0, east: 5, north: 91 })).toBe(false);
});

test("what is wrong with an area is said in plain words", () => {
  expect(areaFault({ kind: "rectangle", west: -71.2, south: 42.6, east: -70.75, north: 42.95 })).toBeNull();
  expect(areaFault({ kind: "rectangle", west: Number.NaN, south: 42.6, east: -70.75, north: 42.95 })).toMatch(
    /as numbers/,
  );
  expect(areaFault({ kind: "rectangle", west: 0, south: 43, east: 1, north: 42 })).toMatch(/not valid/);
  expect(areaFault({ kind: "polygons", rings: [SQUARE] })).toBeNull();
  expect(areaFault({ kind: "polygons", rings: [] })).toMatch(/at least three points/);
  expect(areaFault({ kind: "polygons", rings: [SQUARE.slice(0, 3)] })).toMatch(/at least three points/);
  expect(areaFault({ kind: "polygons", rings: Array.from({ length: 11 }, () => SQUARE) })).toMatch(/at most 10/);
  const long: Ring = Array.from({ length: MOST_POINTS + 1 }, (_, index) => [index * 0.01, index % 2] as const);
  expect(areaFault({ kind: "polygons", rings: [long] })).toMatch(/at most 250/);
});

test("points are added along a side that spans more than two degrees of longitude", () => {
  const wide: Ring = [
    [0, 60],
    [10, 60],
    [10, 61],
    [0, 61],
    [0, 60],
  ];
  const dense = densify(wide);
  // Each of the two long sides receives four points, two degrees apart.
  expect(dense).toHaveLength(13);
  expect(dense.slice(0, 6)).toEqual([
    [0, 60],
    [2, 60],
    [4, 60],
    [6, 60],
    [8, 60],
    [10, 60],
  ]);
  expect(densify(SQUARE)).toEqual(SQUARE);
});

test("a point added on a slanted side lies on the straight line of the Web Mercator projection", () => {
  const [, middle] = densify([
    [0, 0],
    [4, 60],
    [0, 60],
    [0, 0],
  ]);
  // Half-way in Web Mercator between the equator and 60 degrees north lies 35.2644 degrees north.
  expect(middle).toEqual([2, 35.26439]);
});

test("a side across the meridian of 180 degrees is followed the short way", () => {
  const dense = densify([
    [178, 10],
    [-178, 10],
    [-178, 11],
    [178, 11],
    [178, 10],
  ]);
  expect(dense.slice(0, 3)).toEqual([
    [178, 10],
    [180, 10],
    [-178, 10],
  ]);
});

test("the outer rings of a polygon are read in degrees", () => {
  const polygon = new Polygon([
    SQUARE.map(([longitude, latitude]) => [longitude, latitude]),
    [
      [0.2, 0.2],
      [0.4, 0.2],
      [0.4, 0.4],
      [0.2, 0.2],
    ],
  ]);
  expect(ringsOfGeometry(polygon, "EPSG:4326")).toEqual([SQUARE]);
  const projected = polygon.clone().transform("EPSG:4326", "EPSG:3857");
  expect(ringsOfGeometry(projected, "EPSG:3857")).toEqual([SQUARE]);
  const twice = new MultiPolygon([polygon.getCoordinates(), polygon.getCoordinates()]);
  expect(ringsOfGeometry(twice, "EPSG:4326")).toEqual([SQUARE, SQUARE]);
  expect(
    ringsOfGeometry(
      new LineString([
        [0, 0],
        [1, 1],
      ]),
      "EPSG:4326",
    ),
  ).toEqual([]);
});

test("polygons with more points than a search takes are simplified", () => {
  // A circle of 2000 points with a radius of one degree.
  const circle: Ring = Array.from({ length: 2001 }, (_, index) => {
    const angle = (2 * Math.PI * (index % 2000)) / 2000;
    return [10 + Math.cos(angle), 45 + Math.sin(angle)] as const;
  });
  const fitted = fitRings([circle]);
  expect(fitted).toHaveLength(1);
  expect(pointCount(fitted ?? [])).toBeLessThanOrEqual(MOST_POINTS);
  expect(pointCount(fitted ?? [])).toBeGreaterThan(20);
  const around = rectangleAround(fitted ?? []);
  expect(around.west).toBeCloseTo(9, 1);
  expect(around.east).toBeCloseTo(11, 1);
  expect(around.south).toBeCloseTo(44, 1);
  expect(around.north).toBeCloseTo(46, 1);
  expect(fitRings([SQUARE])).toEqual([SQUARE]);
});

test("polygons that cannot be brought under the limit give nothing", () => {
  expect(fitRings([SQUARE, SQUARE], 9)).toBeNull();
  expect(fitRings([SQUARE, SQUARE], 10)).toHaveLength(2);
});

test("a rectangle across the meridian of 180 degrees is drawn in one piece", () => {
  const crossing = { kind: "rectangle", west: 170, south: -20, east: -170, north: -10 } as const;
  const [west, south, east, north] = areaGeometry(crossing, "EPSG:4326").getExtent();
  expect([west, south, east, north]).toEqual([170, -20, 190, -10]);
  const extent = areaExtent(crossing, "EPSG:3857");
  // In Web Mercator one degree of longitude is about 111 319 metres.
  expect(getWidth(extent ?? [])).toBeCloseTo(20 * 111319.49079327357, 3);
});

test("polygons are drawn as they are, and an area without size has no extent", () => {
  const geometry = areaGeometry({ kind: "polygons", rings: [SQUARE] }, "EPSG:4326");
  expect(geometry.getExtent()).toEqual([0, 0, 1, 1]);
  expect(areaExtent({ kind: "rectangle", west: 5, south: 0, east: 5, north: 0 }, "EPSG:4326")).toBeNull();
});

test("an area is described in words", () => {
  expect(describeArea(null)).toBe("the whole Earth");
  expect(describeArea({ kind: "rectangle", west: -71.2, south: 42.6, east: -70.75, north: 42.95 })).toBe(
    "the rectangle from 71.2° W to 70.75° W and from 42.6° N to 42.95° N",
  );
  expect(describeArea({ kind: "rectangle", west: 170, south: -20, east: -170, north: -10 })).toBe(
    "the rectangle from 170° E to 170° W and from 20° S to 10° S",
  );
  expect(describeArea({ kind: "polygons", rings: [SQUARE] })).toBe("a polygon of 4 points");
  expect(describeArea({ kind: "polygons", rings: [SQUARE, SQUARE] })).toBe("2 polygons of 8 points");
});

test("the kind of an area is named in a word or two", () => {
  expect(areaKind({ kind: "rectangle", west: -71.2, south: 42.6, east: -70.75, north: 42.95 })).toBe("Rectangle");
  expect(areaKind({ kind: "polygons", rings: [SQUARE] })).toBe("Polygon");
  expect(areaKind({ kind: "polygons", rings: [SQUARE, SQUARE, SQUARE] })).toBe("3 polygons");
});

test("the properties of an area are its kind, its four sides in degrees and the points of its polygons", () => {
  expect(areaProperties({ kind: "rectangle", west: -71.2, south: 42.6, east: -70.75, north: 42.95 })).toEqual([
    { name: "Kind", value: "Rectangle" },
    { name: "West", value: "71.2° W" },
    { name: "South", value: "42.6° N" },
    { name: "East", value: "70.75° W" },
    { name: "North", value: "42.95° N" },
  ]);
  // A rectangle across the meridian of 180 degrees, south of the equator.
  expect(
    areaProperties({ kind: "rectangle", west: 170, south: -20, east: -170, north: -10 }).map(({ value }) => value),
  ).toEqual(["Rectangle", "170° E", "20° S", "170° W", "10° S"]);
  // The sides of polygons are those of the rectangle around them.
  const east: Ring = SQUARE.map(([longitude, latitude]) => [longitude + 10, latitude - 5] as const);
  expect(areaProperties({ kind: "polygons", rings: [SQUARE, east] })).toEqual([
    { name: "Kind", value: "2 polygons" },
    { name: "West", value: "0° E" },
    { name: "South", value: "5° S" },
    { name: "East", value: "11° E" },
    { name: "North", value: "1° N" },
    { name: "Points", value: "8" },
  ]);
  expect(areaProperties({ kind: "polygons", rings: [SQUARE] }).slice(-1)).toEqual([{ name: "Points", value: "4" }]);
});

test("two areas are the same when both are none, the same rectangle or the same polygons", () => {
  const box = { kind: "rectangle", west: -71.2, south: 42.6, east: -70.75, north: 42.95 } as const;
  const polygon = { kind: "polygons", rings: [SQUARE] } as const;
  expect(sameArea(null, null)).toBe(true);
  expect(sameArea(box, null)).toBe(false);
  expect(sameArea(null, polygon)).toBe(false);
  expect(sameArea(box, { ...box })).toBe(true);
  expect(sameArea(box, { ...box, north: 43 })).toBe(false);
  expect(sameArea(box, polygon)).toBe(false);
  expect(sameArea(polygon, box)).toBe(false);
  expect(sameArea(polygon, polygon)).toBe(true);
  expect(sameArea(polygon, { kind: "polygons", rings: [[...SQUARE]] })).toBe(true);
  expect(sameArea(polygon, { kind: "polygons", rings: [SQUARE, SQUARE] })).toBe(false);
  expect(sameArea(polygon, { kind: "polygons", rings: [SQUARE.slice(0, 4)] })).toBe(false);
});

test("a ring is written as the catalogue reads a polygon", () => {
  expect(ringText(SQUARE)).toBe("0,0,1,0,1,1,0,1,0,0");
  expect(pointCount([SQUARE, SQUARE])).toBe(10);
});
