import type { Client } from "../fixtures/electron.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function createProject(client: Client, name: string): Promise<void> {
  const page = client.page;
  await page.getByPlaceholder("Project name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  // After creation we stay on projects screen — click into the project
  await page.getByText(name).first().waitFor({ timeout: 15_000 });
  await page.getByText(name).first().click();
  // Wait for workspace screen
  await page.locator(".workspace-screen").waitFor({ timeout: 15_000 });
}

export async function sendMessage(client: Client, body: string): Promise<void> {
  const page = client.page;
  await page.getByPlaceholder("Type a message").fill(body);
  await page.getByPlaceholder("Type a message").press("Enter");
  await page.getByText(body).first().waitFor({ timeout: 15_000 });
}

export async function sendDecision(client: Client, title: string, detail: string): Promise<void> {
  const page = client.page;
  await page.getByPlaceholder("Decision title").fill(title);
  await page.getByPlaceholder("Decision detail").fill(detail);
  await page.getByRole("button", { name: "Record decision" }).click();
  await page.getByText(title).first().waitFor({ timeout: 15_000 });
}

export async function sendTask(client: Client, title: string): Promise<void> {
  const page = client.page;
  await page.getByPlaceholder("Task title").fill(title);
  await page.getByRole("button", { name: "Create task" }).click();
  await page.getByText(title).first().waitFor({ timeout: 15_000 });
}

export async function completeTask(client: Client, title: string): Promise<void> {
  const page = client.page;
  // Tasks use checkbox inputs within a label containing the title
  const taskItem = page.locator(".task-list li").filter({ hasText: title }).first();
  await taskItem.getByRole("checkbox").check();
}

export async function reopenTask(client: Client, title: string): Promise<void> {
  const page = client.page;
  const taskItem = page.locator(".task-list li").filter({ hasText: title }).first();
  await taskItem.getByRole("checkbox").uncheck();
}

export async function createInviteCode(client: Client): Promise<string> {
  const page = client.page;
  await page.getByRole("button", { name: "Create Invite" }).click();
  // Invite code appears in a pill: "Invite: XXXXXXXXXX"
  const pill = page.locator(".pill").filter({ hasText: "Invite:" });
  await pill.waitFor({ timeout: 15_000 });
  const text = await pill.innerText();
  const match = text.match(/Invite:\s*(\S+)/);
  if (!match) {
    throw new Error(`${client.name}: invite code not found in pill text: ${text}`);
  }
  return match[1]!;
}

export async function joinByInvite(client: Client, code: string): Promise<void> {
  const page = client.page;
  await page.getByRole("button", { name: "Join with invite" }).click();
  await page.getByPlaceholder("Invite code").fill(code);
  await page.getByRole("button", { name: "Join", exact: true }).click();
}

export async function assertTextVisible(client: Client, text: string, timeout = 15_000): Promise<void> {
  await client.page.getByText(text).first().waitFor({ timeout });
}

export async function assertTextNotVisibleWithin(client: Client, text: string, timeout = 3000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await client.page.getByText(text).first().isVisible().catch(() => false)) {
      throw new Error(`${client.name}: text became visible unexpectedly within ${timeout}ms: ${text}`);
    }
    await sleep(250);
  }
}
