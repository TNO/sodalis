import { defineConfig } from "vitest/config";

// Root-level tests only; workspace packages run their own suites via `pnpm -r test`.
export default defineConfig({
  test: {
    include: ["scripts/**/*.test.ts"],
  },
});
