import { create } from "zustand";
import type {
  CreateProjectInput,
  LocalTimelineEvent,
  Profile,
  Project,
  ProjectListItem,
  RoomSummary,
  SyncConnectionState,
  SyncUpdatePayload,
  TaskProjection,
  TimelineFilter
} from "@slopify/shared";

type ProjectStatusFilter = Project["status"] | "all";

type AppState = {
  initialized: boolean;
  loading: boolean;
  error: string | null;
  profile: Profile | null;
  projects: ProjectListItem[];
  projectFilter: ProjectStatusFilter;
  selectedProjectId: string | null;
  roomSummary: RoomSummary | null;
  openTasks: TaskProjection[];
  timelineEvents: LocalTimelineEvent[];
  timelineFilter: TimelineFilter;
  nextBeforeCreatedAt: number | null;
  inviteInfo: { code: string; expiresAt: number } | null;
  sync: SyncConnectionState;
  bootstrap: () => Promise<void>;
  setupProfile: (displayName: string) => Promise<void>;
  setProjectFilter: (filter: ProjectStatusFilter) => Promise<void>;
  createProject: (input: CreateProjectInput) => Promise<void>;
  selectProject: (projectId: string) => Promise<void>;
  loadOlderTimeline: () => Promise<void>;
  setTimelineFilter: (filter: TimelineFilter) => Promise<void>;
  postMessage: (body: string) => Promise<void>;
  recordDecision: (summary: string, note: string) => Promise<void>;
  createTask: (title: string, assigneeUserId: string | null) => Promise<void>;
  completeTask: (taskId: string) => Promise<void>;
  reopenTask: (taskId: string) => Promise<void>;
  createInvite: () => Promise<void>;
  joinWithInvite: (code: string) => Promise<void>;
  connectSync: () => Promise<void>;
  disconnectSync: () => Promise<void>;
  applySyncUpdate: (payload: SyncUpdatePayload) => Promise<void>;
};

function setError(set: (partial: Partial<AppState>) => void, error: unknown): void {
  set({ error: error instanceof Error ? error.message : "Unknown error" });
}

export const useAppStore = create<AppState>((set, get) => ({
  initialized: false,
  loading: false,
  error: null,
  profile: null,
  projects: [],
  projectFilter: "all",
  selectedProjectId: null,
  roomSummary: null,
  openTasks: [],
  timelineEvents: [],
  timelineFilter: "all",
  nextBeforeCreatedAt: null,
  inviteInfo: null,
  sync: {
    connected: false,
    serverUrl: "http://127.0.0.1:4000"
  },

  bootstrap: async () => {
    set({ loading: true, error: null });
    try {
      const profile = await window.projectLog.profile.get();
      const projects = await window.projectLog.projects.list(get().projectFilter);
      const sync = await window.projectLog.sync.status();
      set({
        profile,
        projects,
        sync,
        initialized: true,
        loading: false
      });

      const firstProject = projects[0];
      if (firstProject) {
        await get().selectProject(firstProject.id);
      }
    } catch (error) {
      set({ loading: false });
      setError(set, error);
    }
  },

  setupProfile: async (displayName) => {
    set({ loading: true, error: null });
    try {
      await window.projectLog.profile.setup({ displayName });
      const profile = await window.projectLog.profile.get();
      const projects = await window.projectLog.projects.list(get().projectFilter);
      set({
        profile,
        projects,
        loading: false
      });
    } catch (error) {
      set({ loading: false });
      setError(set, error);
    }
  },

  setProjectFilter: async (filter) => {
    set({ projectFilter: filter, loading: true, error: null });
    try {
      const projects = await window.projectLog.projects.list(filter);
      const selectedProjectId = get().selectedProjectId;
      const hasSelected = selectedProjectId !== null && projects.some((project) => project.id === selectedProjectId);
      set({
        projects,
        selectedProjectId: hasSelected ? selectedProjectId : null,
        roomSummary: hasSelected ? get().roomSummary : null,
        timelineEvents: hasSelected ? get().timelineEvents : [],
        openTasks: hasSelected ? get().openTasks : [],
        loading: false
      });
    } catch (error) {
      set({ loading: false });
      setError(set, error);
    }
  },

  createProject: async (input) => {
    set({ loading: true, error: null });
    try {
      const project = await window.projectLog.projects.create(input);
      const projects = await window.projectLog.projects.list(get().projectFilter);
      set({
        projects,
        selectedProjectId: project.id,
        loading: false
      });
      await get().selectProject(project.id);
    } catch (error) {
      set({ loading: false });
      setError(set, error);
    }
  },

  selectProject: async (projectId) => {
    set({
      loading: true,
      error: null,
      selectedProjectId: projectId,
      timelineEvents: [],
      nextBeforeCreatedAt: null
    });
    try {
      const [summary, openTasks, timeline] = await Promise.all([
        window.projectLog.projects.roomSummary(projectId),
        window.projectLog.projects.openTasks(projectId),
        window.projectLog.timeline.list({
          projectId,
          limit: 100,
          filter: get().timelineFilter
        })
      ]);

      const highestSeq = timeline.events.reduce<number>(
        (maxSeq, event) => (event.seq !== null && event.seq > maxSeq ? event.seq : maxSeq),
        0
      );
      if (highestSeq > 0) {
        await window.projectLog.timeline.markRead({
          projectId,
          lastReadSeq: highestSeq
        });
      }

      set({
        roomSummary: summary,
        openTasks,
        timelineEvents: timeline.events,
        nextBeforeCreatedAt: timeline.nextBeforeCreatedAt,
        loading: false
      });
    } catch (error) {
      set({ loading: false });
      setError(set, error);
    }
  },

  loadOlderTimeline: async () => {
    const selectedProjectId = get().selectedProjectId;
    const before = get().nextBeforeCreatedAt;
    if (!selectedProjectId || before === null) {
      return;
    }
    set({ loading: true, error: null });
    try {
      const timeline = await window.projectLog.timeline.list({
        projectId: selectedProjectId,
        limit: 100,
        beforeCreatedAt: before,
        filter: get().timelineFilter
      });
      set({
        timelineEvents: [...timeline.events, ...get().timelineEvents],
        nextBeforeCreatedAt: timeline.nextBeforeCreatedAt,
        loading: false
      });
    } catch (error) {
      set({ loading: false });
      setError(set, error);
    }
  },

  setTimelineFilter: async (filter) => {
    set({
      timelineFilter: filter
    });
    const selectedProjectId = get().selectedProjectId;
    if (!selectedProjectId) {
      return;
    }
    set({ loading: true, error: null });
    try {
      const [timeline, openTasks] = await Promise.all([
        window.projectLog.timeline.list({
          projectId: selectedProjectId,
          limit: 100,
          filter
        }),
        window.projectLog.projects.openTasks(selectedProjectId)
      ]);
      set({
        timelineEvents: timeline.events,
        nextBeforeCreatedAt: timeline.nextBeforeCreatedAt,
        openTasks,
        loading: false
      });
    } catch (error) {
      set({ loading: false });
      setError(set, error);
    }
  },

  postMessage: async (body) => {
    const projectId = get().selectedProjectId;
    if (!projectId) {
      return;
    }
    await window.projectLog.timeline.postMessage({ projectId, body });
    await get().applySyncUpdate({ projectId });
  },

  recordDecision: async (summary, note) => {
    const projectId = get().selectedProjectId;
    if (!projectId) {
      return;
    }
    await window.projectLog.timeline.recordDecision({ projectId, summary, note });
    await get().applySyncUpdate({ projectId });
  },

  createTask: async (title, assigneeUserId) => {
    const projectId = get().selectedProjectId;
    if (!projectId) {
      return;
    }
    await window.projectLog.timeline.createTask({
      projectId,
      title,
      assigneeUserId
    });
    await get().applySyncUpdate({ projectId });
  },

  completeTask: async (taskId) => {
    const projectId = get().selectedProjectId;
    if (!projectId) {
      return;
    }
    await window.projectLog.timeline.completeTask({ projectId, taskId });
    await get().applySyncUpdate({ projectId });
  },

  reopenTask: async (taskId) => {
    const projectId = get().selectedProjectId;
    if (!projectId) {
      return;
    }
    await window.projectLog.timeline.reopenTask({ projectId, taskId });
    await get().applySyncUpdate({ projectId });
  },

  createInvite: async () => {
    const projectId = get().selectedProjectId;
    if (!projectId) {
      return;
    }
    try {
      const inviteInfo = await window.projectLog.invite.create({
        projectId,
        expiresInDays: 7
      });
      set({ inviteInfo });
    } catch (error) {
      setError(set, error);
    }
  },

  joinWithInvite: async (code) => {
    try {
      const result = await window.projectLog.invite.join({ code: code.trim() });
      const projects = await window.projectLog.projects.list(get().projectFilter);
      set({
        projects,
        selectedProjectId: result.projectId
      });
      await get().selectProject(result.projectId);
    } catch (error) {
      setError(set, error);
    }
  },

  connectSync: async () => {
    try {
      const sync = await window.projectLog.sync.connect();
      set({ sync });
    } catch (error) {
      setError(set, error);
    }
  },

  disconnectSync: async () => {
    try {
      const sync = await window.projectLog.sync.disconnect();
      set({ sync });
    } catch (error) {
      setError(set, error);
    }
  },

  applySyncUpdate: async (payload) => {
    const selectedProjectId = get().selectedProjectId;
    try {
      const [projects, sync] = await Promise.all([
        window.projectLog.projects.list(get().projectFilter),
        window.projectLog.sync.status()
      ]);
      set({ projects, sync });

      if (selectedProjectId && selectedProjectId === payload.projectId) {
        const [summary, openTasks, timeline] = await Promise.all([
          window.projectLog.projects.roomSummary(selectedProjectId),
          window.projectLog.projects.openTasks(selectedProjectId),
          window.projectLog.timeline.list({
            projectId: selectedProjectId,
            limit: 100,
            filter: get().timelineFilter
          })
        ]);
        set({
          roomSummary: summary,
          openTasks,
          timelineEvents: timeline.events,
          nextBeforeCreatedAt: timeline.nextBeforeCreatedAt
        });
      }
    } catch (error) {
      setError(set, error);
    }
  }
}));
