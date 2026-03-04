import { ipcMain } from "electron";
import {
  createInviteInputSchema,
  inviteInfoSchema,
  joinInviteInputSchema,
  joinInviteResultSchema,
  projectMemberSchema,
  projectSchema,
  serverSyncEventSchema
} from "@slopify/shared";
import { z } from "zod";
import { LocalRepository } from "./repository.js";
import { DesktopSyncClient } from "./sync-client.js";

const joinSnapshotSchema = z.object({
  project: projectSchema,
  members: z.array(projectMemberSchema),
  events: z.array(serverSyncEventSchema)
});

export function registerIpcHandlers(repository: LocalRepository, syncClient: DesktopSyncClient): void {
  ipcMain.handle("profile:get", () => {
    return repository.getProfile();
  });

  ipcMain.handle("profile:setup", (_event, input) => {
    return repository.setupProfile(input);
  });

  ipcMain.handle("projects:list", (_event, status) => {
    const projects = repository.listProjects(status);
    return projects.map((project) => ({
      ...project,
      onlineCount: syncClient.getOnlineCount(project.id)
    }));
  });

  ipcMain.handle("projects:create", (_event, input) => {
    const project = repository.createProject(input);
    syncClient.refreshProjectSubscriptions();
    syncClient.flushPendingEvents();
    return project;
  });

  ipcMain.handle("projects:roomSummary", (_event, projectId) => {
    const summary = repository.getRoomSummary(projectId);
    return {
      ...summary,
      onlineCount: syncClient.getOnlineCount(projectId)
    };
  });

  ipcMain.handle("projects:openTasks", (_event, projectId) => {
    return repository.getOpenTasks(projectId);
  });

  ipcMain.handle("timeline:list", (_event, input) => {
    return repository.listTimeline(input);
  });

  ipcMain.handle("timeline:postMessage", (_event, input) => {
    const event = repository.postMessage(input);
    syncClient.flushPendingEvents();
    return event;
  });

  ipcMain.handle("timeline:recordDecision", (_event, input) => {
    const event = repository.recordDecision(input);
    syncClient.flushPendingEvents();
    return event;
  });

  ipcMain.handle("timeline:createTask", (_event, input) => {
    const event = repository.createTask(input);
    syncClient.flushPendingEvents();
    return event;
  });

  ipcMain.handle("timeline:completeTask", (_event, input) => {
    const event = repository.completeTask(input);
    syncClient.flushPendingEvents();
    return event;
  });

  ipcMain.handle("timeline:reopenTask", (_event, input) => {
    const event = repository.reopenTask(input);
    syncClient.flushPendingEvents();
    return event;
  });

  ipcMain.handle("timeline:markRead", (_event, input) => {
    repository.markRead(input);
  });

  ipcMain.handle("invite:create", async (_event, rawInput) => {
    const input = createInviteInputSchema.parse(rawInput);
    const syncConfig = repository.getSyncConfig();
    if (!syncConfig) {
      throw new Error("Profile setup is required before creating invites");
    }

    const response = await fetch(`${syncConfig.serverUrl}/invites`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        projectId: input.projectId,
        userId: syncConfig.userId,
        expiresInDays: input.expiresInDays
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Invite creation failed: ${text}`);
    }

    const payload = (await response.json()) as unknown;
    return inviteInfoSchema.parse(payload);
  });

  ipcMain.handle("invite:join", async (_event, rawInput) => {
    const input = joinInviteInputSchema.parse(rawInput);
    const syncConfig = repository.getSyncConfig();
    if (!syncConfig) {
      throw new Error("Profile setup is required before joining by invite");
    }

    const response = await fetch(`${syncConfig.serverUrl}/invites/join`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        code: input.code,
        userId: syncConfig.userId
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Invite join failed: ${text}`);
    }

    const payload = (await response.json()) as unknown;
    const snapshot = joinSnapshotSchema.parse(payload);
    const projectId = repository.importJoinedProjectSnapshot(snapshot);

    syncClient.refreshProjectSubscriptions();
    return joinInviteResultSchema.parse({ projectId });
  });

  ipcMain.handle("sync:connect", () => {
    return syncClient.connect();
  });

  ipcMain.handle("sync:disconnect", () => {
    return syncClient.disconnect();
  });

  ipcMain.handle("sync:status", () => {
    return syncClient.status();
  });
}
