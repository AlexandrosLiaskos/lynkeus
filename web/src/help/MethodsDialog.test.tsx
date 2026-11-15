// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { ROW_NAMES, SHEETS } from "../analysis/methods";
import { METHODS } from "../analysis/methodSheets";
import { Ribbon } from "../ribbon/Ribbon";
import { resetDock } from "../shared/dock/dock";
import { ABOUT } from "./about";
import { useHelpActions } from "./actions";
import { HelpDialogs } from "./HelpDialogs";
import { MethodsDialog, MethodSheet, MethodsList, sheetAddress, SHEET_INFO } from "./MethodsDialog";
import { methodsStore } from "./state";
import { HELP_TAB } from "./tab";

/** The Help tab as the page holds it: its buttons with their actions, and its dialogs. */
function HelpTab() {
  return (
    <>
      <Ribbon tabs={[HELP_TAB]} actions={useHelpActions()} />
      <HelpDialogs />
    </>
  );
}

/** The names and the values of the rows of the lists of names and values inside an element. */
function rows(element: HTMLElement): (string | null)[][] {
  return Array.from(element.querySelectorAll(".property-row"), (row) => [
    row.querySelector(".property-name > span")?.textContent ?? null,
    row.querySelector(".property-value-text")?.textContent ?? null,
  ]);
}

beforeEach(() => {
  resetDock();
  methodsStore.set({ open: false, tool: null });
});

test("the button Methods of the Help tab is active and opens the dialog with every section open", async () => {
  render(<HelpTab />);
  const button = screen.getByRole("button", { name: /^Methods/ });
  expect(button.getAttribute("aria-disabled")).toBeNull();
  expect(screen.queryByRole("dialog", { name: "Methods" })).toBeNull();
  await userEvent.click(button);
  expect(methodsStore.get()).toEqual({ open: true, tool: null });
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: "Methods" });
  expect(dialog.open).toBe(true);
  for (const tool of SHEETS) {
    const toggle = within(dialog).getByRole("button", { name: METHODS[tool].title });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  }
});

test("the page shows one section for each finished tool and one for the statistics in an area, under the title of its sheet", () => {
  render(<MethodsList asked={null} />);
  expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
    "Backscatter, One date",
    "Backscatter, Change",
    "Backscatter, Thematic map",
    "Coherence, One pair",
    "Coherence, Change",
    "Surface displacement, One pair",
    "Soil moisture, One date",
    "Soil moisture, Change",
    "Backscatter, Series",
    "Coherence, Series",
    "Soil moisture, Series",
    "Statistics in an area",
  ]);
  expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(
    SHEETS.map((tool) => METHODS[tool].title),
  );
});

test("the section of the tool that a form asked for is open, and the others are closed", () => {
  render(<MethodsDialog />);
  act(() => methodsStore.set({ open: true, tool: "backscatter-change" }));
  const expanded = SHEETS.map((tool) =>
    screen.getByRole("button", { name: METHODS[tool].title, hidden: true }).getAttribute("aria-expanded"),
  );
  expect(expanded).toEqual([
    "false",
    "true",
    "false",
    "false",
    "false",
    "false",
    "false",
    "false",
    "false",
    "false",
    "false",
    "false",
  ]);
});

test.each([
  "coherence-change",
  "displacement-state",
  "soil-moisture-state",
  "soil-moisture-change",
  "backscatter-series",
  "coherence-series",
  "soil-moisture-series",
] as const)("the link Method of %s opens its section alone", (asked) => {
  render(<MethodsDialog />);
  act(() => methodsStore.set({ open: true, tool: asked }));
  for (const tool of SHEETS) {
    const toggle = screen.getByRole("button", { name: METHODS[tool].title, hidden: true });
    expect(toggle.getAttribute("aria-expanded")).toBe(tool === asked ? "true" : "false");
  }
});

test("the dialog closes, and keeps no section drawn while it is closed", () => {
  render(<MethodsDialog />);
  act(() => methodsStore.set({ open: true, tool: null }));
  act(() => screen.getByRole<HTMLDialogElement>("dialog", { name: "Methods" }).close());
  expect(methodsStore.get().open).toBe(false);
  expect(document.querySelector(".methods")).toBeNull();
});

/** A text without the marks of a sheet: the grave accents of a name in code, and the address of a link. */
function words(text: string): string {
  return text.replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

test.each(SHEETS)(
  "the section of %s shows one list: the rows of the summary, and the address of the full sheet",
  (tool) => {
    const { container } = render(<MethodSheet tool={tool} />);
    const address = `https://github.com/AlexandrosLiaskos/lynkeus/blob/main/docs/methods/${tool}.md`;
    expect(sheetAddress(tool)).toBe(address);
    expect(address.startsWith(ABOUT.citation.repository)).toBe(true);
    expect(container.querySelectorAll(".property-list")).toHaveLength(1);
    expect(rows(container)).toEqual([
      ...METHODS[tool].rows.map(({ name, text }) => [name, words(text)]),
      ["Full method sheet", address],
    ]);
    expect(rows(container).map(([name]) => name)).toEqual([...ROW_NAMES, "Full method sheet"]);
    expect(container.querySelector("h4, table, pre, ol")).toBeNull();
    expect(screen.getByRole("link", { name: address }).getAttribute("href")).toBe(address);
  },
);

test("the rows show a name in code as code and a reference as a link that opens in a new tab", () => {
  const { container } = render(<MethodSheet tool="backscatter-change" />);
  expect(Array.from(container.querySelectorAll("code"), (code) => code.textContent)).toEqual([
    "10 * log10(gamma0_later / gamma0_earlier)",
  ]);
  const link = screen.getByRole("link", { name: "Rignot and van Zyl (1993)" });
  expect(link.getAttribute("href")).toBe("https://doi.org/10.1109/36.239913");
  expect(link.getAttribute("target")).toBe("_blank");
});

test("the explanation of a section states that it is a summary", () => {
  expect(SHEET_INFO).toBe("A summary of the method. The full sheet is in the repository.");
  const { container } = render(<MethodsList asked={null} />);
  expect(container.textContent).toContain(SHEET_INFO);
});
