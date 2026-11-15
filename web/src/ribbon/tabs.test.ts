import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { TABS } from "./tabs";

const tools = TABS.flatMap(({ groups }) => groups.flatMap((group) => group.tools));

// The names of the icons in the icon set of the U.S. Web Design System.
const sprite = readFileSync("node_modules/@uswds/uswds/dist/img/sprite.svg", "utf8");
const icons = new Set(Array.from(sprite.matchAll(/<symbol[^>]*\bid="([^"]+)"/g), (match) => match[1]));

test("the ribbon has its seven tabs, in order", () => {
  expect(TABS.map(({ label }) => label)).toEqual(["Map", "Data", "Analysis", "View", "Share", "Options", "Help"]);
});

test("every tab and every button has its own name", () => {
  const tabIds = TABS.map(({ id }) => id);
  const toolIds = tools.map(({ id }) => id);
  expect(new Set(tabIds).size).toBe(tabIds.length);
  expect(new Set(toolIds).size).toBe(toolIds.length);
});

test("every tab has at least one group, and every group at least one button", () => {
  for (const { groups } of TABS) {
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group.tools.length).toBeGreaterThan(0);
    }
  }
});

test.each(tools)("the button $id has a label, an icon of the design system and a one-sentence description", (tool) => {
  expect(tool.label).not.toBe("");
  expect(icons.has(tool.icon)).toBe(true);
  expect(tool.description).toMatch(/^[A-Z][^.]*\.$/);
});
