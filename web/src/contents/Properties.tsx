import { useEffect, useState } from "react";
import { Dialog } from "../shared/dialog/Dialog";
import type { LayerDescription } from "../shared/layer";
import { mapLayersStore } from "../shared/mapLayers";
import { Notice } from "../shared/notice/Notice";
import { PropertyList, type Property, type PropertyGroup } from "../shared/properties/PropertyList";
import { PROJECT_SERVER_WORDS, serverOfAddress, serversStore, type Server } from "../shared/servers";
import { useStore } from "../shared/store";
import type { Cog } from "./cog";
import { formatDates } from "./dates";
import { fileOf } from "./files";
import { formatNumber, formatUnit } from "./legendValues";
import { projectionOf } from "./projections";
import { propertiesStore } from "./state";

/** Write a number of the grid of a file: up to ten significant digits, without zeros at its end. */
function gridNumber(value: number): string {
  return String(Number(value.toPrecision(10)));
}

/** Return the unit of the coordinates of a projection as it stands in a name, or an empty text when it is not known. */
function unitOf(code: string): string {
  const units = projectionOf(code)?.getUnits();
  return units === "m" ? " (m)" : units === "degrees" ? " (degrees)" : "";
}

/**
 * Return an address as it is copied: the whole address, so that it also opens outside Lynkeus. An address of the
 * site itself is stored without the name of the site.
 *
 * @param address The address as the description of the layer gives it.
 * @param base The address of the page.
 */
export function wholeAddress(address: string, base: string): string {
  try {
    return new URL(address, base).href;
  } catch {
    return address;
  }
}

/** Return the row of an address: a link that shows the address as it is stored, and a button that copies it whole. */
function addressRow(address: string, info: string): Property {
  return {
    name: "Address",
    value: <a href={address}>{address}</a>,
    copy: wholeAddress(address, window.location.href),
    info,
  };
}

/**
 * Return the row that says which server keeps the file of a layer: the project server, or the own server that
 * the address of the file names, with its name where the list of the servers of the visitor holds it.
 *
 * @param address The address of the file, as the description of the layer gives it.
 * @param servers The own servers of the visitor, as far as the page knows them.
 */
export function keptRow(address: string, servers: readonly Server[]): Property {
  const id = serverOfAddress(address);
  const server = servers.find((listed) => listed.id === id);
  const value =
    id === null
      ? PROJECT_SERVER_WORDS
      : server
        ? `Your server "${server.name}"${server.connected ? "" : ", which is not connected"}`
        : "An own server";
  return {
    name: "Kept on",
    value,
    info: "The server that keeps the file: the project server of Lynkeus, or an own server of yours. The file of a layer of an own server is read through the project server while that server is connected.",
  };
}

/** Return the rows of the group Layer: what the layer is and where it comes from. */
function layerRows(layer: LayerDescription): Property[] {
  const unit = formatUnit(layer.unit);
  return [
    { name: "Name", value: layer.title },
    { name: "Kind", value: layer.kind === "layer" ? "Layer of a NISAR product" : "Result of an analysis tool" },
    { name: "Quantity", value: layer.quantity },
    unit === ""
      ? { name: "Unit", value: "None", info: "The quantity has no dimension, so its values carry no unit." }
      : { name: "Unit", value: unit },
    { name: layer.dates.length === 1 ? "Date" : "Dates", value: formatDates(layer.dates) },
    ...layer.inputs.map((input, index) => ({
      name: layer.inputs.length === 1 ? "Product file" : `Product file ${String(index + 1)}`,
      value: input,
      copy: true,
    })),
    { name: "Program", value: layer.program, info: "The program that wrote the file of the layer, with its version." },
    ...(layer.method === null
      ? []
      : [
          {
            name: "Method",
            value: layer.method,
            info: "The method sheet of the analysis tool that computed the result.",
          },
        ]),
  ];
}

/** Return the rows of the group Projection and grid, which the file of the layer states. */
function gridRows(cog: Cog): Property[] {
  const full = cog.levels.at(-1);
  const unit = unitOf(cog.projection);
  return [
    { name: "Projection", value: cog.projection },
    ...(full
      ? [
          { name: "Size", value: `${String(full.size[0])} columns by ${String(full.size[1])} rows` },
          { name: `Cell size${unit}`, value: `${gridNumber(full.cell[0])} by ${gridNumber(full.cell[1])}` },
        ]
      : []),
    {
      name: `Extent${unit}`,
      value: cog.extent.map(gridNumber).join(", "),
      copy: true,
      info: "The west, south, east and north limits of the grid, in the coordinates of the projection.",
    },
  ];
}

/** Return the rows of the group File that only the opened file gives: its reduced copies and its values. */
function fileRows(cog: Cog, unit: string): Property[] {
  const write = (value: number) => `${formatNumber(value)}${unit && ` ${unit}`}`;
  return [
    {
      name: "Reduced copies",
      value:
        cog.levels.length > 1
          ? cog.levels
              .slice(0, -1)
              .reverse()
              .map(({ size }) => `${String(size[0])} by ${String(size[1])} cells`)
              .join("; ")
          : "None",
      info: "The copies of the grid with fewer cells that the file holds. The map draws them at small scales.",
    },
    {
      name: "Value without data",
      value: cog.noData === null ? "None" : String(cog.noData),
      info: "The value that marks a cell without data, when the file names one.",
    },
    ...(cog.statistics
      ? [
          { name: "Lowest value", value: write(cog.statistics.minimum) },
          { name: "Highest value", value: write(cog.statistics.maximum) },
          { name: "Mean", value: write(cog.statistics.mean) },
          { name: "Standard deviation", value: write(cog.statistics.deviation) },
        ]
      : [{ name: "Statistics", value: "None", info: "The file states no statistics of its values." }]),
  ];
}

/**
 * The properties of one layer as a list of names and values in four groups: the layer, the projection and the
 * grid, the file and the record. The file of the layer is read for its projection, its grid and its values;
 * until it is read, and when it cannot be read, a notice above the list says so and the list shows the rest.
 */
function PropertiesOf({ layer }: { layer: LayerDescription }) {
  const [cog, setCog] = useState<Cog | "reading" | "failed">("reading");
  const servers = useStore(serversStore)?.servers ?? [];

  useEffect(() => {
    let current = true;
    fileOf(layer.url).then(
      (file) => {
        if (current) {
          setCog(file);
        }
      },
      () => {
        if (current) {
          setCog("failed");
        }
      },
    );
    return () => {
      current = false;
    };
  }, [layer.url]);

  const file = [addressRow(layer.url, "The file is a Cloud Optimized GeoTIFF."), keptRow(layer.url, servers)];
  const groups: PropertyGroup[] = [
    { title: "Layer", rows: layerRows(layer) },
    ...(typeof cog === "string" ? [] : [{ title: "Projection and grid", rows: gridRows(cog) }]),
    { title: "File", rows: typeof cog === "string" ? file : [...file, ...fileRows(cog, formatUnit(layer.unit))] },
    { title: "Record", rows: [addressRow(layer.record, "The record is a STAC Item, which describes the layer.")] },
  ];

  return (
    <>
      {typeof cog === "string" ? (
        <div className="properties-notice">
          {cog === "reading" ? (
            <Notice kind="info">Reading the file of the layer.</Notice>
          ) : (
            <Notice kind="error">
              The file of the layer could not be read. Its projection, its grid and its values are not shown.
            </Notice>
          )}
        </div>
      ) : null}
      <PropertyList groups={groups} />
    </>
  );
}

/**
 * The Properties window of a layer: what the layer is, where it comes from, and the projection and the grid of
 * its file, with the addresses of the file and of its record, which can be copied. The command Properties of the
 * menu of a layer opens it.
 */
export function PropertiesWindow() {
  const shown = useStore(propertiesStore);
  const layer = useStore(mapLayersStore).find(({ id }) => id === shown?.id);
  return (
    <Dialog
      title={layer ? `Properties of ${layer.title}` : "Properties"}
      open={shown !== null && layer !== undefined}
      onClose={() => propertiesStore.set(null)}
      large
    >
      {shown && layer ? <PropertiesOf key={`${shown.id} ${String(shown.time)}`} layer={layer} /> : null}
    </Dialog>
  );
}
