import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { DesktopApi } from "@slopify/shared";

const api: DesktopApi = {
  profile: {
    get: () => ipcRenderer.invoke("profile:get"),
    setup: (input) => ipcRenderer.invoke("profile:setup", input)
  },
  projects: {
    list: (status = "all") => ipcRenderer.invoke("projects:list", status),
    create: (input) => ipcRenderer.invoke("projects:create", input),
    roomSummary: (projectId) => ipcRenderer.invoke("projects:roomSummary", projectId),
    openTasks: (projectId) => ipcRenderer.invoke("projects:openTasks", projectId)
  },
  timeline: {
    list: (input) => ipcRenderer.invoke("timeline:list", input),
    postMessage: (input) => ipcRenderer.invoke("timeline:postMessage", input),
    recordDecision: (input) => ipcRenderer.invoke("timeline:recordDecision", input),
    createTask: (input) => ipcRenderer.invoke("timeline:createTask", input),
    completeTask: (input) => ipcRenderer.invoke("timeline:completeTask", input),
    reopenTask: (input) => ipcRenderer.invoke("timeline:reopenTask", input),
    markRead: (input) => ipcRenderer.invoke("timeline:markRead", input)
  },
  invite: {
    create: (input) => ipcRenderer.invoke("invite:create", input),
    join: (input) => ipcRenderer.invoke("invite:join", input)
  },
  sync: {
    connect: () => ipcRenderer.invoke("sync:connect"),
    disconnect: () => ipcRenderer.invoke("sync:disconnect"),
    status: () => ipcRenderer.invoke("sync:status"),
    onUpdated: (listener) => {
      const wrapped = (_event: IpcRendererEvent, payload: unknown) => {
        if (
          typeof payload === "object" &&
          payload !== null &&
          "projectId" in payload &&
          typeof (payload as { projectId: unknown }).projectId === "string"
        ) {
          listener({ projectId: (payload as { projectId: string }).projectId });
        }
      };
      ipcRenderer.on("sync:updated", wrapped);
      return () => {
        ipcRenderer.off("sync:updated", wrapped);
      };
    }
  }
};

contextBridge.exposeInMainWorld("projectLog", api);
