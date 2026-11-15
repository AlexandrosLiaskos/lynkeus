// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The U.S. Web Design System is compiled from its Sass packages, so that only
  // the components in use reach the page.
  css: {
    preprocessorOptions: {
      scss: { loadPaths: ["node_modules/@uswds/uswds/packages"] },
    },
  },
  // Every image is a file of the site, because the security policy of the web
  // server accepts images only from the site and from the map services.
  build: { assetsInlineLimit: 0 },
  // On a member's own computer the interface asks the server that runs beside it.
  server: { proxy: { "/api": "http://localhost:8000" } },
  // The tests run in a simulated browser.
  test: {
    environment: "happy-dom",
    setupFiles: ["src/test-setup.ts"],
  },
});
