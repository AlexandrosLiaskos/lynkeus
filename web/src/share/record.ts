// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type { LayerDescription } from "../shared/layer";

/** The parts of the STAC record of a layer that the Share tab reads. */
export interface LayerRecord {
  id: string;
  properties: Readonly<Record<string, unknown>>;
  links: readonly { rel: string; href: string }[];
  /** The whole record, as the server wrote it. */
  whole: Readonly<Record<string, unknown>>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return the parts of a STAC Item that the Share tab reads, or null when the value is not a STAC Item. */
export function asLayerRecord(value: unknown): LayerRecord | null {
  if (!isObject(value) || value.type !== "Feature" || typeof value.id !== "string" || !isObject(value.properties)) {
    return null;
  }
  const links = Array.isArray(value.links) ? value.links : [];
  return {
    id: value.id,
    properties: value.properties,
    links: links.flatMap((link: unknown) =>
      isObject(link) && typeof link.rel === "string" && typeof link.href === "string"
        ? [{ rel: link.rel, href: link.href }]
        : [],
    ),
    whole: value,
  };
}

/**
 * Return an address as an address of this site, or null when it leads to another site. A record is read only
 * from the site itself, as the security policy of the site also demands.
 */
export function siteAddress(address: string, page: string = window.location.href): string | null {
  try {
    const full = new URL(address, page);
    return full.origin === new URL(page).origin ? full.href : null;
  } catch {
    return null;
  }
}

/** Read the STAC record of a layer from the site. The promise fails with a sentence for the user. */
export async function readRecord(address: string): Promise<LayerRecord> {
  const full = siteAddress(address);
  if (full === null) {
    throw new Error("The record of the layer is not on this site, so it was not read.");
  }
  const response = await fetch(full);
  if (!response.ok) {
    throw new Error(`The server did not give the record of the layer (answer ${String(response.status)}).`);
  }
  const record = asLayerRecord((await response.json()) as unknown);
  if (!record) {
    throw new Error("The record of the layer is not a STAC Item.");
  }
  return record;
}

/**
 * Return the record of a layer as the text of a file that is saved beside the file of the layer. The record is
 * written as the server wrote it, with two changes that keep its links valid outside the site: the address of
 * the data file becomes the name under which Lynkeus saves that file, and a link to another file of the site
 * becomes a full address.
 */
export function recordText(record: LayerRecord, dataFile: string, page: string = window.location.href): string {
  const assets = isObject(record.whole.assets) ? record.whole.assets : {};
  const data = isObject(assets.data) ? { ...assets.data, href: `./${dataFile}` } : undefined;
  const links = Array.isArray(record.whole.links)
    ? record.whole.links.map((link: unknown) =>
        isObject(link) && typeof link.href === "string"
          ? { ...link, href: siteAddress(link.href, page) ?? link.href }
          : link,
      )
    : [];
  const saved = { ...record.whole, links, assets: data ? { ...assets, data } : assets };
  return `${JSON.stringify(saved, null, 2)}\n`;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Return the provenance record of a layer as plain text: what the layer is, its input files, the program and
 * its version, the reference of the method of a result and, from the STAC record when it was read, how and when
 * the file was made.
 */
export function provenanceText(
  layer: LayerDescription,
  record: LayerRecord | null,
  page: string = window.location.href,
): string {
  const software =
    record && isObject(record.properties["processing:software"]) ? record.properties["processing:software"] : {};
  const programs = Object.entries(software).flatMap(([name, version]) =>
    typeof version === "string" ? [`${name} ${version}`] : [],
  );
  const lines = [
    "Provenance record",
    "",
    `Title: ${layer.title}`,
    `Kind: ${layer.kind === "result" ? "result of an analysis tool" : "layer received from NASA"}`,
    `Quantity: ${layer.quantity}`,
    `Unit: ${layer.unit}`,
    `Dates of the data: ${layer.dates.join(", ")}`,
    "Input files:",
    ...layer.inputs.map((input) => `  ${input}`),
    `Program: ${layer.program}`,
    ...(layer.method === null ? [] : [`Method: ${layer.method}`]),
    ...(record
      ? [
          ...[text(record.properties["processing:lineage"])].flatMap((lineage) =>
            lineage ? [`Lineage: ${lineage}`] : [],
          ),
          ...[text(record.properties["processing:datetime"])].flatMap((time) => (time ? [`Processed: ${time}`] : [])),
          ...(programs.length > 0 ? [`Software: ${programs.join(", ")}`] : []),
        ]
      : []),
    `File: ${siteAddress(layer.url, page) ?? layer.url}`,
    `Record: ${siteAddress(layer.record, page) ?? layer.record}`,
  ];
  return `${lines.join("\n")}\n`;
}
