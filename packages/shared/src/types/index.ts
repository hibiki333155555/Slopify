import type {
  AddDocCommentCommand,
  AddReactionCommand,
  CreateChatChannelCommand,
  DeleteChatChannelCommand,
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

export type PresenceStatus = "online" | "away" | "offline";

export type UserPresence = {
  userId: string;
  status: PresenceStatus;
};

export type OpenWorkspaceResult = {
  workspace: WorkspaceState;
  timeline: TimelineEvent[];
  docsComments: Record<string, DocComment[]>;
};

export type SearchResult = {
  eventId: string;
  projectId: string;
  chatChannelId: string | null;
  channelName: string | null;
  actorDisplayName: string;
  actorAvatarUrl: string | null;
  body: string;
  createdAt: number;
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
  leaveProject(projectId: string): Promise<void>;

  openWorkspace(projectId: string): Promise<OpenWorkspaceResult>;
  listMembers(projectId: string): Promise<Member[]>;
  listChannels(projectId: string): Promise<ChatChannel[]>;
  createChannel(input: CreateChatChannelCommand): Promise<ChatChannel>;
  renameChannel(input: RenameChatChannelCommand): Promise<ChatChannel>;
  deleteChannel(input: DeleteChatChannelCommand): Promise<void>;

  listTimeline(filter: TimelineFilter): Promise<TimelineEvent[]>;
  postMessage(input: PostMessageCommand): Promise<void>;
  editMessage(input: EditMessageCommand): Promise<void>;
  deleteMessage(input: DeleteMessageCommand): Promise<void>;
  addReaction(input: AddReactionCommand): Promise<void>;
  removeReaction(input: RemoveReactionCommand): Promise<void>;
  recordDecision(input: RecordDecisionCommand): Promise<void>;
  createTask(input: CreateTaskCommand): Promise<void>;
  setTaskStatus(input: UpdateTaskStatusCommand): Promise<void>;

  listDocs(projectId: string): Promise<Doc[]>;
  createDoc(input: CreateDocCommand): Promise<Doc>;
  renameDoc(input: RenameDocCommand): Promise<Doc>;
  updateDoc(input: UpdateDocCommand): Promise<Doc>;
  listDocComments(projectId: string, docId: string): Promise<DocComment[]>;
  addDocComment(input: AddDocCommentCommand): Promise<DocComment>;

  testNotification(): Promise<void>;
  getSyncStatus(): Promise<SyncStatus>;
  syncNow(): Promise<void>;
  readClipboardImage(): Promise<string | null>;

  searchMessages(projectId: string, query: string): Promise<SearchResult[]>;

  getPresence(projectId: string): Promise<UserPresence[]>;
  updatePresence(status: "online" | "away"): void;

  onSyncStatus(listener: (status: SyncStatus) => void): () => void;
  onWorkspaceChanged(listener: (projectId: string) => void): () => void;
  onNotification(listener: (payload: { title: string; body: string }) => void): () => void;
  onPresenceChanged(listener: (presence: UserPresence[]) => void): () => void;
}
