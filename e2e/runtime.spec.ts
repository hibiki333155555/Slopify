import { test, expect } from "./fixtures/electron.js";
import { setupProfileViaApi, waitForSyncReady, serverUrl, serverAccessPassword } from "./helpers/client.js";
import {
  listProjects,
  openWorkspace,
  listTimeline,
  createProject,
  createInvite,
  joinProject,
  waitForTimelineText,
  ensureTimelineTextAbsentFor,
} from "./helpers/api-actions.js";

test("full API E2E flow: create, sync, realtime, offline", async ({ launchClient }) => {
  const marker = Date.now();
  const messageA = `Message A ${marker}`;
  const decisionTitle = `Decision A ${marker}`;
  const decisionBody = `Decision body ${marker}`;
  const taskTitle = `Task A ${marker}`;
  const realtimeA = `Realtime A->B ${marker}`;
  const realtimeB = `Realtime B->A ${marker}`;
  const offlineB = `Offline B ${marker}`;

  let clientA = await test.step("launch client A and complete setup", async () => {
    const client = await launchClient("A");
    const boot = await setupProfileViaApi(client, "User A");
    expect(boot.hasCompletedSetup).toBe(true);
    await waitForSyncReady(client, 15_000);
    return client;
  });

  const { projectId, channelId } = await test.step("create project and post message/decision/task", async () => {
    const project = await createProject(clientA, `Runtime Project ${marker}`);
    const projectId = project.projectId;
    const ws = await openWorkspace(clientA, projectId);
    const channelId = ws.workspace.channels[0]?.chatChannelId;
    expect(channelId).toBeTruthy();

    await clientA.page.evaluate(
      async ({ projectId, channelId, messageA, decisionTitle, decisionBody, taskTitle }) => {
        await window.desktopApi.postMessage({ projectId, chatChannelId: channelId, body: messageA });
        await window.desktopApi.recordDecision({
          projectId,
          chatChannelId: channelId,
          title: decisionTitle,
          body: decisionBody,
        });
        await window.desktopApi.createTask({ projectId, chatChannelId: channelId, title: taskTitle });
      },
      { projectId, channelId: channelId!, messageA, decisionTitle, decisionBody, taskTitle }
    );

    return { projectId, channelId: channelId! };
  });

  await test.step("complete then reopen task", async () => {
    const ws = await openWorkspace(clientA, projectId);
    const createdTask = ws.workspace.tasks.find((t) => t.title === taskTitle);
    expect(createdTask).toBeTruthy();

    await clientA.page.evaluate(
      async ({ projectId, taskId }) => {
        await window.desktopApi.setTaskStatus({ projectId, taskId, completed: true });
        await window.desktopApi.setTaskStatus({ projectId, taskId, completed: false });
      },
      { projectId, taskId: createdTask!.taskId }
    );

    const ws2 = await openWorkspace(clientA, projectId);
    const reopenedTask = ws2.workspace.tasks.find((t) => t.taskId === createdTask!.taskId);
    expect(reopenedTask?.completed).toBe(false);
  });

  const inviteCode = await test.step("create invite", async () => {
    const invite = await createInvite(clientA, projectId);
    expect(invite.inviteCode.length).toBeGreaterThan(0);
    return invite.inviteCode;
  });

  clientA = await test.step("restart A and verify persistence", async () => {
    await clientA.app.close();
    const client = await launchClient("A");
    await setupProfileViaApi(client, "User A");
    await waitForSyncReady(client, 15_000);

    const projects = await listProjects(client);
    expect(projects.some((p) => p.projectId === projectId)).toBe(true);

    const timeline = await listTimeline(client, projectId, channelId);
    expect(timeline.some((e) => String(e.timelineText).includes(messageA))).toBe(true);
    expect(timeline.some((e) => String(e.timelineText).includes(decisionTitle))).toBe(true);

    return client;
  });

  const clientB = await test.step("launch B, join project, verify hydration", async () => {
    const client = await launchClient("B");
    const boot = await setupProfileViaApi(client, "User B");
    expect(boot.hasCompletedSetup).toBe(true);
    await waitForSyncReady(client, 15_000);

    const joined = await joinProject(client, inviteCode);
    expect(joined.projectId).toBe(projectId);

    const ws = await openWorkspace(client, projectId);
    expect(ws.workspace.channels[0]?.chatChannelId).toBe(channelId);
    expect(ws.workspace.members.length).toBeGreaterThanOrEqual(2);

    const timeline = await listTimeline(client, projectId, channelId);
    expect(timeline.some((e) => String(e.timelineText).includes(messageA))).toBe(true);
    expect(timeline.some((e) => String(e.timelineText).includes(decisionTitle))).toBe(true);

    return client;
  });

  await test.step("validate realtime A<->B", async () => {
    await clientA.page.evaluate(
      async ({ projectId, channelId, realtimeA }) => {
        await window.desktopApi.postMessage({ projectId, chatChannelId: channelId, body: realtimeA });
      },
      { projectId, channelId, realtimeA }
    );
    await waitForTimelineText(clientB, projectId, channelId, realtimeA, 15_000);

    await clientB.page.evaluate(
      async ({ projectId, channelId, realtimeB }) => {
        await window.desktopApi.postMessage({ projectId, chatChannelId: channelId, body: realtimeB });
      },
      { projectId, channelId, realtimeB }
    );
    await waitForTimelineText(clientA, projectId, channelId, realtimeB, 15_000);
  });

  await test.step("validate offline sync for B", async () => {
    await clientB.page.evaluate(async () => {
      await window.desktopApi.clearConnection();
    });

    await clientB.page.evaluate(
      async ({ projectId, channelId, offlineB }) => {
        await window.desktopApi.postMessage({ projectId, chatChannelId: channelId, body: offlineB });
      },
      { projectId, channelId, offlineB }
    );

    await waitForTimelineText(clientB, projectId, channelId, offlineB, 3000);
    await ensureTimelineTextAbsentFor(clientA, projectId, channelId, offlineB, 4000);

    await clientB.page.evaluate(
      async ({ serverUrl, serverAccessPassword }) => {
        await window.desktopApi.completeSetup({
          displayName: "User B",
          avatarUrl: "",
          serverUrl,
          serverAccessPassword,
        });
      },
      { serverUrl, serverAccessPassword }
    );
    await waitForSyncReady(clientB, 20_000);

    await waitForTimelineText(clientA, projectId, channelId, offlineB, 20_000);
  });
});
