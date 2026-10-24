import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/sim/**/*.ts"],
      reporter: ["text", "html"],
      thresholds: { lines: 80 },
    },
  },
});
