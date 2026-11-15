import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { CELL_MEMORY, JOB_BASE_MEMORY, jobMemory, jobsInMemory } from "./memory";

test("the memory of a job grows with the cells of its layer, as the measurements of the rules state", () => {
  // docs/Own_Servers.md, Cells of a layer: 353 megabytes for 15.0 million cells and 508 for 25 million.
  expect(jobMemory(15_000_000)).toBe(353_000_000);
  expect(jobMemory(25_000_000)).toBe(508_000_000);
  expect(jobMemory(0)).toBe(JOB_BASE_MEMORY);
  expect(jobMemory(1)).toBe(JOB_BASE_MEMORY + Math.ceil(CELL_MEMORY));
});

test("the jobs that fit in a memory are counted in whole jobs", () => {
  expect(jobsInMemory(25_000_000, 508_000_000)).toBe(1);
  expect(jobsInMemory(25_000_000, 507_999_999)).toBe(0);
  expect(jobsInMemory(25_000_000, 17_179_869_184)).toBe(33);
  expect(jobsInMemory(100_000_000, 17_179_869_184)).toBe(10);
});

test("the two measurements written here are those of the rules", () => {
  const rules = readFileSync("../docs/Own_Servers.md", "utf8").replace(/\s+/g, " ");
  expect(rules).toContain("353 megabytes for 15.0 million cells and 508 megabytes for 25 million");
});
