import { expect, test } from "vitest";
import { zipOf } from "./testFiles";
import { zipEntries } from "./zip";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const TEXT = "Lynkeus reads the files inside a zip file. ".repeat(200);

test("the files inside a zip file are listed and read, compressed or stored", async () => {
  for (const compress of [true, false]) {
    const file = await zipOf(
      { "area.prj": encoder.encode("GEOGCS"), "folder/area.txt": encoder.encode(TEXT) },
      compress,
    );
    const entries = zipEntries(file);
    expect(entries.map(({ name }) => name)).toEqual(["area.prj", "folder/area.txt"]);
    expect(decoder.decode(await entries[0]?.read())).toBe("GEOGCS");
    expect(decoder.decode(await entries[1]?.read())).toBe(TEXT);
  }
});

test("compression makes the zip file of the test smaller than its content", async () => {
  const file = await zipOf({ "area.txt": encoder.encode(TEXT) });
  expect(file.byteLength).toBeLessThan(TEXT.length / 4);
});

test("a file that is not a zip file is refused", () => {
  expect(() => zipEntries(encoder.encode("not a zip file, only some text of no use").buffer)).toThrow(
    "The file is not a zip file.",
  );
  expect(() => zipEntries(new ArrayBuffer(4))).toThrow("The file is not a zip file.");
});

test("a damaged zip file is refused", async () => {
  const file = new Uint8Array(await zipOf({ "area.txt": encoder.encode(TEXT) }));
  const cut = file.slice();
  // The first entry of the directory loses its mark.
  const end = cut.length - 22;
  const directory = new DataView(cut.buffer).getUint32(end + 16, true);
  cut[directory] = 0;
  expect(() => zipEntries(cut.buffer)).toThrow("The zip file is damaged.");
  // The entry of the file itself loses its mark.
  const broken = file.slice();
  broken[0] = 0;
  await expect(zipEntries(broken.buffer)[0]?.read()).rejects.toThrow("The zip file is damaged.");
});

test("a compression that is not Deflate is refused", async () => {
  const file = new Uint8Array(await zipOf({ "area.txt": encoder.encode(TEXT) }, false));
  const view = new DataView(file.buffer);
  const directory = view.getUint32(file.length - 22 + 16, true);
  // Method 12 is bzip2.
  view.setUint16(directory + 10, 12, true);
  await expect(zipEntries(file.buffer)[0]?.read()).rejects.toThrow("a compression that Lynkeus does not read");
});
