// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { displacementSeries, pairSeries, series } from "../data/testSeries";
import { isCell, isPoint, isReference, isSeriesDescription, isSeriesEntry, REDUCTIONS } from "./series";

/** The formats of the server, as the repository holds them. */
const SERVER = readFileSync("../api/src/lynkeus/layers.py", "utf8");

test("a series of an area and a series of pairs at a point, as the server returned them, are accepted", () => {
  expect(isSeriesDescription(series())).toBe(true);
  expect(isSeriesDescription(pairSeries())).toBe(true);
  // The server sends null for a field without a value; a missing field is read in the same way.
  const { range, point, cell, reference, ...rest } = series();
  expect([range, point, cell, reference]).toEqual([null, null, null, null]);
  expect(isSeriesDescription(rest)).toBe(true);
});

test("a series relative to a reference point, as the server returned it, is accepted, and one without its point is not", () => {
  const relative = displacementSeries();
  expect(isSeriesDescription(relative)).toBe(true);
  expect(relative.inputs.length).toBe(relative.entries.length - 1);
  expect(isReference(relative.reference)).toBe(true);
  for (const wrong of [
    { ...relative, point: null, cell: null },
    { ...relative, inputs: relative.inputs.slice(1) },
    { ...relative, reference: { point: relative.point } },
    { ...relative, reference: { point: relative.point, cell: { row: -1, column: 0, longitude: 0, latitude: 0 } } },
  ]) {
    expect(isSeriesDescription(wrong), JSON.stringify(wrong)).toBe(false);
  }
  // A series that is not relative to a reference point keeps one product file for each entry.
  expect(isSeriesDescription({ ...pairSeries(), inputs: pairSeries().inputs.slice(1) })).toBe(false);
});

test("the fields of a series are those of the format of the server, line for line", () => {
  for (const line of [
    'type Reduction = Literal["mean", "mean-power"]',
    "    longitude: float = Field(ge=-180, le=180)",
    "    latitude: float = Field(ge=-90, le=90)",
    "    row: int = Field(ge=0)",
    "    column: int = Field(ge=0)",
    "    dates: tuple[date, ...] = Field(min_length=1)",
    "    value: float | None",
    "    cells: int = Field(ge=0)",
    '    id: str = Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")',
    '    kind: Literal["series"]',
    "    reduction: Reduction",
    "    range: tuple[float, float] | None = None",
    "    point: Point | None = None",
    "    cell: Cell | None = None",
    "    reference: Reference | None = None",
    "    area: Area",
    "    entries: tuple[SeriesEntry, ...] = Field(min_length=1)",
    "    inputs: tuple[Text, ...] = Field(min_length=1)",
    "    layer: Text",
    "    program: Text",
    "    method: Text",
    'raise ValueError("an entry has a value when, and only when, it was made from at least one cell")',
    'raise ValueError("a series at a point has its point and its cell, and a series of an area has neither")',
    'raise ValueError("a series has one product file for each of its entries")',
    'raise ValueError("a series relative to a reference point is a series at a point")',
    'raise ValueError("a series relative to a reference point has a pair for each date after the first")',
    'raise ValueError("the entries of a series have different dates, the earliest first")',
    'raise ValueError("the lowest value of the range must be smaller than the highest")',
  ]) {
    expect(SERVER).toContain(line);
  }
  expect([...REDUCTIONS]).toEqual(["mean", "mean-power"]);
  // Every field of the interface is a field of the format of the server, and the other way round.
  const [, format = ""] = /^class SeriesDescription\(Format\):\n([\s\S]*?)^class /m.exec(SERVER) ?? [];
  const fields = Array.from(format.matchAll(/^ {4}([a-z]+): /gm), ([, name = ""]) => name);
  expect(fields).toEqual(Object.keys(series()));
});

test("a value that is not a series description is refused", () => {
  const sound = series();
  const wrong: unknown[] = [
    null,
    "series",
    { ...sound, id: "Series 1" },
    { ...sound, kind: "layer" },
    { ...sound, title: " " },
    { ...sound, unit: "" },
    { ...sound, reduction: "median" },
    { ...sound, range: [1, 0] },
    { ...sound, range: [0] },
    { ...sound, area: { west: 0 } },
    { ...sound, entries: [] },
    { ...sound, inputs: sound.inputs.slice(1) },
    { ...sound, inputs: [...sound.inputs.slice(1), ""] },
    { ...sound, entries: [...sound.entries].reverse() },
    { ...sound, entries: [sound.entries[0], sound.entries[0], sound.entries[2], sound.entries[3]] },
    { ...sound, point: { longitude: -71, latitude: 42.8 } },
    { ...sound, cell: pairSeries().cell },
    { ...pairSeries(), point: { longitude: 181, latitude: 42.8 } },
    { ...pairSeries(), cell: { row: -1, column: 0, longitude: -71, latitude: 42.8 } },
  ];
  for (const value of wrong) {
    expect(isSeriesDescription(value), JSON.stringify(value)).toBe(false);
  }
});

test("an entry has a value when, and only when, it has cells", () => {
  expect(isSeriesEntry({ dates: ["2026-10-21"], value: -9.5, cells: 1 })).toBe(true);
  expect(isSeriesEntry({ dates: ["2026-10-21"], value: null, cells: 0 })).toBe(true);
  expect(isSeriesEntry({ dates: ["2026-10-09", "2026-10-21"], value: 0.5, cells: 12 })).toBe(true);
  for (const wrong of [
    { dates: ["2026-10-21"], value: null, cells: 1 },
    { dates: ["2026-10-21"], value: -9.5, cells: 0 },
    { dates: ["2026-10-21"], value: -9.5, cells: 1.5 },
    { dates: ["2026-10-21"], value: "-9.5", cells: 1 },
    { dates: ["21 Oct 2026"], value: -9.5, cells: 1 },
    { dates: [], value: -9.5, cells: 1 },
    { dates: ["2026-10-21"], cells: 1 },
  ]) {
    expect(isSeriesEntry(wrong), JSON.stringify(wrong)).toBe(false);
  }
});

test("a point lies on the Earth, and a cell has a row and a column counted from 0", () => {
  expect(isPoint({ longitude: -180, latitude: 90 })).toBe(true);
  expect(isPoint({ longitude: -180.1, latitude: 0 })).toBe(false);
  expect(isPoint({ longitude: 0, latitude: 90.1 })).toBe(false);
  expect(isPoint({ longitude: 0 })).toBe(false);
  expect(isPoint([0, 0])).toBe(false);
  expect(isCell({ row: 0, column: 0, longitude: 0, latitude: 0 })).toBe(true);
  expect(isCell({ row: 1.5, column: 0, longitude: 0, latitude: 0 })).toBe(false);
  expect(isCell({ column: 0, longitude: 0, latitude: 0 })).toBe(false);
});

test("a series of an area drawn on the map carries the area, and a series at a point carries none", () => {
  const shape = {
    crs: "EPSG:3857",
    kind: "rectangle",
    points: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  } as const;
  expect(isSeriesDescription(series({ shape }))).toBe(true);
  expect(isSeriesDescription(pairSeries({ shape }))).toBe(false);
  expect(isSeriesDescription(series({ shape: { ...shape, points: shape.points.slice(0, 3) } }))).toBe(false);
  expect(SERVER).toContain(
    'raise ValueError("a series is made at a point or for an area drawn on the map, not for both")',
  );
});
