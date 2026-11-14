import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { SOURCE_PARTS, type SourcePart } from "./sources";
import { SourcesDialog, SourcesList } from "./SourcesDialog";
import { sourcesDialogStore } from "./state";

const PARTS: readonly SourcePart[] = [
  {
    name: "First",
    sources: [
      { name: "Program", version: "1.2.3", licence: "MIT", url: "https://example.org/program", use: "Draws" },
      { name: "Dataset", licence: "CC0-1.0", url: "https://example.org/dataset", use: "Is drawn" },
    ],
  },
  { name: "Second", sources: [] },
];

/** The texts of the cells of each row of a table. */
function rows(table: HTMLElement): (string | null)[][] {
  return within(table)
    .getAllByRole("row")
    .map((row) => Array.from(row.children, (cell) => cell.textContent));
}

beforeEach(() => {
  sourcesDialogStore.set(false);
});

test("a part with sources is a table that carries the name of the part, with one row for each source", () => {
  render(<SourcesList parts={PARTS} />);
  expect(screen.getByRole("heading", { level: 3, name: "First" })).toBeDefined();
  expect(rows(screen.getByRole("table", { name: "First" }))).toEqual([
    ["Name", "Version", "Licence", "Use", "Address"],
    ["Program", "1.2.3", "MIT", "Draws", "https://example.org/program"],
    ["Dataset", "", "CC0-1.0", "Is drawn", "https://example.org/dataset"],
  ]);
});

test("the head of each column and the name of each source are marked as headers", () => {
  render(<SourcesList parts={PARTS} />);
  const table = screen.getByRole("table", { name: "First" });
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.getAttribute("scope")),
  ).toEqual(Array.from({ length: 5 }, () => "col"));
  expect(
    within(table)
      .getAllByRole("rowheader")
      .map((cell) => [cell.textContent, cell.getAttribute("scope")]),
  ).toEqual([
    ["Program", "row"],
    ["Dataset", "row"],
  ]);
});

test("the address of a source is a link to it", () => {
  render(<SourcesList parts={PARTS} />);
  expect(screen.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
    ["https://example.org/program", "https://example.org/program"],
    ["https://example.org/dataset", "https://example.org/dataset"],
  ]);
});

test("the frame of a table can take the keyboard focus and carries the name of the part", () => {
  render(<SourcesList parts={PARTS} />);
  const frame = screen.getByRole("region", { name: "First" });
  expect(frame.getAttribute("tabindex")).toBe("0");
  expect(within(frame).getByRole("table")).toBeDefined();
});

test("a part that lists nothing says so and has no table", () => {
  render(<SourcesList parts={PARTS} />);
  const heading = screen.getByRole("heading", { level: 3, name: "Second" });
  expect(heading.nextElementSibling?.textContent).toBe("This part lists nothing yet.");
  expect(screen.queryByRole("table", { name: "Second" })).toBeNull();
});

test("the dialog starts closed, opens with its name as its heading and shows the three parts", () => {
  render(<SourcesDialog />);
  expect(screen.getByRole<HTMLDialogElement>("dialog", { hidden: true }).open).toBe(false);
  act(() => sourcesDialogStore.set(true));
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: "Sources" });
  expect(dialog.open).toBe(true);
  expect(
    within(dialog)
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent),
  ).toEqual(["Map", "Data", "Analysis"]);
  for (const { name, sources } of SOURCE_PARTS) {
    const table = within(dialog).queryByRole("table", { name });
    expect(table ? rows(table).length - 1 : 0).toBe(sources.length);
    const heading = within(dialog).getByRole("heading", { level: 3, name });
    expect(heading.nextElementSibling?.textContent === "This part lists nothing yet.").toBe(sources.length === 0);
  }
});

test("the close button closes the dialog", async () => {
  render(<SourcesDialog />);
  act(() => sourcesDialogStore.set(true));
  await userEvent.click(screen.getByRole("button", { name: "Close this window" }));
  expect(sourcesDialogStore.get()).toBe(false);
});
