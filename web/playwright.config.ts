// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { defineConfig, devices } from "@playwright/test";

// The browser checks open the built site, which `vite preview` serves from the folder dist. With the variable
// LYNKEUS_ADDRESS they open another address instead, for example https://lynkeus.nkua.cloud.
const address = process.env.LYNKEUS_ADDRESS ?? "";
const built = address === "";
const onRunner = process.env.CI !== undefined;

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: onRunner,
  retries: 0,
  workers: onRunner ? 3 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  // The trace, the video and the screenshot of every test are kept, so that a fault can be looked at afterwards.
  use: { baseURL: built ? "http://localhost:4173" : address, trace: "on", video: "on", screenshot: "on" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: built
    ? {
        command: "npx vite preview --port 4173 --strictPort",
        url: "http://localhost:4173",
        reuseExistingServer: !onRunner,
        timeout: 60_000,
      }
    : undefined,
});
