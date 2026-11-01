import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist", "coverage", ".wrangler"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // "_" で始まる名前は「意図的に使わない」ことを表す慣習として許可する
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs["recommended-latest"]],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["scripts/**/*.ts", "tests/**/*.ts", "*.config.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
]);
