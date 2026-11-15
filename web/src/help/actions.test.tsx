// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { Ribbon } from "../ribbon/Ribbon";
import { dockStore, resetDock } from "../shared/dock/dock";
import { useHelpActions } from "./actions";
import { HelpDialogs } from "./HelpDialogs";
import { aboutDialogStore, GETTING_STARTED_PANE, methodsStore, sourcesDialogStore } from "./state";
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

beforeEach(() => {
  resetDock();
  aboutDialogStore.set(false);
  sourcesDialogStore.set(false);
  methodsStore.set({ open: false, tool: null });
});

test("Getting started is the first button of the Help tab", () => {
  expect(HELP_TAB.groups.flatMap(({ tools }) => tools.map(({ label }) => label))).toEqual([
    "Getting started",
    "Methods",
    "Sources",
    "About",
  ]);
});

test("the pane Getting started is closed at first, and its button opens it beside the map and not in a dialog", async () => {
  render(<HelpTab />);
  expect(screen.queryByRole("complementary", { name: "Getting started" })).toBeNull();
  expect(dockStore.get().tools).toEqual([]);
  await userEvent.click(screen.getByRole("button", { name: "Getting started" }));
  expect(dockStore.get().tools).toEqual([GETTING_STARTED_PANE]);
  expect(screen.getByRole("complementary", { name: "Getting started" })).toBeDefined();
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("the button About opens its dialog", async () => {
  render(<HelpTab />);
  await userEvent.click(screen.getByRole("button", { name: "About" }));
  expect(screen.getByRole<HTMLDialogElement>("dialog", { name: "About Lynkeus" }).open).toBe(true);
});

test("the button Sources opens its dialog", async () => {
  render(<HelpTab />);
  await userEvent.click(screen.getByRole("button", { name: "Sources" }));
  expect(screen.getByRole<HTMLDialogElement>("dialog", { name: "Sources" }).open).toBe(true);
});

test("the button Methods opens its dialog", async () => {
  render(<HelpTab />);
  const button = screen.getByRole("button", { name: "Methods" });
  expect(button.getAttribute("aria-disabled")).toBeNull();
  await userEvent.click(button);
  expect(screen.getByRole<HTMLDialogElement>("dialog", { name: "Methods" }).open).toBe(true);
});

test("every button of the Help tab is finished", () => {
  render(<HelpTab />);
  const buttons = HELP_TAB.groups.flatMap(({ tools }) =>
    tools.map(({ label }) => screen.getByRole("button", { name: label })),
  );
  expect(buttons.map((button) => button.getAttribute("aria-disabled"))).toEqual([null, null, null, null]);
});
