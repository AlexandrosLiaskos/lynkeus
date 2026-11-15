// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { expect, openSite, test } from "./support";

test("the welcome screen appears, is entered and leaves the map visible", async ({ page, findings }) => {
  const welcome = await openSite(page);
  await expect(welcome.getByRole("heading", { name: "Lynkeus" })).toBeVisible();
  await findings.scan("welcome screen");

  await welcome.getByRole("button", { name: "Enter the Platform" }).click();
  await expect(welcome).toBeHidden();
  await expect(page.getByRole("main", { name: "Map" })).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Ribbon" })).toBeVisible();
  await findings.scan("page after the welcome screen");
});
