import { defineConfig } from "vite";

// The U.S. Web Design System is compiled from its Sass packages, so that only
// the components in use reach the page.
export default defineConfig({
  css: {
    preprocessorOptions: {
      scss: { loadPaths: ["node_modules/@uswds/uswds/packages"] },
    },
  },
});
