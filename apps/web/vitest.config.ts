import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    tsconfigRaw: {
      compilerOptions: {
        jsx: "react-jsx",
      },
    },
  },
  oxc: false,
  test: {
    environment: "jsdom",
    testTimeout: 10_000,
  },
});
