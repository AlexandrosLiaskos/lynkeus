// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { enter, expect, isDrawn, paneOf, pressTool, test } from "./support";

for (const name of ["Contents", "Catalog"]) {
  test(`the ${name} pane closes and opens again from the View tab`, async ({ page, findings }) => {
    await enter(page);
    const pane = paneOf(page, name);
    await expect(pane).toBeVisible();

    await pane.getByRole("button", { name: `Close the ${name} pane` }).click();
    await expect(pane).toBeHidden();
    await findings.scan(`${name} pane closed`);

    await pressTool(page, "View", name);
    await expect(pane).toBeVisible();
    await findings.scan(`${name} pane open`);
  });
}

/** Buttons of the ribbon that open a pane for a visitor who has not signed in, with the title of the pane. */
const TOOL_PANES = [
  { tab: "Map", tool: "Go to coordinates", title: "Go to coordinates" },
  { tab: "Map", tool: "Bookmarks", title: "Bookmarks" },
  { tab: "Map", tool: "Imagery of a date", title: "Imagery of a date" },
  { tab: "Data", tool: "Sign in", title: "Sign in to Earthdata" },
  { tab: "Share", tool: "Map image", title: "Map image" },
  { tab: "Share", tool: "Link to this map", title: "Link to this map" },
  { tab: "Options", tool: "Storage", title: "Browser storage" },
  { tab: "Help", tool: "Getting started", title: "Getting started" },
];

for (const { tab, tool, title } of TOOL_PANES) {
  test(`the button ${tool} of the ${tab} tab opens the pane ${title}, and its X closes it`, async ({
    page,
    findings,
  }) => {
    await enter(page);
    await pressTool(page, tab, tool);
    const pane = paneOf(page, title);
    await expect(pane).toBeVisible();
    await findings.scan(`${title} pane open`);

    await pane.getByRole("button", { name: `Close the ${title} pane` }).click();
    await expect(pane).toBeHidden();
  });
}

test("the Contents pane hides to the strip at the edge and shows again", async ({ page, findings }) => {
  await enter(page);
  const pane = paneOf(page, "Contents");
  await pane.getByRole("button", { name: "Auto-hide the Contents pane" }).click();
  const strip = page.getByRole("group", { name: "Hidden panes on the left of the map" });
  const tab = strip.getByRole("button", { name: "Contents", exact: true });
  await expect(tab).toBeVisible();
  await expect(tab).toHaveAttribute("aria-expanded", "false");
  await expect.poll(() => isDrawn(pane)).toBe(false);
  await findings.scan("Contents pane hidden to the strip");

  await tab.click();
  await expect(tab).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => isDrawn(pane)).toBe(true);
  await findings.scan("Contents pane shown from the strip");

  await pane.getByRole("button", { name: "Pin the Contents pane" }).click();
  await expect(strip).toBeHidden();
  await expect(pane).toBeVisible();
});
