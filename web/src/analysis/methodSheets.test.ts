import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { ROW_NAMES, rowOf } from "./methods";
import { METHODS } from "./methodSheets";
import { FINISHED_TOOLS, type FinishedTool } from "./tools";

/** The method sheet of a tool, as the repository holds it. */
function sheet(tool: FinishedTool): string {
  return readFileSync(`../docs/methods/${tool}.md`, "utf8");
}

/** The title of a sheet and the names of its sections of the second level, in their order. */
function outlineOf(text: string): { title: string; sections: string[] } {
  const [first = ""] = text.split("\n");
  return {
    title: first.replace(/^# /, "").trim(),
    sections: Array.from(text.matchAll(/^## (.+)$/gm), ([, name = ""]) => name.trim()),
  };
}

/**
 * The cells of a line of a table. A vertical bar inside a cell is written with a backslash before it in the
 * sheet, and the cell is returned without that backslash.
 */
function cellsOf(line: string): string[] {
  return line
    .trim()
    .split(/(?<!\\)\|/)
    .slice(1, -1)
    .map((cell) => cell.trim().replaceAll("\\|", "|"));
}

/** The rows of the table of the section In brief of a sheet, without the head of the table and its rule. */
function inBrief(text: string): { name: string; text: string }[] {
  const [, section = ""] = /^## In brief\n([\s\S]*?)(?=^## )/m.exec(text) ?? [];
  return section
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map(cellsOf)
    .slice(2)
    .map(([name = "", cell = ""]) => ({ name, text: cell }));
}

test.each(FINISHED_TOOLS)("the title and the rows of %s are those of the section In brief of its sheet", (tool) => {
  const text = sheet(tool);
  expect(METHODS[tool]).toEqual({ title: outlineOf(text).title, rows: inBrief(text) });
});

test.each(FINISHED_TOOLS)("the section In brief of %s is the first section of the sheet", (tool) => {
  expect(outlineOf(sheet(tool)).sections[0]).toBe("In brief");
});

test.each(FINISHED_TOOLS)("the summary of %s has every row once, in the order of the page Methods", (tool) => {
  const method = METHODS[tool];
  expect(method.title).not.toBe("");
  expect(method.rows.map(({ name }) => name)).toEqual([...ROW_NAMES]);
  for (const name of ROW_NAMES) {
    expect(rowOf(method, name)).not.toBe("");
  }
});

test("the formula of the coherence keeps its vertical bars", () => {
  expect(rowOf(METHODS["coherence-state"], "Formula")).toBe(
    "The layer of the product, unchanged. The mission computes it as `|<s1 * conj(s2)>| / sqrt(<|s1|^2> * <|s2|^2>)`.",
  );
  expect(sheet("coherence-state")).toContain("`\\|<s1 * conj(s2)>\\| / sqrt(<\\|s1\\|^2> * <\\|s2\\|^2>)`");
});
