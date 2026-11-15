// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
/** The largest size of one file inside a zip file that is read, in bytes. */
export const MOST_UNZIPPED = 50_000_000;

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_ENTRY = 0x04034b50;
const STORED = 0;
const DEFLATED = 8;

/** A file inside a zip file: its name, and a function that returns its bytes. */
export interface ZipEntry {
  name: string;
  read: () => Promise<Uint8Array<ArrayBuffer>>;
}

/** Undo the Deflate compression of a block of bytes, with the function of the browser. */
async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new DecompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  // The two ends of the stream work at the same time; a fault of the writer also ends the reader.
  const written = writer.write(bytes).then(() => writer.close());
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.length;
    if (size > MOST_UNZIPPED) {
      await reader.cancel();
      throw new Error("A file inside the zip file is too large.");
    }
    chunks.push(value);
  }
  await written;
  const whole = new Uint8Array(size);
  let place = 0;
  for (const chunk of chunks) {
    whole.set(chunk, place);
    place += chunk.length;
  }
  return whole;
}

/**
 * List the files inside a zip file. The format is the one of the .ZIP File Format Specification of PKWARE:
 * the directory at the end of the file names every entry and the place of its bytes. Entries are read when
 * they are stored without compression or with the Deflate method.
 */
export function zipEntries(file: ArrayBuffer): ZipEntry[] {
  const view = new DataView(file);
  // The record that ends the directory is 22 bytes long and may be followed by a comment of up to 65535 bytes.
  let end = file.byteLength - 22;
  const earliest = Math.max(0, end - 0xffff);
  while (end >= earliest && view.getUint32(end, true) !== END_OF_DIRECTORY) {
    end -= 1;
  }
  if (end < earliest || end < 0) {
    throw new Error("The file is not a zip file.");
  }
  const count = view.getUint16(end + 10, true);
  let place = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (place + 46 > file.byteLength || view.getUint32(place, true) !== DIRECTORY_ENTRY) {
      throw new Error("The zip file is damaged.");
    }
    const method = view.getUint16(place + 10, true);
    const packed = view.getUint32(place + 20, true);
    const size = view.getUint32(place + 24, true);
    const nameLength = view.getUint16(place + 28, true);
    const local = view.getUint32(place + 42, true);
    const name = decoder.decode(new Uint8Array(file, place + 46, nameLength));
    place += 46 + nameLength + view.getUint16(place + 30, true) + view.getUint16(place + 32, true);
    entries.push({
      name,
      read: async () => {
        if (local + 30 > file.byteLength || view.getUint32(local, true) !== LOCAL_ENTRY) {
          throw new Error("The zip file is damaged.");
        }
        const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
        if (start + packed > file.byteLength || size > MOST_UNZIPPED) {
          throw new Error("A file inside the zip file is damaged or too large.");
        }
        const bytes = new Uint8Array(file.slice(start, start + packed));
        if (method === STORED) {
          return bytes;
        }
        if (method !== DEFLATED) {
          throw new Error("The zip file uses a compression that Lynkeus does not read.");
        }
        return inflate(bytes);
      },
    });
  }
  return entries;
}
