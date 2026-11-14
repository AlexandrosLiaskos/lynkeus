import { expect, test } from "vitest";
import { areaOfShapes, MOST_FILE_BYTES, readAreaFile } from "./areaFile";
import { pointCount } from "./searchArea";
import { REAL_SHAPEFILE_ZIP, shpOf, UTM_PRJ, WGS84_PRJ, zipOf } from "./testFiles";

const encoder = new TextEncoder();
const SQUARE = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
  [0, 0],
];

function geoJson(...geometries: object[]): string {
  return JSON.stringify({
    type: "FeatureCollection",
    features: geometries.map((geometry) => ({ type: "Feature", properties: {}, geometry })),
  });
}

function fileOf(name: string, content: string | ArrayBuffer): File {
  return new File([content], name);
}

test("a GeoJSON file with one polygon gives that polygon", async () => {
  const file = fileOf("area.geojson", geoJson({ type: "Polygon", coordinates: [SQUARE] }));
  expect(await readAreaFile(file)).toEqual({ area: { kind: "polygons", rings: [SQUARE] }, note: null });
});

test("a GeoJSON file with a polygon of many parts and a point gives the polygons and says what was left out", async () => {
  const island = SQUARE.map(([x, y]) => [(x ?? 0) + 5, y]);
  const file = fileOf(
    "area.json",
    geoJson({ type: "MultiPolygon", coordinates: [[SQUARE], [island]] }, { type: "Point", coordinates: [3, 3] }),
  );
  expect(await readAreaFile(file)).toEqual({
    area: { kind: "polygons", rings: [SQUARE, island] },
    note: "The shapes of the file that are not polygons were left out.",
  });
});

test("a file without a polygon gives the rectangle around its shapes", async () => {
  const file = fileOf(
    "points.geojson",
    geoJson(
      { type: "Point", coordinates: [-71.2, 42.6] },
      {
        type: "LineString",
        coordinates: [
          [-71, 42.7],
          [-70.75, 42.95],
        ],
      },
    ),
  );
  expect(await readAreaFile(file)).toEqual({
    area: { kind: "rectangle", west: -71.2, south: 42.6, east: -70.75, north: 42.95 },
    note: "The file holds no polygon. The area is the rectangle around its shapes.",
  });
});

test("a file with more polygons than a search takes gives the rectangle around them", async () => {
  const squares = Array.from({ length: 12 }, (_, index) => ({
    type: "Polygon",
    coordinates: [SQUARE.map(([x, y]) => [(x ?? 0) + 2 * index, y])],
  }));
  const read = await readAreaFile(fileOf("many.geojson", geoJson(...squares)));
  expect(read.area).toEqual({ kind: "rectangle", west: 0, south: 0, east: 23, north: 1 });
  expect(read.note).toBe(
    "The file holds 12 polygons, and a search takes at most 10. The area is the rectangle around them.",
  );
});

test("a polygon with more points than a search takes is simplified, and the user is told", async () => {
  const circle = Array.from({ length: 3001 }, (_, index) => {
    const angle = (2 * Math.PI * (index % 3000)) / 3000;
    return [10 + Math.cos(angle), 45 + Math.sin(angle)];
  });
  const read = await readAreaFile(fileOf("circle.geojson", geoJson({ type: "Polygon", coordinates: [circle] })));
  expect(read.area.kind).toBe("polygons");
  const points = read.area.kind === "polygons" ? pointCount(read.area.rings) : 0;
  expect(points).toBeLessThanOrEqual(250);
  expect(read.note).toBe(
    `The polygons of the file have 3,001 points. They were simplified to ${String(points)} points.`,
  );
});

test("a KML file gives its polygon", async () => {
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Area</name><Polygon><outerBoundaryIs><LinearRing>
<coordinates>0,0,0 1,0,0 1,1,0 0,1,0 0,0,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`;
  expect(await readAreaFile(fileOf("area.kml", kml))).toEqual({
    area: { kind: "polygons", rings: [SQUARE] },
    note: null,
  });
  const kmz = await zipOf({ "doc.kml": encoder.encode(kml) });
  expect((await readAreaFile(fileOf("area.kmz", kmz))).area).toEqual({ kind: "polygons", rings: [SQUARE] });
});

test("a zipped shapefile in degrees on WGS 84 gives its polygons", async () => {
  // The outer ring of a polygon of a shapefile runs clockwise.
  const ring = [...SQUARE].reverse() as [number, number][];
  const zip = await zipOf({
    "area/Study.shp": shpOf([{ rings: [ring] }]),
    "area/Study.prj": encoder.encode(WGS84_PRJ),
    "area/Study.dbf": encoder.encode("table"),
  });
  expect(await readAreaFile(fileOf("area.zip", zip))).toEqual({
    area: { kind: "polygons", rings: [ring] },
    note: null,
  });
});

test("a zipped shapefile that another program wrote gives its polygon without the hole", async () => {
  const bytes = Uint8Array.from(atob(REAL_SHAPEFILE_ZIP), (character) => character.charCodeAt(0));
  expect(await readAreaFile(fileOf("merrimack.zip", bytes.buffer))).toEqual({
    area: {
      kind: "polygons",
      rings: [
        [
          [-71.2, 42.6],
          [-71.2, 42.95],
          [-70.75, 42.95],
          [-70.75, 42.6],
          [-71.2, 42.6],
        ],
      ],
    },
    note: null,
  });
});

test("a shapefile in a projected system is refused, with or without its projection file", async () => {
  const metres: [number, number][] = [
    [300000, 4700000],
    [300000, 4800000],
    [400000, 4800000],
    [300000, 4700000],
  ];
  const inDegrees: [number, number][] = [
    [0, 0],
    [0, 1],
    [1, 1],
    [0, 0],
  ];
  const withPrj = await zipOf({ "a.shp": shpOf([{ rings: [inDegrees] }]), "a.prj": encoder.encode(UTM_PRJ) });
  await expect(readAreaFile(fileOf("a.zip", withPrj))).rejects.toThrow("Save it in WGS 84 (EPSG:4326)");
  const withoutPrj = await zipOf({ "a.shp": shpOf([{ rings: [metres] }]) });
  await expect(readAreaFile(fileOf("a.zip", withoutPrj))).rejects.toThrow("Save it in WGS 84 (EPSG:4326)");
  // Without a projection file, coordinates inside the limits of longitude and latitude are taken as degrees.
  const plain = await zipOf({ "a.shp": shpOf([{ rings: [inDegrees] }]) });
  expect((await readAreaFile(fileOf("a.zip", plain))).area.kind).toBe("polygons");
});

test("a file that cannot give an area is refused in plain words", async () => {
  await expect(readAreaFile(fileOf("area.geojson", "{ not json"))).rejects.toThrow("The file is not a GeoJSON file.");
  await expect(readAreaFile(fileOf("area.geojson", '{"type":"Topology"}'))).rejects.toThrow(/GeoJSON file|no shape/);
  await expect(readAreaFile(fileOf("area.geojson", geoJson()))).rejects.toThrow("The file holds no shape.");
  await expect(readAreaFile(fileOf("area.txt", "0 0, 1 1"))).rejects.toThrow("Choose a GeoJSON file");
  await expect(readAreaFile(fileOf("area.zip", await zipOf({ "readme.txt": encoder.encode("x") })))).rejects.toThrow(
    "holds no shapefile",
  );
  await expect(readAreaFile(fileOf("point.geojson", geoJson({ type: "Point", coordinates: [3, 3] })))).rejects.toThrow(
    "cover no area",
  );
  await expect(
    readAreaFile(
      fileOf(
        "metres.geojson",
        geoJson({
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [5000, 0],
              [5000, 5000],
              [0, 0],
            ],
          ],
        }),
      ),
    ),
  ).rejects.toThrow("not in degrees");
  const large = { name: "large.geojson", size: MOST_FILE_BYTES + 1 } as File;
  await expect(readAreaFile(large)).rejects.toThrow("larger than 20 MB");
});

test("polygons that cannot be simplified enough give the rectangle around them", () => {
  // Ten rings of 30 points each stay above the limit of 250 points whatever is left out of them.
  const rings = Array.from({ length: 10 }, (_, ring) =>
    Array.from({ length: 31 }, (_point, index) => {
      const angle = (2 * Math.PI * (index % 30)) / 30;
      return [ring * 30 + 10 * Math.cos(angle) - 130, 10 * Math.sin(angle)] as const;
    }),
  );
  const read = areaOfShapes({ rings, others: 0, box: [-140, -10, 150, 10] });
  expect(read.area.kind).toBe("rectangle");
  expect(read.note).toMatch(/too many points for a search/);
});
