import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "composer-dom",
          environment: "jsdom",
          include: ["tests/jsdom/**/*.test.tsx"],
        },
      },
      {
        test: {
          name: "live-daemon",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          fileParallelism: false,
          testTimeout: 180_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
