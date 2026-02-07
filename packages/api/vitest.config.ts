import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 15_000,
    hookTimeout: 30_000,
    globalSetup: ["../bot/src/__tests__/global-setup.ts"],
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
  },
});
