// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import {
  formatDay,
  formatMoment,
  formatSize,
  pairDays,
  PRODUCT_NAMES,
  type Attribute,
  type Product,
  type ProductDetail,
} from "../data/products";
import type { Property, PropertyGroup } from "../shared/properties/PropertyList";

/**
 * The identifiers of the processing that have a readable name, by the name that the record gives them. The NISAR
 * Data User Guide of the Alaska Satellite Facility describes both as parts of a product name
 * (https://nisar-docs.asf.alaska.edu/gcov/). An identifier that is not listed here keeps the name of the record.
 */
const IDENTIFIERS = new Map<string, { name: string; info: string }>([
  [
    "CRID",
    {
      name: "Composite release identifier",
      info: "The identifier CRID of the record. It names the version of the workflow that processed the data, and it is a part of the product name.",
    },
  ],
  [
    "ProductCounter",
    {
      name: "Product counter",
      info: "The identifier ProductCounter of the record. The product name ends with the same counter, written with three digits.",
    },
  ],
]);

/** Write a word with a capital first letter, as a value of a property list is written. */
function capital(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Return a row for a value that the record states, and no row for a value that it does not state. */
function row(name: string, value: string | null, more: { info?: string; copy?: boolean } = {}): Property[] {
  return value === null || value === "" ? [] : [{ name, value, ...more }];
}

function megahertz(value: number | null): string | null {
  return value === null ? null : `${String(value)} MHz`;
}

/**
 * Return the properties of a product in groups: what the result list knows about it and, once the full record
 * is read, what only the record states. A property that the record does not state has no row, and a group
 * without rows is left out.
 */
export function productGroups(product: Product, detail: ProductDetail | null): PropertyGroup[] {
  const days = pairDays(product);
  const [first, second] = product.dates;
  const named = detail?.identifiers.filter(({ name }) => IDENTIFIERS.has(name)) ?? [];
  const groups: PropertyGroup[] = [
    {
      title: "Product",
      rows: [
        ...row("Product type", `${product.product} (${PRODUCT_NAMES[product.product]})`),
        ...row("Collection", product.collection, { copy: true }),
        ...row("Level of validation", product.maturity),
        ...row("Version", product.version),
        ...row("Size", product.size === null ? null : formatSize(product.size), {
          info: "The size of the product file alone. The section Files lists every file of the product with its size.",
        }),
        ...row("Catalogue identifier", product.id, {
          copy: true,
          info: "The identifier of the record in NASA's catalogue, which the record names concept-id.",
        }),
      ],
    },
    {
      title: "Acquisition",
      rows: [
        ...(days === null || first === undefined || second === undefined
          ? [...row("Start", formatMoment(product.start)), ...row("End", formatMoment(product.end))]
          : [
              ...row("First acquisition", formatDay(first)),
              ...row("Second acquisition", formatDay(second)),
              ...row("Days between", String(days)),
              ...row("Start of the first", formatMoment(product.start)),
              ...row("End of the second", formatMoment(product.end)),
            ]),
        ...row("Frame coverage", product.coverage === null ? null : capital(product.coverage), {
          info: "Whether the product covers its whole frame or a part of it.",
        }),
        ...row("Covers", detail?.localities.join(", ") ?? null, {
          info: "The kinds of surface and the continents that the product covers, which the record names GranuleLocalities.",
        }),
      ],
    },
    {
      title: "Orbit",
      rows: [
        ...row("Track", String(product.track)),
        ...row("Frame", String(product.frame)),
        ...row("Direction", capital(product.direction)),
        ...row("Cycle", product.cycle === null ? null : String(product.cycle), {
          info: "The number of the 12-day cycle of the orbit, read from the product name. For a pair it is the cycle of the first acquisition.",
        }),
        ...row("Absolute orbit", product.orbit === null ? null : String(product.orbit)),
      ],
    },
    {
      title: "Radar",
      rows: [
        ...row("Frequency bands", product.bands.join(", ")),
        ...row("Channels of band A", product.channels.join(", ")),
        ...row("Channels of band B", product.side_channels.join(", ")),
        ...row("Bandwidth of band A", megahertz(product.bandwidth)),
        ...row("Bandwidth of band B", megahertz(product.side_bandwidth)),
        ...row("Look direction", detail?.look ? capital(detail.look) : null, {
          info: "The side of the track to which the radar looked.",
        }),
        ...row("Joint observation", product.joint === null ? null : product.joint ? "Yes" : "No", {
          info: "Whether the L-band radar and the S-band radar observed together.",
        }),
      ],
    },
    {
      title: "Processing",
      rows: detail
        ? [
            ...row("Produced", detail.produced === null ? null : formatMoment(detail.produced)),
            ...row("Program", detail.software, {
              info: "The program that made the product, with its version, which the record names PGEVersionClass.",
            }),
            ...named.flatMap(({ name, values }) =>
              row(IDENTIFIERS.get(name)?.name ?? name, values.join(", "), {
                info: IDENTIFIERS.get(name)?.info,
                copy: true,
              }),
            ),
            ...row("Record changed", detail.recorded === null ? null : formatMoment(detail.recorded)),
            ...row("Input products", detail.inputs.join(", "), { copy: true }),
          ]
        : [],
    },
  ];
  return groups.filter(({ rows }) => rows.length > 0);
}

/** Return the identifiers of the processing that have no readable name, under the names of the record. */
export function otherIdentifiers(detail: ProductDetail): Attribute[] {
  return detail.identifiers.filter(({ name }) => !IDENTIFIERS.has(name));
}

/** Return attributes of a record as the rows of a property list, under the names of the record. */
export function attributeRows(attributes: readonly Attribute[]): Property[] {
  return attributes.map(({ name, values }) => ({ name, value: values.join(", ") }));
}
