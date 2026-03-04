import { _electron as electron } from 'playwright';
import electronPath from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repoRoot = '/Users/morihibiki/oss/Slopify';
const appEntry = path.join(repoRoot, 'apps/desktop/dist/main/main.js');
const rendererUrl = 'http://127.0.0.1:5173';
const runRoot = '/tmp/slopify-e2e-run';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}

async function getSyncStatus(page) {
  return Promise.race([
    page.evaluate(() => window.projectLog.sync.status()),
    sleep(3000).then(() => {
      throw new Error('sync.status timeout');
    })
  ]);
}

async function rmrf(target) {
  await fs.rm(target, { recursive: true, force: true });
}

async function launchClient(name, homeDir) {
  await fs.mkdir(homeDir, { recursive: true });
  const app = await electron.launch({
    executablePath: electronPath,
    args: [appEntry],
    cwd: repoRoot,
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: rendererUrl,
      HOME: homeDir,
      SLOPIFY_USER_DATA_DIR: path.join(homeDir, 'user-data')
    },
    timeout: 60000
  });
  const page = await app.firstWindow();
  page.on('console', (msg) => {
    console.log(`[${name}:console:${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    console.log(`[${name}:pageerror] ${err.stack ?? err.message}`);
  });
  await page.waitForLoadState('domcontentloaded');
  return { name, homeDir, app, page };
}

async function closeClient(client) {
  await Promise.race([
    client.app.close(),
    sleep(5000).then(() => {
      throw new Error(`${client.name}: close timeout`);
    })
  ]);
}

async function setupProfileIfNeeded(client, displayName) {
  const page = client.page;
  const startBtn = page.getByRole('button', { name: 'Start' });
  const appShell = page.locator('.app-shell');
  const started = Date.now();
  while (Date.now() - started < 60000) {
    if (await startBtn.isVisible().catch(() => false)) break;
    if (await appShell.isVisible().catch(() => false)) break;
    await sleep(250);
  }

  if (await startBtn.isVisible().catch(() => false)) {
    await page.getByLabel('Display Name').fill(displayName);
    await startBtn.click();
  }
  const shellVisible = await appShell.isVisible().catch(() => false);
  if (!shellVisible) {
    const url = page.url();
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const shot = `/tmp/${client.name.toLowerCase()}-bootstrap-fail.png`;
    await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
    throw new Error(`${client.name}: app shell not visible after bootstrap. url=${url} body=${JSON.stringify(bodyText)} screenshot=${shot}`);
  }
}

async function ensureSync(client, shouldConnect) {
  const page = client.page;
  const connectBtn = page.getByRole('button', { name: 'Connect' });
  const disconnectBtn = page.getByRole('button', { name: 'Disconnect' });

  const hasConnect = await connectBtn.isVisible().catch(() => false);
  const hasDisconnect = await disconnectBtn.isVisible().catch(() => false);

  if (shouldConnect) {
    if (hasConnect) {
      await connectBtn.click();
      const started = Date.now();
      while (Date.now() - started < 15000) {
        const status = await getSyncStatus(page);
        if (status.connected) {
          return;
        }
        if (await disconnectBtn.isVisible().catch(() => false)) {
          return;
        }
        await sleep(300);
      }
      const status = await getSyncStatus(page).catch(() => null);
      const errorBanner = await page.locator('.error-banner').innerText().catch(() => '');
      throw new Error(`${client.name}: failed to connect sync. status=${JSON.stringify(status)} error=${JSON.stringify(errorBanner)}`);
    } else if (!hasDisconnect) {
      throw new Error(`${client.name}: neither Connect nor Disconnect button visible`);
    }
  } else {
    if (hasDisconnect) {
      await disconnectBtn.click();
      const started = Date.now();
      while (Date.now() - started < 10000) {
        const status = await getSyncStatus(page);
        if (!status.connected) {
          return;
        }
        if (await connectBtn.isVisible().catch(() => false)) {
          return;
        }
        await sleep(300);
      }
      const status = await getSyncStatus(page).catch(() => null);
      throw new Error(`${client.name}: failed to disconnect sync. status=${JSON.stringify(status)}`);
    } else if (!hasConnect) {
      throw new Error(`${client.name}: neither Connect nor Disconnect button visible`);
    }
  }
}

async function createProject(client, name, description) {
  const page = client.page;
  await page.getByLabel('Project Name').fill(name);
  await page.getByLabel('Description').fill(description);
  await page.getByRole('button', { name: 'Create Project' }).click();
  await page.locator('.room-header h1').filter({ hasText: name }).waitFor({ timeout: 15000 });
}

async function selectComposerMode(client, modeName) {
  await client.page.locator('.composer-modes').getByRole('button', { name: modeName }).click();
}

async function sendMessage(client, body) {
  const page = client.page;
  await selectComposerMode(client, 'Message');
  await page.getByPlaceholder('Write a message').fill(body);
  await page.locator('.composer button[type="submit"]').click();
  await page.getByText(body).first().waitFor({ timeout: 15000 });
}

async function sendDecision(client, summary, note) {
  const page = client.page;
  await selectComposerMode(client, 'Decision');
  await page.getByPlaceholder('Decision summary').fill(summary);
  await page.getByPlaceholder('Note (optional)').fill(note);
  await page.locator('.composer button[type="submit"]').click();
  await page.getByText(summary).first().waitFor({ timeout: 15000 });
}

async function sendTask(client, title) {
  const page = client.page;
  await selectComposerMode(client, 'Task');
  await page.getByPlaceholder('Task title').fill(title);
  await page.locator('.composer button[type="submit"]').click();
  await page.getByText(title).first().waitFor({ timeout: 15000 });
}

async function completeTask(client, title) {
  const page = client.page;
  const taskCard = page.locator('.event-card.task', { hasText: title }).first();
  await taskCard.getByRole('button', { name: 'Complete' }).click();
  await page.getByText('Task completed').first().waitFor({ timeout: 15000 });
}

async function reopenTask(client) {
  const page = client.page;
  const reopenBtn = page.getByRole('button', { name: 'Reopen' }).first();
  await reopenBtn.click();
  await page.getByText('Task reopened').first().waitFor({ timeout: 15000 });
}

async function createInviteCode(client) {
  const page = client.page;
  await page.getByRole('button', { name: 'Create Invite Code' }).click();
  await sleep(600);
  const text = await page.locator('.room-header').innerText();
  const match = text.match(/\b[0-9A-HJKMNP-TV-Z]{10}\b/);
  if (!match) {
    throw new Error(`${client.name}: invite code not found in header text: ${text}`);
  }
  return match[0];
}

async function joinByInvite(client, code) {
  const page = client.page;
  await page.getByLabel('Invite Code').fill(code);
  await page.getByRole('button', { name: 'Join with Invite Code' }).click();
}

async function getCurrentProjectId(client) {
  return client.page.evaluate(async () => {
    const projects = await window.projectLog.projects.list('all');
    return projects[0]?.id ?? null;
  });
}

async function getRoomSummary(client, projectId) {
  return client.page.evaluate(async (pid) => window.projectLog.projects.roomSummary(pid), projectId);
}

async function assertTextVisible(client, text, timeout = 15000) {
  await client.page.getByText(text).first().waitFor({ timeout });
}

async function assertTextNotVisibleWithin(client, text, timeout = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await client.page.getByText(text).first().isVisible().catch(() => false)) {
      throw new Error(`${client.name}: text became visible unexpectedly within ${timeout}ms: ${text}`);
    }
    await sleep(250);
  }
}

async function main() {
  const errors = [];
  const homes = {
    a: path.join(runRoot, 'home-a'),
    b: path.join(runRoot, 'home-b')
  };

  await rmrf(runRoot);
  await fs.mkdir(runRoot, { recursive: true });

  let clientA;
  let clientB;
  const hardTimeout = setTimeout(() => {
    throw new Error('Global timeout exceeded (180000ms)');
  }, 180000);

  const marker = Date.now();
  const projectName = `E2E Project ${marker}`;
  const message1 = `Message from A ${marker}`;
  const decision1 = `Decision from A ${marker}`;
  const taskTitle = `Task from A ${marker}`;
  const rtAtoB = `Realtime A->B ${marker}`;
  const rtBtoA = `Realtime B->A ${marker}`;
  const offlineMsgB = `Offline B message ${marker}`;

  try {
    log('1', 'launch client A and setup profile');
    clientA = await launchClient('A', homes.a);
    await setupProfileIfNeeded(clientA, 'User A');
    await ensureSync(clientA, true);

    log('2-4', 'create project + message/decision/task + complete/reopen');
    await createProject(clientA, projectName, 'runtime e2e');
    await sendMessage(clientA, message1);
    await sendDecision(clientA, decision1, 'Decision note');
    await sendTask(clientA, taskTitle);
    await completeTask(clientA, taskTitle);
    await reopenTask(clientA);

    log('6-prep', 'create invite code');
    const inviteCode = await createInviteCode(clientA);
    log('6-prep', `invite code: ${inviteCode}`);

    log('5', 'restart client A and validate local persistence');
    await closeClient(clientA);
    clientA = await launchClient('A', homes.a);
    await setupProfileIfNeeded(clientA, 'User A');
    await ensureSync(clientA, true);
    await assertTextVisible(clientA, projectName);
    await assertTextVisible(clientA, message1);
    await assertTextVisible(clientA, decision1);
    await assertTextVisible(clientA, taskTitle);

    log('6', 'launch client B, setup profile, join via invite, validate hydration');
    clientB = await launchClient('B', homes.b);
    await setupProfileIfNeeded(clientB, 'User B');
    await ensureSync(clientB, true);
    await joinByInvite(clientB, inviteCode);
    await assertTextVisible(clientB, projectName);
    await assertTextVisible(clientB, message1);
    await assertTextVisible(clientB, decision1);
    await assertTextVisible(clientB, taskTitle);

    const bProjectId = await getCurrentProjectId(clientB);
    if (!bProjectId) {
      throw new Error('B: no project id after join');
    }
    const bSummary = await getRoomSummary(clientB, bProjectId);
    if (!Array.isArray(bSummary.members) || bSummary.members.length < 2) {
      const hydrationError = `B: expected at least 2 members after join, got ${JSON.stringify(bSummary.members)}`;
      errors.push(new Error(hydrationError));
      console.error(`[6] ${hydrationError}`);
    }

    log('7', 'validate realtime A -> B and B -> A');
    try {
      await sendMessage(clientA, rtAtoB);
      await assertTextVisible(clientB, rtAtoB, 15000);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    try {
      await sendMessage(clientB, rtBtoA);
      await assertTextVisible(clientA, rtBtoA, 15000);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    log('8', 'validate offline sync on B (disconnect, post, reconnect)');
    try {
      log('8', 'disconnecting B');
      await ensureSync(clientB, false);
      log('8', 'posting offline message from B');
      await sendMessage(clientB, offlineMsgB);
      log('8', 'assert A does not receive while B offline');
      await assertTextNotVisibleWithin(clientA, offlineMsgB, 4000);

      log('8', 'reconnecting B');
      await ensureSync(clientB, true);
      log('8', 'assert A receives after reconnect');
      await assertTextVisible(clientA, offlineMsgB, 20000);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    if (errors.length === 0) {
      console.log('RESULT:PASS');
    } else {
      console.log('RESULT:FAIL');
      for (const error of errors) {
        console.error(error.stack ?? String(error));
      }
      process.exitCode = 1;
    }
  } catch (error) {
    errors.push(error instanceof Error ? error : new Error(String(error)));
    console.error('RESULT:FAIL');
    for (const err of errors) {
      console.error(err.stack ?? String(err));
    }
    process.exitCode = 1;
  } finally {
    clearTimeout(hardTimeout);
    if (clientB) {
      await closeClient(clientB).catch(() => undefined);
    }
    if (clientA) {
      await closeClient(clientA).catch(() => undefined);
    }
  }
}

await main();
