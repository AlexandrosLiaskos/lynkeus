// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
// Files that the tests of the area build in memory: a zip file and the main file of a shapefile.

async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new CompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  void writer.write(bytes).then(() => writer.close());
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

/**
 * Build a zip file from named contents. The contents are compressed with the Deflate method, or stored as they
 * are. The check sums are left at zero, because the reader of Lynkeus does not use them.
 */
export async function zipOf(files: Record<string, Uint8Array<ArrayBuffer>>, compress = true): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let place = 0;
  for (const [name, content] of Object.entries(files)) {
    const packed = compress ? await deflate(content) : content;
    const nameBytes = encoder.encode(name);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, compress ? 8 : 0, true);
    local.setUint32(18, packed.length, true);
    local.setUint32(22, content.length, true);
    local.setUint16(26, nameBytes.length, true);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(10, compress ? 8 : 0, true);
    entry.setUint32(20, packed.length, true);
    entry.setUint32(24, content.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, place, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, packed);
    directory.push(new Uint8Array(entry.buffer), nameBytes);
    place += 30 + nameBytes.length + packed.length;
  }
  const directorySize = directory.reduce((size, part) => size + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, place, true);
  const all = [...parts, ...directory, new Uint8Array(end.buffer)];
  const whole = new Uint8Array(all.reduce((size, part) => size + part.length, 0));
  let at = 0;
  for (const part of all) {
    whole.set(part, at);
    at += part.length;
  }
  return whole.buffer;
}

/** A shape of a shapefile for the tests: the rings of a polygon, or a point. */
export type TestShape = { rings: [number, number][][] } | { point: [number, number] };

/** Build the main file (.shp) of a shapefile that holds the given shapes. */
export function shpOf(shapes: readonly TestShape[]): Uint8Array<ArrayBuffer> {
  const records = shapes.map((shape) => {
    if ("point" in shape) {
      const content = new DataView(new ArrayBuffer(20));
      content.setInt32(0, 1, true);
      content.setFloat64(4, shape.point[0], true);
      content.setFloat64(12, shape.point[1], true);
      return new Uint8Array(content.buffer);
    }
    const points = shape.rings.flat();
    const content = new DataView(new ArrayBuffer(44 + 4 * shape.rings.length + 16 * points.length));
    content.setInt32(0, 5, true);
    content.setInt32(36, shape.rings.length, true);
    content.setInt32(40, points.length, true);
    let first = 0;
    shape.rings.forEach((ring, index) => {
      content.setInt32(44 + 4 * index, first, true);
      first += ring.length;
    });
    points.forEach(([x, y], index) => {
      content.setFloat64(44 + 4 * shape.rings.length + 16 * index, x, true);
      content.setFloat64(44 + 4 * shape.rings.length + 16 * index + 8, y, true);
    });
    return new Uint8Array(content.buffer);
  });
  const all = shapes.flatMap((shape) => ("point" in shape ? [shape.point] : shape.rings.flat()));
  const size = 100 + records.reduce((sum, record) => sum + 8 + record.length, 0);
  const file = new Uint8Array(size);
  const view = new DataView(file.buffer);
  view.setInt32(0, 9994, false);
  view.setInt32(24, size / 2, false);
  view.setInt32(28, 1000, true);
  view.setInt32(32, 5, true);
  view.setFloat64(36, Math.min(...all.map(([x]) => x)), true);
  view.setFloat64(44, Math.min(...all.map(([, y]) => y)), true);
  view.setFloat64(52, Math.max(...all.map(([x]) => x)), true);
  view.setFloat64(60, Math.max(...all.map(([, y]) => y)), true);
  let place = 100;
  records.forEach((record, index) => {
    view.setInt32(place, index + 1, false);
    view.setInt32(place + 4, record.length / 2, false);
    file.set(record, place + 8);
    place += 8 + record.length;
  });
  return file;
}

/** The projection file (.prj) that ArcGIS and QGIS write for geographic coordinates on WGS 84. */
export const WGS84_PRJ =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

/** The start of the projection file of a projected system, here zone 19 north of UTM. */
export const UTM_PRJ = 'PROJCS["WGS_1984_UTM_Zone_19N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984"]]]';

/**
 * A zipped shapefile that another program wrote: one polygon with a hole, around the lower Merrimack River, with
 * its projection file. pyshp 3.1.8 wrote the shapefile and the zipfile module of Python 3.13 zipped it with the
 * Deflate method. The file is written here in base64.
 */
export const REAL_SHAPEFILE_ZIP =
  "UEsDBBQAAAAIAHaAbl3dAjBwVQAAAEABAAAXAAAAbWVycmltYWNrL21lcnJpbWFjay5zaHBjYFDnYsAOFrxgZmBgBTLOngGBwANg2sfVASy7IfDArJlAUAnl4weMQJxFjFlMQC7MQdjUw/godqO7ZQOmehT7DkDVR7o6gOmdmPw0MECoR+fD1AMAUEsDBBQAAAAIAHaAbl3zLke+LAAAAGwAAAAXAAAAbWVycmltYWNrL21lcnJpbWFjay5zaHhjYFDnYsAOzF4wMzCwAhlnz4BA4AEw7ePqAJbdEHhg1kwgqITy8QMjIM4CAFBLAwQUAAAACAB2gG5dBzScPC8AAAB0AAAAFwAAAG1lcnJpbWFjay9tZXJyaW1hY2suZGJmY67j5mNkYGBwZDBmwAbyEnNToUxnEGGEJs+r4JNfnlqk4JtaVJSZm5icrUAYAABQSwMEFAAAAAgAdoBuXVV/Q695AAAAkQAAABcAAABtZXJyaW1hY2svbWVycmltYWNrLnByanN39Xd3Do5WAhLx4e7B8YaWFiZKOi6OIaG+0UouSELBAR6uQf6eLtFKCDEzY3MLQ2NzPQMdI0sLPSNTcyMjY1Mz49hYnYAgT19XoAnuRampeeWZyRlKOgZ6BrE6oX6eIUBzU9OB4mAhQ3MTU2MjSyNTQ0tLE2OgVgBQSwECFAMUAAAACAB2gG5d3QIwcFUAAABAAQAAFwAAAAAAAAAAAAAApIEAAAAAbWVycmltYWNrL21lcnJpbWFjay5zaHBQSwECFAMUAAAACAB2gG5d8y5HviwAAABsAAAAFwAAAAAAAAAAAAAApIGKAAAAbWVycmltYWNrL21lcnJpbWFjay5zaHhQSwECFAMUAAAACAB2gG5dBzScPC8AAAB0AAAAFwAAAAAAAAAAAAAApIHrAAAAbWVycmltYWNrL21lcnJpbWFjay5kYmZQSwECFAMUAAAACAB2gG5dVX9Dr3kAAACRAAAAFwAAAAAAAAAAAAAApIFPAQAAbWVycmltYWNrL21lcnJpbWFjay5wcmpQSwUGAAAAAAQABAAUAQAA/QEAAAAA";
