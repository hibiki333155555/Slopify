import { test, expect } from "./fixtures/electron.js";
import { setupProfileViaUi, waitForSyncReady, serverUrl, serverAccessPassword } from "./helpers/client.js";
import {
  createProject,
  sendMessage,
  sendDecision,
  sendTask,
  completeTask,
  reopenTask,
  createInviteCode,
  joinByInvite,
  assertTextVisible,
  assertTextNotVisibleWithin,
} from "./helpers/ui-actions.js";

test("full UI E2E flow: create, sync, realtime, offline", async ({ launchClient }) => {
  const marker = Date.now();
  const projectName = `E2E Project ${marker}`;
  const message1 = `Message from A ${marker}`;
  const decision1 = `Decision from A ${marker}`;
  const taskTitle = `Task from A ${marker}`;
  const rtAtoB = `Realtime A->B ${marker}`;
  const rtBtoA = `Realtime B->A ${marker}`;
  const offlineMsgB = `Offline B message ${marker}`;

  let clientA = await test.step("launch client A and setup profile", async () => {
    const client = await launchClient("A");
    await setupProfileViaUi(client, "User A");
    await waitForSyncReady(client, 15_000);
    return client;
  });

  await test.step("create project + message/decision/task + complete/reopen", async () => {
    await createProject(clientA, projectName);
    await sendMessage(clientA, message1);
    await sendDecision(clientA, decision1, "Decision detail");
    await sendTask(clientA, taskTitle);
    await completeTask(clientA, taskTitle);
    await reopenTask(clientA, taskTitle);
  });

  const inviteCode = await test.step("create invite code", async () => {
    return createInviteCode(clientA);
  });

  clientA = await test.step("restart client A and validate local persistence", async () => {
    await clientA.app.close();
    const client = await launchClient("A");
    await setupProfileViaUi(client, "User A");
    await waitForSyncReady(client, 15_000);
    // Project should appear in project list
    await assertTextVisible(client, projectName);
    // Click into the project to see workspace content
    await client.page.getByText(projectName).first().click();
    await assertTextVisible(client, message1);
    await assertTextVisible(client, decision1);
    await assertTextVisible(client, taskTitle);
    return client;
  });

  const clientB = await test.step("launch client B, join via invite, validate hydration", async () => {
    const client = await launchClient("B");
    await setupProfileViaUi(client, "User B");
    await waitForSyncReady(client, 15_000);
    await joinByInvite(client, inviteCode);
    // After join, we're on projects screen — click into the project
    await assertTextVisible(client, projectName);
    await client.page.getByText(projectName).first().click();
    await assertTextVisible(client, message1);
    await assertTextVisible(client, decision1);
    await assertTextVisible(client, taskTitle);
    return client;
  });

  await test.step("validate realtime A -> B and B -> A", async () => {
    await sendMessage(clientA, rtAtoB);
    await assertTextVisible(clientB, rtAtoB, 15_000);

    await sendMessage(clientB, rtBtoA);
    await assertTextVisible(clientA, rtBtoA, 15_000);
  });

  await test.step("validate offline sync on B", async () => {
    // Disconnect B via API
    await clientB.page.evaluate(async () => {
      await window.desktopApi.clearConnection();
    });

    await sendMessage(clientB, offlineMsgB);
    await assertTextNotVisibleWithin(clientA, offlineMsgB, 4000);

    // Reconnect B via API
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
    await assertTextVisible(clientA, offlineMsgB, 20_000);
  });
});
