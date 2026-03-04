import { _electron as electron } from 'playwright';
import electronPath from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repoRoot = '/Users/morihibiki/oss/Slopify';
const appEntry = path.join(repoRoot, 'apps/desktop/dist/main/main.js');
const runRoot = '/tmp/slopify-runtime-v2';
const serverUrl = 'http://127.0.0.1:4000';
const serverAccessPassword = 'change-me';
const rendererUrl = 'http://127.0.0.1:5173';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function launchClient(name, userDataDir) {
  await fs.mkdir(userDataDir, { recursive: true });
  const app = await electron.launch({
    executablePath: electronPath,
    args: [appEntry],
    cwd: repoRoot,
    env: {
      ...process.env,
      SLOPIFY_USER_DATA_DIR: userDataDir,
      ELECTRON_RENDERER_URL: rendererUrl,
    },
    timeout: 60000,
  });

  const page = await app.firstWindow();
  page.setDefaultTimeout(120000);
  page.on('console', (msg) => {
    console.log(`[${name}:console:${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    console.log(`[${name}:pageerror] ${err.stack ?? err.message}`);
  });

  await page.waitForLoadState('domcontentloaded');
  return { name, app, page, userDataDir };
}

async function closeClient(client) {
  await client.app.close();
}

async function setupProfileIfNeeded(client, displayName) {
  return client.page.evaluate(
    async ({ displayName, serverUrl, serverAccessPassword }) => {
      const boot = await window.desktopApi.bootstrap();
      if (!boot.hasCompletedSetup) {
        await window.desktopApi.completeSetup({
          displayName,
          avatarUrl: '',
          serverUrl,
          serverAccessPassword,
        });
      }
      return await window.desktopApi.bootstrap();
    },
    { displayName, serverUrl, serverAccessPassword },
  );
}

async function waitForSyncReady(client, timeoutMs) {
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

async function listProjects(client) {
  return client.page.evaluate(async () => await window.desktopApi.listProjects());
}

async function openWorkspace(client, projectId) {
  return client.page.evaluate(async (pid) => await window.desktopApi.openWorkspace(pid), projectId);
}

async function listTimeline(client, projectId, channelId) {
  return client.page.evaluate(
    async ({ projectId, channelId }) =>
      await window.desktopApi.listTimeline({
        projectId,
        workspaceType: 'chat',
        workspaceItemId: channelId,
      }),
    { projectId, channelId },
  );
}

async function waitForTimelineText(client, projectId, channelId, text, timeoutMs) {
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

async function ensureTimelineTextAbsentFor(client, projectId, channelId, text, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const timeline = await listTimeline(client, projectId, channelId);
    if (timeline.some((entry) => String(entry.timelineText).includes(text))) {
      throw new Error(`${client.name}: unexpected timeline text became visible: ${text}`);
    }
    await sleep(250);
  }
}

async function createProject(client, name) {
  return client.page.evaluate(async (projectName) => await window.desktopApi.createProject({ name: projectName }), name);
}

async function createInvite(client, projectId) {
  return client.page.evaluate(async (pid) => await window.desktopApi.createInvite(pid), projectId);
}

async function joinProject(client, inviteCode) {
  return client.page.evaluate(async (code) => await window.desktopApi.joinProject({ inviteCode: code }), inviteCode);
}

async function main() {
  const marker = Date.now();
  const homes = {
    a: path.join(runRoot, 'client-a'),
    b: path.join(runRoot, 'client-b'),
  };

  const messageA = `Message A ${marker}`;
  const decisionTitle = `Decision A ${marker}`;
  const decisionBody = `Decision body ${marker}`;
  const taskTitle = `Task A ${marker}`;
  const realtimeA = `Realtime A->B ${marker}`;
  const realtimeB = `Realtime B->A ${marker}`;
  const offlineB = `Offline B ${marker}`;

  await fs.rm(runRoot, { recursive: true, force: true });
  await fs.mkdir(runRoot, { recursive: true });

  let clientA;
  let clientB;

  try {
    log('2', 'Start desktop app A and complete first-launch setup');
    clientA = await launchClient('A', homes.a);
    const bootA = await setupProfileIfNeeded(clientA, 'User A');
    assert(bootA.hasCompletedSetup === true, 'A setup did not complete');
    await waitForSyncReady(clientA, 15000);

    log('3', 'Create project + post Message/Decision/Task from A');
    const project = await createProject(clientA, `Runtime Project ${marker}`);
    const projectId = project.projectId;
    const wsA0 = await openWorkspace(clientA, projectId);
    const channelId = wsA0.workspace.channels[0]?.chatChannelId;
    assert(typeof channelId === 'string' && channelId.length > 0, 'A channel missing after project create');

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
      { projectId, channelId, messageA, decisionTitle, decisionBody, taskTitle },
    );

    const wsA1 = await openWorkspace(clientA, projectId);
    const createdTask = wsA1.workspace.tasks.find((task) => task.title === taskTitle);
    assert(createdTask, 'Task was not created');

    log('4', 'Complete then reopen task on A');
    await clientA.page.evaluate(
      async ({ projectId, taskId }) => {
        await window.desktopApi.setTaskStatus({ projectId, taskId, completed: true });
        await window.desktopApi.setTaskStatus({ projectId, taskId, completed: false });
      },
      { projectId, taskId: createdTask.taskId },
    );

    const wsA2 = await openWorkspace(clientA, projectId);
    const reopenedTask = wsA2.workspace.tasks.find((task) => task.taskId === createdTask.taskId);
    assert(reopenedTask && reopenedTask.completed === false, 'Task did not reopen');

    const invite = await createInvite(clientA, projectId);
    assert(invite.inviteCode.length > 0, 'Invite code missing');

    log('5', 'Restart A and verify local-first history persistence');
    await closeClient(clientA);
    clientA = await launchClient('A', homes.a);
    await setupProfileIfNeeded(clientA, 'User A');
    await waitForSyncReady(clientA, 15000);

    const projectsAfterRestart = await listProjects(clientA);
    assert(projectsAfterRestart.some((p) => p.projectId === projectId), 'A missing project after restart');
    const timelineAfterRestart = await listTimeline(clientA, projectId, channelId);
    assert(timelineAfterRestart.some((entry) => String(entry.timelineText).includes(messageA)), 'A missing message after restart');
    assert(timelineAfterRestart.some((entry) => String(entry.timelineText).includes(decisionTitle)), 'A missing decision after restart');

    log('6', 'Launch B, setup, join by invite, verify project/member/history hydration');
    clientB = await launchClient('B', homes.b);
    const bootB = await setupProfileIfNeeded(clientB, 'User B');
    assert(bootB.hasCompletedSetup === true, 'B setup did not complete');
    await waitForSyncReady(clientB, 15000);

    const joined = await joinProject(clientB, invite.inviteCode);
    assert(joined.projectId === projectId, `B joined wrong project: ${joined.projectId}`);

    const wsB0 = await openWorkspace(clientB, projectId);
    const channelIdB = wsB0.workspace.channels[0]?.chatChannelId;
    assert(channelIdB === channelId, 'B channel mismatch after hydration');
    assert(wsB0.workspace.members.length >= 2, `B members not hydrated: ${wsB0.workspace.members.length}`);

    const timelineB0 = await listTimeline(clientB, projectId, channelId);
    assert(timelineB0.some((entry) => String(entry.timelineText).includes(messageA)), 'B missing hydrated message');
    assert(timelineB0.some((entry) => String(entry.timelineText).includes(decisionTitle)), 'B missing hydrated decision');

    log('7', 'Validate realtime A<->B');
    await clientA.page.evaluate(
      async ({ projectId, channelId, realtimeA }) => {
        await window.desktopApi.postMessage({ projectId, chatChannelId: channelId, body: realtimeA });
      },
      { projectId, channelId, realtimeA },
    );
    await waitForTimelineText(clientB, projectId, channelId, realtimeA, 15000);

    await clientB.page.evaluate(
      async ({ projectId, channelId, realtimeB }) => {
        await window.desktopApi.postMessage({ projectId, chatChannelId: channelId, body: realtimeB });
      },
      { projectId, channelId, realtimeB },
    );
    await waitForTimelineText(clientA, projectId, channelId, realtimeB, 15000);

    log('8', 'Validate offline sync for B (disconnect, post local, reconnect, pull/apply)');
    await clientB.page.evaluate(async () => {
      await window.desktopApi.clearConnection();
    });

    await clientB.page.evaluate(
      async ({ projectId, channelId, offlineB }) => {
        await window.desktopApi.postMessage({ projectId, chatChannelId: channelId, body: offlineB });
      },
      { projectId, channelId, offlineB },
    );

    await waitForTimelineText(clientB, projectId, channelId, offlineB, 3000);
    await ensureTimelineTextAbsentFor(clientA, projectId, channelId, offlineB, 4000);

    await clientB.page.evaluate(
      async ({ serverUrl, serverAccessPassword }) => {
        await window.desktopApi.completeSetup({
          displayName: 'User B',
          avatarUrl: '',
          serverUrl,
          serverAccessPassword,
        });
      },
      { serverUrl, serverAccessPassword },
    );
    await waitForSyncReady(clientB, 20000);

    await waitForTimelineText(clientA, projectId, channelId, offlineB, 20000);

    console.log('RESULT:PASS');
  } catch (error) {
    console.log('RESULT:FAIL');
    console.error(error?.stack ?? String(error));
    process.exitCode = 1;
  } finally {
    if (clientB) {
      await closeClient(clientB).catch(() => undefined);
    }
    if (clientA) {
      await closeClient(clientA).catch(() => undefined);
    }
  }
}

await main();
