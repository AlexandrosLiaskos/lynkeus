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
  // The tests run in a simulated browser.
  test: {
    environment: "happy-dom",
    setupFiles: ["src/test-setup.ts"],
  },
});
