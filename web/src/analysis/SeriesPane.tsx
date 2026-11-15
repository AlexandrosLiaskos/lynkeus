// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { unitWords } from "../data/layers";
import { SERIES_PANE, seriesStore, shownSeriesStore } from "../data/series";
import { formatAngle } from "../map/coordinates";
import { EmptyState } from "../shared/empty/EmptyState";
import { setPaneOpen } from "../shared/panes";
import { PropertyList } from "../shared/properties/PropertyList";
import type { SeriesDescription, SeriesEntry } from "../shared/series";
import { useStore } from "../shared/store";
import { InfoPane } from "../shared/toolpane/InfoPane";
import { shapeWords } from "./analysisArea";
import { daysWords } from "./series";
import { SeriesChart } from "./SeriesChart";

/** What the "i" beside the title of the pane says. */
export const SERIES_INFO = "The values of one series against time, as a chart and as a table.";

/** The words of an entry that has no value. */
export const NO_VALUE = "no value";

const COUNT = new Intl.NumberFormat("en-GB");

/** Write the value of an entry: two decimals for decibels, three for a quantity without unit, or "no value". */
export function valueWords(value: number | null, unit: string): string {
  return value === null ? NO_VALUE : value.toFixed(unit === "1" ? 3 : 2).replace("-", "−");
}

/** Write a number of cells with its thousands apart, as "14,316,415". */
export function cellsWords(cells: number): string {
  return COUNT.format(cells);
}

/** Tell whether the entries of a series are pairs of dates. */
export function ofPairs(series: SeriesDescription): boolean {
  return series.entries.some((entry) => entry.dates.length > 1);
}

/** State the place of a series: its point, the area drawn on the map, or the whole area of its layers. */
export function placeWords(series: SeriesDescription): string {
  if (series.point) {
    return `At the point ${formatAngle(series.point.latitude, "latitude")}, ${formatAngle(series.point.longitude, "longitude")}`;
  }
  return series.shape ? shapeWords(series.shape) : "Whole area of the layers";
}

/** State how the value of a date was made from the cells of its layer. */
export function reductionWords(series: SeriesDescription): string {
  if (series.point) {
    return "The value of the cell that holds the point";
  }
  const cells = series.shape ? "the cells inside the area" : "the cells";
  return series.reduction === "mean-power"
    ? `The mean of the power of ${cells}, given in decibels`
    : `The mean of ${cells} that hold a value`;
}

/** The rows of the table of a series: the date or the pair, the value and the number of cells of each entry. */
export function tableRows(series: SeriesDescription): [string, string, string][] {
  return series.entries.map((entry: SeriesEntry) => [
    daysWords(entry.dates),
    valueWords(entry.value, series.unit),
    cellsWords(entry.cells),
  ]);
}

/**
 * One series: its name, its quantity with the unit, its chart, the table of its entries, which gives the same
 * values as text, and the facts of its description as a list of names and values.
 */
export function SeriesView({ series }: { series: SeriesDescription }) {
  const { cell } = series;
  return (
    <div className="series">
      <p className="item-title">{series.title}</p>
      <p className="item-line">
        {series.quantity} ({unitWords(series.unit)})
      </p>
      <SeriesChart series={series} />
      <table
        className="usa-table usa-table--borderless usa-table--compact series-table"
        aria-label={`Values of the series ${series.title}`}
      >
        <thead>
          <tr>
            <th scope="col">{ofPairs(series) ? "Pair" : "Date"}</th>
            <th scope="col">Value ({unitWords(series.unit)})</th>
            <th scope="col">Cells</th>
          </tr>
        </thead>
        <tbody>
          {tableRows(series).map(([dates, value, cells]) => (
            <tr key={dates}>
              <th scope="row">{dates}</th>
              <td>{value}</td>
              <td>{cells}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <PropertyList
        groups={[
          {
            title: "Series",
            rows: [
              { name: "Place", value: placeWords(series) },
              ...(cell
                ? [
                    {
                      name: "Cell",
                      value: `Row ${String(cell.row)}, column ${String(cell.column)}, with its centre at ${formatAngle(cell.latitude, "latitude")}, ${formatAngle(cell.longitude, "longitude")}`,
                      info: "The cell of the grid of the layers that holds the point. Rows and columns are counted from 0.",
                    },
                  ]
                : []),
              { name: "Value of a date", value: reductionWords(series) },
              { name: "Layer of the product", value: series.layer },
              { name: "Program", value: series.program },
              { name: "Method", value: series.method },
            ],
          },
          {
            title: "Product files",
            rows: series.entries.map((entry, index) => ({
              id: series.inputs[index] ?? String(index),
              name: daysWords(entry.dates),
              value: series.inputs[index] ?? "",
              copy: true,
            })),
          },
        ]}
      />
    </div>
  );
}

/** Bring the Catalog pane to the front of its side. */
function showCatalog(): void {
  setPaneOpen("catalog", true);
}

/**
 * The pane Series, in the stack of the tool panes: the series that was chosen in the Catalog pane or at the end
 * of a job, as a chart with its table. The pane runs no tool, so it has no foot. When the series has left the
 * session, the pane says how another one is chosen.
 */
export function SeriesPane() {
  const shown = useStore(shownSeriesStore);
  const item = useStore(seriesStore).find((listed) => listed.series.id === shown);
  return (
    <InfoPane id={SERIES_PANE} title="Series" info={SERIES_INFO}>
      {item ? (
        <SeriesView series={item.series} />
      ) : (
        <EmptyState
          title="No series to show"
          text="Choose a series under Series in the Catalog pane."
          action={{ label: "Show the Catalog pane", onClick: showCatalog }}
        />
      )}
    </InfoPane>
  );
}
