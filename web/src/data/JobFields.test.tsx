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
    "Server",
    "Status",
    "Message",
    "Requested",
    "Product type",
    "Product file",
    "Layer of the product",
    "Area",
    "Identifier of the job",
  ]);
  expect(rows[2]).toEqual(["Server", "Project server"]);
  expect(rows[3]).toEqual(["Status", "Waiting, 0 %"]);
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
    "Server",
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

test("a job of an own server of the visitor names that server", () => {
  const rows = jobRows(job({ server: { id: "3f9a1c0b7e24d658", name: "Office computer" } }));
  expect(rows).toContainEqual(["Server", "Office computer"]);
});

test("a job of a Series tool names its point in words and carries the identifier of its series", () => {
  const rows = jobRows(
    job({
      processID: "backscatter-series",
      status: "successful",
      inputs: {
        inputs: ["first", "second"],
        title: "Series of backscatter",
        point: { longitude: -70.9, latitude: 42.8 },
      },
      series: "5b0a52ffe356b487a469c1b2c7989d7e",
    }),
  );
  expect(rows).toContainEqual(["Input layers", "first, second"]);
  expect(rows).toContainEqual(["Point", "Longitude -70.9, latitude 42.8 (degrees)"]);
  expect(rows.slice(-2)).toEqual([
    ["Identifier of the series", "5b0a52ffe356b487a469c1b2c7989d7e"],
    ["Identifier of the job", "0123456789abcdef0123456789abcdef"],
  ]);
  // A series of the whole area was started without a point.
  const whole = jobRows(job({ inputs: { inputs: ["first", "second"], title: "Series", point: null } }));
  expect(whole).toContainEqual(["Point", "None"]);
});
