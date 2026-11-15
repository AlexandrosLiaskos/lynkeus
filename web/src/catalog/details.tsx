// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { jobRows } from "../data/JobFields";
import { formatMoment, type Job } from "../data/jobs";
import { KIND_WORDS, unitWords, type LayerEntry } from "../data/layers";
import { formatDay, formatSize } from "../data/products";
import { statementOf } from "../options/kept";
import type { Property, PropertyGroup } from "../shared/properties/PropertyList";
import { PROJECT_SERVER_WORDS } from "../shared/servers";

/**
 * Return every field of a job in groups: its state and its times, the inputs with which it was started, and its
 * identifiers, which can be copied. The rows are those of `jobRows`, which lists the inputs after the state and
 * before the identifiers.
 */
export function jobGroups(job: Job): PropertyGroup[] {
  const rows = jobRows(job);
  const inputs = Object.keys(job.inputs ?? {}).length;
  const identifiers = job.layer || job.series ? 2 : 1;
  const state = rows.length - inputs - identifiers;
  const group = (title: string, part: [string, string][], copy = false): PropertyGroup => ({
    title,
    rows: part.map(([name, value]) => ({ name, value, copy })),
  });
  return [
    group("Job", rows.slice(0, state)),
    group("Inputs", rows.slice(state, state + inputs)),
    group("Identifiers", rows.slice(state + inputs), true),
  ].filter(({ rows: part }) => part.length > 0);
}

function fileName(address: string): string {
  return address.split("/").at(-1) ?? address;
}

/**
 * Return every field of the description of a layer in groups, with the size and the time that the server
 * records, the server that keeps its files, until when they are kept and the links to its two files. The
 * explanation of the GeoTIFF file says who reads the file at its address (`docs/Storage.md`). A field that the
 * server does not state has no row. `kept` says where the layer is kept, as the list of layers says it; without it the row
 * names the server alone.
 */
export function layerGroups(
  { layer, size, created, server, keptUntil }: LayerEntry,
  kept: string | null = null,
): PropertyGroup[] {
  const stated = (name: string, value: string | null): Property[] => (value === null ? [] : [{ name, value }]);
  return [
    {
      title: "Layer",
      rows: [
        { name: "Name", value: layer.title },
        { name: "Kind", value: KIND_WORDS[layer.kind] },
        { name: "Quantity", value: layer.quantity },
        { name: "Unit", value: unitWords(layer.unit) },
        { name: "Identifier", value: layer.id, copy: true },
      ],
    },
    {
      title: "Legend",
      rows: [
        { name: "Range", value: `${String(layer.range[0])} to ${String(layer.range[1])}` },
        { name: "Colour scale", value: layer.colours },
      ],
    },
    {
      title: "Data",
      rows: [
        {
          name: layer.dates.length === 1 ? "Date of the data" : "Dates of the data",
          value: layer.dates.map(formatDay).join(" and "),
        },
        {
          name: layer.inputs.length === 1 ? "Product file used" : "Product files used",
          value: (
            <ul className="catalog-values">
              {layer.inputs.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          ),
          copy: layer.inputs.join(", "),
        },
        { name: "Program", value: layer.program },
        ...stated("Method", layer.method),
      ],
    },
    {
      title: "Files",
      rows: [
        ...stated("Size", size === null ? null : formatSize(size)),
        ...stated("Made", created === null ? null : formatMoment(created)),
        { name: "Kept", value: kept ?? `On ${server ? server.name : `the ${PROJECT_SERVER_WORDS.toLowerCase()}`}` },
        ...stated(
          "Kept until",
          server ? "You remove the layer" : keptUntil === undefined ? null : formatMoment(keptUntil),
        ),
        {
          name: "GeoTIFF file",
          info: statementOf("files"),
          value: (
            <a href={layer.url} download>
              {fileName(layer.url)}
            </a>
          ),
        },
        {
          name: "STAC record",
          value: (
            <a href={layer.record} target="_blank" rel="noopener noreferrer">
              {fileName(layer.record)} (opens in a new tab)
            </a>
          ),
        },
      ],
    },
  ];
}
