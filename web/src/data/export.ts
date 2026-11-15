// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { pairDays, type Product } from "./products";

/** The columns of the table of products, with the value of each for one product. */
const COLUMNS: readonly (readonly [string, (product: Product) => string | number | boolean | null])[] = [
  ["name", ({ name }) => name],
  ["id", ({ id }) => id],
  ["product", ({ product }) => product],
  ["collection", ({ collection }) => collection],
  ["maturity", ({ maturity }) => maturity],
  ["start", ({ start }) => start],
  ["end", ({ end }) => end],
  ["date_1", ({ dates }) => dates[0] ?? null],
  ["date_2", ({ dates }) => dates[1] ?? null],
  ["days_between", (product) => pairDays(product)],
  ["track", ({ track }) => track],
  ["frame", ({ frame }) => frame],
  ["direction", ({ direction }) => direction],
  ["cycle", ({ cycle }) => cycle],
  ["orbit", ({ orbit }) => orbit],
  ["bands", ({ bands }) => bands.join("+")],
  ["channels_a", ({ channels }) => channels.join("+")],
  ["channels_b", ({ side_channels }) => side_channels.join("+")],
  ["bandwidth_a_mhz", ({ bandwidth }) => bandwidth],
  ["bandwidth_b_mhz", ({ side_bandwidth }) => side_bandwidth],
  ["coverage", ({ coverage }) => coverage],
  ["joint", ({ joint }) => joint],
  ["version", ({ version }) => version],
  ["size_bytes", ({ size }) => size],
];

function cell(value: string | number | boolean | null): string {
  const text = value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Write products as a table of comma-separated values, as RFC 4180 describes it: one line for the names of the
 * columns and one for each product, each ended by a carriage return and a line feed.
 */
export function productsCsv(products: readonly Product[]): string {
  const lines = [
    COLUMNS.map(([name]) => name),
    ...products.map((product) => COLUMNS.map(([, value]) => cell(value(product)))),
  ];
  return lines.map((line) => `${line.join(",")}\r\n`).join("");
}

/**
 * Write products as a GeoJSON feature collection (RFC 7946), in degrees on WGS 84. The outline of each product
 * is a MultiPolygon with the rings as the catalogue gives them, and its properties are the columns of the table.
 */
export function productsGeoJson(products: readonly Product[]): string {
  const features = products.map((product) => ({
    type: "Feature",
    id: product.id,
    geometry: { type: "MultiPolygon", coordinates: product.footprint.map((ring) => [ring]) },
    properties: Object.fromEntries(COLUMNS.map(([name, value]) => [name, value(product)])),
  }));
  return `${JSON.stringify({ type: "FeatureCollection", features })}\n`;
}

/** Give the user a text as a file to save. */
export function saveFile(name: string, type: string, text: string): void {
  const address = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = address;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(address);
}

/** Return the name of a saved list of products: the product type, or "products", and the day of the saving. */
export function exportName(products: readonly Product[], ending: string, today = new Date()): string {
  const types = new Set(products.map(({ product }) => product));
  const [only] = types;
  const type = types.size === 1 && only !== undefined ? only : "products";
  return `nisar-${type.toLowerCase()}-${today.toISOString().slice(0, 10)}.${ending}`;
}
