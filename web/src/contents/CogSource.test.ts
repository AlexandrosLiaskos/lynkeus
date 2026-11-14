import TileState from "ol/TileState";
import { expect, test } from "vitest";
import { CogError, type Cog } from "./cog";
import { CogSource } from "./CogSource";
import { openTestFile } from "./testdata/files";

/** Wait until a source has read its file, or has failed. */
function settled(source: CogSource): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (source.getState() !== "loading") {
        resolve();
      }
    };
    source.on("change", check);
    check();
  });
}

/** Read one tile of a source: the numbers of its cells, row after row. */
async function tileOf(source: CogSource, z: number, x: number, y: number): Promise<Float32Array> {
  const projection = source.getProjection();
  if (!projection) {
    throw new Error("the source has no projection");
  }
  const tile = source.getTile(z, x, y, 1, projection);
  if (!tile) {
    throw new Error("the source has no such tile");
  }
  await new Promise<void>((resolve, reject) => {
    const check = () => {
      if (tile.getState() === TileState.LOADED) {
        resolve();
      } else if (tile.getState() === TileState.ERROR) {
        reject(new Error("the tile could not be read"));
      }
    };
    tile.addEventListener("change", check);
    tile.load();
    check();
  });
  return tile.getData() as Float32Array;
}

async function sourceOf(name: "backscatter" | "coherence", decibels = false): Promise<CogSource> {
  const source = new CogSource({ cog: openTestFile(name), decibels, workers: false });
  await settled(source);
  return source;
}

test("the source takes its projection and its grid from the file", async () => {
  const source = await sourceOf("backscatter");
  expect(source.getState()).toBe("ready");
  expect(source.getProjection()?.getCode()).toBe("EPSG:32619");
  const grid = source.getTileGrid();
  expect(grid?.getExtent()).toEqual([322080, 4756650, 323360, 4757610]);
  expect(grid?.getResolutions()).toEqual([20, 10]);
  expect(grid?.getOrigin(0)).toEqual([322080, 4757610]);
  expect(source.bandCount).toBe(2);
});

test("a tile holds the values of the file, as rasterio reads them", async () => {
  const source = await sourceOf("backscatter");
  // The tile of column 0 and row 0 at full resolution. The cell of row 10 and column 20 holds 0.37373352...
  const first = await tileOf(source, 1, 0, 0);
  expect(first).toHaveLength(64 * 64 * 2);
  // The first cell of the file holds no data.
  expect([first[0], first[1]]).toEqual([0, 0.5]);
  expect(first[(10 * 64 + 20) * 2]).toBe(Math.fround(0.3737335205078125));
  expect(first[(10 * 64 + 20) * 2 + 1]).toBe(1);
  // The tile of column 1 and row 1 starts at row 64 and column 64 of the image.
  const last = await tileOf(source, 1, 1, 1);
  expect(last[0]).toBe(Math.fround(0.3625984191894531));
  expect(last[(31 * 64 + 63) * 2]).toBe(Math.fround(0.1573810577392578));
});

test("the cells of a tile below the last row of the image hold no data", async () => {
  const last = await tileOf(await sourceOf("backscatter"), 1, 1, 1);
  // The image has 96 rows, so the tile that starts at row 64 has 32 rows of the image.
  expect(last[31 * 64 * 2 + 1]).toBe(1);
  expect(last[32 * 64 * 2 + 1]).toBe(0);
  expect(last.at(-1)).toBe(0);
});

test("a small scale reads the reduced copy of the file", async () => {
  const tile = await tileOf(await sourceOf("backscatter"), 0, 0, 0);
  expect(tile[(5 * 64 + 10) * 2]).toBe(Math.fround(0.2038402557373047));
  expect(tile[(47 * 64 + 63) * 2]).toBe(Math.fround(0.3462810516357422));
});

test("a file compressed with DEFLATE and the floating-point predictor is read", async () => {
  const source = await sourceOf("coherence");
  expect((await tileOf(source, 1, 0, 0))[0]).toBe(Math.fround(0.6058818697929382));
  // Row 70 and column 100 of the image are row 6 and column 36 of the tile of column 1 and row 1.
  expect((await tileOf(source, 1, 1, 1))[(6 * 64 + 36) * 2]).toBe(Math.fround(0.3186381757259369));
});

test("with decibels a tile holds the decibels beside the values of the file", async () => {
  const source = await sourceOf("backscatter", true);
  expect(source.bandCount).toBe(3);
  const tile = await tileOf(source, 1, 1, 1);
  expect(tile[0]).toBeCloseTo(10 * Math.log10(0.3625984191894531), 5);
  expect(tile[1]).toBe(Math.fround(0.3625984191894531));
  expect(tile[2]).toBe(1);
});

test("a file that cannot be opened puts the source in the error state", async () => {
  const source = new CogSource({ cog: Promise.reject(new Error("404")), decibels: false, workers: false });
  await settled(source);
  expect(source.getState()).toBe("error");
  expect(source.getError()?.message).toBe("404");
});

test("a file in a projection that Lynkeus does not hold is refused in one sentence", async () => {
  const cog: Promise<Cog> = openTestFile("backscatter").then((file) => ({ ...file, projection: "EPSG:2100" }));
  const source = new CogSource({ cog, decibels: false, workers: false });
  await settled(source);
  expect(source.getError()).toBeInstanceOf(CogError);
  expect(source.getError()?.message).toBe("Lynkeus cannot draw a file in the projection EPSG:2100.");
});
