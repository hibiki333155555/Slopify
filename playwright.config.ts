import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  workers: 1,
  retries: 0,
  reporter: "list",
  projects: [
    {
      name: "ui",
      testMatch: "ui.spec.ts",
    },
    {
      name: "runtime",
      testMatch: "runtime.spec.ts",
    },
  ],
});
