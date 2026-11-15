// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { enter, expect, paneOf, pressTool, test } from "./support";

test("the form of the tool Backscatter, One date opens in its pane", async ({ page, findings }) => {
  await enter(page);
  await pressTool(page, "Analysis", "One date", "Backscatter");
  const pane = paneOf(page, "Backscatter, One date");
  await expect(pane).toBeVisible();
  await findings.scan("tool form Backscatter, One date");
});
