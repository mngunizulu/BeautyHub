import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["artifacts/api-server/src/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 15000,
    coverage: { reportsDirectory: "generated-artifacts/coverage" },
  },
});
