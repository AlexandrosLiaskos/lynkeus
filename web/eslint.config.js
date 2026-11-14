import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores(["dist", "public", "eslint.config.js"]),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  reactHooks.configs.flat.recommended,
  { languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } } },
  // An arrow function may call a function that returns nothing, as event handlers do.
  { rules: { "@typescript-eslint/no-confusing-void-expression": ["error", { ignoreArrowShorthand: true }] } },
);
