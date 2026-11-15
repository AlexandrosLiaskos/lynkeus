// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import GeoJSON from "ol/format/GeoJSON";
import KML from "ol/format/KML";
import type Geometry from "ol/geom/Geometry";
import GeometryCollection from "ol/geom/GeometryCollection";
import { formatCount, type Ring } from "./products";
import { fitRings, MOST_POLYGONS, pointCount, rectangleAround, ringsOfGeometry, type SearchArea } from "./searchArea";
import { isWgs84, readShapefile } from "./shapefile";
import { zipEntries } from "./zip";

/** The largest file that is read as an area, in bytes. */
export const MOST_FILE_BYTES = 20_000_000;

/** The endings of the file names that the form reads as an area. */
export const AREA_FILE_TYPES = ".geojson,.json,.kml,.kmz,.zip";

/** The area that a file gives, and a sentence for the user when the area is not exactly the shapes of the file. */
export interface AreaOfFile {
  area: SearchArea;
  note: string | null;
}

/** The shapes of a file: the outer rings of its polygons, and the rectangle around its shapes of other kinds. */
interface Shapes {
  rings: Ring[];
  others: number;
  /** West, south, east and north of every shape, or null when the file holds none. */
  box: readonly number[] | null;
}

function simpleGeometries(geometry: Geometry): Geometry[] {
  return geometry instanceof GeometryCollection ? geometry.getGeometries().flatMap(simpleGeometries) : [geometry];
}

function shapesOfGeometries(geometries: readonly Geometry[]): Shapes {
  const simple = geometries.flatMap(simpleGeometries);
  const rings = simple.flatMap((geometry) => ringsOfGeometry(geometry, "EPSG:4326"));
  const boxes = simple.map((geometry) => geometry.getExtent()).filter((box) => box.every(Number.isFinite));
  const side = (index: number, pick: (...values: number[]) => number) =>
    pick(...boxes.map((box) => box[index] ?? Number.NaN));
  return {
    rings,
    others: simple.filter((geometry) => ringsOfGeometry(geometry, "EPSG:4326").length === 0).length,
    box: boxes.length === 0 ? null : [side(0, Math.min), side(1, Math.min), side(2, Math.max), side(3, Math.max)],
  };
}

function geometriesOf(features: { getGeometry: () => Geometry | undefined }[]): Geometry[] {
  return features.flatMap((feature) => feature.getGeometry() ?? []);
}

async function shapesOfZip(file: ArrayBuffer): Promise<Shapes> {
  const entries = zipEntries(file);
  const named = (ending: string) => entries.find(({ name }) => name.toLowerCase().endsWith(ending));
  const kml = named(".kml");
  const shp = named(".shp");
  if (!shp && kml) {
    const text = new TextDecoder().decode(await kml.read());
    return shapesOfGeometries(geometriesOf(new KML({ extractStyles: false }).readFeatures(text)));
  }
  if (!shp) {
    throw new Error("The zip file holds no shapefile (.shp) and no KML file.");
  }
  const prj = entries.find(({ name }) => name.toLowerCase() === shp.name.toLowerCase().replace(/\.shp$/, ".prj"));
  const projection = prj ? new TextDecoder().decode(await prj.read()) : null;
  const { rings, others, box } = readShapefile((await shp.read()).buffer);
  const inDegrees = box[0] >= -180 && box[2] <= 180 && box[1] >= -90 && box[3] <= 90;
  if (projection === null ? !inDegrees : !isWgs84(projection)) {
    throw new Error(
      "The shapefile is not in degrees of longitude and latitude on WGS 84. Save it in WGS 84 (EPSG:4326) and choose it again.",
    );
  }
  return { rings, others, box: rings.length + others > 0 ? box : null };
}

/** Read the shapes of a file of one of the kinds that the form takes. */
async function shapesOfFile(name: string, file: ArrayBuffer): Promise<Shapes> {
  const ending = name.toLowerCase().split(".").pop() ?? "";
  if (ending === "zip" || ending === "kmz") {
    return shapesOfZip(file);
  }
  const text = new TextDecoder().decode(file);
  if (ending === "kml") {
    return shapesOfGeometries(geometriesOf(new KML({ extractStyles: false }).readFeatures(text)));
  }
  if (ending === "geojson" || ending === "json") {
    let content: unknown;
    try {
      content = JSON.parse(text);
    } catch {
      throw new Error("The file is not a GeoJSON file.");
    }
    try {
      return shapesOfGeometries(geometriesOf(new GeoJSON().readFeatures(content)));
    } catch {
      throw new Error("The file is not a GeoJSON file.");
    }
  }
  throw new Error("Choose a GeoJSON file, a KML or KMZ file, or a zip file that holds a shapefile.");
}

/**
 * Return the area that the shapes of a file give. One to ten polygons are taken as they are, with fewer
 * points when they have more than a search takes. Other files give the rectangle around their shapes.
 */
export function areaOfShapes({ rings, others, box }: Shapes): AreaOfFile {
  if (!box) {
    throw new Error("The file holds no shape.");
  }
  const [west, south, east, north] = box;
  const inDegrees =
    west !== undefined &&
    south !== undefined &&
    east !== undefined &&
    north !== undefined &&
    west >= -180 &&
    east <= 180 &&
    south >= -90 &&
    north <= 90;
  if (!inDegrees) {
    throw new Error("The shapes of the file are not in degrees of longitude and latitude on WGS 84.");
  }
  const rectangle = (note: string): AreaOfFile => {
    if (west === east || south === north) {
      throw new Error("The shapes of the file cover no area.");
    }
    return { area: { kind: "rectangle", west, south, east, north }, note };
  };
  if (rings.length === 0) {
    return rectangle("The file holds no polygon. The area is the rectangle around its shapes.");
  }
  if (rings.length > MOST_POLYGONS) {
    return rectangle(
      `The file holds ${formatCount(rings.length)} polygons, and a search takes at most ${String(MOST_POLYGONS)}. The area is the rectangle around them.`,
    );
  }
  const fitted = fitRings(rings);
  if (!fitted) {
    const around = rectangleAround(rings);
    return {
      area: { kind: "rectangle", ...around },
      note: "The polygons of the file have too many points for a search. The area is the rectangle around them.",
    };
  }
  const [before, after] = [pointCount(rings), pointCount(fitted)];
  const notes = [
    after < before
      ? `The polygons of the file have ${formatCount(before)} points. They were simplified to ${formatCount(after)} points.`
      : null,
    others > 0 ? "The shapes of the file that are not polygons were left out." : null,
  ].filter((note) => note !== null);
  return { area: { kind: "polygons", rings: fitted }, note: notes.length > 0 ? notes.join(" ") : null };
}

/**
 * Read a file as the area of a search. The file is a GeoJSON file, a KML or KMZ file, or a zip file that holds
 * a shapefile, with coordinates in degrees on WGS 84. The promise is rejected with an error whose message can
 * be shown to the user.
 */
export async function readAreaFile(file: File): Promise<AreaOfFile> {
  if (file.size > MOST_FILE_BYTES) {
    throw new Error(`The file is larger than ${String(MOST_FILE_BYTES / 1e6)} MB.`);
  }
  return areaOfShapes(await shapesOfFile(file.name, await file.arrayBuffer()));
}
