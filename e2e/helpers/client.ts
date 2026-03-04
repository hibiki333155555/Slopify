import type { Client } from "../fixtures/electron.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const serverUrl = process.env["SLOPIFY_SERVER_URL"] ?? "http://127.0.0.1:4000";
const serverAccessPassword = process.env["SLOPIFY_SERVER_PASSWORD"] ?? "change-me";

/**
 * Setup profile via UI interactions (used by ui.spec.ts).
 * Waits for either the Continue button (setup screen) or projects-screen to appear.
 */
export async function setupProfileViaUi(client: Client, displayName: string): Promise<void> {
  const page = client.page;
  const continueBtn = page.getByRole("button", { name: "Continue" });
  const projectsScreen = page.locator(".projects-screen");

  const started = Date.now();
  while (Date.now() - started < 60_000) {
    if (await continueBtn.isVisible().catch(() => false)) break;
    if (await projectsScreen.isVisible().catch(() => false)) break;
    await sleep(250);
  }

  if (await continueBtn.isVisible().catch(() => false)) {
    await page.getByLabel("Display name").fill(displayName);
    await page.getByLabel("Server access password").fill(serverAccessPassword);
    await continueBtn.click();
  }

  await projectsScreen.waitFor({ timeout: 30_000 });
}

/**
 * Setup profile via desktopApi (used by runtime.spec.ts).
 * Calls completeSetup programmatically, returns bootstrap result.
 */
export async function setupProfileViaApi(client: Client, displayName: string) {
  return client.page.evaluate(
    async ({ displayName, serverUrl, serverAccessPassword }) => {
      const boot = await window.desktopApi.bootstrap();
      if (!boot.hasCompletedSetup) {
        await window.desktopApi.completeSetup({
          displayName,
          avatarUrl: "",
          serverUrl,
          serverAccessPassword,
        });
      }
      return await window.desktopApi.bootstrap();
    },
    { displayName, serverUrl, serverAccessPassword }
  );
}

/**
 * Polls desktopApi.getSyncStatus() until connected, authed, and subscribed.
 */
export async function waitForSyncReady(client: Client, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = await client.page.evaluate(async () => await window.desktopApi.getSyncStatus());
    if (status.connected && status.authed && status.subscribed) {
      return status;
    }
    await sleep(250);
  }
  const status = await client.page.evaluate(async () => await window.desktopApi.getSyncStatus());
  throw new Error(`${client.name}: sync readiness timeout status=${JSON.stringify(status)}`);
}

export { serverUrl, serverAccessPassword };
