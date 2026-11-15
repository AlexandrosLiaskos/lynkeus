// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
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
