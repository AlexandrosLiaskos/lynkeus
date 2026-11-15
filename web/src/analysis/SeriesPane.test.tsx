import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test } from "vitest";
import { resetSeries, SERIES_PANE, seriesStore, showSeries } from "../data/series";
import { pairSeries, series, seriesItem } from "../data/testSeries";
import { dockStore, resetDock } from "../shared/dock/dock";
import { panesStore, resetPanes } from "../shared/panes";
import { FIRST_WIDTH, FRAME, SeriesChart } from "./SeriesChart";
import {
  cellsWords,
  NO_VALUE,
  ofPairs,
  placeWords,
  reductionWords,
  SERIES_INFO,
  SeriesPane,
  SeriesView,
  tableRows,
  valueWords,
} from "./SeriesPane";

beforeEach(() => {
  resetDock();
  resetPanes();
  resetSeries();
});

afterEach(() => {
  resetSeries();
});

/** The texts of the cells of the rows of the body of a table. */
function rowsOf(table: HTMLElement): (string | null)[][] {
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => Array.from(row.children, (cell) => cell.textContent));
}

/** The value of the row of a list of names and values that carries a name. */
function valueOf(name: string): string | null {
  const row = Array.from(document.querySelectorAll(".property-row")).find(
    (candidate) => candidate.querySelector(".property-name > span")?.textContent === name,
  );
  return row?.querySelector(".property-value-text")?.textContent ?? null;
}

test("a value is written with its decimals, a missing one as no value, and a number of cells with its thousands apart", () => {
  expect(valueWords(-4.315111978395169, "dB")).toBe("−4.32");
  expect(valueWords(0.36974722146987915, "1")).toBe("0.370");
  expect(valueWords(null, "dB")).toBe("no value");
  expect(NO_VALUE).toBe("no value");
  expect(cellsWords(14316415)).toBe("14,316,415");
  expect(cellsWords(0)).toBe("0");
});

test("the table of a series gives the date, the value and the number of cells of every entry", () => {
  expect(tableRows(series())).toEqual([
    ["27 Sep 2026", "−4.32", "14,316,415"],
    ["9 Oct 2026", "−4.83", "14,316,411"],
    ["21 Oct 2026", "−4.83", "14,316,413"],
    ["2 Nov 2026", "−4.74", "14,316,416"],
  ]);
  expect(tableRows(pairSeries())).toEqual([
    ["15 Sep 2026 to 27 Sep 2026", "0.370", "1"],
    ["27 Sep 2026 to 9 Oct 2026", "0.322", "1"],
    ["9 Oct 2026 to 21 Oct 2026", "0.648", "1"],
  ]);
  expect([ofPairs(series()), ofPairs(pairSeries())]).toEqual([false, true]);
});

test("the place and the making of the values are stated in words", () => {
  expect(placeWords(series())).toBe("Whole area of the layers");
  expect(placeWords(pairSeries())).toBe("At the point 42.80000° N, 71.00000° W");
  expect(reductionWords(series())).toBe("The mean of the power of the cells, given in decibels");
  expect(reductionWords(series({ reduction: "mean", unit: "1" }))).toBe("The mean of the cells that hold a value");
  expect(reductionWords(pairSeries())).toBe("The value of the cell that holds the point");
  const shape = {
    crs: "EPSG:3857",
    kind: "polygon",
    points: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 0],
    ],
  } as const;
  expect(placeWords(series({ shape }))).toBe("The polygon of 3 corners drawn on the map");
  expect(reductionWords(series({ shape }))).toBe("The mean of the power of the cells inside the area, given in decibels");
  expect(reductionWords(series({ shape, reduction: "mean", unit: "1" }))).toBe(
    "The mean of the cells inside the area that hold a value",
  );
});

test("a series of dates is shown as a chart with the unit on its value axis and a table under it", () => {
  render(<SeriesView series={series()} />);
  expect(screen.getByText("Backscatter HH, mean of the area")).toBeDefined();
  expect(screen.getByText("Radar backscatter gamma0 (dB)")).toBeDefined();
  const chart = screen.getByRole("img", {
    name: "Chart of the series Backscatter HH, mean of the area. The table under the chart gives the same values.",
  });
  expect(chart.getAttribute("width")).toBe(String(FIRST_WIDTH));
  expect(chart.getAttribute("height")).toBe(String(FRAME.height));
  const texts = Array.from(chart.querySelectorAll("text"), (text) => text.textContent);
  expect(texts).toEqual(["dB", "−5.0", "−4.8", "−4.6", "−4.4", "−4.2", "27 Sep", "21 Oct", "2 Nov", "Date (2026)"]);
  expect(chart.querySelectorAll("polyline")).toHaveLength(1);
  expect(chart.querySelector("polyline")?.getAttribute("points")?.split(" ")).toHaveLength(4);
  expect(chart.querySelectorAll("circle")).toHaveLength(4);
  const table = screen.getByRole("table", { name: "Values of the series Backscatter HH, mean of the area" });
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((head) => head.textContent),
  ).toEqual(["Date", "Value (dB)", "Cells"]);
  expect(rowsOf(table)).toEqual(tableRows(series()));
  // The table stands after the chart.
  expect(
    Array.from(document.querySelectorAll(".series .series-chart svg, .series table"), (element) => element.tagName),
  ).toEqual(["svg", "TABLE"]);
  expect(valueOf("Place")).toBe("Whole area of the layers");
  expect(valueOf("Cell")).toBeNull();
  expect(valueOf("Value of a date")).toBe("The mean of the power of the cells, given in decibels");
  expect(valueOf("Layer of the product")).toBe("HHHH");
  expect(valueOf("27 Sep 2026")).toBe(series().inputs[0]);
});

test("a date without a value is not drawn, and the table says no value", () => {
  const sound = series();
  const gap = series({
    entries: sound.entries.map((entry, index) => (index === 1 ? { dates: entry.dates, value: null, cells: 0 } : entry)),
  });
  render(<SeriesView series={gap} />);
  const chart = screen.getByRole("img");
  expect(chart.querySelectorAll("circle")).toHaveLength(3);
  expect(chart.querySelector("polyline")?.getAttribute("points")?.split(" ")).toHaveLength(3);
  expect(rowsOf(screen.getByRole("table"))[1]).toEqual(["9 Oct 2026", "no value", "0"]);
});

test("a series of pairs is drawn as segments from the first to the second date, and its table names the pairs", () => {
  render(<SeriesView series={pairSeries()} />);
  expect(screen.getByText("Interferometric coherence (magnitude) (no unit)")).toBeDefined();
  const chart = screen.getByRole("img");
  const texts = Array.from(chart.querySelectorAll("text"), (text) => text.textContent);
  expect(texts).toEqual([
    "no unit",
    "0.0",
    "0.2",
    "0.4",
    "0.6",
    "0.8",
    "1.0",
    "15 Sep",
    "9 Oct",
    "21 Oct",
    "Date (2026)",
  ]);
  expect(chart.querySelectorAll("polyline")).toHaveLength(0);
  const segments = Array.from(chart.querySelectorAll("line.series-chart-line"));
  expect(segments).toHaveLength(3);
  for (const segment of segments) {
    expect(segment.getAttribute("y1")).toBe(segment.getAttribute("y2"));
    expect(Number(segment.getAttribute("x1"))).toBeLessThan(Number(segment.getAttribute("x2")));
  }
  // The second pair starts on the date on which the first one ends.
  expect(segments[1]?.getAttribute("x1")).toBe(segments[0]?.getAttribute("x2"));
  const table = screen.getByRole("table");
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((head) => head.textContent),
  ).toEqual(["Pair", "Value (no unit)", "Cells"]);
  expect(rowsOf(table)).toEqual(tableRows(pairSeries()));
  expect(valueOf("Place")).toBe("At the point 42.80000° N, 71.00000° W");
  expect(valueOf("Cell")).toBe("Row 852, column 846, with its centre at 42.80004° N, 71.00004° W");
  expect(valueOf("Value of a date")).toBe("The value of the cell that holds the point");
});

test("the chart is drawn alone as an image with a name", () => {
  render(<SeriesChart series={pairSeries()} />);
  expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
    "Chart of the series Coherence HH at p1. The table under the chart gives the same values.",
  );
});

test("the pane Series is a docked pane that shows the series that was chosen", () => {
  seriesStore.set([seriesItem(pairSeries()), seriesItem()]);
  render(<SeriesPane />);
  expect(screen.queryByRole("complementary", { name: "Series" })).toBeNull();
  act(() => showSeries(series().id));
  const pane = screen.getByRole("complementary", { name: "Series" });
  expect(dockStore.get().tools).toContain(SERIES_PANE);
  expect(pane.textContent).toContain(SERIES_INFO);
  expect(within(pane).getByText("Backscatter HH, mean of the area")).toBeDefined();
  expect(within(pane).getByRole("img")).toBeDefined();
  expect(within(pane).getByRole("table")).toBeDefined();
  // The pane runs no tool: it has no run button and no dialog.
  expect(within(pane).queryByRole("button", { name: "Run" })).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(SERIES_INFO).toBe("The values of one series against time, as a chart and as a table.");
});

test("when the series has left the session, the pane says how another one is chosen", async () => {
  showSeries("gone");
  render(<SeriesPane />);
  const pane = screen.getByRole("complementary", { name: "Series" });
  expect(within(pane).getByText("No series to show")).toBeDefined();
  expect(within(pane).getByText("Choose a series under Series in the Catalog pane.")).toBeDefined();
  panesStore.set({ ...panesStore.get(), catalog: { ...panesStore.get().catalog, open: false } });
  await userEvent.click(within(pane).getByRole("button", { name: "Show the Catalog pane" }));
  expect(panesStore.get().catalog.open).toBe(true);
});
