// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { SHEET_TOOLS } from "./series";

/**
 * The names of the rows of the summary of a method, in the order of the section In brief of a method sheet
 * (`docs/methods/`).
 */
export const ROW_NAMES = [
  "What it shows",
  "Input",
  "Formula",
  "Result",
  "How to read",
  "Limits",
  "Checked",
  "References",
] as const;
export type RowName = (typeof ROW_NAMES)[number];

/** A row of the section In brief of a method sheet: its name and its text, with the marks of the sheet. */
export interface MethodRow {
  name: RowName;
  text: string;
}

/** What the interface holds of the method sheet of a tool: its title and the rows of its section In brief. */
export interface Method {
  title: string;
  rows: readonly MethodRow[];
}

/** Return the text of a row of the summary of a method. */
export function rowOf(method: Method, name: RowName): string {
  return method.rows.find((row) => row.name === name)?.text ?? "";
}

/**
 * The method sheets that the page Methods shows: the sheet of each finished tool, then the sheet of the statistics
 * in an area, which every tool that maps computes when it is run with an area drawn on the map.
 */
export const SHEETS = [...SHEET_TOOLS, "area-statistics"] as const;
export type Sheet = (typeof SHEETS)[number];
