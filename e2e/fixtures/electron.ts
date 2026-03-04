import { test as base, expect } from "@playwright/test";
import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import electronPath from "electron";
import fs from "node:fs/promises";
import path from "node:path";

// Playwright transpiles TS as CJS, so use process.cwd() (always run from repo root)
const repoRoot = process.cwd();
const appEntry = path.join(repoRoot, "apps/desktop/dist/main/main.js");
const rendererUrl = process.env["SLOPIFY_RENDERER_URL"] ?? "http://127.0.0.1:5173";

export type Client = {
  name: string;
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
};

export type LaunchClientFn = (name: string) => Promise<Client>;

export type ElectronFixtures = {
  repoRoot: string;
  runRoot: string;
  launchClient: LaunchClientFn;
};

export const test = base.extend<ElectronFixtures>({
  repoRoot: async ({}, use) => {
    await use(repoRoot);
  },

  runRoot: async ({}, use) => {
    const dir = path.join(repoRoot, ".tmp-e2e", `run-${Date.now()}`);
    await fs.mkdir(dir, { recursive: true });
    await use(dir);
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  },

  launchClient: async ({ runRoot }, use) => {
    const clients: Client[] = [];

    const factory: LaunchClientFn = async (name) => {
      const userDataDir = path.join(runRoot, `home-${name.toLowerCase()}`);
      await fs.mkdir(userDataDir, { recursive: true });

      const app = await electron.launch({
        executablePath: electronPath as unknown as string,
        args: ["--no-sandbox", "--disable-gpu", appEntry],
        cwd: repoRoot,
        env: {
          ...process.env,
          ELECTRON_RENDERER_URL: rendererUrl,
          SLOPIFY_USER_DATA_DIR: userDataDir,
        },
        timeout: 60_000,
      });

      const page = await app.firstWindow();
      page.setDefaultTimeout(120_000);

      page.on("console", (msg) => {
        console.log(`[${name}:console:${msg.type()}] ${msg.text()}`);
      });
      page.on("pageerror", (err) => {
        console.log(`[${name}:pageerror] ${err.stack ?? err.message}`);
      });

      await page.waitForLoadState("domcontentloaded");

      const client: Client = { name, app, page, userDataDir };
      clients.push(client);
      return client;
    };

    await use(factory);

    // Teardown: close all launched clients
    for (const client of clients) {
      await client.app.close().catch(() => undefined);
    }
  },
});

export { expect };
