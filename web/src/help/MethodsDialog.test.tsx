import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { plain } from "../analysis/Marked";
import { METHODS } from "../analysis/methodSheets";
import { FINISHED_TOOLS } from "../analysis/tools";
import { Ribbon } from "../ribbon/Ribbon";
import { resetDock } from "../shared/dock/dock";
import { ABOUT } from "./about";
import { useHelpActions } from "./actions";
import { HelpDialogs } from "./HelpDialogs";
import {
  BlockView,
  LEGEND_NAMES,
  MethodsDialog,
  MethodSheet,
  MethodsList,
  sheetAddress,
  SHEET_INFO,
} from "./MethodsDialog";
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

test("the button Methods of the Help tab is active and opens the dialog with every sheet open", async () => {
  render(<HelpTab />);
  const button = screen.getByRole("button", { name: /^Methods/ });
  expect(button.getAttribute("aria-disabled")).toBeNull();
  expect(screen.queryByRole("dialog", { name: "Methods" })).toBeNull();
  await userEvent.click(button);
  expect(methodsStore.get()).toEqual({ open: true, tool: null });
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: "Methods" });
  expect(dialog.open).toBe(true);
  for (const tool of FINISHED_TOOLS) {
    const toggle = within(dialog).getByRole("button", { name: METHODS[tool].title });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  }
});

test("the page shows one section for each finished tool, under the title of its sheet", () => {
  render(<MethodsList asked={null} />);
  expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
    "Backscatter, One date",
    "Backscatter, Change",
    "Coherence, One pair",
  ]);
  expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(
    FINISHED_TOOLS.map((tool) => METHODS[tool].title),
  );
});

test("the sheet that the form of a tool asked for is open, and the others are closed", () => {
  render(<MethodsDialog />);
  act(() => methodsStore.set({ open: true, tool: "backscatter-change" }));
  const expanded = FINISHED_TOOLS.map((tool) =>
    screen.getByRole("button", { name: METHODS[tool].title, hidden: true }).getAttribute("aria-expanded"),
  );
  expect(expanded).toEqual(["false", "true", "false"]);
});

test("the dialog closes, and keeps no sheet drawn while it is closed", () => {
  render(<MethodsDialog />);
  act(() => methodsStore.set({ open: true, tool: null }));
  act(() => screen.getByRole<HTMLDialogElement>("dialog", { name: "Methods" }).close());
  expect(methodsStore.get().open).toBe(false);
  expect(document.querySelector(".methods")).toBeNull();
});

test.each(FINISHED_TOOLS)(
  "the sheet of %s shows its table, every section and the address of the whole sheet",
  (tool) => {
    const { container } = render(<MethodSheet tool={tool} />);
    const method = METHODS[tool];
    expect(rows(container).slice(0, 4)).toEqual(method.summary.map(([name = "", value = ""]) => [name, plain(value)]));
    expect(screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)).toEqual([
      ...method.sections.map(({ title }) => title),
      ...(tool === "coherence-state" ? [] : ["Mask of the product"]),
    ]);
    expect(container.textContent).toContain(plain(method.mask));
    for (const { blocks } of method.sections) {
      for (const block of blocks) {
        const texts =
          block.kind === "text"
            ? [block.text]
            : block.kind === "code"
              ? [block.code]
              : block.kind === "list"
                ? block.items
                : block.rows.flat().filter((cell) => !(plain(cell) in LEGEND_NAMES));
        for (const text of texts) {
          expect(container.textContent).toContain(plain(text));
        }
      }
    }
    const address = `https://github.com/AlexandrosLiaskos/lynkeus/blob/main/docs/methods/${tool}.md`;
    expect(sheetAddress(tool)).toBe(address);
    expect(address.startsWith(ABOUT.citation.repository)).toBe(true);
    expect(screen.getByRole("link", { name: address }).getAttribute("href")).toBe(address);
  },
);

test("the table Legend names its rows in plain words, with the name of the field behind the i", () => {
  const { container } = render(
    <BlockView
      block={{
        kind: "table",
        head: ["Field of the layer description", "Value"],
        rows: [
          ["`quantity`", "Radar backscatter gamma0"],
          ["`unit`", "dB"],
          ["`range`", "0 to 1"],
          ["`colours`", "`grey`"],
        ],
      }}
    />,
  );
  expect(rows(container).map(([name]) => name)).toEqual(["Quantity", "Unit", "Range", "Colour scale"]);
  expect(container.textContent).toContain("The field colours of the layer description.");
  expect(screen.getByRole("button", { name: "Information about Colour scale" })).toBeDefined();
});

test("a table of more than two columns gives one list for each row, with the heads of the columns as names", () => {
  const { container } = render(
    <BlockView
      block={{
        kind: "table",
        head: ["Spacing", "Path in the product", "Unit"],
        rows: [
          ["80 m", "`/science/a`", "`1`"],
          ["20 m", "`/science/b`", "`1`"],
        ],
      }}
    />,
  );
  expect(container.querySelectorAll(".property-group")).toHaveLength(2);
  expect(rows(container)).toEqual([
    ["Spacing", "80 m"],
    ["Path in the product", "/science/a"],
    ["Unit", "1"],
    ["Spacing", "20 m"],
    ["Path in the product", "/science/b"],
    ["Unit", "1"],
  ]);
});

test("a formula is shown as written, and a numbered list keeps its order", () => {
  const { container } = render(
    <>
      <BlockView block={{ kind: "code", code: "change_dB = 10 * log10(gamma0_later / gamma0_earlier)" }} />
      <BlockView block={{ kind: "list", items: ["`nan`;", "zero or negative;"] }} />
    </>,
  );
  expect(container.querySelector("pre code")?.textContent).toBe(
    "change_dB = 10 * log10(gamma0_later / gamma0_earlier)",
  );
  expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["nan;", "zero or negative;"]);
});

test("the explanation of a sheet has at most three sentences", () => {
  expect(SHEET_INFO.split(/(?<=\.)\s+/).length).toBeLessThanOrEqual(3);
});
