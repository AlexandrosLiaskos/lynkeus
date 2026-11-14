import { expect, test } from "vitest";
import { VIEW_TAB } from "./tab";

test("the View tab holds the groups Windows and Show, with their buttons in order", () => {
  expect(VIEW_TAB.groups.map(({ label, tools }) => [label, tools.map((tool) => tool.label)])).toEqual([
    ["Windows", ["Contents", "Catalog", "Reset panes", "Full screen"]],
    ["Show", ["Status bar", "Scale bar"]],
  ]);
});

test("every button of the View tab has its own name and a description that ends with a full stop", () => {
  const tools = VIEW_TAB.groups.flatMap(({ tools }) => [...tools]);
  expect(new Set(tools.map(({ id }) => id)).size).toBe(tools.length);
  for (const { id, description } of tools) {
    expect(id.startsWith("view-")).toBe(true);
    expect(description.endsWith(".")).toBe(true);
  }
});
