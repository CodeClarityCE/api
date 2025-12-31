import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import security from "eslint-plugin-security";
import importPlugin from "eslint-plugin-import";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import prettierConfig from "eslint-config-prettier";

/** @type {import('eslint').Linter.Config[]} */
export default [
  // ==========================================
  // File Patterns
  // ==========================================
  {
    files: ["**/*.{js,mjs,cjs,ts}"]
  },

  // ==========================================
  // Ignore Patterns
  // ==========================================
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.yarn/**",
      "**/coverage/**",
      "**/*.config.js",
      "**/*.config.mjs",
      "**/migrations/**", // Don't lint generated migrations
      ".pnp.cjs", // Yarn PnP generated file
      ".pnp.loader.mjs" // Yarn PnP generated file
    ]
  },

  // ==========================================
  // Base Configurations
  // ==========================================
  pluginJs.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  security.configs.recommended,
  prettierConfig, // Must be last to override conflicting rules

  // ==========================================
  // Main Configuration
  // ==========================================
  {
    languageOptions: {
      // ✅ FIXED: Use Node.js globals instead of browser
      globals: {
        ...globals.node,
        ...globals.jest, // For test files
      },
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        project: './tsconfig.json',
      },
    },

    plugins: {
      import: importPlugin,
      'simple-import-sort': simpleImportSort,
    },

    rules: {
      // ==========================================
      // TypeScript Rules - Strictness
      // ==========================================

      // ✅ IMPROVED: Warn on 'any' instead of disabling completely
      "@typescript-eslint/no-explicit-any": ["warn"],

      // Downgrade unsafe-* rules to warnings since they're symptoms of 'any' usage
      "@typescript-eslint/no-unsafe-member-access": ["warn"],
      "@typescript-eslint/no-unsafe-assignment": ["warn"],
      "@typescript-eslint/no-unsafe-argument": ["warn"],
      "@typescript-eslint/no-unsafe-call": ["warn"],
      "@typescript-eslint/no-unsafe-return": ["warn"],
      "@typescript-eslint/no-unsafe-enum-comparison": ["warn"],

      // Allow empty interfaces (common in NestJS/TypeORM decorators)
      "@typescript-eslint/no-empty-object-type": ["off"],
      "@typescript-eslint/no-empty-interface": ["off"],

      // ✅ IMPROVED: Support both _ and ___ prefixes for intentionally unused
      // Note: This extends TypeScript's noUnusedLocals/noUnusedParameters by adding _ prefix exceptions
      "@typescript-eslint/no-unused-vars": [
        "warn", // Warn instead of error since TypeScript also checks this
        {
          "argsIgnorePattern": "^_+",  // Matches _, __, ___, etc.
          "varsIgnorePattern": "^_+",
          "caughtErrorsIgnorePattern": "^_+",
          "destructuredArrayIgnorePattern": "^_+",
          "ignoreRestSiblings": true
        }
      ],

      // Require explicit return types on exported functions
      "@typescript-eslint/explicit-function-return-type": [
        "warn",
        {
          "allowExpressions": true,
          "allowTypedFunctionExpressions": true,
          "allowHigherOrderFunctions": true,
          "allowDirectConstAssertionInArrowFunctions": true,
          "allowConciseArrowFunctionExpressionsStartingWithVoid": true
        }
      ],

      // ==========================================
      // TypeScript Rules - Code Quality
      // ==========================================

      // Enforce consistent type imports (helps with tree-shaking)
      // ✅ FIXED: Use inline-type-imports to avoid conflicts with enums/classes
      "@typescript-eslint/consistent-type-imports": [
        "warn", // Downgraded from error to avoid blocking builds
        {
          "prefer": "type-imports",
          "fixStyle": "inline-type-imports", // Allows mixing type and value imports
          "disallowTypeAnnotations": false
        }
      ],

      // Prevent floating promises (critical for async code)
      // Note: Some intentional fire-and-forget promises in main.ts and scripts
      "@typescript-eslint/no-floating-promises": ["warn"],

      // Require await in async functions (style preference - TypeScript doesn't enforce this)
      // ✅ DISABLED: Many functions return Promise for API consistency without needing await
      "@typescript-eslint/require-await": ["off"],

      // Prefer nullish coalescing (?? instead of ||)
      "@typescript-eslint/prefer-nullish-coalescing": ["warn"],

      // Prefer optional chaining (?.)
      "@typescript-eslint/prefer-optional-chain": ["warn"],

      // Prefer for-of loops (stylistic preference)
      "@typescript-eslint/prefer-for-of": ["warn"],

      // Allow empty constructors (common in NestJS dependency injection)
      "@typescript-eslint/no-empty-function": ["warn"],

      // No misused promises
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          "checksVoidReturn": false // Allow promises in NestJS decorators
        }
      ],

      // Ban // @ts-ignore comments
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": "allow-with-description",
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-check": false,
          "minimumDescriptionLength": 10
        }
      ],

      // Naming conventions
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          "selector": "interface",
          "format": ["PascalCase"]
        },
        {
          "selector": "class",
          "format": ["PascalCase"]
        },
        {
          "selector": "typeAlias",
          "format": ["PascalCase"]
        },
        {
          "selector": "enum",
          "format": ["PascalCase"]
        },
        {
          "selector": "enumMember",
          "format": ["UPPER_CASE", "PascalCase"]
        }
      ],

      // ==========================================
      // General JavaScript Rules
      // ==========================================

      // Enforce === instead of ==
      "eqeqeq": ["error", "always", { "null": "ignore" }],

      // No var, use const/let
      "no-var": ["error"],

      // Prefer const when variable is never reassigned
      "prefer-const": ["error"],

      // No console.log in production code (use NestJS Logger instead)
      "no-console": ["warn", { "allow": ["warn", "error"] }],

      // Prevent infinite loops
      "no-constant-condition": ["error"],

      // No duplicate imports
      "no-duplicate-imports": ["error"],

      // Require default case in switch or comment
      "default-case": ["warn"],

      // No fallthrough in switch cases
      // ✅ DISABLED: Redundant with TypeScript's noFallthroughCasesInSwitch
      // "no-fallthrough": ["error"],

      // Enforce return in array methods
      "array-callback-return": ["error"],

      // Prefer template literals over string concatenation
      "prefer-template": ["warn"],

      // Restrict template expressions (allow complex types in templates)
      "@typescript-eslint/restrict-template-expressions": ["warn"],

      // No nested ternary operators (hard to read)
      "no-nested-ternary": ["warn"],

      // ==========================================
      // Security Rules (Built-in)
      // ==========================================

      // No eval
      "no-eval": ["error"],

      // No implied eval
      "no-implied-eval": ["error"],

      // No script URLs
      "no-script-url": ["error"],

      // No new Function()
      "no-new-func": ["error"],

      // Disable object injection warning - too many false positives with TypeScript
      "security/detect-object-injection": ["off"],

      // ==========================================
      // Code Quality & Complexity
      // ==========================================

      // Warn on high complexity
      "complexity": ["warn", { "max": 30 }],

      // Max nested callbacks
      "max-nested-callbacks": ["warn", { "max": 4 }],

      // Max depth of nested blocks
      "max-depth": ["warn", { "max": 4 }],

      // Max parameters in function
      "max-params": ["warn", { "max": 12 }],

      // ==========================================
      // Import Rules
      // ==========================================

      "import/no-unresolved": "off", // TypeScript handles this
      "import/no-duplicates": ["error"],

      // Use simple-import-sort for reliable import ordering
      // Groups: external packages first, then src/ internal imports, then relative imports
      "simple-import-sort/imports": [
        "warn",
        {
          "groups": [
            // External packages (npm modules)
            ["^@?\\w"],
            // Internal src/ imports
            ["^src/"],
            // Parent imports (..)
            ["^\\.\\."],
            // Sibling imports (./)
            ["^\\./"]]
        }
      ],
      "simple-import-sort/exports": "warn",

    }
  },

  // ==========================================
  // Test Files Configuration
  // ==========================================
  {
    files: ["**/*.spec.ts", "**/*.test.ts", "**/test/**/*.ts"],
    rules: {
      // More lenient rules for test files
      "@typescript-eslint/no-explicit-any": ["off"],
      "@typescript-eslint/no-unsafe-assignment": ["off"],
      "@typescript-eslint/no-unsafe-member-access": ["off"],
      "@typescript-eslint/no-unsafe-call": ["off"],
      "@typescript-eslint/no-unsafe-return": ["off"],
      "@typescript-eslint/no-unsafe-argument": ["off"],
      "@typescript-eslint/explicit-function-return-type": ["off"],
      "@typescript-eslint/unbound-method": ["off"],
      "@typescript-eslint/no-empty-function": ["off"],
      "@typescript-eslint/dot-notation": ["off"],
      "@typescript-eslint/no-floating-promises": ["off"],
      "no-console": ["off"],
      "complexity": ["off"],
      "max-nested-callbacks": ["off"],
      "max-params": ["off"],
      "@typescript-eslint/no-magic-numbers": ["off"]
    }
  }
];
