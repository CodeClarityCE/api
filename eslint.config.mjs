import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";


/** @type {import('eslint').Linter.Config[]} */
export default [
  {files: ["**/*.{js,mjs,cjs,ts}"]},
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.browser }, 
    rules:{
      "@typescript-eslint/no-explicit-any": ["off"],
      "@typescript-eslint/no-empty-object-type": ["off"],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_"
        }
      ]
    }
  },
];