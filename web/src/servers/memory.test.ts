import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { CELL_MEMORY, JOB_BASE_MEMORY, jobMemory, jobsInMemory } from "./memory";

// The rule of the server, which `lynkeus.computer` holds once the program knows the cells of a layer.
const computer = readFileSync("../api/src/lynkeus/computer.py", "utf8");

test("the memory of a job is a fixed part and a part for every cell of its layer", () => {
  expect(jobMemory(0)).toBe(200_000_000);
  expect(jobMemory(25_000_000)).toBe(600_000_000);
  expect(jobMemory(100_000_000)).toBe(1_800_000_000);
  expect(jobMemory(-1)).toBe(JOB_BASE_MEMORY);
});

test("the jobs that fit in a memory are counted in whole jobs", () => {
  expect(jobsInMemory(25_000_000, 600_000_000)).toBe(1);
  expect(jobsInMemory(25_000_000, 599_999_999)).toBe(0);
  // The 16 GB of the Office computer of the examples.
  expect(jobsInMemory(25_000_000, 17_179_869_184)).toBe(28);
  expect(jobsInMemory(100_000_000, 17_179_869_184)).toBe(9);
});

test.skipIf(!computer.includes("def job_memory"))("the two numbers written here are those of lynkeus.computer", () => {
  // Python writes the numbers with an underscore between the groups of three digits.
  const python = (count: number) => count.toLocaleString("en-US").replaceAll(",", "_");
  expect(computer).toContain(`JOB_BASE_MEMORY = ${python(JOB_BASE_MEMORY)}\n`);
  expect(computer).toContain(`CELL_MEMORY = ${String(CELL_MEMORY)}\n`);
  expect(computer).toContain("return JOB_BASE_MEMORY + CELL_MEMORY * max(cells, 0)");
});
