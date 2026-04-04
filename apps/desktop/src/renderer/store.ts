import { create } from "zustand";
import type {
  Bootstrap,
  CreateDocCommand,
  CreateTaskCommand,
  Doc,
  DocComment,
  OpenWorkspaceResult,
  ProjectSummary,
  SearchResult,
  SetupCommand,
  SyncStatus,
  TimelineEvent,
  UpdateSettingsCommand,
  UserPresence,
  WorkspaceState,
} from "@slopify/shared";
import { repository } from "../core/repository.js";
import { readClipboardImage, showNotification, getSystemIdleTime } from "../core/native.js";
import { initDb } from "../core/db.js";

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
  inAppNotification: { title: string; body: string; projectId: string | undefined; chatChannelId: string | null | undefined; id: number } | null;
  presence: UserPresence[];
  versionWarning: { latestVersion: string; currentVersion: string } | null;

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
  deleteChannel: (chatChannelId: string) => Promise<void>;

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

  searchQuery: string;
  searchResults: SearchResult[];
  searchOpen: boolean;
  highlightEventId: string | null;

  setSearchOpen: (open: boolean) => void;
  searchMessages: (query: string) => Promise<void>;
  clearSearch: () => void;
  jumpToSearchResult: (result: SearchResult) => Promise<void>;

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
  presence: [],
  versionWarning: null,
  searchQuery: "",
  searchResults: [],
  searchOpen: false,
  highlightEventId: null,

  initialize: async () => {
    await withBusy(set, async () => {
      await initDb();

      const bootstrap = await repository.bootstrap();
      const syncStatus = await repository.getSyncStatus();

      set({ bootstrap, syncStatus });

      repository.onSyncStatus((status) => {
        set({ syncStatus: status });
      });

      repository.onNotification(async ({ title, body, projectId, chatChannelId }) => {
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
        set({ inAppNotification: { title, body, projectId, chatChannelId, id: Date.now() } });
        setTimeout(() => {
          const current = get().inAppNotification;
          if (current !== null && current.id <= Date.now() - 5000) {
            set({ inAppNotification: null });
          }
        }, 6000);
        // OS notification
        await showNotification(title, body);
      });

      repository.onPresenceChanged((presence) => {
        set({ presence });
      });

      repository.onVersionOutdated((latestVersion) => {
        set({ versionWarning: { latestVersion, currentVersion: __APP_VERSION__ } });
      });

      repository.onWorkspaceChanged(async (projectId) => {
        const ws = get().activeWorkspace;
        if (ws !== null && ws.projectId === projectId) {
          const selType = ws.selectedType;
          const selId = ws.selectedItemId;
          const [timeline, channels, docs] = await Promise.all([
            repository.listTimeline({
              projectId,
              workspaceType: selType,
              workspaceItemId: selId,
            }),
            repository.listChannels(projectId),
            repository.listDocs(projectId),
          ]);
          set((state) => {
            const aw = state.activeWorkspace;
            if (aw === null || aw.projectId !== projectId) return {};
            const selChanged = aw.selectedType !== selType || aw.selectedItemId !== selId;
            return {
              activeWorkspace: {
                ...aw,
                data: { ...aw.data, channels, docs },
                ...(selChanged ? {} : { timeline }),
              },
            };
          });
        }
        await get().refreshProjects();
      });

      await repository.init();

      // Idle detection polling
      const IDLE_THRESHOLD_S = 5 * 60;
      let currentPresence: "online" | "away" = "online";
      setInterval(async () => {
        const idleSeconds = await getSystemIdleTime();
        const newPresence = idleSeconds >= IDLE_THRESHOLD_S ? "away" : "online";
        if (newPresence !== currentPresence) {
          currentPresence = newPresence;
          repository.updatePresence(newPresence);
        }
      }, 30_000);

      if (!bootstrap.hasCompletedSetup) {
        set({ screen: "setup" });
        return;
      }

      const projects = await repository.listProjects();
      set({ projects, screen: "projects" });
    });
  },

  completeSetup: async (input) => {
    await withBusy(set, async () => {
      const bootstrap = await repository.completeSetup(input);
      const projects = await repository.listProjects();
      set({ bootstrap, projects, screen: "projects" });
    });
  },

  updateSettings: async (input) => {
    await withBusy(set, async () => {
      await repository.updateSettings(input);
      const bootstrap = await repository.bootstrap();
      set({ bootstrap, screen: "projects" });
    });
  },

  clearConnection: async () => {
    await withBusy(set, async () => {
      await repository.clearConnection();
      const bootstrap = await repository.bootstrap();
      set({ bootstrap, activeWorkspace: null, projects: [], screen: "setup" });
    });
  },

  refreshProjects: async () => {
    const projects = await repository.listProjects();
    set({ projects });
  },

  createProject: async (name) => {
    await withBusy(set, async () => {
      await repository.createProject({ name });
      const projects = await repository.listProjects();
      set({ projects, screen: "projects" });
    });
  },

  joinProject: async (inviteCode) => {
    await withBusy(set, async () => {
      await repository.joinProject({ inviteCode });
      const projects = await repository.listProjects();
      set({ projects, screen: "projects" });
    });
  },

  openProject: async (projectId) => {
    await withBusy(set, async () => {
      const payload = await repository.openWorkspace(projectId);
      const presence = await repository.getPresence(projectId).catch(() => []);
      set({
        activeWorkspace: toWorkspaceState(projectId, payload),
        screen: "workspace",
        inviteCode: null,
        presence,
      });
    });
  },

  createInvite: async () => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null) {
        return;
      }
      const { inviteCode } = await repository.createInvite(workspace.projectId);
      set({ inviteCode });
    });
  },

  leaveProject: async (projectId) => {
    await withBusy(set, async () => {
      await repository.leaveProject(projectId);
      const projects = await repository.listProjects();
      set({ projects, activeWorkspace: null, screen: "projects" });
    });
  },

  selectChatChannel: async (chatChannelId) => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null) {
        return;
      }
      const timeline = await repository.listTimeline({
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
        repository.listTimeline({
          projectId: workspace.projectId,
          workspaceType: "doc",
          workspaceItemId: docId,
        }),
        repository.listDocComments(workspace.projectId, docId),
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
      const channel = await repository.createChannel({
        projectId: workspace.projectId,
        name,
      });
      const payload = await repository.openWorkspace(workspace.projectId);
      const timeline = await repository.listTimeline({
        projectId: workspace.projectId,
        workspaceType: "chat",
        workspaceItemId: channel.chatChannelId,
      });
      set({
        activeWorkspace: {
          projectId: workspace.projectId,
          data: payload.workspace,
          timeline,
          docComments: payload.docsComments,
          selectedType: "chat",
          selectedItemId: channel.chatChannelId,
        },
        screen: "workspace",
      });
    });
  },

  deleteChannel: async (chatChannelId) => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null) {
        return;
      }
      await repository.deleteChannel({
        projectId: workspace.projectId,
        chatChannelId,
      });
      await get().openProject(workspace.projectId);
    });
  },

  postMessage: async (body, imageDataUrl, replyToEventId) => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null || workspace.selectedType !== "chat") {
        return;
      }
      await repository.postMessage({
        projectId: workspace.projectId,
        chatChannelId: workspace.selectedItemId,
        body,
        imageDataUrl,
        replyToEventId,
      });
    });
  },

  editMessage: async (messageEventId, body) => {
    const workspace = get().activeWorkspace;
    if (workspace === null || workspace.selectedType !== "chat") {
      return;
    }
    await repository.editMessage({
      projectId: workspace.projectId,
      chatChannelId: workspace.selectedItemId,
      messageEventId,
      body,
    });
    await get().selectChatChannel(workspace.selectedItemId);
  },

  deleteMessage: async (messageEventId) => {
    const workspace = get().activeWorkspace;
    if (workspace === null || workspace.selectedType !== "chat") {
      return;
    }
    await repository.deleteMessage({
      projectId: workspace.projectId,
      chatChannelId: workspace.selectedItemId,
      messageEventId,
    });
    await get().selectChatChannel(workspace.selectedItemId);
  },

  addReaction: async (messageEventId, emoji) => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null || workspace.selectedType !== "chat") {
        return;
      }
      await repository.addReaction({
        projectId: workspace.projectId,
        chatChannelId: workspace.selectedItemId,
        messageEventId,
        emoji,
      });
    });
  },

  removeReaction: async (messageEventId, emoji) => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null || workspace.selectedType !== "chat") {
        return;
      }
      await repository.removeReaction({
        projectId: workspace.projectId,
        chatChannelId: workspace.selectedItemId,
        messageEventId,
        emoji,
      });
    });
  },

  recordDecision: async (text) => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null || workspace.selectedType !== "chat") {
        return;
      }
      await repository.recordDecision({
        projectId: workspace.projectId,
        chatChannelId: workspace.selectedItemId,
        title: text,
        body: text,
      });
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
      await repository.createTask(command);
      const payload = await repository.openWorkspace(workspace.projectId);
      const timeline = await repository.listTimeline({
        projectId: workspace.projectId,
        workspaceType: "chat",
        workspaceItemId: workspace.selectedItemId,
      });
      set({
        activeWorkspace: {
          projectId: workspace.projectId,
          data: payload.workspace,
          timeline,
          docComments: payload.docsComments,
          selectedType: "chat",
          selectedItemId: workspace.selectedItemId,
        },
        screen: "workspace",
      });
    });
  },

  setTaskStatus: async (taskId, completed) => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null) {
        return;
      }
      await repository.setTaskStatus({
        projectId: workspace.projectId,
        taskId,
        completed,
      });
      const payload = await repository.openWorkspace(workspace.projectId);
      const timeline = await repository.listTimeline({
        projectId: workspace.projectId,
        workspaceType: workspace.selectedType,
        workspaceItemId: workspace.selectedItemId,
      });
      set({
        activeWorkspace: {
          projectId: workspace.projectId,
          data: payload.workspace,
          timeline,
          docComments: payload.docsComments,
          selectedType: workspace.selectedType,
          selectedItemId: workspace.selectedItemId,
        },
        screen: "workspace",
      });
    });
  },

  createDoc: async (input) => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null) {
        return;
      }
      const doc = await repository.createDoc({
        projectId: workspace.projectId,
        title: input.title,
        markdown: input.markdown,
      });
      const payload = await repository.openWorkspace(workspace.projectId);
      const timeline = await repository.listTimeline({
        projectId: workspace.projectId,
        workspaceType: "doc",
        workspaceItemId: doc.docId,
      });
      const comments = await repository.listDocComments(workspace.projectId, doc.docId);
      set({
        activeWorkspace: {
          projectId: workspace.projectId,
          data: payload.workspace,
          timeline,
          docComments: { ...payload.docsComments, [doc.docId]: comments },
          selectedType: "doc",
          selectedItemId: doc.docId,
        },
        screen: "workspace",
      });
    });
  },

  renameDoc: async (docId, title) => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null) {
        return;
      }
      await repository.renameDoc({ projectId: workspace.projectId, docId, title });
      const payload = await repository.openWorkspace(workspace.projectId);
      const timeline = await repository.listTimeline({
        projectId: workspace.projectId,
        workspaceType: "doc",
        workspaceItemId: docId,
      });
      const comments = await repository.listDocComments(workspace.projectId, docId);
      set({
        activeWorkspace: {
          projectId: workspace.projectId,
          data: payload.workspace,
          timeline,
          docComments: { ...payload.docsComments, [docId]: comments },
          selectedType: "doc",
          selectedItemId: docId,
        },
        screen: "workspace",
      });
    });
  },

  updateDoc: async (docId, markdown) => {
    await withBusy(set, async () => {
      const workspace = get().activeWorkspace;
      if (workspace === null) {
        return;
      }
      await repository.updateDoc({ projectId: workspace.projectId, docId, markdown });
      const refreshedDocs = await repository.listDocs(workspace.projectId);
      const timeline = await repository.listTimeline({
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
      await repository.addDocComment({
        projectId: workspace.projectId,
        docId,
        body,
        anchor: null,
      });
      await get().selectDoc(docId);
    });
  },

  setSearchOpen: (open) => {
    set({ searchOpen: open, searchQuery: "", searchResults: [] });
  },

  searchMessages: async (query) => {
    const workspace = get().activeWorkspace;
    if (workspace === null) return;
    set({ searchQuery: query });
    if (query.trim().length === 0) {
      set({ searchResults: [] });
      return;
    }
    const results = await repository.searchMessages(workspace.projectId, query);
    // Only update if query hasn't changed while awaiting
    if (get().searchQuery === query) {
      set({ searchResults: results });
    }
  },

  clearSearch: () => {
    set({ searchQuery: "", searchResults: [], searchOpen: false });
  },

  jumpToSearchResult: async (result) => {
    if (result.chatChannelId !== null) {
      await get().selectChatChannel(result.chatChannelId);
    }
    set({ searchOpen: false, searchQuery: "", searchResults: [], highlightEventId: result.eventId });
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
