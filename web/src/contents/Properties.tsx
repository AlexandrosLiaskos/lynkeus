import { useEffect, useState } from "react";
import { Dialog } from "../shared/dialog/Dialog";
import type { LayerDescription } from "../shared/layer";
import { mapLayersStore } from "../shared/mapLayers";
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

/** Return the unit of the coordinates of a projection, in words. */
function unitOf(code: string): string {
  const units = projectionOf(code)?.getUnits();
  return units === "m" ? "metres" : units === "degrees" ? "degrees" : "units of the projection";
}

/** The properties that the file of a layer states: its projection, its grid and its values. */
function FileProperties({ cog }: { cog: Cog }) {
  const full = cog.levels.at(-1);
  const unit = unitOf(cog.projection);
  const [west, south, east, north] = cog.extent;
  return (
    <>
      <dt>Projection</dt>
      <dd>{cog.projection}</dd>
      {full ? (
        <>
          <dt>Grid</dt>
          <dd>
            {full.size[0]} columns by {full.size[1]} rows, cells of {gridNumber(full.cell[0])} by{" "}
            {gridNumber(full.cell[1])} {unit}
          </dd>
        </>
      ) : null}
      <dt>Extent (west, south, east, north, in {unit})</dt>
      <dd>{[west, south, east, north].map(gridNumber).join(", ")}</dd>
      <dt>Reduced copies in the file</dt>
      <dd>
        {cog.levels.length > 1
          ? cog.levels
              .slice(0, -1)
              .reverse()
              .map(({ size }) => `${String(size[0])} by ${String(size[1])} cells`)
              .join("; ")
          : "None"}
      </dd>
      <dt>Value of a cell without data</dt>
      <dd>{cog.noData === null ? "The file names none" : String(cog.noData)}</dd>
      <dt>Statistics that the file states</dt>
      <dd>
        {cog.statistics
          ? `Lowest value ${formatNumber(cog.statistics.minimum)}, highest value ${formatNumber(cog.statistics.maximum)}, mean ${formatNumber(cog.statistics.mean)}, standard deviation ${formatNumber(cog.statistics.deviation)}`
          : "None"}
      </dd>
    </>
  );
}

/** The properties of one layer. The file of the layer is read for its projection and its grid. */
function PropertiesOf({ layer }: { layer: LayerDescription }) {
  const [cog, setCog] = useState<Cog | "reading" | "failed">("reading");
  const unit = formatUnit(layer.unit);

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

  return (
    <dl className="properties">
      <dt>Name</dt>
      <dd>{layer.title}</dd>
      <dt>Kind</dt>
      <dd>{layer.kind === "layer" ? "Layer of a NISAR product" : "Result of an analysis tool"}</dd>
      <dt>Quantity</dt>
      <dd>{layer.quantity}</dd>
      <dt>Unit</dt>
      <dd>{unit === "" ? "None (a quantity without dimension)" : unit}</dd>
      <dt>{layer.dates.length === 1 ? "Date" : "Dates"}</dt>
      <dd>{formatDates(layer.dates)}</dd>
      <dt>{layer.inputs.length === 1 ? "Product file" : "Product files"}</dt>
      {layer.inputs.map((input) => (
        <dd key={input}>{input}</dd>
      ))}
      <dt>Program</dt>
      <dd>{layer.program}</dd>
      {layer.method === null ? null : (
        <>
          <dt>Method</dt>
          <dd>{layer.method}</dd>
        </>
      )}
      {typeof cog === "string" ? (
        <>
          <dt>Projection and grid</dt>
          <dd>{cog === "reading" ? "Reading the file of the layer." : "The file of the layer could not be read."}</dd>
        </>
      ) : (
        <FileProperties cog={cog} />
      )}
      <dt>File (Cloud Optimized GeoTIFF)</dt>
      <dd>
        <a href={layer.url}>{layer.url}</a>
      </dd>
      <dt>Record (STAC Item)</dt>
      <dd>
        <a href={layer.record}>{layer.record}</a>
      </dd>
    </dl>
  );
}

/**
 * The Properties window of a layer: what the layer is, where it comes from, and the projection and the grid of
 * its file, with the addresses of the file and of its record. The command Properties of the menu of a layer
 * opens it.
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
