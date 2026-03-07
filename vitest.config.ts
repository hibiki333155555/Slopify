import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "packages/shared/src/**/*.ts",
        "apps/sync-server/src/**/*.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/index.ts",
        "apps/sync-server/src/db.ts",
      ],
    },
  },
});
