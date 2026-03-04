import type { Client } from "../fixtures/electron.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function listProjects(client: Client) {
  return client.page.evaluate(async () => await window.desktopApi.listProjects());
}

export async function openWorkspace(client: Client, projectId: string) {
  return client.page.evaluate(async (pid) => await window.desktopApi.openWorkspace(pid), projectId);
}

export async function listTimeline(client: Client, projectId: string, channelId: string) {
  return client.page.evaluate(
    async ({ projectId, channelId }) =>
      await window.desktopApi.listTimeline({
        projectId,
        workspaceType: "chat",
        workspaceItemId: channelId,
      }),
    { projectId, channelId }
  );
}

export async function createProject(client: Client, name: string) {
  return client.page.evaluate(
    async (projectName) => await window.desktopApi.createProject({ name: projectName }),
    name
  );
}

export async function createInvite(client: Client, projectId: string) {
  return client.page.evaluate(async (pid) => await window.desktopApi.createInvite(pid), projectId);
}

export async function joinProject(client: Client, inviteCode: string) {
  return client.page.evaluate(
    async (code) => await window.desktopApi.joinProject({ inviteCode: code }),
    inviteCode
  );
}

export async function waitForTimelineText(
  client: Client,
  projectId: string,
  channelId: string,
  text: string,
  timeoutMs: number
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const timeline = await listTimeline(client, projectId, channelId);
    if (timeline.some((entry) => String(entry.timelineText).includes(text))) {
      return;
    }
    await sleep(250);
  }
  throw new Error(`${client.name}: timeout waiting for timeline text: ${text}`);
}

export async function ensureTimelineTextAbsentFor(
  client: Client,
  projectId: string,
  channelId: string,
  text: string,
  timeoutMs: number
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const timeline = await listTimeline(client, projectId, channelId);
    if (timeline.some((entry) => String(entry.timelineText).includes(text))) {
      throw new Error(`${client.name}: unexpected timeline text became visible: ${text}`);
    }
    await sleep(250);
  }
}
