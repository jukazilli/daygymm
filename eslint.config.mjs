import js from "@eslint/js";
import tseslint from "typescript-eslint";

const commonGlobals = {
  Buffer: "readonly",
  URL: "readonly",
  console: "readonly",
  process: "readonly",
};

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.expo/**",
      "**/dist/**",
      "coverage/**",
      "docs/**",
      "supabase/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: commonGlobals,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["**/*.test.ts"],
    languageOptions: {
      globals: {
        ...commonGlobals,
        describe: "readonly",
        expect: "readonly",
        it: "readonly",
      },
    },
  },
);
