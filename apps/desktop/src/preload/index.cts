import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi, SyncStatus } from "@slopify/shared";

const api: DesktopApi = {
  bootstrap: async () => await ipcRenderer.invoke("bootstrap"),
  completeSetup: async (input) => await ipcRenderer.invoke("complete-setup", input),
  updateSettings: async (input) => await ipcRenderer.invoke("update-settings", input),
  clearConnection: async () => await ipcRenderer.invoke("clear-connection"),

  listProjects: async () => await ipcRenderer.invoke("list-projects"),
  createProject: async (input) => await ipcRenderer.invoke("create-project", input),
  joinProject: async (input) => await ipcRenderer.invoke("join-project", input),
  createInvite: async (projectId) => await ipcRenderer.invoke("create-invite", projectId),

  openWorkspace: async (projectId) => await ipcRenderer.invoke("open-workspace", projectId),
  listMembers: async (projectId) => await ipcRenderer.invoke("list-members", projectId),
  listChannels: async (projectId) => await ipcRenderer.invoke("list-channels", projectId),
  createChannel: async (input) => await ipcRenderer.invoke("create-channel", input),
  renameChannel: async (input) => await ipcRenderer.invoke("rename-channel", input),

  listTimeline: async (filter) => await ipcRenderer.invoke("list-timeline", filter),
  postMessage: async (input) => await ipcRenderer.invoke("post-message", input),
  recordDecision: async (input) => await ipcRenderer.invoke("record-decision", input),
  createTask: async (input) => await ipcRenderer.invoke("create-task", input),
  setTaskStatus: async (input) => await ipcRenderer.invoke("set-task-status", input),

  listDocs: async (projectId) => await ipcRenderer.invoke("list-docs", projectId),
  createDoc: async (input) => await ipcRenderer.invoke("create-doc", input),
  renameDoc: async (input) => await ipcRenderer.invoke("rename-doc", input),
  updateDoc: async (input) => await ipcRenderer.invoke("update-doc", input),
  listDocComments: async (projectId, docId) => await ipcRenderer.invoke("list-doc-comments", projectId, docId),
  addDocComment: async (input) => await ipcRenderer.invoke("add-doc-comment", input),

  getSyncStatus: async () => await ipcRenderer.invoke("get-sync-status"),
  syncNow: async () => await ipcRenderer.invoke("sync-now"),

  onSyncStatus: (listener: (status: SyncStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: SyncStatus): void => {
      listener(status);
    };
    ipcRenderer.on("sync-status", handler);
    return () => ipcRenderer.off("sync-status", handler);
  },

  onWorkspaceChanged: (listener: (projectId: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { projectId: string }): void => {
      listener(payload.projectId);
    };
    ipcRenderer.on("workspace-changed", handler);
    return () => ipcRenderer.off("workspace-changed", handler);
  },
};

contextBridge.exposeInMainWorld("desktopApi", api);
