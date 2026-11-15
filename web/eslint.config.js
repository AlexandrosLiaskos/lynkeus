// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Alexandros Liaskos. Additional terms under section 7 of the licence apply; see the file NOTICE.
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  // The browser checks of the folder e2e are checked by the TypeScript compiler with their own settings.
  globalIgnores([
    "dist",
    "public",
    "eslint.config.js",
    "stylelint.config.js",
    "playwright.config.ts",
    "e2e",
    "playwright-report",
    "test-results",
    "findings",
    "lighthouse-report",
    ".lighthouseci",
    "bundle-map",
  ]),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  reactHooks.configs.flat.recommended,
  { languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } } },
  // An arrow function may call a function that returns nothing, as event handlers do.
  { rules: { "@typescript-eslint/no-confusing-void-expression": ["error", { ignoreArrowShorthand: true }] } },
);
