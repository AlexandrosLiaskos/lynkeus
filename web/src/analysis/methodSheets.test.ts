import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { plain } from "./Marked";
import {
  COPIES,
  copiesOf,
  READING,
  READING_SENTENCES,
  readingOf,
  REFERENCE,
  referenceOf,
  summaryOf,
  type Block,
} from "./methods";
import { METHODS } from "./methodSheets";
import { FINISHED_TOOLS, type FinishedTool } from "./tools";

/** A part of a section of a sheet as the file holds it: a block, or a heading of the third level. */
type Part = Block | { kind: "heading"; title: string };

/** A text with every run of white space as one space, because a sentence of a sheet may run over several lines. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The method sheet of a tool, as the repository holds it. */
function sheet(tool: FinishedTool): string {
  return readFileSync(`../docs/methods/${tool}.md`, "utf8");
}

/** The title of a sheet and its sections by their headings. The lines before the first heading are the section "". */
function sectionsOf(text: string): { title: string; sections: Map<string, string[]> } {
  const [first = "", ...lines] = text.split("\n");
  const sections = new Map<string, string[]>([["", []]]);
  let current = "";
  for (const line of lines) {
    const heading = /^## (.+)$/.exec(line)?.[1];
    if (heading === undefined) {
      sections.get(current)?.push(line);
    } else {
      current = heading.trim();
      sections.set(current, []);
    }
  }
  return { title: first.replace(/^# /, "").trim(), sections };
}

const ITEM = /^\d+\. /;

/** The cells of a line of a table. */
function cellsOf(line: string): string[] {
  return line
    .trim()
    .split(/(?<!\\)\|/)
    .slice(1, -1)
    .map((cell) => cell.trim());
}

/** The parts of a section, in their order: paragraphs, formulas, numbered lists, tables and headings. */
function partsOf(lines: readonly string[]): Part[] {
  const parts: Part[] = [];
  let index = 0;
  const line = () => lines[index] ?? "";
  while (index < lines.length) {
    if (line().trim() === "") {
      index += 1;
    } else if (line().startsWith("```")) {
      const code: string[] = [];
      for (index += 1; index < lines.length && !line().startsWith("```"); index += 1) {
        code.push(line());
      }
      index += 1;
      parts.push({ kind: "code", code: code.join("\n") });
    } else if (line().startsWith("### ")) {
      parts.push({ kind: "heading", title: line().slice(4).trim() });
      index += 1;
    } else if (line().startsWith("|")) {
      const rows: string[][] = [];
      for (; index < lines.length && line().startsWith("|"); index += 1) {
        rows.push(cellsOf(line()));
      }
      const [head = [], ...rest] = rows.filter((row) => !row.every((cell) => /^:?-+:?$/.test(cell)));
      parts.push({ kind: "table", head, rows: rest });
    } else if (ITEM.test(line())) {
      const items: string[] = [];
      for (; index < lines.length && (ITEM.test(line()) || line().startsWith("   ")); index += 1) {
        if (ITEM.test(line())) {
          items.push(line().replace(ITEM, ""));
        } else {
          items.push(`${items.pop() ?? ""} ${line().trim()}`);
        }
      }
      parts.push({ kind: "list", items: items.map(oneLine) });
    } else {
      const text: string[] = [];
      for (; index < lines.length && line().trim() !== "" && !/^(\||```|### |\d+\. )/.test(line()); index += 1) {
        text.push(line());
      }
      parts.push({ kind: "text", text: oneLine(text.join(" ")) });
    }
  }
  return parts;
}

/** The blocks of a list of parts, without its headings. */
function blocksOf(parts: readonly Part[]): Block[] {
  return parts.filter((part) => part.kind !== "heading");
}

/** The parts that stand before the first heading of the third level. */
function beforeHeading(parts: readonly Part[]): Part[] {
  const end = parts.findIndex((part) => part.kind === "heading");
  return end < 0 ? [...parts] : parts.slice(0, end);
}

/** The rows of the table Comparison that the page Methods shows. */
const COMPARISON_ROWS = [
  "Source program",
  "Version",
  "Licence",
  "Comparison",
  "Largest difference",
  "Largest difference of the legend",
  "Not reached",
];

/** The words with which a sheet starts its statement on the mask of the product. */
const MASK_START = "The tool does not read";

/** What the interface must hold of a sheet, read from the file of the sheet. */
function expected(tool: FinishedTool) {
  const { title, sections } = sectionsOf(sheet(tool));
  const named = (start: string) => [...sections.keys()].find((name) => name.startsWith(start)) ?? "";
  const parts = (name: string) => partsOf(sections.get(name) ?? []);
  const input = named("Input layer");
  const comparison = named("Comparison with the source program");
  const [summary] = parts("");
  const [legend] = parts("Legend");
  const [compared] = parts(comparison);
  const maskText = parts(input).find((part) => part.kind === "text" && part.text.includes(MASK_START));
  return {
    title,
    summary: summary?.kind === "table" ? summary.rows : [],
    sections: [
      { title: REFERENCE, blocks: blocksOf(parts(REFERENCE)) },
      { title: input, blocks: blocksOf(beforeHeading(parts(input))) },
      { title: "Formula", blocks: blocksOf(parts("Formula")) },
      { title: "Unit", blocks: blocksOf(parts("Unit")) },
      { title: COPIES, blocks: blocksOf(parts(COPIES)) },
      { title: "Legend", blocks: legend ? blocksOf([legend]) : [] },
      { title: READING, blocks: blocksOf(parts(READING)) },
      {
        title: comparison,
        blocks:
          compared?.kind === "table"
            ? [{ ...compared, rows: compared.rows.filter(([name = ""]) => COMPARISON_ROWS.includes(name)) }]
            : [],
      },
    ],
    mask: maskText?.kind === "text" ? maskText.text.slice(maskText.text.indexOf(MASK_START)) : "",
  };
}

test.each(FINISHED_TOOLS)("the texts of %s are the texts of its method sheet", (tool) => {
  expect(METHODS[tool]).toEqual(expected(tool));
});

test.each(FINISHED_TOOLS)("the sheet of %s holds every part that the interface shows", (tool) => {
  const method = METHODS[tool];
  expect(method.title).not.toBe("");
  expect(method.summary.map(([name]) => name)).toEqual(["Tool", "NISAR product", "Result", "State"]);
  expect(method.summary.every(([, value = ""]) => value !== "")).toBe(true);
  for (const { title, blocks } of method.sections) {
    expect(title).not.toBe("");
    expect(blocks.length).toBeGreaterThan(0);
  }
  const comparison = method.sections.find(({ title }) => title.startsWith("Comparison with the source program"));
  const [table] = comparison?.blocks ?? [];
  const rows = table?.kind === "table" ? table.rows.map(([name]) => name) : [];
  expect(rows).toContain("Source program");
  expect(rows).toContain("Largest difference");
  expect(method.mask.startsWith(MASK_START)).toBe(true);
});

test.each(FINISHED_TOOLS)("the table under the title of the sheet of %s names the tool by its button", (tool) => {
  expect(summaryOf(METHODS[tool], "Tool").startsWith(`\`${tool}\` `)).toBe(true);
  expect(summaryOf(METHODS[tool], "Result")).not.toBe("");
});

test.each(FINISHED_TOOLS)("the form of %s shows the first reference of the sheet", (tool) => {
  const { sections } = sectionsOf(sheet(tool));
  const [list] = partsOf(sections.get(REFERENCE) ?? []);
  expect(list?.kind === "list" ? list.items[0] : undefined).toBe(referenceOf(METHODS[tool]));
  expect(referenceOf(METHODS[tool])).not.toBe("");
});

test.each(FINISHED_TOOLS)("the form of %s shows what the sheet tells the reader about the reduced copies", (tool) => {
  const { sections } = sectionsOf(sheet(tool));
  const texts = partsOf(sections.get(COPIES) ?? []).flatMap((part) => (part.kind === "text" ? [part.text] : []));
  expect(texts.length).toBeGreaterThan(1);
  expect(copiesOf(METHODS[tool])).toBe(texts.at(-1));
  expect(copiesOf(METHODS[tool]).startsWith("For the reader: ")).toBe(true);
});

test.each(FINISHED_TOOLS)("the sections of %s stand in the order of the sheet", (tool) => {
  expect(METHODS[tool].sections.map(({ title }) => title.replace(/ \(D-17\)$/, "").replace(/s$/, ""))).toEqual([
    "Reference",
    "Input layer",
    "Formula",
    "Unit",
    "Reduced copies of the result",
    "Legend",
    "How to read the result",
    "Comparison with the source program",
  ]);
});

test.each(FINISHED_TOOLS)(
  "the form of %s shows the first three sentences of the sheet on how to read the result",
  (tool) => {
    const { sections } = sectionsOf(sheet(tool));
    const [paragraph] = partsOf(sections.get(READING) ?? []);
    const text = paragraph?.kind === "text" ? paragraph.text : "";
    const shown = readingOf(METHODS[tool]);
    expect(shown).not.toBe("");
    expect(text.startsWith(shown)).toBe(true);
    expect(shown.endsWith(".")).toBe(true);
    expect(shown.split(/(?<=\.)\s+(?=[A-Z])/)).toHaveLength(READING_SENTENCES);
    // The words of the sentences stand in the sheet, one after the other, when its marks are taken away.
    expect(oneLine(plain(sheet(tool)))).toContain(plain(shown));
  },
);
