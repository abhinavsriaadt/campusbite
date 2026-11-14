import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  { ignores: ["dist/**", "node_modules/**", "test-results/**", "playwright-report/**"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "18.3" } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      "react/prop-types": "off", // plain JS project, no PropTypes
      "no-unused-vars": ["error", { ignoreRestSiblings: true, caughtErrors: "none" }],
      "no-console": "error",
    },
  },
  {
    files: ["e2e/**", "playwright.config.js", "vite.config.js", "eslint.config.js"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "no-console": "off" },
  },
];
