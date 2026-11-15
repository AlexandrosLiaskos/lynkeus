import { readFileSync } from "node:fs";
import Polygon from "ol/geom/Polygon";
import { fromLonLat } from "ol/proj";
import { expect, test } from "vitest";
import { MOST_CORNERS, type AreaStatistics, type Shape } from "../shared/layer";
import {
  CELLS_INFO,
  cornersSentence,
  crossesItself,
  SHAPE_FAULTS,
  shapeName,
  shapeOfGeometry,
  shapeProperties,
  shapeWords,
  statisticsRows,
} from "./analysisArea";

/** The width of the world of the map (Web Mercator), in metres. */
const WORLD = 2 * 20037508.342789244;

function ring(...corners: (readonly [number, number])[]): Polygon {
  const [first] = corners;
  return new Polygon([first ? [...corners, first].map(([x, y]) => [x, y]) : []]);
}

function box(west: number, south: number, east: number, north: number): Polygon {
  return ring([west, south], [east, south], [east, north], [west, north]);
}

test("an area has at most the corners that the server takes", () => {
  expect(MOST_CORNERS).toBe(250);
  expect(readFileSync("../api/src/lynkeus/layers.py", "utf8")).toMatch(/^MOST_CORNERS = 250$/m);
});

test("a drawn rectangle becomes an area in the coordinates of the map, rounded to the centimetre", () => {
  expect(shapeOfGeometry(box(-7909000.123, 5270000.456, -7891000.789, 5284000.001), "rectangle", "EPSG:3857")).toEqual({
    crs: "EPSG:3857",
    kind: "rectangle",
    points: [
      [-7909000.12, 5270000.46],
      [-7891000.79, 5270000.46],
      [-7891000.79, 5284000],
      [-7909000.12, 5284000],
      [-7909000.12, 5270000.46],
    ],
  });
});

test("a shape drawn in a repeated world is moved into the first one, and a shape across 180 degrees is refused", () => {
  const moved = shapeOfGeometry(box(-7909000 + WORLD, 5270000, -7891000 + WORLD, 5284000), "rectangle", "EPSG:3857");
  expect(typeof moved === "string" ? null : moved.points[0]?.[0]).toBeCloseTo(-7909000, 1);
  expect(shapeOfGeometry(box(19000000, 0, 21000000, 100000), "rectangle", "EPSG:3857")).toBe(SHAPE_FAULTS.meridian);
});

test("a drawn polygon becomes an area of its corners, and a shape that is not an area is refused with a sentence", () => {
  const triangle = shapeOfGeometry(ring([0, 0], [1000, 0], [1000, 1000]), "polygon", "EPSG:3857");
  expect(triangle).toEqual({
    crs: "EPSG:3857",
    kind: "polygon",
    points: [
      [0, 0],
      [1000, 0],
      [1000, 1000],
      [0, 0],
    ],
  });
  expect(shapeOfGeometry(box(10, 10, 10, 10), "rectangle", "EPSG:3857")).toBe(SHAPE_FAULTS.empty);
  expect(shapeOfGeometry(ring([0, 0], [1000, 0], [1000, 0]), "polygon", "EPSG:3857")).toBe(SHAPE_FAULTS.corners);
  expect(shapeOfGeometry(ring([0, 0], [1000, 1000], [1000, 0], [0, 1000]), "polygon", "EPSG:3857")).toBe(
    SHAPE_FAULTS.crossing,
  );
  const circle = Array.from(
    { length: 251 },
    (_, index) => [1000 * Math.cos((2 * Math.PI * index) / 251), 1000 * Math.sin((2 * Math.PI * index) / 251)] as const,
  );
  expect(shapeOfGeometry(ring(...circle), "polygon", "EPSG:3857")).toBe(cornersSentence(251));
  expect(cornersSentence(251)).toBe("The polygon has 251 corners. An area takes at most 250.");
});

test("the sides of a polygon cross when the server says that they do", () => {
  // The cases of the test of the server, tests/test_areas.py.
  expect(crossesItself([[0, 0], [2, 2], [2, 0], [0, 2]])).toBe(true);
  expect(crossesItself([[0, 0], [2, 0], [2, 2], [0, 2], [0, 0], [1, 1], [1, 3]])).toBe(true);
  expect(crossesItself([[0, 0], [4, 0], [2, 0], [2, 2]])).toBe(true);
  expect(crossesItself([[0, 0], [1, 1], [2, 2]])).toBe(true);
  expect(crossesItself([[0, 0], [1, 0], [1, 1]])).toBe(false);
  expect(crossesItself([[0, 0], [2, 0], [2, 2], [1, 1], [0, 2]])).toBe(false);
});

const RECTANGLE: Shape = {
  crs: "EPSG:3857",
  kind: "rectangle",
  points: [
    fromLonLat([-71.05, 42.7]),
    fromLonLat([-70.9, 42.7]),
    fromLonLat([-70.9, 42.82]),
    fromLonLat([-71.05, 42.82]),
    fromLonLat([-71.05, 42.7]),
  ].map(([x = 0, y = 0]) => [x, y] as const),
};

test("an area is named by its kind, and the Properties window states the rectangle around it in degrees", () => {
  expect(shapeName(RECTANGLE)).toBe("rectangle");
  expect(shapeWords(RECTANGLE)).toBe("The rectangle drawn on the map");
  const triangle: Shape = { crs: "EPSG:3857", kind: "polygon", points: [[0, 0], [1000, 0], [1000, 1000], [0, 0]] };
  expect(shapeWords(triangle)).toBe("The polygon of 3 corners drawn on the map");
  expect(shapeProperties(RECTANGLE)).toEqual([
    { name: "Kind", value: "Rectangle" },
    { name: "West", value: "71.05° W" },
    { name: "South", value: "42.7° N" },
    { name: "East", value: "70.9° W" },
    { name: "North", value: "42.82° N" },
  ]);
  expect(shapeProperties(triangle).map(({ name }) => name)).toEqual(["Kind", "West", "South", "East", "North", "Points"]);
});

test("the statistics of a result are stated in its unit, and without a cell with data none are stated", () => {
  const statistics: AreaStatistics = {
    area: RECTANGLE,
    cells: 1234567,
    mean: -12.3456,
    deviation: 3.21,
    minimum: -30,
    median: -12.1,
    maximum: 5.5,
  };
  expect(statisticsRows(statistics, "dB")).toEqual([
    { name: "Area", value: "The rectangle drawn on the map" },
    { name: "Cells with data", value: "1,234,567", info: CELLS_INFO },
    { name: "Mean", value: "-12.3 dB" },
    { name: "Standard deviation", value: "3.21 dB" },
    { name: "Lowest value", value: "-30 dB" },
    { name: "Median", value: "-12.1 dB" },
    { name: "Highest value", value: "5.5 dB" },
  ]);
  expect(statisticsRows({ ...statistics, mean: 0.4123 }, "")[2]).toEqual({ name: "Mean", value: "0.412" });
  const none = { area: RECTANGLE, cells: 0, mean: null, deviation: null, minimum: null, median: null, maximum: null };
  expect(statisticsRows(none, "dB").slice(1)).toEqual([
    { name: "Cells with data", value: "0", info: CELLS_INFO },
    { name: "Statistics", value: "None", info: "No cell with data lies inside the area." },
  ]);
});
