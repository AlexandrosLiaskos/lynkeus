import type { ReactNode } from "react";
import { formatMoment } from "./jobs";
import { KIND_WORDS, unitWords, type LayerEntry } from "./layers";
import { formatDay, formatSize } from "./products";

function fileName(address: string): string {
  return address.split("/").at(-1) ?? address;
}

/**
 * Every field of the description of a layer, with the size and the time that the server records and the links
 * to its two files, as a table of names and values.
 */
export function LayerFields({ entry: { layer, size, created } }: { entry: LayerEntry }) {
  const rows: [string, ReactNode][] = [
    ["Name", layer.title],
    ["Kind", KIND_WORDS[layer.kind]],
    ["Quantity", layer.quantity],
    ["Unit", unitWords(layer.unit)],
    ["Range of the legend", `${String(layer.range[0])} to ${String(layer.range[1])}`],
    ["Colour scale", layer.colours],
    [layer.dates.length === 1 ? "Date of the data" : "Dates of the data", layer.dates.map(formatDay).join(" and ")],
    [
      layer.inputs.length === 1 ? "Product file used" : "Product files used",
      <ul key="inputs" className="fields-list">
        {layer.inputs.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>,
    ],
    ["Program", layer.program],
    ["Method", layer.method],
    ["Size of the files", size === null ? null : formatSize(size)],
    ["Made", created === null ? null : formatMoment(created)],
    [
      "GeoTIFF file",
      <a key="file" href={layer.url} download>
        {fileName(layer.url)}
      </a>,
    ],
    [
      "STAC record",
      <a key="record" href={layer.record} target="_blank" rel="noopener noreferrer">
        {fileName(layer.record)} (opens in a new tab)
      </a>,
    ],
    ["Identifier of the layer", layer.id],
  ];
  return (
    <table
      className="usa-table usa-table--borderless usa-table--compact fields"
      aria-label={`Fields of the layer ${layer.title}`}
    >
      <tbody>
        {rows.map(([name, value]) =>
          value === null ? null : (
            <tr key={name}>
              <th scope="row">{name}</th>
              <td>{value}</td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}
