import type { GeoTIFF, GeoTIFFImage } from "geotiff";

/** A file that Lynkeus cannot draw. The message is one sentence for the visitor. */
export class CogError extends Error {}

/** The side of the tiles that are read from a file that is stored in strips, in cells. */
const TILE_OF_STRIPS = 256;

/** One image of the file: the values at full resolution, or a reduced copy of them (an overview). */
export interface CogLevel {
  image: GeoTIFFImage;
  /** Columns and rows of the image. */
  size: readonly [number, number];
  /** Width and height of a cell, in the unit of the projection. */
  cell: readonly [number, number];
  /** Columns and rows of a tile. */
  tile: readonly [number, number];
}

/** The statistics that a file states for its values, as GDAL writes them. */
export interface CogStatistics {
  minimum: number;
  maximum: number;
  mean: number;
  deviation: number;
}

/** What Lynkeus reads from the header of a Cloud Optimized GeoTIFF before it reads any value. */
export interface Cog {
  /** Code of the projection, for example EPSG:32619. */
  projection: string;
  /** West, south, east and north limit, in the unit of the projection. */
  extent: readonly [number, number, number, number];
  /** The images, from the most reduced copy to the full resolution. */
  levels: readonly CogLevel[];
  /** The value of a cell without data, or null when the file names none. NaN always marks a cell without data. */
  noData: number | null;
  /** The statistics of the values, or null when the file does not state them. */
  statistics: CogStatistics | null;
}

/** Tell whether an image is a mask of another image and not values. */
function isMask(image: GeoTIFFImage): boolean {
  const type: unknown = image.getFileDirectory().getValue("NewSubfileType");
  return typeof type === "number" && (type & 4) === 4;
}

/** Return the code of the projection that the file names, or fail when it names none of the EPSG registry. */
function projectionCode(image: GeoTIFFImage): string {
  const keys = image.getGeoKeys();
  for (const key of ["ProjectedCSTypeGeoKey", "GeographicTypeGeoKey"] as const) {
    const code: unknown = keys?.[key];
    // The code 32767 states that the projection is defined in the file and has no code.
    if (typeof code === "number" && code > 0 && code !== 32767) {
      return `EPSG:${String(code)}`;
    }
  }
  throw new CogError("The file of the layer does not name its projection by an EPSG code.");
}

/** Read one number of the metadata of GDAL. */
function numberOf(metadata: Record<string, unknown>, key: string): number {
  const value = metadata[key];
  return typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
}

/** Return the statistics that the file states for its band, or null. */
async function statisticsOf(image: GeoTIFFImage): Promise<CogStatistics | null> {
  const metadata = await image.getGDALMetadata(0);
  if (!metadata) {
    return null;
  }
  const statistics = {
    minimum: numberOf(metadata, "STATISTICS_MINIMUM"),
    maximum: numberOf(metadata, "STATISTICS_MAXIMUM"),
    mean: numberOf(metadata, "STATISTICS_MEAN"),
    deviation: numberOf(metadata, "STATISTICS_STDDEV"),
  };
  return Object.values(statistics).every(Number.isFinite) ? statistics : null;
}

/**
 * Read the header of a GeoTIFF with one band: its projection, its extent, its images and its value for cells
 * without data.
 */
export async function readCog(tiff: GeoTIFF): Promise<Cog> {
  const count = await tiff.getImageCount();
  const images = await Promise.all(Array.from({ length: count }, (_, index) => tiff.getImage(index)));
  const full = images.find((image) => !isMask(image));
  if (!full) {
    throw new CogError("The file of the layer holds no image.");
  }
  if (full.getSamplesPerPixel() !== 1) {
    throw new CogError("The file of the layer holds more than one band.");
  }
  const projection = projectionCode(full);
  let extent: number[];
  try {
    extent = full.getBoundingBox();
  } catch {
    throw new CogError("The file of the layer does not state its position.");
  }
  const [west, south, east, north] = extent;
  if (west === undefined || south === undefined || east === undefined || north === undefined) {
    throw new CogError("The file of the layer does not state its position.");
  }
  const levels = images
    .filter((image) => !isMask(image) && image.getSamplesPerPixel() === 1)
    .sort((one, other) => one.getWidth() - other.getWidth())
    .map((image): CogLevel => {
      const [width = Number.NaN, height = Number.NaN] = image.getResolution(full);
      const tile = [image.getTileWidth(), image.getTileHeight()] as const;
      return {
        image,
        size: [image.getWidth(), image.getHeight()],
        cell: [Math.abs(width), Math.abs(height)],
        // A file in strips has tiles as wide as the image and a few rows high. It is read in square tiles instead.
        tile: tile[0] === tile[1] ? tile : [TILE_OF_STRIPS, TILE_OF_STRIPS],
      };
    });
  return {
    projection,
    extent: [west, south, east, north],
    levels,
    noData: full.getGDALNoData(),
    statistics: await statisticsOf(full),
  };
}

/** The power of a value in decibels: ten times its logarithm to the base ten. */
export function decibels(power: number): number {
  return 10 * Math.log10(power);
}

/** The number that stands for the decibels of a power that is zero or negative, which has no logarithm. */
export const NO_DECIBELS = -1e30;

/**
 * The last number of a cell of a tile: 1 where the cell holds data, a half where a cell of the file holds no
 * data, and 0 beyond the edge of the file.
 */
export const PRESENT = 1;
export const NO_DATA = 0.5;
export const OUTSIDE = 0;

/**
 * Put the values of one tile in the form that the map draws. Each cell receives the value that the colour scale
 * is applied to and, as its last number, `PRESENT`, `NO_DATA` or `OUTSIDE`. With decibels the cell holds three
 * numbers: the value in decibels, the value of the file, and the last number.
 *
 * @param values The values of the tile, row after row.
 * @param tile Columns and rows of the tile.
 * @param inside Columns and rows of the tile that lie inside the image. The cells beyond them hold no data.
 * @param noData The value of a cell without data, or null.
 * @param inDecibels Whether the colour scale is applied to the decibels of the values.
 */
export function composeTile(
  values: ArrayLike<number>,
  tile: readonly [number, number],
  inside: readonly [number, number],
  noData: number | null,
  inDecibels: boolean,
): Float32Array {
  const [columns, rows] = tile;
  const bands = inDecibels ? 3 : 2;
  const data = new Float32Array(columns * rows * bands);
  for (let row = 0; row < Math.min(rows, inside[1]); row += 1) {
    for (let column = 0; column < Math.min(columns, inside[0]); column += 1) {
      const cell = row * columns + column;
      const value = values[cell];
      const start = cell * bands;
      if (value === undefined || Number.isNaN(value) || value === noData) {
        data[start + bands - 1] = NO_DATA;
        continue;
      }
      if (inDecibels) {
        data[start] = value > 0 ? decibels(value) : NO_DECIBELS;
        data[start + 1] = value;
      } else {
        data[start] = value;
      }
      data[start + bands - 1] = PRESENT;
    }
  }
  return data;
}
