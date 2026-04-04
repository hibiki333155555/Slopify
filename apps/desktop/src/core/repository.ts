import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { ulid } from "ulid";
import {
  addDocCommentCommandSchema,
  addReactionCommandSchema,
  deleteChatChannelCommandSchema,
  deleteMessageCommandSchema,
  editMessageCommandSchema,
  bootstrapSchema,
  createChatChannelCommandSchema,
  createDocCommandSchema,
  createProjectCommandSchema,
  createTaskCommandSchema,
  eventPayloadSchema,
  eventSchema,
  joinProjectCommandSchema,
  postMessageCommandSchema,
  recordDecisionCommandSchema,
  renameChatChannelCommandSchema,
  removeReactionCommandSchema,
  renameDocCommandSchema,
  setupCommandSchema,
  timelineEventSchema,
  timelineFilterSchema,
  updateDocCommandSchema,
  updateSettingsCommandSchema,
  updateTaskStatusCommandSchema,
  type AddReactionCommand,
  type DeleteChatChannelCommand,
  type DeleteMessageCommand,
  type EditMessageCommand,
  type Bootstrap,
  type ChatChannel,
  type CreateChatChannelCommand,
  type CreateDocCommand,
  type CreateProjectCommand,
  type CreateTaskCommand,
  type Decision,
  type Doc,
  type DocComment,
  type EventRecord,
  type JoinProjectCommand,
  type Member,
  type OpenWorkspaceResult,
  type PostMessageCommand,
  type ProjectSummary,
  type RecordDecisionCommand,
  type RenameChatChannelCommand,
  type RemoveReactionCommand,
  type RenameDocCommand,
  type Settings,
  type SetupCommand,
  type SyncStatus,
  type TimelineEvent,
  type TimelineFilter,
  type SearchResult,
  type UpdateDocCommand,
  type UpdateSettingsCommand,
  type UpdateTaskStatusCommand,
  type UserPresence,
  type WorkspaceState,
} from "@slopify/shared";
import { db, rawQuery, rawExecute } from "./db.js";
import {
  appMeta,
  chatChannels,
  decisions,
  docComments,
  docs,
  events,
  invites,
  projectMembers,
  projectReadCursors,
  projects,
  tasks,
  users,
} from "./schema.js";
import { SyncClient } from "./sync-client.js";

type MetaKey =
  | "setup_complete"
  | "user_id"
  | "display_name"
  | "avatar_url"
  | "server_url"
  | "server_access_password"
  | "last_pulled_at";

type JoinProjectResponse = {
  projectId: string;
  events: EventRecord[];
};

type PullResponse = { events: EventRecord[] };

type InviteResponse = { inviteCode: string };

type NotificationPayload = {
  title: string;
  body: string;
  projectId: string;
  chatChannelId: string | null;
};

type SyncEmitterEvents = {
  "sync-status": SyncStatus;
  "workspace-changed": string;
  notification: NotificationPayload;
  "presence-changed": UserPresence[];
  "version-outdated": string;
};

type Listener<T> = (payload: T) => void;

class TypedEmitter {
  private listeners: { [K in keyof SyncEmitterEvents]?: Array<Listener<SyncEmitterEvents[K]>> } = {};

  public on<K extends keyof SyncEmitterEvents>(
    eventName: K,
    listener: Listener<SyncEmitterEvents[K]>,
  ): () => void {
    if (this.listeners[eventName] === undefined) {
      this.listeners[eventName] = [];
    }
    (this.listeners[eventName] as Array<Listener<SyncEmitterEvents[K]>>).push(listener);
    return () => {
      const arr = this.listeners[eventName] as Array<Listener<SyncEmitterEvents[K]>> | undefined;
      if (arr !== undefined) {
        const idx = arr.indexOf(listener);
        if (idx !== -1) arr.splice(idx, 1);
      }
    };
  }

  public emit<K extends keyof SyncEmitterEvents>(eventName: K, payload: SyncEmitterEvents[K]): void {
    const arr = this.listeners[eventName] as Array<Listener<SyncEmitterEvents[K]>> | undefined;
    if (arr !== undefined) {
      for (const fn of arr) fn(payload);
    }
  }
}

const parseJson = <T>(value: string): T => JSON.parse(value) as T;

const serializeJson = (value: unknown): string => JSON.stringify(value);

export class DesktopRepository {
  private readonly emitter = new TypedEmitter();

  private readonly syncClient = new SyncClient({
    onRemoteEvents: async (incomingEvents) => {
      await this.applyRemoteEvents(incomingEvents);
    },
    onProjectHint: async () => {
      await this.syncNow();
    },
    onPresenceChanged: (_projectId, presence) => {
      this.emitter.emit("presence-changed", presence);
    },
    onConnectionChanged: (connected) => {
      this.currentSyncStatus.connected = connected;
      if (!connected) {
        this.currentSyncStatus.authed = false;
        this.currentSyncStatus.subscribed = false;
      }
      this.publishSyncStatus();
      if (connected) {
        void this.syncNow();
      }
    },
    onVersionOutdated: (latestVersion) => {
      this.emitter.emit("version-outdated", latestVersion);
    },
  });

  private currentSyncStatus: SyncStatus = {
    pendingCount: 0,
    lastPulledAt: null,
    connected: false,
    authed: false,
    subscribed: false,
    lastPulledSeq: 0,
    lastError: null,
  };

  private syncInFlight: Promise<void> | null = null;

  private syncInFlightStartedAt = 0;

  public constructor(
    private readonly appVersion: string = "unknown",
  ) {}

  public async init(): Promise<void> {
    this.currentSyncStatus.lastPulledAt = await this.getLastPulledAt();
    this.currentSyncStatus.lastPulledSeq = await this.getLastPulledAt();
    this.currentSyncStatus.pendingCount = await this.pendingCount();
    this.currentSyncStatus.connected = false;
    this.currentSyncStatus.authed = false;
    this.currentSyncStatus.subscribed = false;
    this.currentSyncStatus.lastError = null;
    this.publishSyncStatus();

    const identity = await this.getSyncIdentity();
    if (identity !== null) {
      this.syncClient.connect(identity);
      await this.syncNow();
    }
  }

  public onSyncStatus(listener: (status: SyncStatus) => void): () => void {
    return this.emitter.on("sync-status", listener);
  }

  public onWorkspaceChanged(listener: (projectId: string) => void): () => void {
    return this.emitter.on("workspace-changed", listener);
  }

  public onNotification(listener: (payload: NotificationPayload) => void): () => void {
    return this.emitter.on("notification", listener);
  }

  public onPresenceChanged(listener: (presence: UserPresence[]) => void): () => void {
    return this.emitter.on("presence-changed", listener);
  }

  public onVersionOutdated(listener: (latestVersion: string) => void): () => void {
    return this.emitter.on("version-outdated", listener);
  }

  public async getPresence(projectId: string): Promise<UserPresence[]> {
    return await this.syncClient.getPresence(projectId);
  }

  public updatePresence(status: "online" | "away"): void {
    this.syncClient.updatePresence(status);
  }

  public async bootstrap(): Promise<Bootstrap> {
    const setupComplete = await this.getMeta("setup_complete") === "1";
    if (!setupComplete) {
      return bootstrapSchema.parse({
        hasCompletedSetup: false,
        me: null,
        settings: null,
      });
    }

    const userId = await this.getMeta("user_id");
    const displayName = await this.getMeta("display_name");
    const serverUrl = await this.getMeta("server_url");
    const avatarUrlMeta = await this.getMeta("avatar_url");
    if (userId === null || displayName === null || serverUrl === null) {
      return bootstrapSchema.parse({
        hasCompletedSetup: false,
        me: null,
        settings: null,
      });
    }

    const now = Date.now();

    let meRow = await db.select().from(users).where(eq(users.userId, userId)).get();
    if (meRow === undefined) {
      await db
        .insert(users)
        .values({
          userId,
          displayName,
          avatarUrl: avatarUrlMeta,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      meRow = await db.select().from(users).where(eq(users.userId, userId)).get();
    }

    if (meRow === undefined) {
      throw new Error("Failed to load current user");
    }

    return bootstrapSchema.parse({
      hasCompletedSetup: true,
      me: {
        userId: meRow.userId,
        displayName: meRow.displayName,
        avatarUrl: meRow.avatarUrl,
        createdAt: meRow.createdAt,
      },
      settings: {
        displayName,
        avatarUrl: avatarUrlMeta === "" ? null : avatarUrlMeta,
        serverUrl,
      },
    });
  }

  public async completeSetup(inputRaw: SetupCommand): Promise<Bootstrap> {
    const input = setupCommandSchema.parse(inputRaw);

    const userId = (await this.getMeta("user_id")) ?? ulid();
    const now = Date.now();

    await db
      .insert(users)
      .values({
        userId,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: users.userId,
        set: {
          displayName: input.displayName,
          avatarUrl: input.avatarUrl,
          updatedAt: now,
        },
      })
      .run();

    await this.setMeta("setup_complete", "1");
    await this.setMeta("user_id", userId);
    await this.setMeta("display_name", input.displayName);
    await this.setMeta("avatar_url", input.avatarUrl ?? "");
    await this.setMeta("server_url", input.serverUrl);
    await this.setMeta("server_access_password", input.serverAccessPassword);

    this.syncClient.connect({
      userId,
      settings: {
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
        serverUrl: input.serverUrl,
      },
      serverAccessPassword: input.serverAccessPassword,
      appVersion: this.appVersion,
    });
    this.currentSyncStatus.lastError = null;
    this.currentSyncStatus.authed = false;
    this.currentSyncStatus.subscribed = false;
    this.publishSyncStatus();
    void this.syncNow();

    return await this.bootstrap();
  }

  public async updateSettings(inputRaw: UpdateSettingsCommand): Promise<Settings> {
    const input = updateSettingsCommandSchema.parse(inputRaw);

    const userId = await this.requireMeta("user_id");
    const now = Date.now();

    await db
      .insert(users)
      .values({
        userId,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: users.userId,
        set: {
          displayName: input.displayName,
          avatarUrl: input.avatarUrl,
          updatedAt: now,
        },
      })
      .run();

    await this.setMeta("display_name", input.displayName);
    await this.setMeta("avatar_url", input.avatarUrl ?? "");
    await this.setMeta("server_url", input.serverUrl);
    await this.setMeta("server_access_password", input.serverAccessPassword);

    this.syncClient.connect({
      userId,
      settings: {
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
        serverUrl: input.serverUrl,
      },
      serverAccessPassword: input.serverAccessPassword,
      appVersion: this.appVersion,
    });
    this.currentSyncStatus.lastError = null;
    this.currentSyncStatus.authed = false;
    this.currentSyncStatus.subscribed = false;
    this.publishSyncStatus();
    void this.syncNow();

    return {
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      serverUrl: input.serverUrl,
    };
  }

  public async clearConnection(): Promise<void> {
    await this.setMeta("setup_complete", "0");
    await this.setMeta("server_url", "");
    await this.setMeta("server_access_password", "");
    this.syncClient.disconnect();
    this.syncClient.resetInFlight();
    this.syncInFlight = null;
    this.syncInFlightStartedAt = 0;
    this.currentSyncStatus.connected = false;
    this.currentSyncStatus.authed = false;
    this.currentSyncStatus.subscribed = false;
    this.currentSyncStatus.lastError = null;
    this.publishSyncStatus();
  }

  public async listProjects(): Promise<ProjectSummary[]> {
    const myUserId = await this.getMeta("user_id");
    const rows = await rawQuery<{
      project_id: string;
      name: string;
      created_at: number;
      updated_at: number;
      member_count: number;
      last_activity_at: number;
      unread_count: number;
    }>(
      `
        SELECT
          p.project_id,
          p.name,
          p.created_at,
          p.updated_at,
          COALESCE(pm.member_count, 0) AS member_count,
          COALESCE(ev.last_activity_at, p.updated_at) AS last_activity_at,
          COALESCE(unread.cnt, 0) AS unread_count
        FROM projects p
        LEFT JOIN (
          SELECT project_id, COUNT(*) AS member_count
          FROM project_members
          GROUP BY project_id
        ) pm ON pm.project_id = p.project_id
        LEFT JOIN (
          SELECT project_id, MAX(created_at) AS last_activity_at
          FROM events
          GROUP BY project_id
        ) ev ON ev.project_id = p.project_id
        LEFT JOIN (
          SELECT e.project_id, COUNT(*) AS cnt
          FROM events e
          LEFT JOIN project_read_cursors prc ON prc.project_id = e.project_id
          WHERE e.created_at > COALESCE(prc.last_read_at, 0)
            AND e.actor_user_id != ?
          GROUP BY e.project_id
        ) unread ON unread.project_id = p.project_id
        ORDER BY last_activity_at DESC
      `,
      [myUserId ?? ""],
    );

    return rows.map((row) => ({
      projectId: row.project_id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      memberCount: row.member_count,
      lastActivityAt: row.last_activity_at,
      unreadCount: row.unread_count,
    }));
  }

  public async createProject(inputRaw: CreateProjectCommand): Promise<ProjectSummary> {
    const input = createProjectCommandSchema.parse(inputRaw);
    const userId = await this.requireMeta("user_id");
    const displayName = await this.requireMeta("display_name");
    const avatarUrl = await this.getMeta("avatar_url");
    const projectId = ulid();
    const channelId = ulid();
    const now = Date.now();

    const projectEvent = eventSchema.parse({
      id: ulid(),
      projectId,
      actorUserId: userId,
      type: "project.created",
      payload: { name: input.name },
      chatChannelId: null,
      docId: null,
      createdAt: now,
    });

    const memberEvent = eventSchema.parse({
      id: ulid(),
      projectId,
      actorUserId: userId,
      type: "member.joined",
      payload: {
        memberUserId: userId,
        memberDisplayName: displayName,
        memberAvatarUrl: avatarUrl,
      },
      chatChannelId: null,
      docId: null,
      createdAt: now + 1,
    });

    const channelEvent = eventSchema.parse({
      id: ulid(),
      projectId,
      actorUserId: userId,
      type: "chat.created",
      payload: {
        chatChannelId: channelId,
        name: "General",
      },
      chatChannelId: channelId,
      docId: null,
      createdAt: now + 2,
    });

    await this.appendLocalEvents([projectEvent, memberEvent, channelEvent]);
    await this.syncNow();

    return await this.requireProject(projectId);
  }

  public async joinProject(inputRaw: JoinProjectCommand): Promise<ProjectSummary> {
    const input = joinProjectCommandSchema.parse(inputRaw);
    const identity = await this.requireSyncIdentity();
    const response = await this.postJson<JoinProjectResponse>(identity.settings.serverUrl, "/invites/join", {
      inviteCode: input.inviteCode,
      userId: identity.userId,
      displayName: identity.settings.displayName,
      avatarUrl: identity.settings.avatarUrl,
      serverAccessPassword: identity.serverAccessPassword,
    });

    await this.applyRemoteEvents(response.events);
    await this.syncNow();
    return await this.requireProject(response.projectId);
  }

  public async createInvite(projectId: string): Promise<{ inviteCode: string }> {
    const identity = await this.requireSyncIdentity();
    const response = await this.postJson<InviteResponse>(
      identity.settings.serverUrl,
      "/invites/create",
      {
        projectId,
        requesterUserId: identity.userId,
        serverAccessPassword: identity.serverAccessPassword,
      },
    );

    await db
      .insert(invites)
      .values({ projectId, inviteCode: response.inviteCode, createdAt: Date.now() })
      .onConflictDoUpdate({
        target: invites.projectId,
        set: {
          inviteCode: response.inviteCode,
          createdAt: Date.now(),
        },
      })
      .run();

    return response;
  }

  public async leaveProject(projectId: string): Promise<void> {
    await rawExecute("BEGIN IMMEDIATE");
    try {
      await db.delete(events).where(eq(events.projectId, projectId)).run();
      await db.delete(decisions).where(eq(decisions.projectId, projectId)).run();
      await db.delete(tasks).where(eq(tasks.projectId, projectId)).run();
      await db.delete(docComments).where(eq(docComments.projectId, projectId)).run();
      await db.delete(docs).where(eq(docs.projectId, projectId)).run();
      await db.delete(chatChannels).where(eq(chatChannels.projectId, projectId)).run();
      await db.delete(projectMembers).where(eq(projectMembers.projectId, projectId)).run();
      await db.delete(invites).where(eq(invites.projectId, projectId)).run();
      await db.delete(projectReadCursors).where(eq(projectReadCursors.projectId, projectId)).run();
      await db.delete(projects).where(eq(projects.projectId, projectId)).run();
      await rawExecute("COMMIT");
    } catch (error) {
      await rawExecute("ROLLBACK");
      throw error;
    }
  }

  public async openWorkspace(projectId: string): Promise<OpenWorkspaceResult> {
    await rawExecute(
      `INSERT INTO project_read_cursors (project_id, last_read_at)
       VALUES (?, ?)
       ON CONFLICT(project_id) DO UPDATE SET last_read_at = excluded.last_read_at`,
      [projectId, Date.now()],
    );

    const project = await this.requireProject(projectId);
    const members = await this.listMembers(projectId);
    const channels = await this.listChannels(projectId);
    const docsList = await this.listDocs(projectId);
    const tasksList = await this.listTasks(projectId);
    const decisionsList = await this.listDecisions(projectId);

    const selectedWorkspaceType = channels.length > 0 ? "chat" : "doc";
    const selectedWorkspaceItemId =
      selectedWorkspaceType === "chat"
        ? channels[0]?.chatChannelId ?? docsList[0]?.docId
        : docsList[0]?.docId ?? channels[0]?.chatChannelId;

    if (selectedWorkspaceItemId === undefined) {
      const channel = await this.createChannel({ projectId, name: "General" });
      const timeline = await this.listTimeline({
        projectId,
        workspaceType: "chat",
        workspaceItemId: channel.chatChannelId,
      });
      return {
        workspace: {
          project,
          members,
          channels: [channel],
          tasks: tasksList,
          decisions: decisionsList,
          docs: docsList,
          selectedWorkspaceType: "chat",
          selectedWorkspaceItemId: channel.chatChannelId,
        },
        timeline,
        docsComments: {},
      };
    }

    const timeline = await this.listTimeline({
      projectId,
      workspaceType: selectedWorkspaceType,
      workspaceItemId: selectedWorkspaceItemId,
    });

    const allCommentRows = await db
      .select()
      .from(docComments)
      .where(eq(docComments.projectId, projectId))
      .orderBy(asc(docComments.createdAt))
      .all();

    const docsComments: Record<string, DocComment[]> = {};
    for (const doc of docsList) {
      docsComments[doc.docId] = [];
    }
    for (const row of allCommentRows) {
      const bucket = docsComments[row.docId];
      if (bucket !== undefined) {
        bucket.push({
          commentId: row.commentId,
          projectId: row.projectId,
          docId: row.docId,
          authorUserId: row.authorUserId,
          body: row.body,
          anchor: row.anchor,
          createdAt: row.createdAt,
        });
      }
    }

    const workspace: WorkspaceState = {
      project,
      members,
      channels,
      tasks: tasksList,
      decisions: decisionsList,
      docs: docsList,
      selectedWorkspaceType,
      selectedWorkspaceItemId,
    };

    return {
      workspace,
      timeline,
      docsComments,
    };
  }

  public async listMembers(projectId: string): Promise<Member[]> {
    const rows = await rawQuery<{
      project_id: string;
      user_id: string;
      joined_at: number;
      display_name: string;
      avatar_url: string | null;
    }>(
      `
          SELECT pm.project_id, pm.user_id, pm.joined_at, u.display_name, u.avatar_url
          FROM project_members pm
          JOIN users u ON u.user_id = pm.user_id
          WHERE pm.project_id = ?
          ORDER BY pm.joined_at ASC
        `,
      [projectId],
    );

    return rows.map((row) => ({
      projectId: row.project_id,
      userId: row.user_id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      joinedAt: row.joined_at,
    }));
  }

  public async listChannels(projectId: string): Promise<ChatChannel[]> {
    const rows = await db
      .select()
      .from(chatChannels)
      .where(eq(chatChannels.projectId, projectId))
      .orderBy(asc(chatChannels.createdAt))
      .all();

    return rows.map((row) => ({
      chatChannelId: row.chatChannelId,
      projectId: row.projectId,
      name: row.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  public async createChannel(inputRaw: CreateChatChannelCommand): Promise<ChatChannel> {
    const input = createChatChannelCommandSchema.parse(inputRaw);
    const userId = await this.requireMeta("user_id");
    const chatChannelId = ulid();
    const event = eventSchema.parse({
      id: ulid(),
      projectId: input.projectId,
      actorUserId: userId,
      type: "chat.created",
      payload: {
        chatChannelId,
        name: input.name,
      },
      chatChannelId,
      docId: null,
      createdAt: Date.now(),
    });

    await this.appendLocalEvents([event]);
    await this.syncNow();

    const payload = eventPayloadSchema.parse({ type: event.type, payload: event.payload });
    if (payload.type !== "chat.created") {
      throw new Error("Unexpected payload type for create channel");
    }

    const channel = await db
      .select()
      .from(chatChannels)
      .where(eq(chatChannels.chatChannelId, payload.payload.chatChannelId))
      .get();

    if (channel === undefined) {
      throw new Error("Failed to load newly created channel");
    }

    return {
      chatChannelId: channel.chatChannelId,
      projectId: channel.projectId,
      name: channel.name,
      createdAt: channel.createdAt,
      updatedAt: channel.updatedAt,
    };
  }

  public async renameChannel(inputRaw: RenameChatChannelCommand): Promise<ChatChannel> {
    const input = renameChatChannelCommandSchema.parse(inputRaw);
    const userId = await this.requireMeta("user_id");

    const event = eventSchema.parse({
      id: ulid(),
      projectId: input.projectId,
      actorUserId: userId,
      type: "chat.renamed",
      payload: {
        chatChannelId: input.chatChannelId,
        name: input.name,
      },
      chatChannelId: input.chatChannelId,
      docId: null,
      createdAt: Date.now(),
    });

    await this.appendLocalEvents([event]);
    await this.syncNow();

    const channel = await db
      .select()
      .from(chatChannels)
      .where(eq(chatChannels.chatChannelId, input.chatChannelId))
      .get();
    if (channel === undefined) {
      throw new Error("Channel not found");
    }

    return {
      chatChannelId: channel.chatChannelId,
      projectId: channel.projectId,
      name: channel.name,
      createdAt: channel.createdAt,
      updatedAt: channel.updatedAt,
    };
  }

  public async deleteChannel(inputRaw: DeleteChatChannelCommand): Promise<void> {
    const input = deleteChatChannelCommandSchema.parse(inputRaw);
    const userId = await this.requireMeta("user_id");

    const event = eventSchema.parse({
      id: ulid(),
      projectId: input.projectId,
      actorUserId: userId,
      type: "chat.deleted",
      payload: {
        chatChannelId: input.chatChannelId,
      },
      chatChannelId: null,
      docId: null,
      createdAt: Date.now(),
    });

    await this.appendLocalEvents([event]);
    await this.syncNow();
  }

  public async listTimeline(filterRaw: TimelineFilter): Promise<TimelineEvent[]> {
    const filter = timelineFilterSchema.parse(filterRaw);
    const myUserId = await this.getMeta("user_id");

    const rows =
      filter.workspaceType === "chat"
        ? await rawQuery<EventRow>(
            `
              SELECT e.*, u.display_name AS actor_display_name, u.avatar_url AS actor_avatar_url
              FROM events e
              LEFT JOIN users u ON u.user_id = e.actor_user_id
              WHERE e.project_id = ?
                AND (
                  e.chat_channel_id = ?
                  OR (e.chat_channel_id IS NULL AND e.doc_id IS NULL)
                )
              ORDER BY e.created_at ASC
            `,
            [filter.projectId, filter.workspaceItemId],
          )
        : await rawQuery<EventRow>(
            `
              SELECT e.*, u.display_name AS actor_display_name, u.avatar_url AS actor_avatar_url
              FROM events e
              LEFT JOIN users u ON u.user_id = e.actor_user_id
              WHERE e.project_id = ?
                AND (e.doc_id = ? OR (e.chat_channel_id IS NULL AND e.doc_id IS NULL))
              ORDER BY e.created_at ASC
            `,
            [filter.projectId, filter.workspaceItemId],
          );

    // Separate meta events (reactions, edits, deletes) from regular timeline events
    const reactionRows: EventRow[] = [];
    const timelineRows: EventRow[] = [];
    const deletedMessageIds = new Set<string>();
    const editedMessages = new Map<string, string>(); // messageEventId -> latest body
    for (const row of rows) {
      if (row.type === "message.reaction.added" || row.type === "message.reaction.removed") {
        reactionRows.push(row);
      } else if (row.type === "message.deleted") {
        const payload = parseJson<Record<string, unknown>>(row.payload_json);
        deletedMessageIds.add(payload.messageEventId as string);
      } else if (row.type === "message.edited") {
        const payload = parseJson<Record<string, unknown>>(row.payload_json);
        editedMessages.set(payload.messageEventId as string, payload.body as string);
      } else {
        timelineRows.push(row);
      }
    }

    // Filter out deleted messages
    const filteredRows = timelineRows.filter((row) => !deletedMessageIds.has(row.id));

    // Build reactions map: messageEventId -> { emoji -> { count, users } }
    const reactionsMap = new Map<string, Map<string, { count: number; users: Set<string> }>>();
    for (const row of reactionRows) {
      const payload = parseJson<Record<string, unknown>>(row.payload_json);
      const messageEventId = payload.messageEventId as string;
      const emoji = payload.emoji as string;
      if (!reactionsMap.has(messageEventId)) {
        reactionsMap.set(messageEventId, new Map());
      }
      const emojiMap = reactionsMap.get(messageEventId)!;
      if (!emojiMap.has(emoji)) {
        emojiMap.set(emoji, { count: 0, users: new Set() });
      }
      const entry = emojiMap.get(emoji)!;
      if (row.type === "message.reaction.added") {
        if (!entry.users.has(row.actor_user_id)) {
          entry.count++;
          entry.users.add(row.actor_user_id);
        }
      } else {
        if (entry.users.has(row.actor_user_id)) {
          entry.count--;
          entry.users.delete(row.actor_user_id);
        }
      }
    }

    // Build a lookup for reply previews
    const timelineById = new Map<string, EventRow>();
    for (const row of filteredRows) {
      timelineById.set(row.id, row);
    }

    return filteredRows.map((row) => {
      // Apply edits: override the payload body if this message was edited
      let effectiveRow = row;
      const editedBody = editedMessages.get(row.id);
      if (editedBody !== undefined && row.type === "message.posted") {
        const originalPayload = parseJson<Record<string, unknown>>(row.payload_json);
        effectiveRow = { ...row, payload_json: JSON.stringify({ ...originalPayload, body: editedBody }) };
      }

      const entry = this.hydrateTimelineEvent(effectiveRow);

      // Mark as edited
      if (editedBody !== undefined) {
        entry.edited = true;
      }

      // Attach reactions
      const emojiMap = reactionsMap.get(row.id);
      if (emojiMap !== undefined) {
        const reactions: Array<{ emoji: string; count: number; reacted: boolean }> = [];
        for (const [emoji, data] of emojiMap) {
          if (data.count > 0) {
            reactions.push({ emoji, count: data.count, reacted: myUserId !== null && data.users.has(myUserId) });
          }
        }
        if (reactions.length > 0) {
          entry.reactions = reactions;
        }
      }

      // Attach reply preview
      const payload = parseJson<Record<string, unknown>>(effectiveRow.payload_json);
      const replyToEventId = payload.replyToEventId as string | undefined;
      if (replyToEventId !== undefined) {
        const replyRow = timelineById.get(replyToEventId);
        if (replyRow !== undefined) {
          const replyPayload = parseJson<Record<string, unknown>>(replyRow.payload_json);
          entry.replyPreview = {
            actorDisplayName: replyRow.actor_display_name ?? "Unknown",
            text: (replyPayload.body as string) || "[image]",
          };
        }
      }

      return entry;
    });
  }

  public async postMessage(inputRaw: PostMessageCommand): Promise<void> {
    const input = postMessageCommandSchema.parse(inputRaw);
    const payload: Record<string, unknown> = {
      chatChannelId: input.chatChannelId,
      body: input.body,
    };
    if (input.imageDataUrl !== undefined) {
      payload.imageDataUrl = input.imageDataUrl;
    }
    if (input.replyToEventId !== undefined) {
      payload.replyToEventId = input.replyToEventId;
    }
    const event = await this.createEvent(input.projectId, "message.posted", payload, input.chatChannelId, null);

    await this.appendLocalEvents([event]);
    await this.syncNow();
  }

  public async editMessage(inputRaw: EditMessageCommand): Promise<void> {
    const input = editMessageCommandSchema.parse(inputRaw);
    const event = await this.createEvent(
      input.projectId,
      "message.edited",
      {
        chatChannelId: input.chatChannelId,
        messageEventId: input.messageEventId,
        body: input.body,
      },
      input.chatChannelId,
      null,
    );
    await this.appendLocalEvents([event]);
    await this.syncNow();
  }

  public async deleteMessage(inputRaw: DeleteMessageCommand): Promise<void> {
    const input = deleteMessageCommandSchema.parse(inputRaw);
    const event = await this.createEvent(
      input.projectId,
      "message.deleted",
      {
        chatChannelId: input.chatChannelId,
        messageEventId: input.messageEventId,
      },
      input.chatChannelId,
      null,
    );
    await this.appendLocalEvents([event]);
    await this.syncNow();
  }

  public async addReaction(inputRaw: AddReactionCommand): Promise<void> {
    const input = addReactionCommandSchema.parse(inputRaw);
    const event = await this.createEvent(
      input.projectId,
      "message.reaction.added",
      {
        chatChannelId: input.chatChannelId,
        messageEventId: input.messageEventId,
        emoji: input.emoji,
      },
      input.chatChannelId,
      null,
    );

    await this.appendLocalEvents([event]);
    await this.syncNow();
  }

  public async removeReaction(inputRaw: RemoveReactionCommand): Promise<void> {
    const input = removeReactionCommandSchema.parse(inputRaw);
    const event = await this.createEvent(
      input.projectId,
      "message.reaction.removed",
      {
        chatChannelId: input.chatChannelId,
        messageEventId: input.messageEventId,
        emoji: input.emoji,
      },
      input.chatChannelId,
      null,
    );

    await this.appendLocalEvents([event]);
    await this.syncNow();
  }

  public async recordDecision(inputRaw: RecordDecisionCommand): Promise<void> {
    const input = recordDecisionCommandSchema.parse(inputRaw);
    const event = await this.createEvent(
      input.projectId,
      "decision.recorded",
      {
        chatChannelId: input.chatChannelId,
        title: input.title,
        body: input.body,
      },
      input.chatChannelId,
      null,
    );

    await this.appendLocalEvents([event]);
    await this.syncNow();
  }

  public async createTask(inputRaw: CreateTaskCommand): Promise<void> {
    const input = createTaskCommandSchema.parse(inputRaw);
    const event = await this.createEvent(
      input.projectId,
      "task.created",
      {
        taskId: ulid(),
        chatChannelId: input.chatChannelId,
        title: input.title,
      },
      input.chatChannelId,
      null,
    );

    await this.appendLocalEvents([event]);
    await this.syncNow();
  }

  public async setTaskStatus(inputRaw: UpdateTaskStatusCommand): Promise<void> {
    const input = updateTaskStatusCommandSchema.parse(inputRaw);
    const type = input.completed ? "task.completed" : "task.reopened";
    const taskProjection = await db.select().from(tasks).where(eq(tasks.taskId, input.taskId)).get();
    const event = await this.createEvent(
      input.projectId,
      type,
      {
        taskId: input.taskId,
      },
      taskProjection?.chatChannelId ?? null,
      null,
    );

    await this.appendLocalEvents([event]);
    await this.syncNow();
  }

  public async listDocs(projectId: string): Promise<Doc[]> {
    const rows = await db
      .select()
      .from(docs)
      .where(eq(docs.projectId, projectId))
      .orderBy(asc(docs.createdAt))
      .all();

    return rows.map((row) => ({
      docId: row.docId,
      projectId: row.projectId,
      title: row.title,
      markdown: row.markdown,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  public async createDoc(inputRaw: CreateDocCommand): Promise<Doc> {
    const input = createDocCommandSchema.parse(inputRaw);
    const docId = ulid();
    const event = await this.createEvent(
      input.projectId,
      "doc.created",
      {
        docId,
        title: input.title,
        markdown: input.markdown,
      },
      null,
      docId,
    );

    await this.appendLocalEvents([event]);
    await this.syncNow();

    const doc = await db.select().from(docs).where(eq(docs.docId, docId)).get();
    if (doc === undefined) {
      throw new Error("Doc not found after create");
    }

    return {
      docId: doc.docId,
      projectId: doc.projectId,
      title: doc.title,
      markdown: doc.markdown,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  public async renameDoc(inputRaw: RenameDocCommand): Promise<Doc> {
    const input = renameDocCommandSchema.parse(inputRaw);
    const event = await this.createEvent(
      input.projectId,
      "doc.renamed",
      {
        docId: input.docId,
        title: input.title,
      },
      null,
      input.docId,
    );

    await this.appendLocalEvents([event]);
    await this.syncNow();

    const doc = await db.select().from(docs).where(eq(docs.docId, input.docId)).get();
    if (doc === undefined) {
      throw new Error("Doc not found");
    }

    return {
      docId: doc.docId,
      projectId: doc.projectId,
      title: doc.title,
      markdown: doc.markdown,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  public async updateDoc(inputRaw: UpdateDocCommand): Promise<Doc> {
    const input = updateDocCommandSchema.parse(inputRaw);
    const event = await this.createEvent(
      input.projectId,
      "doc.updated",
      {
        docId: input.docId,
        markdown: input.markdown,
      },
      null,
      input.docId,
    );

    await this.appendLocalEvents([event]);
    await this.syncNow();

    const doc = await db.select().from(docs).where(eq(docs.docId, input.docId)).get();
    if (doc === undefined) {
      throw new Error("Doc not found");
    }

    return {
      docId: doc.docId,
      projectId: doc.projectId,
      title: doc.title,
      markdown: doc.markdown,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  public async listDocComments(projectId: string, docId: string): Promise<DocComment[]> {
    const rows = await db
      .select()
      .from(docComments)
      .where(and(eq(docComments.projectId, projectId), eq(docComments.docId, docId)))
      .orderBy(asc(docComments.createdAt))
      .all();

    return rows.map((row) => ({
      commentId: row.commentId,
      projectId: row.projectId,
      docId: row.docId,
      authorUserId: row.authorUserId,
      body: row.body,
      anchor: row.anchor,
      createdAt: row.createdAt,
    }));
  }

  public async addDocComment(inputRaw: AddDocCommentInput): Promise<DocComment> {
    const input = addDocCommentCommandSchema.parse(inputRaw);
    const commentId = ulid();
    const event = await this.createEvent(
      input.projectId,
      "doc.comment.added",
      {
        docId: input.docId,
        commentId,
        body: input.body,
        anchor: input.anchor,
      },
      null,
      input.docId,
    );

    await this.appendLocalEvents([event]);
    await this.syncNow();

    const row = await db
      .select()
      .from(docComments)
      .where(eq(docComments.commentId, commentId))
      .get();

    if (row === undefined) {
      throw new Error("Comment not found");
    }

    return {
      commentId: row.commentId,
      projectId: row.projectId,
      docId: row.docId,
      authorUserId: row.authorUserId,
      body: row.body,
      anchor: row.anchor,
      createdAt: row.createdAt,
    };
  }

  public async searchMessages(projectId: string, query: string): Promise<SearchResult[]> {
    if (query.trim().length === 0) return [];

    const pattern = `%${query.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;

    const rows = await rawQuery<{
      id: string;
      project_id: string;
      chat_channel_id: string | null;
      created_at: number;
      payload_json: string;
      actor_user_id: string;
      actor_display_name: string | null;
      actor_avatar_url: string | null;
      channel_name: string | null;
    }>(
      `
        SELECT e.id, e.project_id, e.chat_channel_id, e.created_at,
               e.payload_json, e.actor_user_id,
               u.display_name AS actor_display_name, u.avatar_url AS actor_avatar_url,
               c.name AS channel_name
        FROM events e
        LEFT JOIN users u ON u.user_id = e.actor_user_id
        LEFT JOIN chat_channels c ON c.chat_channel_id = e.chat_channel_id
        WHERE e.project_id = ?
          AND e.type = 'message.posted'
          AND json_extract(e.payload_json, '$.body') LIKE ? ESCAPE '\\'
        ORDER BY e.created_at DESC
        LIMIT 50
        `,
      [projectId, pattern],
    );

    return rows.map((row) => {
      const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
      return {
        eventId: row.id,
        projectId: row.project_id,
        chatChannelId: row.chat_channel_id,
        channelName: row.channel_name,
        actorDisplayName: row.actor_display_name ?? "Unknown",
        actorAvatarUrl: row.actor_avatar_url,
        body: (payload.body as string) || "",
        createdAt: row.created_at,
      };
    });
  }

  public async syncNow(): Promise<void> {
    const syncTimeoutMs = 15000;
    const identity = await this.getSyncIdentity();
    if (identity === null) {
      return;
    }

    if (this.syncInFlight !== null) {
      const inFlightAge = Date.now() - this.syncInFlightStartedAt;
      if (inFlightAge <= syncTimeoutMs) {
        await this.syncInFlight;
        return;
      }
      this.syncInFlight = null;
      this.syncClient.resetInFlight();
      this.currentSyncStatus.lastError = "Sync lock timed out and was reset";
      this.publishSyncStatus();
    }

    this.syncInFlightStartedAt = Date.now();
    this.syncInFlight = this.withTimeout(
      (async () => {
        const connected = await this.syncClient.ensureConnected(5000);
        this.currentSyncStatus.connected = connected;
        if (!connected) {
          this.currentSyncStatus.authed = false;
          this.currentSyncStatus.subscribed = false;
          return;
        }

        const projectIds = (await db
          .select({ projectId: projects.projectId })
          .from(projects)
          .all())
          .map((x) => x.projectId);

        const pending = await this.pendingEvents();
        if (projectIds.length === 0 && pending.length === 0) {
          this.currentSyncStatus.authed = true;
          this.currentSyncStatus.subscribed = true;
          this.currentSyncStatus.lastError = null;
          return;
        }

        const pullResult = await this.syncClient.pull({
          projectIds,
          since: await this.getLastPulledAt(),
          serverAccessPassword: identity.serverAccessPassword,
        });

        await this.applyRemoteEvents(pullResult.events);
        const cursor = pullResult.cursor;
        await this.setMeta("last_pulled_at", String(cursor));
        this.currentSyncStatus.lastPulledSeq = cursor;
        this.currentSyncStatus.lastPulledAt = cursor;
        this.currentSyncStatus.authed = true;
        this.currentSyncStatus.subscribed = true;
        this.currentSyncStatus.lastError = null;
        if (pending.length > 0) {
          const acceptedIds = await this.syncClient.push({
            events: pending,
            serverAccessPassword: identity.serverAccessPassword,
          });
          if (acceptedIds.length > 0) {
            await db
              .update(events)
              .set({ syncStatus: "synced" })
              .where(inArray(events.id, acceptedIds))
              .run();
          }
        }
      })(),
      syncTimeoutMs,
      "syncNow",
    )
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.currentSyncStatus.lastError = message;
        this.currentSyncStatus.connected = this.syncClient.connected;
        if (message.toLowerCase().includes("unauthorized")) {
          this.currentSyncStatus.authed = false;
          this.currentSyncStatus.subscribed = false;
        }
        this.syncClient.resetInFlight();
      })
      .finally(async () => {
        this.syncInFlight = null;
        this.currentSyncStatus.pendingCount = await this.pendingCount();
        this.currentSyncStatus.lastPulledAt = await this.getLastPulledAt();
        this.currentSyncStatus.connected = this.syncClient.connected;
        this.publishSyncStatus();
      });

    await this.syncInFlight;
  }

  public async getSyncStatus(): Promise<SyncStatus> {
    this.currentSyncStatus.pendingCount = await this.pendingCount();
    this.currentSyncStatus.lastPulledAt = await this.getLastPulledAt();
    this.currentSyncStatus.lastPulledSeq = await this.getLastPulledAt();
    this.currentSyncStatus.connected = this.syncClient.connected;
    return this.currentSyncStatus;
  }

  private async createEvent(
    projectId: string,
    type: EventRecord["type"],
    payload: Record<string, unknown>,
    chatChannelId: string | null,
    docId: string | null,
  ): Promise<EventRecord> {
    return eventSchema.parse({
      id: ulid(),
      projectId,
      actorUserId: await this.requireMeta("user_id"),
      type,
      payload,
      chatChannelId,
      docId,
      createdAt: Date.now(),
    });
  }

  private async appendLocalEvents(inputEvents: EventRecord[]): Promise<void> {
    const orderedEvents = [...inputEvents].sort((a, b) => a.createdAt - b.createdAt);
    await rawExecute("BEGIN IMMEDIATE");
    try {
      for (const event of orderedEvents) {
        await this.insertEventRow(event, "pending");
        await this.applyProjection(event);
        this.emitter.emit("workspace-changed", event.projectId);
      }
      await rawExecute("COMMIT");
    } catch (error) {
      await rawExecute("ROLLBACK");
      throw error;
    }

    this.currentSyncStatus.pendingCount = await this.pendingCount();
    this.publishSyncStatus();
  }

  private async applyRemoteEvents(remoteEvents: EventRecord[]): Promise<void> {
    const orderedEvents = [...remoteEvents]
      .map((event) => eventSchema.parse(event))
      .sort((a, b) => a.createdAt - b.createdAt);

    if (orderedEvents.length === 0) {
      return;
    }

    const incomingIds = orderedEvents.map((e) => e.id);
    const existingRows = await db
      .select({ id: events.id })
      .from(events)
      .where(inArray(events.id, incomingIds))
      .all();
    const existingIds = new Set(existingRows.map((r) => r.id));

    await rawExecute("BEGIN IMMEDIATE");
    try {
      for (const event of orderedEvents) {
        if (existingIds.has(event.id)) {
          continue;
        }

        await this.insertEventRow(event, "synced");
        await this.applyProjection(event);
        this.emitter.emit("workspace-changed", event.projectId);

        // Emit notification for messages from other users
        const myUserId = await this.getMeta("user_id");
        if (event.actorUserId !== myUserId && event.type === "message.posted") {
          const actorRow = await db
            .select({ displayName: users.displayName })
            .from(users)
            .where(eq(users.userId, event.actorUserId))
            .get();
          const senderName = actorRow?.displayName ?? "Someone";
          const body = (event.payload as Record<string, unknown>).body as string;
          this.emitter.emit("notification", {
            title: senderName,
            body: body || "[image]",
            projectId: event.projectId,
            chatChannelId: event.chatChannelId,
          });
        }
      }
      await rawExecute("COMMIT");
    } catch (error) {
      await rawExecute("ROLLBACK");
      throw error;
    }

    this.currentSyncStatus.pendingCount = await this.pendingCount();
    this.publishSyncStatus();
  }

  private async insertEventRow(event: EventRecord, syncStatus: "pending" | "synced"): Promise<void> {
    await db
      .insert(events)
      .values({
        id: event.id,
        projectId: event.projectId,
        actorUserId: event.actorUserId,
        type: event.type,
        payloadJson: serializeJson(event.payload),
        chatChannelId: event.chatChannelId,
        docId: event.docId,
        createdAt: event.createdAt,
        syncStatus,
      })
      .run();
  }

  private async applyProjection(event: EventRecord): Promise<void> {
    const payload = eventPayloadSchema.parse({ type: event.type, payload: event.payload });

    await db
      .insert(users)
      .values({
        userId: event.actorUserId,
        displayName: await this.displayNameForEventActor(event.actorUserId),
        avatarUrl: await this.avatarForEventActor(event.actorUserId),
        createdAt: event.createdAt,
        updatedAt: event.createdAt,
      })
      .onConflictDoNothing()
      .run();

    switch (payload.type) {
      case "project.created": {
        await db
          .insert(projects)
          .values({
            projectId: event.projectId,
            name: payload.payload.name,
            createdAt: event.createdAt,
            updatedAt: event.createdAt,
          })
          .onConflictDoUpdate({
            target: projects.projectId,
            set: {
              name: payload.payload.name,
              updatedAt: event.createdAt,
            },
          })
          .run();
        break;
      }
      case "member.joined": {
        await db
          .insert(users)
          .values({
            userId: payload.payload.memberUserId,
            displayName: payload.payload.memberDisplayName,
            avatarUrl: payload.payload.memberAvatarUrl,
            createdAt: event.createdAt,
            updatedAt: event.createdAt,
          })
          .onConflictDoUpdate({
            target: users.userId,
            set: {
              displayName: payload.payload.memberDisplayName,
              avatarUrl: payload.payload.memberAvatarUrl,
              updatedAt: event.createdAt,
            },
          })
          .run();

        await db
          .insert(projectMembers)
          .values({
            projectId: event.projectId,
            userId: payload.payload.memberUserId,
            joinedAt: event.createdAt,
          })
          .onConflictDoNothing()
          .run();
        break;
      }
      case "chat.created": {
        await db
          .insert(chatChannels)
          .values({
            chatChannelId: payload.payload.chatChannelId,
            projectId: event.projectId,
            name: payload.payload.name,
            createdAt: event.createdAt,
            updatedAt: event.createdAt,
          })
          .onConflictDoNothing()
          .run();
        break;
      }
      case "chat.renamed": {
        await db
          .update(chatChannels)
          .set({
            name: payload.payload.name,
            updatedAt: event.createdAt,
          })
          .where(eq(chatChannels.chatChannelId, payload.payload.chatChannelId))
          .run();
        break;
      }
      case "chat.deleted": {
        await db
          .delete(chatChannels)
          .where(eq(chatChannels.chatChannelId, payload.payload.chatChannelId))
          .run();
        break;
      }
      case "decision.recorded": {
        await db
          .insert(decisions)
          .values({
            decisionId: event.id,
            projectId: event.projectId,
            chatChannelId: payload.payload.chatChannelId,
            title: payload.payload.title,
            body: payload.payload.body,
            createdAt: event.createdAt,
            updatedAt: event.createdAt,
          })
          .onConflictDoNothing()
          .run();
        break;
      }
      case "task.created": {
        await db
          .insert(tasks)
          .values({
            taskId: payload.payload.taskId,
            projectId: event.projectId,
            chatChannelId: payload.payload.chatChannelId,
            title: payload.payload.title,
            completed: false,
            createdAt: event.createdAt,
            updatedAt: event.createdAt,
          })
          .onConflictDoNothing()
          .run();
        break;
      }
      case "task.completed": {
        await db
          .update(tasks)
          .set({ completed: true, updatedAt: event.createdAt })
          .where(eq(tasks.taskId, payload.payload.taskId))
          .run();
        break;
      }
      case "task.reopened": {
        await db
          .update(tasks)
          .set({ completed: false, updatedAt: event.createdAt })
          .where(eq(tasks.taskId, payload.payload.taskId))
          .run();
        break;
      }
      case "doc.created": {
        await db
          .insert(docs)
          .values({
            docId: payload.payload.docId,
            projectId: event.projectId,
            title: payload.payload.title,
            markdown: payload.payload.markdown,
            createdAt: event.createdAt,
            updatedAt: event.createdAt,
          })
          .onConflictDoNothing()
          .run();
        break;
      }
      case "doc.renamed": {
        await db
          .update(docs)
          .set({ title: payload.payload.title, updatedAt: event.createdAt })
          .where(eq(docs.docId, payload.payload.docId))
          .run();
        break;
      }
      case "doc.updated": {
        await db
          .update(docs)
          .set({ markdown: payload.payload.markdown, updatedAt: event.createdAt })
          .where(eq(docs.docId, payload.payload.docId))
          .run();
        break;
      }
      case "doc.comment.added": {
        await db
          .insert(docComments)
          .values({
            commentId: payload.payload.commentId,
            projectId: event.projectId,
            docId: payload.payload.docId,
            authorUserId: event.actorUserId,
            body: payload.payload.body,
            anchor: payload.payload.anchor,
            createdAt: event.createdAt,
          })
          .onConflictDoNothing()
          .run();
        break;
      }
      case "message.posted":
      case "message.edited":
      case "message.deleted":
      case "message.reaction.added":
      case "message.reaction.removed": {
        break;
      }
    }

    await db
      .update(projects)
      .set({ updatedAt: event.createdAt })
      .where(eq(projects.projectId, event.projectId))
      .run();
  }

  private async listTasks(projectId: string): Promise<Array<{
    taskId: string;
    projectId: string;
    chatChannelId: string;
    title: string;
    completed: boolean;
    createdAt: number;
    updatedAt: number;
  }>> {
    const rows = await db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .orderBy(asc(tasks.createdAt))
      .all();
    return rows.map((row) => ({
      taskId: row.taskId,
      projectId: row.projectId,
      chatChannelId: row.chatChannelId,
      title: row.title,
      completed: row.completed,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  private async listDecisions(projectId: string): Promise<Decision[]> {
    const rows = await db
      .select()
      .from(decisions)
      .where(eq(decisions.projectId, projectId))
      .orderBy(asc(decisions.createdAt))
      .all();
    return rows.map((row) => ({
      decisionId: row.decisionId,
      projectId: row.projectId,
      chatChannelId: row.chatChannelId,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  private async pendingEvents(): Promise<EventRecord[]> {
    const rows = await db
      .select()
      .from(events)
      .where(eq(events.syncStatus, "pending"))
      .orderBy(asc(events.createdAt))
      .all();

    return rows.map((row) =>
      eventSchema.parse({
        id: row.id,
        projectId: row.projectId,
        actorUserId: row.actorUserId,
        type: row.type,
        payload: parseJson<Record<string, unknown>>(row.payloadJson),
        chatChannelId: row.chatChannelId,
        docId: row.docId,
        createdAt: row.createdAt,
      }),
    );
  }

  private async pendingCount(): Promise<number> {
    return (
      (await db
        .select({ count: sql<number>`count(*)` })
        .from(events)
        .where(eq(events.syncStatus, "pending"))
        .get())?.count ?? 0
    );
  }

  private async requireProject(projectId: string): Promise<ProjectSummary> {
    const row = (await rawQuery<{
      project_id: string;
      name: string;
      created_at: number;
      updated_at: number;
      member_count: number;
      last_activity_at: number;
    }>(
      `
          SELECT
            p.project_id,
            p.name,
            p.created_at,
            p.updated_at,
            COALESCE(pm.member_count, 0) AS member_count,
            COALESCE(ev.last_activity_at, p.updated_at) AS last_activity_at
          FROM projects p
          LEFT JOIN (
            SELECT project_id, COUNT(*) AS member_count
            FROM project_members
            WHERE project_id = ?
            GROUP BY project_id
          ) pm ON pm.project_id = p.project_id
          LEFT JOIN (
            SELECT project_id, MAX(created_at) AS last_activity_at
            FROM events
            WHERE project_id = ?
            GROUP BY project_id
          ) ev ON ev.project_id = p.project_id
          WHERE p.project_id = ?
        `,
      [projectId, projectId, projectId],
    ))[0];

    if (row === undefined) {
      throw new Error(`Project not found: ${projectId}`);
    }

    return {
      projectId: row.project_id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      memberCount: row.member_count,
      lastActivityAt: row.last_activity_at,
      unreadCount: 0,
    };
  }

  private hydrateTimelineEvent(row: EventRow): TimelineEvent {
    const parsedEvent = eventSchema.parse({
      id: row.id,
      projectId: row.project_id,
      actorUserId: row.actor_user_id,
      type: row.type,
      payload: parseJson<Record<string, unknown>>(row.payload_json),
      chatChannelId: row.chat_channel_id,
      docId: row.doc_id,
      createdAt: row.created_at,
    });

    const timelineText = this.formatEventText(parsedEvent);

    return timelineEventSchema.parse({
      ...parsedEvent,
      actorDisplayName: row.actor_display_name ?? "Unknown",
      actorAvatarUrl: row.actor_avatar_url,
      timelineText,
    });
  }

  private formatEventText(event: EventRecord): string {
    const payload = eventPayloadSchema.parse({ type: event.type, payload: event.payload });
    switch (payload.type) {
      case "project.created":
        return `Created project "${payload.payload.name}"`;
      case "member.joined":
        return `${payload.payload.memberDisplayName} joined the project`;
      case "chat.created":
        return `Created channel #${payload.payload.name}`;
      case "chat.renamed":
        return `Renamed channel to #${payload.payload.name}`;
      case "chat.deleted":
        return "Channel deleted";
      case "message.posted":
        return (payload.payload as Record<string, unknown>).body as string
          || ((payload.payload as Record<string, unknown>).imageDataUrl ? "[image]" : "");
      case "message.edited":
        return "";
      case "message.deleted":
        return "";
      case "decision.recorded":
        return `Decision: ${payload.payload.title}\n${payload.payload.body}`;
      case "task.created":
        return `Task created: ${payload.payload.title}`;
      case "task.completed":
        return "Task completed";
      case "task.reopened":
        return "Task reopened";
      case "doc.created":
        return `Created doc: ${payload.payload.title}`;
      case "doc.renamed":
        return `Renamed doc to: ${payload.payload.title}`;
      case "doc.updated":
        return "Updated doc content";
      case "doc.comment.added":
        return `Commented: ${payload.payload.body}`;
      case "message.reaction.added":
      case "message.reaction.removed":
        return "";
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  }

  private publishSyncStatus(): void {
    this.emitter.emit("sync-status", this.currentSyncStatus);
  }

  private async getLastPulledAt(): Promise<number> {
    const value = await this.getMeta("last_pulled_at");
    if (value === null || value.length === 0) {
      return 0;
    }
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    // Migrate from old timestamp-based cursor to server_seq-based cursor.
    // Timestamps are >1e12 while server_seq starts from 1.
    if (num > 1e10) return 0;
    return num;
  }

  private async getSyncIdentity(): Promise<{ userId: string; settings: Settings; serverAccessPassword: string; appVersion: string } | null> {
    if (await this.getMeta("setup_complete") !== "1") {
      return null;
    }

    const userId = await this.getMeta("user_id");
    const displayName = await this.getMeta("display_name");
    const serverUrl = await this.getMeta("server_url");
    const serverAccessPassword = await this.getMeta("server_access_password");
    const avatarUrl = await this.getMeta("avatar_url");

    if (
      userId === null ||
      displayName === null ||
      serverUrl === null ||
      serverAccessPassword === null ||
      serverAccessPassword.length === 0
    ) {
      return null;
    }

    return {
      userId,
      settings: {
        displayName,
        avatarUrl: avatarUrl === "" ? null : avatarUrl,
        serverUrl,
      },
      serverAccessPassword,
      appVersion: this.appVersion,
    };
  }

  private async requireSyncIdentity(): Promise<{ userId: string; settings: Settings; serverAccessPassword: string; appVersion: string }> {
    const identity = await this.getSyncIdentity();
    if (identity === null) {
      throw new Error("Setup is incomplete");
    }
    return identity;
  }

  private async ensureServerAuth(serverUrl: string, serverAccessPassword: string): Promise<void> {
    await this.postJson<{ ok: true }>(serverUrl, "/auth/check", {
      serverAccessPassword,
    });
  }

  private async postJson<T>(serverUrl: string, path: string, body: Record<string, unknown>): Promise<T> {
    const url = `${serverUrl.replace(/\/$/, "")}${path}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Request failed (${response.status}) ${path}: ${text}`);
    }

    return (await response.json()) as T;
  }

  private async getMeta(key: MetaKey): Promise<string | null> {
    const row = await db.select().from(appMeta).where(eq(appMeta.key, key)).get();
    return row?.value ?? null;
  }

  private async requireMeta(key: MetaKey): Promise<string> {
    const value = await this.getMeta(key);
    if (value === null || value.length === 0) {
      throw new Error(`Missing meta value: ${key}`);
    }
    return value;
  }

  private async setMeta(key: MetaKey, value: string): Promise<void> {
    await db
      .insert(appMeta)
      .values({ key, value })
      .onConflictDoUpdate({
        target: appMeta.key,
        set: { value },
      })
      .run();
  }

  private async displayNameForEventActor(userId: string): Promise<string> {
    const known = await db.select().from(users).where(eq(users.userId, userId)).get();
    if (known !== undefined) {
      return known.displayName;
    }
    if (userId === await this.getMeta("user_id")) {
      return await this.requireMeta("display_name");
    }
    return "Unknown";
  }

  private async avatarForEventActor(userId: string): Promise<string | null> {
    const known = await db.select().from(users).where(eq(users.userId, userId)).get();
    if (known !== undefined) {
      return known.avatarUrl;
    }
    if (userId === await this.getMeta("user_id")) {
      return await this.getMeta("avatar_url");
    }
    return null;
  }
}

type EventRow = {
  id: string;
  project_id: string;
  actor_user_id: string;
  type: string;
  payload_json: string;
  chat_channel_id: string | null;
  doc_id: string | null;
  created_at: number;
  sync_status: string;
  actor_display_name: string | null;
  actor_avatar_url: string | null;
};

type AddDocCommentInput = {
  projectId: string;
  docId: string;
  body: string;
  anchor: string | null;
};

export const repository = new DesktopRepository(__APP_VERSION__);
