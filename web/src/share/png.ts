/** The eight bytes that start every PNG file. */
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

/** The table of the cyclic redundancy check of the PNG specification (polynomial 0xEDB88320). */
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_unused, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

/** Return the cyclic redundancy check of some bytes, as the PNG specification computes it for a chunk. */
export function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = (CRC_TABLE[(value ^ byte) & 0xff] ?? 0) ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function chunkType(bytes: Uint8Array, start: number): string {
  return String.fromCharCode(...bytes.subarray(start + 4, start + 8));
}

/**
 * Return a PNG file with its resolution written in it, as the chunk `pHYs` of the PNG specification: the
 * pixels per metre along both axes. A program that prints the image, or places it on a page, reads its size
 * from this chunk. The browser writes a PNG without it. The chunk is placed after the header chunk, and a
 * `pHYs` chunk that the file already has is replaced.
 */
export function pngWithResolution(png: Uint8Array, dotsPerInch: number): Uint8Array<ArrayBuffer> {
  if (!SIGNATURE.every((byte, index) => png[index] === byte)) {
    throw new Error("The file is not a PNG image.");
  }
  if (!Number.isFinite(dotsPerInch) || dotsPerInch <= 0) {
    throw new Error("The resolution of an image is a positive number.");
  }
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const headerEnd = SIGNATURE.length + 12 + view.getUint32(SIGNATURE.length);
  if (chunkType(png, SIGNATURE.length) !== "IHDR" || headerEnd > png.length) {
    throw new Error("The file is not a PNG image.");
  }

  // The chunks after the header, without an earlier chunk of the resolution.
  const kept: Uint8Array[] = [];
  for (let start = headerEnd; start + 12 <= png.length;) {
    const end = start + 12 + view.getUint32(start);
    if (chunkType(png, start) !== "pHYs") {
      kept.push(png.subarray(start, end));
    }
    start = end;
  }

  const chunk = new Uint8Array(21);
  const fields = new DataView(chunk.buffer);
  const pixelsPerMetre = Math.round(dotsPerInch / 0.0254);
  fields.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4);
  fields.setUint32(8, pixelsPerMetre);
  fields.setUint32(12, pixelsPerMetre);
  // The unit of the two numbers: 1 is the metre.
  fields.setUint8(16, 1);
  fields.setUint32(17, crc32(chunk.subarray(4, 17)));

  const parts = [png.subarray(0, headerEnd), chunk, ...kept];
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
