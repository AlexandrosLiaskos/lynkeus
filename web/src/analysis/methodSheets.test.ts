// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { COLOUR_TABLES } from "../contents/colourTables";
import { ROW_NAMES, rowOf, SHEETS, type Sheet } from "./methods";
import { METHODS } from "./methodSheets";

/** The method sheet of a tool, or of the statistics in an area, as the repository holds it. */
function sheet(tool: Sheet): string {
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

test.each(SHEETS)("the title and the rows of %s are those of the section In brief of its sheet", (tool) => {
  const text = sheet(tool);
  expect(METHODS[tool]).toEqual({ title: outlineOf(text).title, rows: inBrief(text) });
});

test.each(SHEETS)("the section In brief of %s is the first section of the sheet", (tool) => {
  expect(outlineOf(sheet(tool)).sections[0]).toBe("In brief");
});

test.each(SHEETS)("the summary of %s has every row once, in the order of the page Methods", (tool) => {
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

test.each(SHEETS)("every row of the summary of %s has one to three sentences", (tool) => {
  for (const { name, text } of METHODS[tool].rows) {
    const sentences = plain(text).match(/[.!?](?=\s|$)/g)?.length ?? 0;
    // A formula alone, written as code, ends without a full stop.
    expect(sentences, name).toBeGreaterThanOrEqual(name === "Formula" ? 0 : 1);
    expect(sentences, name).toBeLessThanOrEqual(3);
  }
});

test.each(SHEETS)("the row What it shows of %s, which the i of its form shows, is one sentence", (tool) => {
  expect(rowOf(METHODS[tool], "What it shows")).toMatch(/^[A-Z][^.`]*\.$/);
});

test("no summary uses the words corridor or route", () => {
  for (const tool of SHEETS) {
    for (const { text } of METHODS[tool].rows) {
      expect(text).not.toMatch(/corridor|route/i);
    }
  }
});

test("the summary of the displacement says what a user must know before reading the map", () => {
  const method = METHODS["displacement-state"];
  expect(rowOf(method, "What it shows")).toBe(
    "The movement of the ground toward or away from the radar along its viewing direction between the two dates of one pair, relative to an unknown level, so only differences inside one map carry meaning.",
  );
  expect(rowOf(method, "How to read")).toContain("The value of one cell alone is not a measurement");
  expect(rowOf(method, "Limits")).toContain("not corrected for the atmosphere");
  expect(rowOf(method, "Limits")).toContain("the test area has no ground movement known to compare with");
  expect(rowOf(method, "Limits")).toContain(
    "The sign was derived from the software of the mission and was not checked on ground with a known movement.",
  );
  expect(rowOf(method, "Limits")).toContain("Cells where the unwrapping is unreliable are left empty.");
  expect(rowOf(method, "Result")).toContain("positive toward the radar");
  expect(rowOf(method, "Checked")).toContain("No ground with a known movement was compared.");
});

test("the spans of the two test pairs in the row Limits are those of the records of the comparison", () => {
  // The legend of a result runs from its 2nd to its 98th percentile, so it spans 96 % of the cells with a value.
  const record = JSON.parse(
    readFileSync("../docs/research/records/analysis/displacement/refit_lynkeus_side.json", "utf8"),
  ) as { pairs: Record<string, { legend: [string, string] }> };
  const spans = ["20261009-20261021", "20260927-20261009"].map((pair) => {
    const [lowest, highest] = record.pairs[pair]?.legend ?? ["", ""];
    return (Number(highest) - Number(lowest)).toFixed(2);
  });
  expect(spans).toEqual(["0.10", "0.09"]);
  expect(rowOf(METHODS["displacement-state"], "Limits")).toContain(
    `96 % of the cells of the two test pairs span ${spans[0] ?? ""} m and ${spans[1] ?? ""} m`,
  );
  const writing = readFileSync("../api/src/lynkeus/writing.py", "utf8");
  expect(writing).toMatch(/^LOWEST_PERCENT = 2(\.0)?$/m);
  expect(writing).toMatch(/^HIGHEST_PERCENT = 98(\.0)?$/m);
  expect(sheet("displacement-state")).toContain("the pilot area has no known\n   movement");
});

test("the legend of the displacement runs from red at its lowest value to blue at its highest", () => {
  expect(rowOf(METHODS["displacement-state"], "Result")).toContain(
    "from red (away from the radar) to blue (toward the radar)",
  );
  // The colour scale RdBu of the interface, as hexadecimal colours from the lowest value to the highest.
  expect(COLOUR_TABLES.RdBu?.slice(0, 6)).toBe("67001f");
  expect(COLOUR_TABLES.RdBu?.slice(-6)).toBe("053061");
  const server = readFileSync("../api/src/lynkeus/analysis/displacement.py", "utf8");
  expect(server).toContain('        "RdBu",\n');
  expect(server).toContain('        ("away from the radar", "toward the radar"),\n');
});

test("the summary of the displacement names the comparison as its sheet does", () => {
  const text = sheet("displacement-state");
  expect(rowOf(METHODS["displacement-state"], "Checked")).toContain("`scale_data2disp_unit` of MintPy 1.6.4");
  expect(text).toContain("MintPy 1.6.4, the package of the Python Package Index");
  expect(text).toContain("`mintpy.utils.plot.scale_data2disp_unit`");
  expect(text).toContain("One area, two pairs, the channel HH and the range bandwidth of 40 MHz were compared");
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
    "The products mark 97.9 % to 98.7 % of the cells of the pilot box that hold a value as not recommended",
  );
  expect(oneLine(SOIL_NOTE)).toContain("The least significant bit indicates whether the retrieval is recommended");
  for (const tool of ["soil-moisture-state", "soil-moisture-change"] as const) {
    expect(rowOf(METHODS[tool], "Limits")).toContain("97.9 % to 98.7 % of the cells with a");
    expect(rowOf(METHODS[tool], "Input")).toContain("with the layer `retrievalQualityFlag` of");
  }
  for (const tool of ["soil-moisture-state", "soil-moisture-change"] as const) {
    const limits = rowOf(METHODS[tool], "Limits");
    expect(limits).toContain("The products themselves mark most cells as not recommended: 97.9 % to 98.7 %");
    expect(limits).toContain("lowest bit of the layer `retrievalQualityFlag`");
    expect(limits).toContain("so the tool leaves most of that area empty");
    expect(rowOf(METHODS[tool], "Result").toLowerCase()).toContain("the result states how many cells were left out");
    expect(oneLine(sheet(tool))).toContain("are left out because NISAR marks their retrieval as not recommended");
  }
  expect(rowOf(METHODS["soil-moisture-state"], "Limits")).toContain(
    "nly provisional and beta products existed for the test area on 15 Nov 2026",
  );
  // The sheet states the collections of the products and the day of the search of the catalogue.
  expect(oneLine(sheet("soil-moisture-state"))).toContain(
    "The products are provisional (collection `NISAR_L3_SME2_PROVISIONAL_V1`) and beta (collection `NISAR_L3_SME2_BETA_V1`); a search of the NASA catalogue for the short name `NISAR_L3_SME2_V1` gave no product for the pilot area on that day",
  );
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
  expect(rowOf(METHODS["coherence-change"], "How to read")).toContain("between −0.242 and 0.200 (20 m layers)");
  for (const tool of ["coherence-change", "soil-moisture-state", "soil-moisture-change"] as const) {
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
  expect(rowOf(METHODS["soil-moisture-state"], "Checked")).toContain("on nine dates of the test area");
  expect(rowOf(METHODS["soil-moisture-change"], "Checked")).toContain("for ten pairs of dates of the test area");
});
