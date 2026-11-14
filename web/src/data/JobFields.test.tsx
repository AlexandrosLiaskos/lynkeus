import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { JobFields, jobRows } from "./JobFields";
import { job } from "./testSession";

test("a job that waits has no time of start, of end or of work", () => {
  const rows = jobRows(
    job({ status: "accepted", started: undefined, progress: 0, message: "The job waits for its turn." }),
  );
  expect(rows.map(([name]) => name)).toEqual([
    "Name",
    "Process",
    "Status",
    "Message",
    "Requested",
    "Product type",
    "Product file",
    "Layer of the product",
    "Area",
    "Identifier of the job",
  ]);
  expect(rows[2]).toEqual(["Status", "Waiting, 0 %"]);
});

test("the inputs of an analysis tool are named in words, and any other input by its own name", () => {
  const rows = jobRows(
    job({
      processID: "backscatter-change",
      inputs: { inputs: ["first", "second"], title: "Change of backscatter", window: 5, options: { smooth: true } },
    }),
  );
  expect(rows).toContainEqual(["Input layers", "first, second"]);
  expect(rows).toContainEqual(["Name of the result", "Change of backscatter"]);
  expect(rows).toContainEqual(["window", "5"]);
  expect(rows).toContainEqual(["options", '{"smooth":true}']);
});

test("a job whose inputs the server does not state shows its other fields", () => {
  const rows = jobRows(job({ inputs: undefined, message: "" }));
  expect(rows.map(([name]) => name)).toEqual([
    "Name",
    "Process",
    "Status",
    "Requested",
    "Started",
    "Time of the work",
    "Identifier of the job",
  ]);
});

test("the fields stand in a table that carries the name of the job", () => {
  render(<JobFields job={job()} />);
  expect(screen.getByRole("table", { name: "Fields of the job Backscatter HH, 21 Oct 2026" })).toBeDefined();
  expect(screen.getAllByRole("rowheader").map((header) => header.textContent)).toContain("Time of the work");
});
