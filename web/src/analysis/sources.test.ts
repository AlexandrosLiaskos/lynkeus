import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { sourceFaults } from "../help/sources";
import { SOURCES } from "./sources";
import { FINISHED_TOOLS } from "./tools";

/** The texts of the three method sheets and of the research note of the part, as the repository holds them. */
const SHEETS = FINISHED_TOOLS.map((tool) => readFileSync(`../docs/methods/${tool}.md`, "utf8")).join("\n");
const NOTE = readFileSync("../docs/research/analysis.md", "utf8");

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

test("every article of the list is cited by its address in a method sheet or in the research note", () => {
  const articles = SOURCES.filter(({ url }) => url.startsWith("https://doi.org/10.1"));
  expect(articles.map(({ url }) => url)).toEqual([
    "https://doi.org/10.1109/36.239913",
    "https://doi.org/10.1109/TGRS.2022.3147472",
    "https://doi.org/10.1109/36.739146",
    "https://doi.org/10.1109/36.175330",
    "https://doi.org/10.1038/s41467-020-19160-7",
  ]);
  for (const { url } of articles) {
    expect(`${SHEETS}\n${NOTE}`).toContain(url);
  }
});

test("the two collections of the data are those that the research note names", () => {
  expect(NOTE).toContain("NISAR_L2_GCOV_V1");
  expect(NOTE).toContain("NISAR_L2_GUNW_V1");
  expect(source("NISAR Validated Geocoded Polarimetric").version).toBe("Collection NISAR_L2_GCOV_V1");
  expect(source("NISAR Validated Geocoded Unwrapped").version).toBe("Collection NISAR_L2_GUNW_V1");
});
