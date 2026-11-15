import { firstSentences } from "./Marked";

/** A part of a section of a method sheet: a paragraph, a formula, a numbered list or a table. */
export type Block =
  | { kind: "text"; text: string }
  | { kind: "code"; code: string }
  | { kind: "list"; items: readonly string[] }
  | { kind: "table"; head: readonly string[]; rows: readonly (readonly string[])[] };

/** A section of a method sheet, under its heading. */
export interface MethodSection {
  title: string;
  blocks: readonly Block[];
}

/** What the interface shows of the method sheet of a tool. The texts carry the marks of the sheet (see `Marked`). */
export interface Method {
  /** The title of the sheet, which is the name of the tool. */
  title: string;
  /** The rows of the table under the title: the tool, the NISAR product, the result and the state of the sheet. */
  summary: readonly (readonly string[])[];
  /** The sections of the sheet that the page Methods shows, in the order of the sheet. */
  sections: readonly MethodSection[];
  /** What the sheet states about the mask of the product. */
  mask: string;
}

/** The headings of the sections that the form of a tool reads. */
export const REFERENCE = "Reference";
export const READING = "How to read the result";
export const COPIES = "Reduced copies of the result";

/** The number of sentences on the reading of the result that the form of a tool shows. */
export const READING_SENTENCES = 3;

/** The names of the rows of the table under the title of a sheet. */
export type SummaryRow = "Tool" | "NISAR product" | "Result" | "State";

/** Return the value of a row of the table under the title of a sheet, or an empty text when the sheet has no such row. */
export function summaryOf(method: Method, row: SummaryRow): string {
  return method.summary.find(([name]) => name === row)?.[1] ?? "";
}

/** Return the section of a sheet under a heading, or undefined. */
function sectionOf(method: Method, title: string): MethodSection | undefined {
  return method.sections.find((section) => section.title === title);
}

/** Return the first reference of a sheet, which is the reference of its method, or an empty text. */
export function referenceOf(method: Method): string {
  for (const block of sectionOf(method, REFERENCE)?.blocks ?? []) {
    if (block.kind === "list") {
      return block.items[0] ?? "";
    }
  }
  return "";
}

/**
 * Return what a sheet tells the reader of the map about the reduced copies of the result: the last paragraph of
 * its section Reduced copies of the result, or an empty text.
 */
export function copiesOf(method: Method): string {
  const texts = (sectionOf(method, COPIES)?.blocks ?? []).flatMap((block) =>
    block.kind === "text" ? [block.text] : [],
  );
  return texts.at(-1) ?? "";
}

/** Return the first three sentences of the section How to read the result of a sheet, or an empty text. */
export function readingOf(method: Method): string {
  for (const block of sectionOf(method, READING)?.blocks ?? []) {
    if (block.kind === "text") {
      return firstSentences(block.text, READING_SENTENCES);
    }
  }
  return "";
}
