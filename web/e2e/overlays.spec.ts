// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import type { Locator, Page, TestInfo } from "@playwright/test";
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
  // The explanation that describes the button is in the page at all times, in an element that is not shown. The
  // bubble is the element with the role of a tooltip. It is in the page only while it shows, and it shows the
  // same explanation.
  const explanation = pane.locator(`[id="${(await button.getAttribute("aria-describedby")) ?? ""}"]`);
  await expect(explanation).toBeHidden();
  const text = (await explanation.textContent()) ?? "";
  expect(text).not.toBe("");
  const bubble = pane.getByRole("tooltip");
  await expect(bubble).toBeHidden();

  await button.hover();
  await expect(bubble).toBeVisible();
  await expect(bubble).toHaveText(text);
  await findings.scan("i bubble under the pointer");
  await page.mouse.move(0, 0);
  await expect(bubble).toBeHidden();

  // The Tab key moves the focus from the title of the pane to the i button, which stands after it.
  await pane.getByRole("heading", { name: "Browser storage", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(button).toBeFocused();
  await expect(bubble).toBeVisible();
  await findings.scan("i bubble on keyboard focus");

  // The Escape key hides the bubble and leaves the focus on the button.
  await page.keyboard.press("Escape");
  await expect(bubble).toBeHidden();
  await expect(button).toBeFocused();
});

/** The box of an element in the window, in pixels, after its transition has ended. */
async function boxOf(element: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  await element.evaluate(async (node) => {
    await Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
  });
  const box = await element.boundingBox();
  if (!box) {
    throw new Error("The element has no box.");
  }
  return box;
}

/** Attach a picture of the window to the report of the flow. */
async function attachPicture(page: Page, info: TestInfo, name: string): Promise<void> {
  await info.attach(`${name}.png`, { body: await page.screenshot(), contentType: "image/png" });
}

/** Expect that a box lies inside the window. */
function expectInsideWindow(page: Page, box: { x: number; y: number; width: number; height: number }): void {
  const size = page.viewportSize() ?? { width: 0, height: 0 };
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(size.width);
  expect(box.y + box.height).toBeLessThanOrEqual(size.height);
}

test("the description of a ribbon button shows under the ribbon, inside the window", async ({ page }, info) => {
  await enter(page);
  const tabs = page.getByRole("tablist", { name: "Ribbon" });
  const mapTab = tabs.getByRole("tab", { name: "Map", exact: true });
  await mapTab.click();
  const panel = page.locator("#ribbon-panel");
  const button = panel.getByRole("button", { name: "Zoom in", exact: true });
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeHidden();

  // Under the pointer the description shows. It stands under the panel of the ribbon, so it covers neither its
  // button nor the name of the group.
  await button.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Zoom in");
  const [box, buttonBox, panelBox] = [await boxOf(tooltip), await boxOf(button), await boxOf(panel)];
  console.log(JSON.stringify({ browser: info.project.name, state: "pointer", box, buttonBox, panelBox }));
  await attachPicture(page, info, "ribbon description under the pointer");
  expectInsideWindow(page, box);
  expect(box.y).toBeGreaterThanOrEqual(buttonBox.y + buttonBox.height);
  expect(box.y).toBeGreaterThanOrEqual(panelBox.y + panelBox.height - 1);
  await page.mouse.move(0, 0);
  await expect(tooltip).toBeHidden();

  // The Tab key moves the focus from the row of tabs to a button of the panel, and its description shows.
  // A browser may stop on the way: the first run of this flow in Firefox did not reach a button with one press.
  await mapTab.focus();
  const focused = panel.locator("button:focus");
  for (let presses = 0; presses < 3 && (await focused.count()) === 0; presses += 1) {
    await page.keyboard.press("Tab");
    const active = await page.evaluate(() => {
      const element = document.activeElement;
      return element ? `${element.tagName} ${element.id} ${element.className}` : "";
    });
    console.log(JSON.stringify({ browser: info.project.name, state: "Tab key", active }));
  }
  await expect(focused).toHaveCount(1);
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText((await focused.textContent()) ?? "");
  const focusBox = await boxOf(tooltip);
  console.log(JSON.stringify({ browser: info.project.name, state: "focus", box: focusBox }));
  await attachPicture(page, info, "ribbon description on keyboard focus");
  expectInsideWindow(page, focusBox);
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();

  // An unfinished button, where the ribbon has one, is inactive and its description ends with the sentence that
  // says so.
  let unfinished: Locator | undefined;
  for (const tab of await tabs.getByRole("tab").all()) {
    await tab.click();
    for (const candidate of await panel.locator('button[aria-disabled="true"]').all()) {
      const id = await candidate.getAttribute("aria-describedby");
      const sentences = id ? await page.locator(`[id="${id}"]`).textContent() : null;
      if (sentences?.endsWith("Not yet available.")) {
        unfinished = candidate;
        break;
      }
    }
    if (unfinished) {
      break;
    }
  }
  if (!unfinished) {
    console.log(JSON.stringify({ browser: info.project.name, state: "unfinished", found: false }));
    return;
  }
  await page.mouse.move(0, 0);
  await unfinished.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Not yet available.");
  const unfinishedBox = await boxOf(tooltip);
  const name = await unfinished.textContent();
  console.log(JSON.stringify({ browser: info.project.name, state: "unfinished", button: name, box: unfinishedBox }));
  await attachPicture(page, info, "description of an unfinished ribbon button");
  expectInsideWindow(page, unfinishedBox);
});
