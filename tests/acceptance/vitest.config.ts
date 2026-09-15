import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/acceptance/**/*.acceptance.ts"],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
