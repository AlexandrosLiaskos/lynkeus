// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { enter, expect, paneOf, pressTool, test } from "./support";

test("the menu of a layer of the Contents pane opens and closes with the Escape key", async ({ page, findings }) => {
  await enter(page);
  const button = paneOf(page, "Contents")
    .getByRole("button", { name: /^More commands of / })
    .first();
  await button.click();
  const menu = page.getByRole("menu", { name: /^More commands of / });
  await expect(menu).toBeVisible();
  await findings.scan("layer menu open");

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(button).toBeFocused();
});

test("the bubble of an i button shows under the pointer and on keyboard focus", async ({ page, findings }) => {
  await enter(page);
  await pressTool(page, "Options", "Storage");
  const pane = paneOf(page, "Browser storage");
  const button = pane.getByRole("button", { name: "Information about Browser storage", exact: true });
  // The button names the element that holds its explanation. The bubble is the tooltip that shows this text; it
  // need not be that element, and it need not stand inside the pane.
  const explanation = pane.locator(`[id="${(await button.getAttribute("aria-describedby")) ?? ""}"]`);
  const bubble = page.getByRole("tooltip").filter({ hasText: (await explanation.textContent()) ?? "" });
  await expect(bubble).toBeHidden();

  await button.hover();
  await expect(bubble).toBeVisible();
  await findings.scan("i bubble under the pointer");
  await page.mouse.move(0, 0);
  await expect(bubble).toBeHidden();

  // The Tab key moves the focus from the title of the pane to the i button, which stands after it.
  await pane.getByRole("heading", { name: "Browser storage", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(button).toBeFocused();
  await expect(bubble).toBeVisible();
  await findings.scan("i bubble on keyboard focus");
});
