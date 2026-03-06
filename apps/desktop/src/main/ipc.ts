import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BrowserWindow, clipboard, ipcMain } from "electron";
import type {
  AddDocCommentCommand,
  AddReactionCommand,
  CreateChatChannelCommand,
  CreateDocCommand,
  CreateProjectCommand,
  CreateTaskCommand,
  DeleteMessageCommand,
  EditMessageCommand,
  JoinProjectCommand,
  PostMessageCommand,
  RecordDecisionCommand,
  RenameChatChannelCommand,
  RemoveReactionCommand,
  RenameDocCommand,
  SetupCommand,
  TimelineFilter,
  UpdateDocCommand,
  UpdateSettingsCommand,
  UpdateTaskStatusCommand,
} from "@slopify/shared";
import type { DesktopRepository } from "./repository.js";

const sendToAll = (channel: string, payload: unknown): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload);
  }
};

export const registerIpcHandlers = (repository: DesktopRepository): void => {
  ipcMain.handle("bootstrap", async () => await repository.bootstrap());
  ipcMain.handle("complete-setup", async (_event, input: SetupCommand) => await repository.completeSetup(input));
  ipcMain.handle("update-settings", async (_event, input: UpdateSettingsCommand) => await repository.updateSettings(input));
  ipcMain.handle("clear-connection", async () => await repository.clearConnection());

  ipcMain.handle("list-projects", async () => await repository.listProjects());
  ipcMain.handle("create-project", async (_event, input: CreateProjectCommand) => await repository.createProject(input));
  ipcMain.handle("join-project", async (_event, input: JoinProjectCommand) => await repository.joinProject(input));
  ipcMain.handle("create-invite", async (_event, projectId: string) => await repository.createInvite(projectId));
  ipcMain.handle("leave-project", async (_event, projectId: string) => await repository.leaveProject(projectId));

  ipcMain.handle("open-workspace", async (_event, projectId: string) => await repository.openWorkspace(projectId));
  ipcMain.handle("list-members", async (_event, projectId: string) => await repository.listMembers(projectId));
  ipcMain.handle("list-channels", async (_event, projectId: string) => await repository.listChannels(projectId));
  ipcMain.handle("create-channel", async (_event, input: CreateChatChannelCommand) => await repository.createChannel(input));
  ipcMain.handle("rename-channel", async (_event, input: RenameChatChannelCommand) => await repository.renameChannel(input));

  ipcMain.handle("list-timeline", async (_event, filter: TimelineFilter) => await repository.listTimeline(filter));
  ipcMain.handle("post-message", async (_event, input: PostMessageCommand) => await repository.postMessage(input));
  ipcMain.handle("edit-message", async (_event, input: EditMessageCommand) => await repository.editMessage(input));
  ipcMain.handle("delete-message", async (_event, input: DeleteMessageCommand) => await repository.deleteMessage(input));
  ipcMain.handle("add-reaction", async (_event, input: AddReactionCommand) => await repository.addReaction(input));
  ipcMain.handle("remove-reaction", async (_event, input: RemoveReactionCommand) => await repository.removeReaction(input));
  ipcMain.handle("record-decision", async (_event, input: RecordDecisionCommand) => await repository.recordDecision(input));
  ipcMain.handle("create-task", async (_event, input: CreateTaskCommand) => await repository.createTask(input));
  ipcMain.handle("set-task-status", async (_event, input: UpdateTaskStatusCommand) => await repository.setTaskStatus(input));

  ipcMain.handle("list-docs", async (_event, projectId: string) => await repository.listDocs(projectId));
  ipcMain.handle("create-doc", async (_event, input: CreateDocCommand) => await repository.createDoc(input));
  ipcMain.handle("rename-doc", async (_event, input: RenameDocCommand) => await repository.renameDoc(input));
  ipcMain.handle("update-doc", async (_event, input: UpdateDocCommand) => await repository.updateDoc(input));
  ipcMain.handle("list-doc-comments", async (_event, projectId: string, docId: string) =>
    await repository.listDocComments(projectId, docId),
  );
  ipcMain.handle("add-doc-comment", async (_event, input: AddDocCommentCommand) => await repository.addDocComment(input));

  ipcMain.handle("test-notification", () => {
    sendToAll("notification", { title: "Slopify", body: "Test notification!" });
  });
  ipcMain.handle("get-presence", async (_event, projectId: string) => await repository.getPresence(projectId));
  ipcMain.handle("update-presence", (_event, status: "online" | "away") => repository.updatePresence(status));
  ipcMain.handle("get-sync-status", async () => await repository.getSyncStatus());
  ipcMain.handle("sync-now", async () => await repository.syncNow());
  ipcMain.handle("read-clipboard-image", () => {
    // Try Electron native clipboard first
    const img = clipboard.readImage();
    if (!img.isEmpty()) return img.toDataURL();

    // WSL2 fallback: read Windows clipboard via PowerShell script
    try {
      const scriptPath = path.join(os.tmpdir(), "slopify-clipboard.ps1");
      fs.writeFileSync(
        scriptPath,
        `Add-Type -AssemblyName System.Windows.Forms
$img = [System.Windows.Forms.Clipboard]::GetImage()
if ($img) {
  $ms = New-Object System.IO.MemoryStream
  $img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  [Convert]::ToBase64String($ms.ToArray())
}`,
      );
      const b64 = execSync(
        `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w '${scriptPath}')"`,
        { encoding: "utf8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] },
      ).trim();
      if (b64.length > 0) return `data:image/png;base64,${b64}`;
    } catch {
      // PowerShell not available or no image
    }
    return null;
  });

  repository.onSyncStatus((status) => {
    sendToAll("sync-status", status);
  });

  repository.onWorkspaceChanged((projectId) => {
    sendToAll("workspace-changed", { projectId });
  });

  repository.onPresenceChanged((presence) => {
    sendToAll("presence-changed", presence);
  });
};
