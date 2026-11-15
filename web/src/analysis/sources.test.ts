// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { sourceFaults } from "../help/sources";
import { SOURCES } from "./sources";
import { SHEET_TOOLS } from "./series";

/**
 * The texts of the method sheets of the finished tools and of the research notes of the part, as the repository
 * holds them. The first note holds the tools of level 1; the tools Coherence, Change and Soil moisture, One date
 * and Change have their own notes, and so have the two Series tools.
 */
const SHEETS = SHEET_TOOLS.map((tool) => readFileSync(`../docs/methods/${tool}.md`, "utf8")).join("\n");
const NOTE = readFileSync("../docs/research/analysis.md", "utf8");
const COHERENCE_CHANGE_NOTE = readFileSync("../docs/research/analysis-coherence-change.md", "utf8");
const SOIL_MOISTURE_NOTE = readFileSync("../docs/research/analysis-soil-moisture.md", "utf8");
const SERIES_NOTE = readFileSync("../docs/research/analysis-series.md", "utf8");
const NOTES = [NOTE, COHERENCE_CHANGE_NOTE, SOIL_MOISTURE_NOTE, SERIES_NOTE].join("\n");

/** A text with every run of white space as one space. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ");
}

function source(start: string) {
  const found = SOURCES.find(({ name }) => name.startsWith(start));
  if (!found) {
    throw new Error(`The list holds no source whose name starts with ${start}.`);
  }
  return found;
}

test("every source of the Analysis part has a name, a licence, a use and an address of the web", () => {
  expect(SOURCES.length).toBeGreaterThan(0);
  expect(sourceFaults([{ name: "Analysis", sources: SOURCES }])).toEqual([]);
});

test("the specifications carry the revision, the version and the date that the method sheets cite", () => {
  const sheets = oneLine(SHEETS);
  expect(sheets).toContain("JPL D-102274, Rev F, version 1.5.0, 8 July 2026");
  expect(source("NASA SDS Product Specification, Level-2 Geocoded Polarimetric").version).toBe(
    "Rev F, version 1.5.0, 8 July 2026",
  );
  expect(sheets).toContain("JPL D-102272, Rev E, version 1.2.1, 8 November 2024");
  expect(source("NASA SDS Product Specification, Level-2 Geocoded Unwrapped").version).toBe(
    "Rev E, version 1.2.1, 8 November 2024",
  );
  expect(sheets).toContain("Naming Conventions, JPL D-102255, Rev C, 19 October 2025");
  expect(source("Science Data Systems (SDS) L-SAR Product File Naming Conventions").version).toBe(
    "Rev C, 19 October 2025",
  );
  expect(sheets).toContain("JPL D-107677, Rev C, version 1.0.0, 8 November 2024");
  expect(source("NASA SDS Product Specification, Level-3 Soil Moisture").version).toBe(
    "Rev C, version 1.0.0, 8 November 2024",
  );
  expect(sheets).toContain("JPL D-107679, Release 3.3, 28 April 2023");
  expect(source("NISAR L3 Soil Moisture Data Product, Algorithm Theoretical Basis Document").version).toBe(
    "Release 3.3, 28 April 2023",
  );
  expect(oneLine(SOIL_MOISTURE_NOTE)).toContain(
    "NASA SDS Product Specification, Level-3 Soil Moisture (L3_SME2), JPL D-107677, Rev C, version 1.0.0, 8 November 2024",
  );
  expect(oneLine(SOIL_MOISTURE_NOTE)).toContain(
    "NISAR L3 Soil Moisture Data Product, ATBD, JPL D-107679, Release 3.3, 28 April 2023",
  );
});

test("the source programs carry the versions that the method sheets cite", () => {
  const sheets = oneLine(SHEETS);
  expect(sheets).toContain("Commit `17b69c8` of 3 Nov 2026");
  expect(source("ASF NISAR Cookbook").version).toBe("Commit 17b69c8, 3 November 2026");
  expect(sheets).toContain("NISAR_Cookbook/blob/17b69c87a7320610740be7f2c7e605601cb7fe43/");
  expect(source("Environment of the source program").url).toContain("17b69c87a7320610740be7f2c7e605601cb7fe43");
  expect(sheets).toContain("ISCE3 0.25.21");
  expect(source("ISCE3").version).toBe("0.25.21");
  expect(sheets).toContain("nisarqa commit `a8bc425` of 30 Sep 2026");
  expect(source("nisarqa").version).toBe("Commit a8bc425, 30 September 2026");
  expect(source("NISAR product specification files").url).toContain("a8bc425f5e8873174471d6a12fe622df338623d1");
  expect(sheets).toContain("a8bc425f5e8873174471d6a12fe622df338623d1/src/nisarqa/product_specs/1.6.0/");
  expect(sheets).toContain("numpy 2.5.3, xarray 2026.7.0, dask 2025.12.0, rioxarray 0.22.0 and rasterio 1.4.4");
  expect(source("Environment of the source program").version).toBe("2.5.3, 2026.7.0, 2025.12.0, 0.22.0 and 1.4.4");
  expect(sheets).toContain("Matplotlib 3.11.2");
  expect(source("Matplotlib").version).toBe("3.11.2");
});

test("the source program of the comparisons of the two new change tools is the one that their notes name", () => {
  const sheets = oneLine(SHEETS);
  expect(sheets).toContain('`GDAL 3.12.2 "Chicoutimi", released 2026/02/03`');
  expect(sheets).toContain('GDAL 3.12.2 "Chicoutimi", released 2026/02/03, in the image');
  expect(source("GDAL").version).toBe("3.12.2");
  expect(COHERENCE_CHANGE_NOTE).toContain(
    '| [GDAL](https://github.com/OSGeo/gdal) | 3.12.2 (`GDAL 3.12.2 "Chicoutimi", released 2026/02/03`) | MIT style (`LICENSE.TXT` at the tag v3.12.2) | Source program of the comparison |',
  );
  expect(source("GDAL").url).toBe("https://github.com/OSGeo/gdal");
  expect(source("GDAL").licence).toBe("MIT style licence (file LICENSE.TXT at the tag v3.12.2)");
  expect(SOIL_MOISTURE_NOTE).toContain("| GDAL 3.12.2 | The image `ghcr.io/osgeo/gdal:alpine-small-3.12.2`");
});

test("the sources of Surface displacement, One pair carry the versions that its method sheet cites", () => {
  const sheet = oneLine(readFileSync("../docs/methods/displacement-state.md", "utf8"));
  expect(sheet).toContain("JPL D-95677, Rev A, 12 November 2023");
  expect(source("NISAR L1 and L2 Algorithm Theoretical Basis Document").version).toBe("Rev A, 12 November 2023");
  expect(sheet).toContain(source("NISAR L1 and L2 Algorithm Theoretical Basis Document").url);
  expect(sheet).toContain("MintPy 1.6.4");
  expect(sheet).toContain("GPL-3.0-or-later");
  expect(source("MintPy").version).toBe("1.6.4");
  expect(source("MintPy").licence).toBe("GPL-3.0-or-later");
  expect(sheet).toContain("Revision A, 25 May 2022");
  expect(source("NISAR Solid Earth Team (2022)").version).toBe("Revision A, 25 May 2022");
  expect(sheet).toContain(source("NISAR Solid Earth Team (2022)").url);
  expect(sheet).toContain("ISCE3, the program of the mission, version 0.25.21");
});

test("the sources of Surface displacement, One pair are those that its research note lists", () => {
  const note = readFileSync("../docs/research/analysis-displacement.md", "utf8");
  expect(note).toContain("`NISAR_L2_GUNW_V1` and `NISAR_L2_GUNW_PROVISIONAL_V1`");
  expect(note).toContain("[MintPy](https://github.com/insarlab/MintPy)");
  expect(source("MintPy").url).toBe("https://github.com/insarlab/MintPy");
  expect(note).toContain(source("NISAR L1 and L2 Algorithm Theoretical Basis Document").url);
  expect(note).toContain(source("NISAR Solid Earth Team (2022)").url);
  expect(source("NISAR Provisional Geocoded Unwrapped").use).toContain("Surface displacement, One pair");
  expect(source("NISAR Validated Geocoded Unwrapped").use).toContain("Surface displacement, One pair");
});

test("every article of the list is cited by its address in a method sheet or in the research note", () => {
  // An address of the DOI resolver names an article, or a dataset of NASA under the prefix 10.5067.
  const articles = SOURCES.filter(
    ({ url }) => url.startsWith("https://doi.org/10.") && !url.startsWith("https://doi.org/10.5067/"),
  );
  expect(articles.map(({ url }) => url)).toEqual([
    "https://doi.org/10.1109/36.239913",
    "https://doi.org/10.1109/TGRS.2022.3147472",
    "https://doi.org/10.1109/36.739146",
    "https://doi.org/10.1109/36.175330",
    "https://doi.org/10.1029/2004JB003299",
    "https://doi.org/10.1109/TGRS.2021.3084209",
    "https://doi.org/10.3390/rs6064870",
    "https://doi.org/10.1080/01431168908903939",
    "https://doi.org/10.1038/s41467-020-19160-7",
    "https://doi.org/10.1109/TGRS.2002.803792",
    "https://doi.org/10.1016/j.cageo.2019.104331",
  ]);
  expect(SOURCES.filter(({ url }) => url.startsWith("https://doi.org/10.5067/"))).toHaveLength(5);
  for (const { url } of articles) {
    expect(`${SHEETS}\n${NOTES}`).toContain(url);
  }
});

test("the articles of the three new tools are sources of their own research notes", () => {
  // Part 6 of each note lists its sources; an article of a new tool is cited there and in the sheet of its tool.
  const sheetOf = (tool: string) => readFileSync(`../docs/methods/${tool}.md`, "utf8");
  for (const url of [
    "https://doi.org/10.1029/2004JB003299",
    "https://doi.org/10.1109/TGRS.2021.3084209",
    "https://doi.org/10.3390/rs6064870",
  ]) {
    expect(COHERENCE_CHANGE_NOTE).toContain(`<${url}>`);
    expect(sheetOf("coherence-change")).toContain(`<${url}>`);
    expect(NOTE).not.toContain(url);
  }
  expect(COHERENCE_CHANGE_NOTE).toContain("manuscript <https://arxiv.org/abs/2105.11544>");
  expect(source("Stephenson et al. (2022)").use).toContain("arXiv:2105.11544");
  const singh = "https://doi.org/10.1080/01431168908903939";
  expect(SOIL_MOISTURE_NOTE).toContain(`<${singh}>`);
  expect(sheetOf("soil-moisture-change")).toContain(`<${singh}>`);
  expect(NOTE).not.toContain(singh);
});

test("the two collections of the data are those that the research note names", () => {
  expect(NOTE).toContain("NISAR_L2_GCOV_V1");
  expect(NOTE).toContain("NISAR_L2_GUNW_V1");
  expect(source("NISAR Validated Geocoded Polarimetric").version).toBe("Collection NISAR_L2_GCOV_V1");
  expect(source("NISAR Validated Geocoded Unwrapped").version).toBe("Collection NISAR_L2_GUNW_V1");
});

test("the two provisional collections are those that the notes of the new tools name, with their addresses", () => {
  expect(COHERENCE_CHANGE_NOTE).toContain("`NISAR_L2_GUNW_PROVISIONAL_V1`");
  expect(COHERENCE_CHANGE_NOTE).toContain("<https://doi.org/10.5067/NIL2GUNW-P1>");
  const interferograms = source("NISAR Provisional Geocoded Unwrapped");
  expect(interferograms.version).toBe("Collection NISAR_L2_GUNW_PROVISIONAL_V1");
  expect(interferograms.url).toBe("https://doi.org/10.5067/NIL2GUNW-P1");
  expect(SOIL_MOISTURE_NOTE).toContain("`NISAR_L3_SME2_PROVISIONAL_V1` (DOI 10.5067/NIL3SME2-P1)");
  const moisture = source("NISAR Provisional Soil Moisture");
  expect(moisture.version).toBe("Collection NISAR_L3_SME2_PROVISIONAL_V1");
  expect(moisture.url).toBe("https://doi.org/10.5067/NIL3SME2-P1");
  // The beta products of the pilot frame, which the soil moisture tools were compared on as well.
  expect(SOIL_MOISTURE_NOTE).toContain("`NISAR_L3_SME2_BETA_V1` (DOI 10.5067/NIL3SME2-B1)");
  const beta = source("NISAR Beta Soil Moisture");
  expect(beta.version).toBe("Collection NISAR_L3_SME2_BETA_V1");
  expect(beta.url).toBe("https://doi.org/10.5067/NIL3SME2-B1");
});

test("the source program of Soil moisture, Series is the Cookbook, applied to the soil moisture as its note states", () => {
  const sheet = oneLine(readFileSync("../docs/methods/soil-moisture-series.md", "utf8"));
  expect(sheet).toContain("The ASF NISAR Cookbook holds no notebook of SME2 products");
  expect(source("ASF NISAR Cookbook").use).toContain(
    "for Soil moisture, Series their statements are applied to the soil moisture",
  );
  expect(oneLine(SOIL_MOISTURE_NOTE)).toContain("The ASF NISAR Cookbook holds no notebook of SME2 products");
});

test("the sources of the Series tools are those that their method sheets cite", () => {
  const sheets = oneLine(SHEETS);
  for (const notebook of ["NISAR_GCOV_Time_Series_Example.ipynb", "NISAR_Pixel_Conversion.ipynb"]) {
    expect(sheets).toContain(notebook);
    expect(source("ASF NISAR Cookbook").use).toContain(notebook);
  }
  expect(sheets).toContain(
    "space-averaged coherence magnitude is biased toward higher values (Touzi et al., 1999, abstract)",
  );
  expect(source("Touzi, Lopes, Bruniquel and Vachon (1999)").use).toContain(
    "and the bias of the mean coherence of an area.",
  );
  expect(sheets).toContain("section 4.1, pages 20 and 21 (the composite release identifier, CRID)");
  expect(source("Science Data Systems (SDS) L-SAR Product File Naming Conventions").use).toContain(
    "the release of the processing software",
  );
  expect(source("NASA SDS Product Specification, Level-2 Geocoded Unwrapped").use).toContain(
    "for the coherence tools One pair, Change and Series.",
  );
});
