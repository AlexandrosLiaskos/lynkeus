import { afterEach, expect, test, vi } from "vitest";
// The record of a real product file, which the tests of the server check as well.
import gcov from "../../../api/tests/data/product-gcov.json";
import {
  areaOf,
  cellLimitOf,
  cellLimitStore,
  coverage,
  estimate,
  formatCells,
  formatSurface,
  loadCellLimit,
  plan,
  requestArea,
  sidesFault,
  surface,
  tooLarge,
  type RequestProduct,
  type Ring,
} from "./getLayer";
import { standIn } from "./testSession";

const AREA = { west: -71.2, south: 42.6, east: -70.75, north: 42.95 };
const OUTLINE = gcov.footprint as unknown as Ring[];
const HH = { name: "HHHH", title: "Backscatter HH", spacing: 10 };
const HV = { name: "HVHV", title: "Backscatter HV", spacing: 10 };
const PRODUCT: RequestProduct = {
  id: gcov.id,
  name: gcov.name,
  product: "GCOV",
  dates: gcov.dates,
  track: gcov.track,
  frame: gcov.frame,
  footprint: OUTLINE,
  layers: [HH, HV, { name: "mask", title: "Mask of valid samples" }],
};

afterEach(() => {
  vi.unstubAllGlobals();
  cellLimitStore.set(null);
});

test("the surface of an area is its surface on a sphere of the mean radius of the Earth", () => {
  // The whole sphere: four times pi times the square of the radius.
  expect(surface({ west: -180, south: -90, east: 180, north: 90 })).toBeCloseTo(4 * Math.PI * 6_371_008.8 ** 2, -3);
  // One degree by one degree at the equator, and the area of the tests, computed apart with the same formula.
  expect(surface({ west: 0, south: 0, east: 1, north: 1 }) / 1e6).toBeCloseTo(12363.718, 2);
  expect(surface(AREA) / 1e6).toBeCloseTo(1429.429, 2);
});

test("the estimate of a layer follows from the surface and the cell size", () => {
  const cells = estimate(AREA, HH)?.cells ?? 0;
  expect(cells / 1e6).toBeCloseTo(14.294, 2);
  expect((estimate(AREA, HH)?.bytes ?? 0) / 1e6).toBeCloseTo(57.177, 2);
  expect((estimate(AREA, { ...HH, spacing: 200 })?.cells ?? 0) / 1e3).toBeCloseTo(35.736, 2);
  expect(estimate(AREA, { name: "mask", title: "Mask" })).toBeNull();
});

test("a number of cells and a surface are written for reading", () => {
  expect(formatCells(14_294_291)).toBe("14 million cells");
  expect(formatCells(2_540_000)).toBe("2.5 million cells");
  expect(formatCells(35_736)).toBe("36,000 cells");
  expect(formatCells(412)).toBe("412 cells");
  expect(formatCells(0.4)).toBe("1 cell");
  expect(formatSurface(1_429_429_114)).toBe("1,429 km²");
  expect(formatSurface(12_340_000)).toBe("12.3 km²");
  expect(formatSurface(350_000)).toBe("0.35 km²");
});

test("an area inside the outline of a real product is told from one partly inside and one outside", () => {
  expect(coverage(AREA, OUTLINE)).toBe("inside");
  // The west side of this area lies west of the outline.
  expect(coverage({ ...AREA, west: -73.5 }, OUTLINE)).toBe("partly");
  // This area holds the whole outline.
  expect(coverage({ west: -75, south: 40, east: -66, north: 46 }, OUTLINE)).toBe("partly");
  // This area crosses the outline from west to east and holds none of its points.
  expect(coverage({ west: -75, south: 42.6, east: -66, north: 42.7 }, OUTLINE)).toBe("partly");
  expect(coverage({ west: -60, south: 42.6, east: -59, north: 42.95 }, OUTLINE)).toBe("outside");
  // The outline slants, so this area beside its north-west corner lies outside although it is inside its box.
  expect(coverage({ west: -72.6, south: 43.8, east: -72.4, north: 43.95 }, OUTLINE)).toBe("outside");
  expect(coverage(AREA, [])).toBe("outside");
});

test("an area inside one of the two polygons of an outline is inside the outline", () => {
  const east: Ring = [
    [170, 50],
    [180, 50],
    [180, 52],
    [170, 52],
    [170, 50],
  ];
  const west: Ring = [
    [-180, 50],
    [-178, 50],
    [-178, 52],
    [-180, 52],
    [-180, 50],
  ];
  expect(coverage({ west: -179.5, south: 50.5, east: -178.5, north: 51.5 }, [east, west])).toBe("inside");
  expect(coverage({ west: 171, south: 50.5, east: 172, north: 51.5 }, [east, west])).toBe("inside");
});

test("the four fields of the area are checked and read", () => {
  const sides = { west: "-71.2", south: "42.6", east: "-70.75", north: "42.95" };
  expect(sidesFault(sides)).toBeNull();
  expect(areaOf(sides)).toEqual(AREA);
  expect(sidesFault({ ...sides, west: " " })).toBe("Give the four sides of the area as numbers.");
  expect(sidesFault({ ...sides, north: "north" })).toBe("Give the four sides of the area as numbers.");
  expect(sidesFault({ ...sides, west: "-70" })).toMatch(/West must be smaller than east/);
  expect(sidesFault({ ...sides, north: "91" })).toMatch(/not valid/);
  expect(areaOf({ ...sides, west: "" })).toBeNull();
  expect(areaOf({ ...sides, west: "-70" })).toBeNull();
});

test("the area of a request follows from the area of the search", () => {
  const rectangle = { kind: "rectangle", west: "-71.2", south: "42.6", east: "-70.75", north: "42.95" } as const;
  expect(requestArea({ limited: true, area: rectangle })).toEqual({ area: AREA, fault: null, around: false });
  expect(requestArea({ limited: false, area: rectangle })).toEqual({
    area: null,
    fault: "A layer is not received for the whole Earth. Choose an area.",
    around: false,
  });
  expect(requestArea({ limited: true, area: { ...rectangle, south: "" } }).fault).toBe(
    "Give the four sides of the area as numbers.",
  );
  expect(requestArea({ limited: true, area: { ...rectangle, north: "91" } }).fault).toMatch(/^The area is not valid\./);
  // A west larger than the east is, in the search, a rectangle across the meridian of 180 degrees.
  expect(requestArea({ limited: true, area: { ...rectangle, west: "170", east: "-170" } })).toEqual({
    area: null,
    fault:
      "A layer is not received for an area that crosses the meridian of 180 degrees. Choose an area on one side of it.",
    around: false,
  });
});

test("an area of polygons gives the rectangle around them", () => {
  expect(requestArea({ limited: true, area: { kind: "polygons", rings: OUTLINE } })).toEqual({
    area: { west: -72.63407, south: 41.16476, east: -68.7564, north: 43.98766 },
    fault: null,
    around: true,
  });
  expect(requestArea({ limited: true, area: { kind: "polygons", rings: [] } })).toEqual({
    area: null,
    fault: "The area has no polygon. Choose an area.",
    around: true,
  });
  const point: Ring = [
    [10, 50],
    [10, 50],
  ];
  expect(requestArea({ limited: true, area: { kind: "polygons", rings: [point] } }).area).toBeNull();
});

test("one request is planned for each chosen layer of each product, in their order", () => {
  const second: RequestProduct = { ...PRODUCT, id: "second", name: "NISAR_SECOND", layers: [HH] };
  const planned = plan([PRODUCT, second], { [gcov.id]: ["HVHV", "HHHH"], second: ["HHHH", "VVVV"] }, AREA);
  expect(planned.map(({ request }) => request)).toEqual([
    { product: "GCOV", granule: gcov.name, layer: "HHHH", area: AREA },
    { product: "GCOV", granule: gcov.name, layer: "HVHV", area: AREA },
    { product: "GCOV", granule: "NISAR_SECOND", layer: "HHHH", area: AREA },
  ]);
  expect(planned[1]?.choice).toBe(HV);
  expect(planned[2]?.product).toBe(second);
  expect(plan([PRODUCT], {}, AREA)).toEqual([]);
});

test("a layer above the limit of the server is named with both numbers", () => {
  expect(tooLarge("Backscatter HH", 41_300_000, 25_000_000)).toBe(
    'The area is too large for the layer "Backscatter HH": the layer would have about 41 million cells, and Lynkeus receives at most 25 million. Choose a smaller area.',
  );
});

test("the limit on the cells is read from the description of the process", () => {
  const description = {
    id: "get-layer",
    additionalParameters: {
      parameters: [
        { name: "other", value: [1] },
        { name: "most-cells", value: [25_000_000] },
      ],
    },
  };
  expect(cellLimitOf(description)).toBe(25_000_000);
  expect(cellLimitOf({ id: "get-layer" })).toBeNull();
  expect(cellLimitOf({ additionalParameters: { parameters: [{ name: "most-cells", value: ["many"] }] } })).toBeNull();
  expect(cellLimitOf({ additionalParameters: { parameters: [{ name: "most-cells", value: 25_000_000 }] } })).toBeNull();
  expect(cellLimitOf(null)).toBeNull();
});

test("the limit is kept when the server states it, and stays unknown otherwise", async () => {
  const server = standIn();
  server.process = {
    id: "get-layer",
    additionalParameters: { parameters: [{ name: "most-cells", value: [25_000_000] }] },
  };
  await loadCellLimit();
  expect(cellLimitStore.get()).toBe(25_000_000);
  expect(server.sent("GET").map(({ address }) => address)).toEqual(["/api/processes/get-layer"]);
  server.process = null;
  await loadCellLimit();
  expect(cellLimitStore.get()).toBeNull();
});
