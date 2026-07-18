import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["benchmarks/**/*.benchmark.test.ts"],
    testTimeout: 0,
    hookTimeout: 0,
    fileParallelism: false
  }
});