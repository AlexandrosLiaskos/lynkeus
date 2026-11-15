// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import { visualizer } from "rollup-plugin-visualizer";
import { configDefaults, defineConfig } from "vitest/config";

// With the variable LYNKEUS_BUNDLE_MAP the build also writes, in the folder bundle-map, which libraries make up
// the script of the page: a drawing to open in a browser and the sizes as data. Without it the build is as before.
const bundleMap = process.env.LYNKEUS_BUNDLE_MAP
  ? [
      visualizer({ filename: "bundle-map/bundle-map.html", template: "treemap", gzipSize: true }),
      visualizer({ filename: "bundle-map/bundle-map.json", template: "raw-data", gzipSize: true }),
    ]
  : [];

export default defineConfig({
  plugins: bundleMap,
  // The U.S. Web Design System is compiled from its Sass packages, so that only
  // the components in use reach the page.
  css: {
    preprocessorOptions: {
      scss: { loadPaths: ["node_modules/@uswds/uswds/packages"] },
    },
  },
  // Every image is a file of the site, because the security policy of the web
  // server accepts images only from the site and from the map services. The
  // files that the build writes go to the folder `bundle`. Each carries a hash
  // of its content in its name, so the web server lets a browser keep it.
  build: { assetsInlineLimit: 0, assetsDir: "bundle" },
  // On a member's own computer the interface asks the server that runs beside it.
  server: { proxy: { "/api": "http://localhost:8000" } },
  // The tests run in a simulated browser.
  test: {
    environment: "happy-dom",
    // The files of the folder e2e are the browser checks, which Playwright runs.
    exclude: [...configDefaults.exclude, "e2e/**"],
    setupFiles: ["src/test-setup.ts"],
  },
});
