import type {
  AddDocCommentCommand,
  CreateChatChannelCommand,
  CreateDocCommand,
  CreateProjectCommand,
  CreateTaskCommand,
  JoinProjectCommand,
  PostMessageCommand,
  RecordDecisionCommand,
  RenameChatChannelCommand,
  RenameDocCommand,
  SetupCommand,
  TimelineFilter,
  UpdateDocCommand,
  UpdateSettingsCommand,
  UpdateTaskStatusCommand,
} from "../schema/commands.js";
import type {
  Bootstrap,
  ChatChannel,
  Doc,
  DocComment,
  Member,
  ProjectSummary,
  Settings,
  TimelineEvent,
  WorkspaceState,
} from "../schema/entities.js";

export type SyncStatus = {
  pendingCount: number;
  lastPulledAt: number | null;
  connected: boolean;
  authed: boolean;
  subscribed: boolean;
  lastPulledSeq: number;
  lastError: string | null;
};

export type OpenWorkspaceResult = {
  workspace: WorkspaceState;
  timeline: TimelineEvent[];
  docsComments: Record<string, DocComment[]>;
};

export interface DesktopApi {
  bootstrap(): Promise<Bootstrap>;
  completeSetup(input: SetupCommand): Promise<Bootstrap>;
  updateSettings(input: UpdateSettingsCommand): Promise<Settings>;
  clearConnection(): Promise<void>;

  listProjects(): Promise<ProjectSummary[]>;
  createProject(input: CreateProjectCommand): Promise<ProjectSummary>;
  joinProject(input: JoinProjectCommand): Promise<ProjectSummary>;
  createInvite(projectId: string): Promise<{ inviteCode: string }>;

  openWorkspace(projectId: string): Promise<OpenWorkspaceResult>;
  listMembers(projectId: string): Promise<Member[]>;
  listChannels(projectId: string): Promise<ChatChannel[]>;
  createChannel(input: CreateChatChannelCommand): Promise<ChatChannel>;
  renameChannel(input: RenameChatChannelCommand): Promise<ChatChannel>;

  listTimeline(filter: TimelineFilter): Promise<TimelineEvent[]>;
  postMessage(input: PostMessageCommand): Promise<void>;
  recordDecision(input: RecordDecisionCommand): Promise<void>;
  createTask(input: CreateTaskCommand): Promise<void>;
  setTaskStatus(input: UpdateTaskStatusCommand): Promise<void>;

  listDocs(projectId: string): Promise<Doc[]>;
  createDoc(input: CreateDocCommand): Promise<Doc>;
  renameDoc(input: RenameDocCommand): Promise<Doc>;
  updateDoc(input: UpdateDocCommand): Promise<Doc>;
  listDocComments(projectId: string, docId: string): Promise<DocComment[]>;
  addDocComment(input: AddDocCommentCommand): Promise<DocComment>;

  getSyncStatus(): Promise<SyncStatus>;
  syncNow(): Promise<void>;

  onSyncStatus(listener: (status: SyncStatus) => void): () => void;
  onWorkspaceChanged(listener: (projectId: string) => void): () => void;
}
