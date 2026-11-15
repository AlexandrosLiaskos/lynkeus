import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { ROW_NAMES, rowOf } from "./methods";
import { METHODS } from "./methodSheets";
import { SHEET_TOOLS, type SheetTool } from "./series";

/** The method sheet of a tool, as the repository holds it. */
function sheet(tool: SheetTool): string {
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

test.each(SHEET_TOOLS)("the title and the rows of %s are those of the section In brief of its sheet", (tool) => {
  const text = sheet(tool);
  expect(METHODS[tool]).toEqual({ title: outlineOf(text).title, rows: inBrief(text) });
});

test.each(SHEET_TOOLS)("the section In brief of %s is the first section of the sheet", (tool) => {
  expect(outlineOf(sheet(tool)).sections[0]).toBe("In brief");
});

test.each(SHEET_TOOLS)("the summary of %s has every row once, in the order of the page Methods", (tool) => {
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

/** A text without the marks of a sheet: a name in code and a link, each as one word. */
function plain(text: string): string {
  return text.replace(/`[^`]+`/g, "code").replace(/\[[^\]]+\]\([^)]+\)/g, "link");
}

test.each(SHEET_TOOLS)("every row of the summary of %s has one to three sentences", (tool) => {
  for (const { name, text } of METHODS[tool].rows) {
    const sentences = plain(text).match(/[.!?](?=\s|$)/g)?.length ?? 0;
    // A formula alone, written as code, ends without a full stop.
    expect(sentences, name).toBeGreaterThanOrEqual(name === "Formula" ? 0 : 1);
    expect(sentences, name).toBeLessThanOrEqual(3);
  }
});

test.each(SHEET_TOOLS)("the row What it shows of %s, which the i of its form shows, is one sentence", (tool) => {
  expect(rowOf(METHODS[tool], "What it shows")).toMatch(/^[A-Z][^.`]*\.$/);
});

test("no summary uses the words corridor or route", () => {
  for (const tool of SHEET_TOOLS) {
    for (const { text } of METHODS[tool].rows) {
      expect(text).not.toMatch(/corridor|route/i);
    }
  }
});

/** The research note of the group Soil moisture and the sheet and the note of Coherence, Change. */
const SOIL_NOTE = readFileSync("../docs/research/analysis-soil-moisture.md", "utf8");
const COHERENCE_NOTE = readFileSync("../docs/research/analysis-coherence-change.md", "utf8");

/** A text with every run of white space as one space. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ");
}

test("the rows Limits of the soil moisture tools carry the share of cells that the products do not recommend", () => {
  // The research note gives the share for the cells of the pilot box that hold a value, and names the bit.
  expect(oneLine(SOIL_NOTE)).toContain(
    "The products mark 97.9 % to 98.6 % of the cells of the pilot box that hold a value as not recommended",
  );
  expect(oneLine(SOIL_NOTE)).toContain("The least significant bit indicates whether the retrieval is recommended");
  for (const tool of ["soil-moisture-state", "soil-moisture-change"] as const) {
    const limits = rowOf(METHODS[tool], "Limits");
    expect(limits).toContain("The products themselves mark most cells as not recommended: 97.9 % to 98.6 %");
    expect(limits).toContain("lowest bit of the layer `retrievalQualityFlag`");
    expect(limits).toContain("maps every cell and does not read that flag");
    expect(limits).toContain("nly provisional products existed for the test area on 15 Nov 2026");
    // The sheet states the collection of the products and the day of the search of the catalogue.
    expect(oneLine(sheet("soil-moisture-state"))).toContain(
      "The products are provisional (collection `NISAR_L3_SME2_PROVISIONAL_V1`); a search of the NASA catalogue for the short name `NISAR_L3_SME2_V1` gave no product for the pilot area on that day",
    );
    expect(oneLine(sheet(tool))).toContain("The tool maps");
  }
});

test("the row Limits of Soil moisture, Change states that two dates are not independent measurements", () => {
  expect(oneLine(sheet("soil-moisture-change"))).toContain("The two dates of a pair are not independent retrievals.");
  expect(oneLine(SOIL_NOTE)).toContain(
    "The soil moisture of a date is therefore not independent of the two dates before it.",
  );
  expect(rowOf(METHODS["soil-moisture-change"], "Limits")).toContain(
    "The product of a date names earlier products of the same track among its inputs, so two dates are not independent measurements.",
  );
  expect(rowOf(METHODS["soil-moisture-state"], "Limits")).not.toContain("independent");
});

test("the row Limits of Coherence, Change carries the order, the spans, the two releases and the comparison", () => {
  const text = oneLine(sheet("coherence-change"));
  const limits = rowOf(METHODS["coherence-change"], "Limits");
  expect(text).toContain("change = coherence_of_the_later_pair - coherence_of_the_earlier_pair");
  expect(limits).toContain("The result is the later pair minus the earlier pair");
  expect(text).toContain("the tool refuses pairs of unequal spans");
  expect(limits).toContain("the two pairs must span the same number of days");
  expect(text).toContain("The tool does not refuse products of different releases.");
  expect(oneLine(COHERENCE_NOTE)).toContain("The tool accepts two products of different releases.");
  expect(limits).toContain(
    "The tool accepts a provisional and a validated product together, and whether their coherence is comparable is not confirmed.",
  );
  expect(text).toContain("The source program computes a subtraction");
  expect(text).toContain(
    "The layer files were written by Lynkeus from the files of NASA Harmony and were not compared with the HDF5 product files.",
  );
  expect(limits).toContain("The comparison was made with a general raster program, on files that Lynkeus wrote.");
});

test("the numbers of the summaries of the three new tools are those of their sheets", () => {
  const change = oneLine(sheet("coherence-change"));
  // The mean change between pairs of 12 days of the pilot area, the lowest and the highest of the three.
  expect(change).toContain("the mean change is -0.013");
  expect(change).toContain("it is 0.200");
  expect(change).toContain("it is -0.242");
  expect(rowOf(METHODS["coherence-change"], "How to read")).toContain("between −0.242 and 0.200");
  for (const tool of ["coherence-change", "soil-moisture-change"] as const) {
    expect(oneLine(sheet(tool))).toContain('GDAL 3.12.2 "Chicoutimi"');
    expect(rowOf(METHODS[tool], "Checked")).toContain("the program `gdal raster calc` of GDAL 3.12.2");
  }
  expect(change).toContain("Five pairs of layers of the pilot area");
  expect(rowOf(METHODS["coherence-change"], "Checked")).toContain("five pairs of coherence layers");
  const state = oneLine(sheet("soil-moisture-state"));
  expect(state).toContain("| `range` | 0.02 to 0.60 |");
  expect(state).toContain("the soil layer from 0 to 5 cm and an accuracy goal of 0.06 m3 m-3");
  expect(rowOf(METHODS["soil-moisture-state"], "Result")).toContain("from 0.02 to 0.60 m3 m-3");
  expect(rowOf(METHODS["soil-moisture-state"], "How to read")).toContain(
    "the soil layer from 0 to 5 cm and an accuracy goal of 0.06 m3 m-3",
  );
  expect(oneLine(sheet("soil-moisture-change"))).toContain(
    "The pairs of 15 Sep to 27 Sep 2026 and of 15 Sep to 9 Oct 2026 gave the same result, in the box and in the whole frame",
  );
  expect(rowOf(METHODS["soil-moisture-change"], "Checked")).toContain(
    "three pairs of dates (15 Sep, 27 Sep and 9 Oct 2026)",
  );
});
