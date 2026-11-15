// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { expect, test } from "vitest";
import { OPTIONS_TAB } from "./tab";

test("the Options tab holds the group Stored data, with the button Storage", () => {
  expect(OPTIONS_TAB.groups.map(({ label, tools }) => [label, tools.map((tool) => tool.label)])).toEqual([
    ["Stored data", ["Storage"]],
  ]);
});

test("every button of the Options tab has its own name and a description that ends with a full stop", () => {
  const tools = OPTIONS_TAB.groups.flatMap(({ tools }) => [...tools]);
  expect(new Set(tools.map(({ id }) => id)).size).toBe(tools.length);
  for (const { id, description } of tools) {
    expect(id.startsWith("options-")).toBe(true);
    expect(description.endsWith(".")).toBe(true);
  }
});
