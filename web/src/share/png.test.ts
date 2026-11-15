// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { expect, test } from "vitest";
import { crc32, pngWithResolution } from "./png";

// A PNG image of one transparent pixel: the signature, the header chunk, one data chunk and the end chunk.
const ONE_PIXEL = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (character) => character.charCodeAt(0),
);

function chunks(png: Uint8Array): { type: string; data: Uint8Array; crc: number; valid: boolean }[] {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const list = [];
  for (let start = 8; start < png.length;) {
    const length = view.getUint32(start);
    const type = String.fromCharCode(...png.subarray(start + 4, start + 8));
    const crc = view.getUint32(start + 8 + length);
    list.push({
      type,
      data: png.subarray(start + 8, start + 8 + length),
      crc,
      valid: crc32(png.subarray(start + 4, start + 8 + length)) === crc,
    });
    start += 12 + length;
  }
  return list;
}

test("the check value of the end chunk is the one that every PNG file carries", () => {
  // The end chunk has no data, so its check value is the same in every PNG file: AE 42 60 82.
  expect(crc32(Uint8Array.from([0x49, 0x45, 0x4e, 0x44]))).toBe(0xae426082);
  expect(chunks(ONE_PIXEL).at(-1)).toMatchObject({ type: "IEND", crc: 0xae426082, valid: true });
});

test("the resolution is written after the header as pixels per metre, with a valid check value", () => {
  const result = chunks(pngWithResolution(ONE_PIXEL, 300));
  expect(result.map(({ type }) => type)).toEqual(["IHDR", "pHYs", "IDAT", "IEND"]);
  expect(result.every(({ valid }) => valid)).toBe(true);
  const fields = new DataView(result[1]?.data.buffer ?? new ArrayBuffer(0), result[1]?.data.byteOffset, 9);
  // 300 dots per inch are 300 / 0.0254 = 11811 pixels per metre.
  expect(fields.getUint32(0)).toBe(11811);
  expect(fields.getUint32(4)).toBe(11811);
  expect(fields.getUint8(8)).toBe(1);
});

test("96 dots per inch are 3780 pixels per metre", () => {
  const [, resolution] = chunks(pngWithResolution(ONE_PIXEL, 96));
  expect(new DataView(resolution?.data.buffer ?? new ArrayBuffer(0), resolution?.data.byteOffset, 9).getUint32(0)).toBe(
    3780,
  );
});

test("the other chunks stay as they were, byte for byte", () => {
  const before = chunks(ONE_PIXEL);
  const after = chunks(pngWithResolution(ONE_PIXEL, 150)).filter(({ type }) => type !== "pHYs");
  expect(after.map(({ type, data, crc }) => [type, [...data], crc])).toEqual(
    before.map(({ type, data, crc }) => [type, [...data], crc]),
  );
  expect(pngWithResolution(ONE_PIXEL, 150).length).toBe(ONE_PIXEL.length + 21);
});

test("an earlier chunk of the resolution is replaced", () => {
  const twice = pngWithResolution(pngWithResolution(ONE_PIXEL, 150), 300);
  const result = chunks(twice);
  expect(result.map(({ type }) => type)).toEqual(["IHDR", "pHYs", "IDAT", "IEND"]);
  expect(new DataView(result[1]?.data.buffer ?? new ArrayBuffer(0), result[1]?.data.byteOffset, 9).getUint32(0)).toBe(
    11811,
  );
});

test("a file that is not a PNG image, or a resolution that is not positive, is refused", () => {
  expect(() => pngWithResolution(Uint8Array.from([1, 2, 3]), 96)).toThrow("not a PNG image");
  expect(() => pngWithResolution(ONE_PIXEL, 0)).toThrow("positive number");
  expect(() => pngWithResolution(ONE_PIXEL, Number.NaN)).toThrow("positive number");
});
