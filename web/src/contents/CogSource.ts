// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { fromUrl, Pool } from "geotiff";
import DataTile from "ol/source/DataTile";
import TileGrid from "ol/tilegrid/TileGrid";
import { CogError, composeTile, readCog, type Cog } from "./cog";
import { projectionOf } from "./projections";

/** The largest number of programs that decompress tiles beside the page. */
const MOST_DECODERS = 4;

let pool: Pool | undefined;
let inPage = false;
let tellStopped: () => void = () => undefined;

/** Settles when one of the programs beside the page could not start. */
const stopped = new Promise<"stopped">((resolve) => {
  tellStopped = () => {
    resolve("stopped");
  };
});

/**
 * Return the programs that decompress tiles beside the page, or undefined when one of them could not start. They
 * start with the first layer. After a failure the page decompresses the tiles itself.
 */
function decoders(): Pool | undefined {
  if (inPage) {
    return undefined;
  }
  pool ??= new Pool(Math.min(MOST_DECODERS, navigator.hardwareConcurrency || 1), () => {
    const worker = new Worker(new URL("./decodeWorker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("error", () => {
      inPage = true;
      tellStopped();
    });
    return worker;
  });
  return pool;
}

/** Open the Cloud Optimized GeoTIFF at an address of the site and read its header. The values are read later, in parts. */
export async function openCog(url: string): Promise<Cog> {
  return readCog(await fromUrl(url));
}

interface CogSourceOptions {
  /** The file, as `openCog` or `readCog` gives it. */
  cog: Promise<Cog>;
  /** Whether the colour scale is applied to the decibels of the values. */
  decibels: boolean;
  /** False decompresses the tiles in the page itself. */
  workers?: boolean;
}

/**
 * The values of a Cloud Optimized GeoTIFF with one band, as tiles for the map. The source reads the tiles of the
 * file as the file stores them, and at a small scale the tiles of its reduced copies. A tile holds, for each cell,
 * the numbers that `composeTile` describes. The values are not interpolated: the map shows the cells of the file.
 */
export class CogSource extends DataTile {
  private failure: Error | null = null;

  constructor({ cog, decibels, workers = true }: CogSourceOptions) {
    super({
      state: "loading",
      bandCount: decibels ? 3 : 2,
      hasAlpha: true,
      interpolate: false,
      transition: 0,
      wrapX: false,
    });
    cog
      .then((file) => {
        this.configure(file, decibels, workers);
      })
      .catch((error: unknown) => {
        this.failure = error instanceof Error ? error : new Error(String(error));
        this.setState("error");
      });
  }

  /** Return why the file could not be read, or null. */
  getError(): Error | null {
    return this.failure;
  }

  private configure(cog: Cog, decibels: boolean, workers: boolean): void {
    const projection = projectionOf(cog.projection);
    if (!projection) {
      throw new CogError(`Lynkeus cannot draw a file in the projection ${cog.projection}.`);
    }
    const [west, , , north] = cog.extent;
    this.projection = projection;
    // The grid has the cell width of each image. The last reduced copy of a file may have cells that are not
    // square, so the height of a tile on the grid follows the cell height of its image.
    this.tileGrid = new TileGrid({
      extent: [...cog.extent],
      origin: [west, north],
      resolutions: cog.levels.map(({ cell }) => cell[0]),
      tileSizes: cog.levels.map(({ cell, tile }) => [tile[0], (tile[1] * cell[1]) / cell[0]]),
    });
    this.setTileSizes(cog.levels.map(({ tile }) => [...tile]));
    this.setLoader(async (z, x, y, { signal }) => {
      const level = cog.levels[z];
      if (!level) {
        throw new Error(`The file has no image ${String(z)}.`);
      }
      const [columns, rows] = level.tile;
      const read = (beside: Pool | undefined) =>
        level.image.readRasters({
          window: [x * columns, y * rows, (x + 1) * columns, (y + 1) * rows],
          samples: [0],
          interleave: false,
          pool: beside,
          signal,
        });
      const beside = workers ? decoders() : undefined;
      // A program beside the page that could not start never answers, so the tile is then read again in the page.
      const answer = beside ? await Promise.race([read(beside), stopped]) : await read(undefined);
      const rasters = answer === "stopped" ? await read(undefined) : answer;
      const inside = [level.size[0] - x * columns, level.size[1] - y * rows] as const;
      return composeTile(rasters[0] as ArrayLike<number>, level.tile, inside, cog.noData, decibels);
    });
    this.setState("ready");
  }
}
