import { create } from "zustand";
import type {
  Bootstrap,
  CreateDocCommand,
  CreateTaskCommand,
  Doc,
  DocComment,
  OpenWorkspaceResult,
  ProjectSummary,
  SetupCommand,
  SyncStatus,
  TimelineEvent,
  UpdateSettingsCommand,
  WorkspaceState,
} from "@slopify/shared";

type Screen = "loading" | "setup" | "projects" | "workspace" | "settings";

type WorkspaceViewState = {
  projectId: string;
  data: WorkspaceState;
  timeline: TimelineEvent[];
  docComments: Record<string, DocComment[]>;
  selectedType: "chat" | "doc";
  selectedItemId: string;
};

type AppState = {
  screen: Screen;
  bootstrap: Bootstrap | null;
  projects: ProjectSummary[];
  activeWorkspace: WorkspaceViewState | null;
  syncStatus: SyncStatus;
  loading: boolean;
  error: string | null;
  inviteCode: string | null;
  inAppNotification: { title: string; body: string; id: number } | null;

  initialize: () => Promise<void>;
  completeSetup: (input: SetupCommand) => Promise<void>;
  updateSettings: (input: UpdateSettingsCommand) => Promise<void>;
  clearConnection: () => Promise<void>;

  refreshProjects: () => Promise<void>;
  createProject: (name: string) => Promise<void>;
  joinProject: (inviteCode: string) => Promise<void>;
  openProject: (projectId: string) => Promise<void>;
  createInvite: () => Promise<void>;
  leaveProject: (projectId: string) => Promise<void>;

  selectChatChannel: (chatChannelId: string) => Promise<void>;
  selectDoc: (docId: string) => Promise<void>;
  createChannel: (name: string) => Promise<void>;

  postMessage: (body: string, imageDataUrl?: string, replyToEventId?: string) => Promise<void>;
  editMessage: (messageEventId: string, body: string) => Promise<void>;
  deleteMessage: (messageEventId: string) => Promise<void>;
  addReaction: (messageEventId: string, emoji: string) => Promise<void>;
  removeReaction: (messageEventId: string, emoji: string) => Promise<void>;
  recordDecision: (text: string) => Promise<void>;
  createTask: (title: string) => Promise<void>;
  setTaskStatus: (taskId: string, completed: boolean) => Promise<void>;

  createDoc: (input: Omit<CreateDocCommand, "projectId">) => Promise<void>;
  renameDoc: (docId: string, title: string) => Promise<void>;
  updateDoc: (docId: string, markdown: string) => Promise<void>;
  addDocComment: (docId: string, body: string) => Promise<void>;

  navigateProjects: () => void;
  navigateSettings: () => void;
  dismissError: () => void;
};

const initialSyncStatus: SyncStatus = {
  pendingCount: 0,
  lastPulledAt: null,
  connected: false,
  authed: false,
  subscribed: false,
  lastPulledSeq: 0,
  lastError: null,
};

const withBusy = async (
  set: (partial: Partial<AppState>) => void,
  task: () => Promise<void>,
): Promise<void> => {
  set({ loading: true, error: null });
  try {
    await task();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    set({ error: message });
  } finally {
    set({ loading: false });
  }
};

const toWorkspaceState = (projectId: string, payload: OpenWorkspaceResult): WorkspaceViewState => ({
  projectId,
  data: payload.workspace,
  timeline: payload.timeline,
  docComments: payload.docsComments,
  selectedType: payload.workspace.selectedWorkspaceType,
  selectedItemId: payload.workspace.selectedWorkspaceItemId,
});

export const useAppStore = create<AppState>((set, get) => ({
  screen: "loading",
  bootstrap: null,
  projects: [],
  activeWorkspace: null,
  syncStatus: initialSyncStatus,
  loading: false,
  error: null,
  inviteCode: null,
  inAppNotification: null,

  initialize: async () => {
    await withBusy(set, async () => {
      const bootstrap = await window.desktopApi.bootstrap();
      const syncStatus = await window.desktopApi.getSyncStatus();

      set({ bootstrap, syncStatus });

      window.desktopApi.onSyncStatus((status) => {
        set({ syncStatus: status });
      });

      window.desktopApi.onNotification(({ title, body }) => {
        // Play notification sound via Web Audio API
        try {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 880;
          gain.gain.value = 0.15;
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.3);
        } catch { /* audio not available */ }
        // Show in-app toast
        set({ inAppNotification: { title, body, id: Date.now() } });
        setTimeout(() => {
          const current = get().inAppNotification;
          if (current !== null && current.id <= Date.now() - 3000) {
            set({ inAppNotification: null });
          }
        }, 4000);
      });

      window.desktopApi.onWorkspaceChanged(async (projectId) => {
        const current = get().activeWorkspace;
        if (current !== null && current.projectId === projectId) {
          await get().openProject(projectId);
        }
        await get().refreshProjects();
      });

      if (!bootstrap.hasCompletedSetup) {
        set({ screen: "setup" });
        return;
      }

      const projects = await window.desktopApi.listProjects();
      set({ projects, screen: "projects" });
    });
  },

  completeSetup: async (input) => {
    await withBusy(set, async () => {
      const bootstrap = await window.desktopApi.completeSetup(input);
      const projects = await window.desktopApi.listProjects();
      set({ bootstrap, projects, screen: "projects" });
    });
  },

  updateSettings: async (input) => {
    await withBusy(set, async () => {
      await window.desktopApi.updateSettings(input);
      const bootstrap = await window.desktopApi.bootstrap();
      set({ bootstrap, screen: "projects" });
    });
  },

  clearConnection: async () => {
    await withBusy(set, async () => {
      await window.desktopApi.clearConnection();
      const bootstrap = await window.desktopApi.bootstrap();
      set({ bootstrap, activeWorkspace: null, projects: [], screen: "setup" });
    });
  },

  refreshProjects: async () => {
    const projects = await window.desktopApi.listProjects();
    set({ projects });
  },

  createProject: async (name) => {
    await withBusy(set, async () => {
      await window.desktopApi.createProject({ name });
      const projects = await window.desktopApi.listProjects();
      set({ projects, screen: "projects" });
    });
  },

  joinProject: async (inviteCode) => {
    await withBusy(set, async () => {
      await window.desktopApi.joinProject({ inviteCode });
      const projects = await window.desktopApi.listProjects();
      set({ projects, screen: "projects" });
    });
  },

  openProject: async (projectId) => {
    await withBusy(set, async () => {
      const payload = await window.desktopApi.openWorkspace(projectId);
      set({
        activeWorkspace: toWorkspaceState(projectId, payload),
        screen: "workspace",
        inviteCode: null,
      });
    });
  },

  createInvite: async () => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null) {
        return;
      }
      const { inviteCode } = await window.desktopApi.createInvite(workspace.projectId);
      set({ inviteCode });
    });
  },

  leaveProject: async (projectId) => {
    await withBusy(set, async () => {
      await window.desktopApi.leaveProject(projectId);
      const projects = await window.desktopApi.listProjects();
      set({ projects, activeWorkspace: null, screen: "projects" });
    });
  },

  selectChatChannel: async (chatChannelId) => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null) {
        return;
      }
      const timeline = await window.desktopApi.listTimeline({
        projectId: workspace.projectId,
        workspaceType: "chat",
        workspaceItemId: chatChannelId,
      });
      set({
        activeWorkspace: {
          ...workspace,
          selectedType: "chat",
          selectedItemId: chatChannelId,
          timeline,
        },
      });
    });
  },

  selectDoc: async (docId) => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null) {
        return;
      }
      const [timeline, comments] = await Promise.all([
        window.desktopApi.listTimeline({
          projectId: workspace.projectId,
          workspaceType: "doc",
          workspaceItemId: docId,
        }),
        window.desktopApi.listDocComments(workspace.projectId, docId),
      ]);

      set({
        activeWorkspace: {
          ...workspace,
          selectedType: "doc",
          selectedItemId: docId,
          timeline,
          docComments: {
            ...workspace.docComments,
            [docId]: comments,
          },
        },
      });
    });
  },

  createChannel: async (name) => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null) {
        return;
      }
      const channel = await window.desktopApi.createChannel({
        projectId: workspace.projectId,
        name,
      });
      await get().openProject(workspace.projectId);
      await get().selectChatChannel(channel.chatChannelId);
    });
  },

  postMessage: async (body, imageDataUrl, replyToEventId) => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null || workspace.selectedType !== "chat") {
        return;
      }
      await window.desktopApi.postMessage({
        projectId: workspace.projectId,
        chatChannelId: workspace.selectedItemId,
        body,
        imageDataUrl,
        replyToEventId,
      });
      await get().selectChatChannel(workspace.selectedItemId);
    });
  },

  editMessage: async (messageEventId, body) => {
    const workspace = get().activeWorkspace;
    if (workspace === null || workspace.selectedType !== "chat") {
      return;
    }
    await window.desktopApi.editMessage({
      projectId: workspace.projectId,
      chatChannelId: workspace.selectedItemId,
      messageEventId,
      body,
    });
  },

  deleteMessage: async (messageEventId) => {
    const workspace = get().activeWorkspace;
    if (workspace === null || workspace.selectedType !== "chat") {
      return;
    }
    await window.desktopApi.deleteMessage({
      projectId: workspace.projectId,
      chatChannelId: workspace.selectedItemId,
      messageEventId,
    });
  },

  addReaction: async (messageEventId, emoji) => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null || workspace.selectedType !== "chat") {
        return;
      }
      await window.desktopApi.addReaction({
        projectId: workspace.projectId,
        chatChannelId: workspace.selectedItemId,
        messageEventId,
        emoji,
      });
      await get().selectChatChannel(workspace.selectedItemId);
    });
  },

  removeReaction: async (messageEventId, emoji) => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null || workspace.selectedType !== "chat") {
        return;
      }
      await window.desktopApi.removeReaction({
        projectId: workspace.projectId,
        chatChannelId: workspace.selectedItemId,
        messageEventId,
        emoji,
      });
      await get().selectChatChannel(workspace.selectedItemId);
    });
  },

  recordDecision: async (text) => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null || workspace.selectedType !== "chat") {
        return;
      }
      await window.desktopApi.recordDecision({
        projectId: workspace.projectId,
        chatChannelId: workspace.selectedItemId,
        title: text,
        body: text,
      });
      await get().selectChatChannel(workspace.selectedItemId);
    });
  },

  createTask: async (title) => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null || workspace.selectedType !== "chat") {
        return;
      }
      const command: CreateTaskCommand = {
        projectId: workspace.projectId,
        chatChannelId: workspace.selectedItemId,
        title,
      };
      await window.desktopApi.createTask(command);
      await get().openProject(workspace.projectId);
      await get().selectChatChannel(workspace.selectedItemId);
    });
  },

  setTaskStatus: async (taskId, completed) => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null) {
        return;
      }
      await window.desktopApi.setTaskStatus({
        projectId: workspace.projectId,
        taskId,
        completed,
      });
      await get().openProject(workspace.projectId);
      if (workspace.selectedType === "chat") {
        await get().selectChatChannel(workspace.selectedItemId);
      }
    });
  },

  createDoc: async (input) => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null) {
        return;
      }
      const doc = await window.desktopApi.createDoc({
        projectId: workspace.projectId,
        title: input.title,
        markdown: input.markdown,
      });
      await get().openProject(workspace.projectId);
      await get().selectDoc(doc.docId);
    });
  },

  renameDoc: async (docId, title) => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null) {
        return;
      }
      await window.desktopApi.renameDoc({ projectId: workspace.projectId, docId, title });
      await get().openProject(workspace.projectId);
      await get().selectDoc(docId);
    });
  },

  updateDoc: async (docId, markdown) => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null) {
        return;
      }
      await window.desktopApi.updateDoc({ projectId: workspace.projectId, docId, markdown });
      const refreshedDocs = await window.desktopApi.listDocs(workspace.projectId);
      const timeline = await window.desktopApi.listTimeline({
        projectId: workspace.projectId,
        workspaceType: "doc",
        workspaceItemId: docId,
      });
      set({
        activeWorkspace: {
          ...workspace,
          data: {
            ...workspace.data,
            docs: refreshedDocs,
          },
          timeline,
        },
      });
    });
  },

  addDocComment: async (docId, body) => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null) {
        return;
      }
      await window.desktopApi.addDocComment({
        projectId: workspace.projectId,
        docId,
        body,
        anchor: null,
      });
      await get().selectDoc(docId);
    });
  },

  navigateProjects: () => {
    set({ screen: "projects", inviteCode: null });
  },

  navigateSettings: () => {
    set({ screen: "settings" });
  },

  dismissError: () => {
    set({ error: null });
  },
}));

export const getSelectedDoc = (workspace: WorkspaceViewState | null): Doc | null => {
  if (workspace === null || workspace.selectedType !== "doc") {
    return null;
  }
  return workspace.data.docs.find((doc) => doc.docId === workspace.selectedItemId) ?? null;
};
