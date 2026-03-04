import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import {
  completeTaskInputSchema,
  createProjectInputSchema,
  createTaskInputSchema,
  clientSyncEventSchema,
  listTimelineInputSchema,
  localTimelineEventSchema,
  markReadInputSchema,
  parsePayloadForEventType,
  postMessageInputSchema,
  profileSchema,
  profileSetupInputSchema,
  projectSchema,
  recordDecisionInputSchema,
  reopenTaskInputSchema,
  type ClientSyncEvent,
  type EventPayloadByType,
  type EventType,
  type LocalTimelineEvent,
  type Profile,
  type Project,
  type ProjectListItem,
  type RoomSummary,
  type ServerSyncEvent,
  type SyncAck,
  type TaskProjection,
  timelinePageSchema,
  ulidSchema
} from "@slopify/shared";
import type Database from "better-sqlite3";
import type { LocalOrm } from "./db.js";
import {
  appMetaTable,
  decisionsTable,
  eventsTable,
  projectMembersTable,
  projectsTable,
  projectSyncStateTable,
  readCursorsTable,
  tasksTable,
  usersTable
} from "./schema.js";

type ProjectListRow = {
  id: string;
  name: string;
  description: string;
  status: Project["status"];
  owner_user_id: string;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
  unread_count: number;
  open_task_count: number;
};

type EventRow = {
  id: string;
  project_id: string;
  seq: number | null;
  actor_user_id: string;
  event_type: EventType;
  entity_id: string | null;
  payload_json: string;
  created_at: number;
  server_created_at: number | null;
  sync_status: "pending" | "synced" | "failed";
  retry_count: number;
};

type MemberRow = {
  project_id: string;
  user_id: string;
  role: "owner" | "member";
  joined_at: number;
  left_at: number | null;
  display_name: string;
};

type DecisionRow = {
  id: string;
  project_id: string;
  summary: string;
  note: string;
  created_event_id: string;
  created_by_user_id: string;
  created_at: number;
};

type TaskRow = {
  id: string;
  project_id: string;
  title: string;
  assignee_user_id: string | null;
  status: "open" | "done";
  created_event_id: string;
  created_by_user_id: string;
  created_at: number;
  completed_at: number | null;
  completed_by_user_id: string | null;
};

export type SyncConfig = {
  userId: string;
  deviceId: string;
  serverUrl: string;
};

export class LocalRepository {
  public constructor(
    private readonly sqlite: Database.Database,
    private readonly orm: LocalOrm
  ) {}

  public getProfile(): Profile | null {
    const userId = this.getMeta("local_user_id");
    const deviceId = this.getMeta("local_device_id");
    if (!userId || !deviceId) {
      return null;
    }

    const user = this.orm.select().from(usersTable).where(eq(usersTable.id, userId)).get();
    if (!user) {
      return null;
    }

    return profileSchema.parse({
      userId: user.id,
      deviceId,
      displayName: user.displayName,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });
  }

  public setupProfile(rawInput: unknown): Profile {
    const input = profileSetupInputSchema.parse(rawInput);
    const now = Date.now();
    const existing = this.getProfile();
    if (existing) {
      this.orm.update(usersTable).set({ displayName: input.displayName, updatedAt: now }).where(eq(usersTable.id, existing.userId)).run();
      return profileSchema.parse({
        ...existing,
        displayName: input.displayName,
        updatedAt: now
      });
    }

    const userId = ulid();
    const deviceId = ulid();

    this.orm.insert(usersTable).values({
      id: userId,
      displayName: input.displayName,
      createdAt: now,
      updatedAt: now
    }).run();

    this.setMeta("local_user_id", userId);
    this.setMeta("local_device_id", deviceId);

    return profileSchema.parse({
      userId,
      deviceId,
      displayName: input.displayName,
      createdAt: now,
      updatedAt: now
    });
  }

  public listProjectIds(): string[] {
    const rows = this.orm.select({ id: projectsTable.id }).from(projectsTable).all();
    return rows.map((row) => row.id);
  }

  public getLastPulledSeq(projectId: string): number {
    const row = this.orm
      .select({ lastPulledSeq: projectSyncStateTable.lastPulledSeq })
      .from(projectSyncStateTable)
      .where(eq(projectSyncStateTable.projectId, projectId))
      .get();
    return row?.lastPulledSeq ?? 0;
  }

  public getSyncConfig(): SyncConfig | null {
    const profile = this.getProfile();
    if (!profile) {
      return null;
    }
    const serverUrl = this.getMeta("server_url") ?? "http://127.0.0.1:4000";
    return {
      userId: profile.userId,
      deviceId: profile.deviceId,
      serverUrl
    };
  }

  public listProjects(status: Project["status"] | "all" = "all"): ProjectListItem[] {
    const localUserId = this.getMeta("local_user_id") ?? "";
    const whereClause = status === "all" ? "" : "WHERE p.status = ?";

    const sql = `
      SELECT
        p.id,
        p.name,
        p.description,
        p.status,
        p.owner_user_id,
        p.created_at,
        p.updated_at,
        p.archived_at,
        COALESCE((
          SELECT COUNT(1)
          FROM events e
          WHERE e.project_id = p.id
            AND e.seq IS NOT NULL
            AND e.seq > COALESCE((SELECT rc.last_read_seq FROM read_cursors rc WHERE rc.project_id = p.id), 0)
            AND e.actor_user_id != ?
        ), 0) AS unread_count,
        COALESCE((
          SELECT COUNT(1)
          FROM tasks t
          WHERE t.project_id = p.id
            AND t.status = 'open'
        ), 0) AS open_task_count
      FROM projects p
      ${whereClause}
      ORDER BY p.updated_at DESC
    `;

    let rows: ProjectListRow[];
    if (status === "all") {
      const statement = this.sqlite.prepare<[string], ProjectListRow>(sql);
      rows = statement.all(localUserId);
    } else {
      const statement = this.sqlite.prepare<[string, Project["status"]], ProjectListRow>(sql);
      rows = statement.all(localUserId, status);
    }

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      ownerUserId: row.owner_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      archivedAt: row.archived_at,
      unreadCount: row.unread_count,
      openTaskCount: row.open_task_count,
      onlineCount: 0,
      lastUpdatedAt: row.updated_at
    }));
  }

  public createProject(rawInput: unknown): Project {
    const input = createProjectInputSchema.parse(rawInput);
    const actor = this.getRequiredProfile();
    const now = Date.now();
    const projectId = ulid();

    this.orm.insert(projectsTable).values({
      id: projectId,
      name: input.name,
      description: input.description,
      status: input.status,
      ownerUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
      archivedAt: null
    }).run();

    this.orm
      .insert(projectMembersTable)
      .values({
        projectId,
        userId: actor.userId,
        role: "owner",
        joinedAt: now,
        leftAt: null
      })
      .run();

    this.orm.insert(readCursorsTable).values({
      projectId,
      lastReadSeq: 0,
      updatedAt: now
    }).run();

    this.orm.insert(projectSyncStateTable).values({
      projectId,
      lastPulledSeq: 0,
      lastSyncAt: null,
      lastError: null
    }).run();

    this.appendEvent({
      id: ulid(),
      projectId,
      actorUserId: actor.userId,
      eventType: "project.created",
      entityId: projectId,
      payload: {
        name: input.name,
        description: input.description,
        status: input.status
      },
      createdAt: now,
      serverCreatedAt: null,
      seq: null,
      syncStatus: "pending",
      retryCount: 0
    });

    return projectSchema.parse({
      id: projectId,
      name: input.name,
      description: input.description,
      status: input.status,
      ownerUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
      archivedAt: null
    });
  }

  public getRoomSummary(projectId: string): RoomSummary {
    const projectRow = this.orm.select().from(projectsTable).where(eq(projectsTable.id, projectId)).get();
    if (!projectRow) {
      throw new Error("Project not found");
    }

    const membersSql = `
      SELECT
        pm.project_id,
        pm.user_id,
        pm.role,
        pm.joined_at,
        pm.left_at,
        COALESCE(u.display_name, pm.user_id) AS display_name
      FROM project_members pm
      LEFT JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ?
        AND pm.left_at IS NULL
      ORDER BY pm.joined_at ASC
    `;
    const memberRows = this.sqlite.prepare<[string], MemberRow>(membersSql).all(projectId);

    const decisionsSql = `
      SELECT id, project_id, summary, note, created_event_id, created_by_user_id, created_at
      FROM decisions
      WHERE project_id = ?
      ORDER BY created_at DESC
      LIMIT 3
    `;
    const decisionRows = this.sqlite.prepare<[string], DecisionRow>(decisionsSql).all(projectId);

    const openTaskCountSql = `
      SELECT COUNT(1) AS count
      FROM tasks
      WHERE project_id = ?
        AND status = 'open'
    `;
    const openCount = this.sqlite.prepare<[string], { count: number }>(openTaskCountSql).get(projectId)?.count ?? 0;

    return {
      project: {
        id: projectRow.id,
        name: projectRow.name,
        description: projectRow.description,
        status: projectRow.status,
        ownerUserId: projectRow.ownerUserId,
        createdAt: projectRow.createdAt,
        updatedAt: projectRow.updatedAt,
        archivedAt: projectRow.archivedAt ?? null
      },
      members: memberRows.map((row) => ({
        projectId: row.project_id,
        userId: row.user_id,
        role: row.role,
        joinedAt: row.joined_at,
        leftAt: row.left_at,
        displayName: row.display_name
      })),
      latestDecisions: decisionRows.map((row) => ({
        id: row.id,
        projectId: row.project_id,
        summary: row.summary,
        note: row.note,
        createdEventId: row.created_event_id,
        createdByUserId: row.created_by_user_id,
        createdAt: row.created_at
      })),
      openTaskCount: openCount,
      onlineCount: 0
    };
  }

  public getOpenTasks(projectId: string): TaskProjection[] {
    const sql = `
      SELECT
        id,
        project_id,
        title,
        assignee_user_id,
        status,
        created_event_id,
        created_by_user_id,
        created_at,
        completed_at,
        completed_by_user_id
      FROM tasks
      WHERE project_id = ?
        AND status = 'open'
      ORDER BY created_at DESC
    `;
    const rows = this.sqlite.prepare<[string], TaskRow>(sql).all(projectId);

    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      assigneeUserId: row.assignee_user_id,
      status: row.status,
      createdEventId: row.created_event_id,
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      completedByUserId: row.completed_by_user_id
    }));
  }

  public listTimeline(rawInput: unknown): { events: LocalTimelineEvent[]; nextBeforeCreatedAt: number | null } {
    const input = listTimelineInputSchema.parse(rawInput);

    const filters: string[] = ["project_id = ?"];
    const args: Array<string | number> = [input.projectId];

    if (input.beforeCreatedAt !== undefined) {
      filters.push("created_at < ?");
      args.push(input.beforeCreatedAt);
    }

    if (input.filter === "message") {
      filters.push("event_type = 'message.posted'");
    }
    if (input.filter === "decision") {
      filters.push("event_type = 'decision.recorded'");
    }
    if (input.filter === "task") {
      filters.push("event_type IN ('task.created', 'task.completed', 'task.reopened')");
    }
    if (input.filter === "openTasks") {
      filters.push("event_type IN ('task.created', 'task.completed', 'task.reopened')");
      filters.push("entity_id IN (SELECT id FROM tasks WHERE project_id = ? AND status = 'open')");
      args.push(input.projectId);
    }

    args.push(input.limit);
    const sql = `
      SELECT id, project_id, seq, actor_user_id, event_type, entity_id, payload_json, created_at, server_created_at, sync_status, retry_count
      FROM events
      WHERE ${filters.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT ?
    `;
    const rows = this.sqlite.prepare(sql).all(...args) as EventRow[];

    const events = rows
      .map((row) => this.mapEventRow(row))
      .sort((left, right) => this.compareTimelineEvents(left, right));

    const nextBeforeCreatedAt =
      rows.length >= input.limit ? rows[rows.length - 1]?.created_at ?? null : null;

    return timelinePageSchema.parse({
      events,
      nextBeforeCreatedAt
    });
  }

  public postMessage(rawInput: unknown): LocalTimelineEvent {
    const input = postMessageInputSchema.parse(rawInput);
    const actor = this.getRequiredProfile();
    return this.appendEvent({
      id: ulid(),
      projectId: input.projectId,
      actorUserId: actor.userId,
      eventType: "message.posted",
      entityId: null,
      payload: { body: input.body },
      createdAt: Date.now(),
      serverCreatedAt: null,
      seq: null,
      syncStatus: "pending",
      retryCount: 0
    });
  }

  public recordDecision(rawInput: unknown): LocalTimelineEvent {
    const input = recordDecisionInputSchema.parse(rawInput);
    const actor = this.getRequiredProfile();
    const decisionId = ulid();
    return this.appendEvent({
      id: ulid(),
      projectId: input.projectId,
      actorUserId: actor.userId,
      eventType: "decision.recorded",
      entityId: decisionId,
      payload: {
        decisionId,
        summary: input.summary,
        note: input.note
      },
      createdAt: Date.now(),
      serverCreatedAt: null,
      seq: null,
      syncStatus: "pending",
      retryCount: 0
    });
  }

  public createTask(rawInput: unknown): LocalTimelineEvent {
    const input = createTaskInputSchema.parse(rawInput);
    const actor = this.getRequiredProfile();
    const taskId = ulid();
    return this.appendEvent({
      id: ulid(),
      projectId: input.projectId,
      actorUserId: actor.userId,
      eventType: "task.created",
      entityId: taskId,
      payload: {
        taskId,
        title: input.title,
        assigneeUserId: input.assigneeUserId
      },
      createdAt: Date.now(),
      serverCreatedAt: null,
      seq: null,
      syncStatus: "pending",
      retryCount: 0
    });
  }

  public completeTask(rawInput: unknown): LocalTimelineEvent {
    const input = completeTaskInputSchema.parse(rawInput);
    const actor = this.getRequiredProfile();
    ulidSchema.parse(input.taskId);

    return this.appendEvent({
      id: ulid(),
      projectId: input.projectId,
      actorUserId: actor.userId,
      eventType: "task.completed",
      entityId: input.taskId,
      payload: {
        taskId: input.taskId
      },
      createdAt: Date.now(),
      serverCreatedAt: null,
      seq: null,
      syncStatus: "pending",
      retryCount: 0
    });
  }

  public reopenTask(rawInput: unknown): LocalTimelineEvent {
    const input = reopenTaskInputSchema.parse(rawInput);
    const actor = this.getRequiredProfile();
    ulidSchema.parse(input.taskId);

    return this.appendEvent({
      id: ulid(),
      projectId: input.projectId,
      actorUserId: actor.userId,
      eventType: "task.reopened",
      entityId: input.taskId,
      payload: {
        taskId: input.taskId
      },
      createdAt: Date.now(),
      serverCreatedAt: null,
      seq: null,
      syncStatus: "pending",
      retryCount: 0
    });
  }

  public markRead(rawInput: unknown): void {
    const input = markReadInputSchema.parse(rawInput);
    this.sqlite
      .prepare(
        `
        INSERT INTO read_cursors (project_id, last_read_seq, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(project_id)
        DO UPDATE SET
          last_read_seq = MAX(last_read_seq, excluded.last_read_seq),
          updated_at = excluded.updated_at
        `
      )
      .run(input.projectId, input.lastReadSeq, Date.now());
  }

  public getPendingSyncEvents(limit = 200): ClientSyncEvent[] {
    const sql = `
      SELECT id, project_id, seq, actor_user_id, event_type, entity_id, payload_json, created_at, server_created_at, sync_status, retry_count
      FROM events
      WHERE sync_status = 'pending'
      ORDER BY created_at ASC
      LIMIT ?
    `;
    const rows = this.sqlite.prepare<[number], EventRow>(sql).all(limit);
    return rows.map((row) => {
      const mapped = this.mapEventRow(row);
      return clientSyncEventSchema.parse({
        id: mapped.id,
        projectId: mapped.projectId,
        actorUserId: mapped.actorUserId,
        eventType: mapped.eventType,
        entityId: mapped.entityId,
        payload: mapped.payload,
        createdAt: mapped.createdAt
      });
    });
  }

  public markAckedEvents(acks: SyncAck[]): void {
    const transaction = this.sqlite.transaction((records: SyncAck[]) => {
      for (const ack of records) {
        this.sqlite
          .prepare(
            `
            UPDATE events
            SET seq = ?, server_created_at = ?, sync_status = 'synced', retry_count = 0
            WHERE id = ?
            `
          )
          .run(ack.seq, ack.serverCreatedAt, ack.eventId);

        this.sqlite
          .prepare(
            `
            INSERT INTO project_sync_state (project_id, last_pulled_seq, last_sync_at, last_error)
            VALUES (?, ?, ?, NULL)
            ON CONFLICT(project_id)
            DO UPDATE SET
              last_pulled_seq = MAX(last_pulled_seq, excluded.last_pulled_seq),
              last_sync_at = excluded.last_sync_at,
              last_error = NULL
            `
          )
          .run(ack.projectId, ack.seq, ack.serverCreatedAt);
      }
    });
    transaction(acks);
  }

  public applyRemoteEvents(events: ServerSyncEvent[]): string[] {
    const touchedProjects = new Set<string>();

    const transaction = this.sqlite.transaction((incoming: ServerSyncEvent[]) => {
      for (const remoteEvent of incoming) {
        const existing = this.orm.select().from(eventsTable).where(eq(eventsTable.id, remoteEvent.id)).get();
        if (existing) {
          this.orm
            .update(eventsTable)
            .set({
              seq: remoteEvent.seq,
              serverCreatedAt: remoteEvent.serverCreatedAt,
              syncStatus: "synced",
              retryCount: 0
            })
            .where(eq(eventsTable.id, remoteEvent.id))
            .run();
        } else {
          this.appendEvent({
            id: remoteEvent.id,
            projectId: remoteEvent.projectId,
            actorUserId: remoteEvent.actorUserId,
            eventType: remoteEvent.eventType,
            entityId: remoteEvent.entityId,
            payload: remoteEvent.payload,
            createdAt: remoteEvent.createdAt,
            serverCreatedAt: remoteEvent.serverCreatedAt,
            seq: remoteEvent.seq,
            syncStatus: "synced",
            retryCount: 0
          });
        }

        this.sqlite
          .prepare(
            `
            INSERT INTO project_sync_state (project_id, last_pulled_seq, last_sync_at, last_error)
            VALUES (?, ?, ?, NULL)
            ON CONFLICT(project_id)
            DO UPDATE SET
              last_pulled_seq = MAX(last_pulled_seq, excluded.last_pulled_seq),
              last_sync_at = excluded.last_sync_at,
              last_error = NULL
            `
          )
          .run(remoteEvent.projectId, remoteEvent.seq, remoteEvent.serverCreatedAt);

        touchedProjects.add(remoteEvent.projectId);
      }
    });

    transaction(events);
    return Array.from(touchedProjects);
  }

  public importJoinedProjectSnapshot(snapshot: {
    project: Project;
    members: RoomSummary["members"];
    events: ServerSyncEvent[];
  }): string {
    this.orm
      .insert(projectsTable)
      .values({
        id: snapshot.project.id,
        name: snapshot.project.name,
        description: snapshot.project.description,
        status: snapshot.project.status,
        ownerUserId: snapshot.project.ownerUserId,
        createdAt: snapshot.project.createdAt,
        updatedAt: snapshot.project.updatedAt,
        archivedAt: snapshot.project.archivedAt
      })
      .onConflictDoUpdate({
        target: projectsTable.id,
        set: {
          name: snapshot.project.name,
          description: snapshot.project.description,
          status: snapshot.project.status,
          updatedAt: snapshot.project.updatedAt,
          archivedAt: snapshot.project.archivedAt
        }
      })
      .run();

    for (const member of snapshot.members) {
      this.orm
        .insert(usersTable)
        .values({
          id: member.userId,
          displayName: member.displayName,
          createdAt: member.joinedAt,
          updatedAt: member.joinedAt
        })
        .onConflictDoUpdate({
          target: usersTable.id,
          set: {
            displayName: member.displayName,
            updatedAt: Date.now()
          }
        })
        .run();

      this.sqlite
        .prepare(
          `
          INSERT INTO project_members (project_id, user_id, role, joined_at, left_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(project_id, user_id)
          DO UPDATE SET role = excluded.role, joined_at = excluded.joined_at, left_at = excluded.left_at
          `
        )
        .run(snapshot.project.id, member.userId, member.role, member.joinedAt, member.leftAt);
    }

    this.sqlite
      .prepare(
        `
        INSERT OR IGNORE INTO read_cursors (project_id, last_read_seq, updated_at)
        VALUES (?, 0, ?)
        `
      )
      .run(snapshot.project.id, Date.now());

    if (snapshot.events.length > 0) {
      this.applyRemoteEvents(snapshot.events);
    } else {
      this.sqlite
        .prepare(
          `
          INSERT OR IGNORE INTO project_sync_state (project_id, last_pulled_seq, last_sync_at, last_error)
          VALUES (?, 0, NULL, NULL)
          `
        )
        .run(snapshot.project.id);
    }

    return snapshot.project.id;
  }

  private appendEvent<T extends EventType>(params: {
    id: string;
    projectId: string;
    actorUserId: string;
    eventType: T;
    entityId: string | null;
    payload: EventPayloadByType[T];
    createdAt: number;
    serverCreatedAt: number | null;
    seq: number | null;
    syncStatus: "pending" | "synced" | "failed";
    retryCount: number;
  }): LocalTimelineEvent {
    const payload = parsePayloadForEventType(params.eventType, params.payload);
    const payloadJson = JSON.stringify(payload);

    this.orm
      .insert(eventsTable)
      .values({
        id: params.id,
        projectId: params.projectId,
        seq: params.seq,
        actorUserId: params.actorUserId,
        eventType: params.eventType,
        entityId: params.entityId,
        payloadJson,
        createdAt: params.createdAt,
        serverCreatedAt: params.serverCreatedAt,
        syncStatus: params.syncStatus,
        retryCount: params.retryCount
      })
      .onConflictDoNothing({ target: eventsTable.id })
      .run();

    const event = localTimelineEventSchema.parse({
      id: params.id,
      projectId: params.projectId,
      seq: params.seq,
      actorUserId: params.actorUserId,
      eventType: params.eventType,
      entityId: params.entityId,
      payload,
      createdAt: params.createdAt,
      serverCreatedAt: params.serverCreatedAt,
      syncStatus: params.syncStatus,
      retryCount: params.retryCount
    });

    this.applyEventProjection(event);
    this.touchProject(params.projectId, params.createdAt);
    return event;
  }

  private applyEventProjection(event: LocalTimelineEvent): void {
    switch (event.eventType) {
      case "project.created": {
        const existing = this.orm.select().from(projectsTable).where(eq(projectsTable.id, event.projectId)).get();
        if (!existing) {
          this.orm
            .insert(projectsTable)
            .values({
              id: event.projectId,
              name: event.payload.name,
              description: event.payload.description,
              status: event.payload.status,
              ownerUserId: event.actorUserId,
              createdAt: event.createdAt,
              updatedAt: event.createdAt,
              archivedAt: null
            })
            .run();
        }
        this.sqlite
          .prepare(
            `
            INSERT INTO project_members (project_id, user_id, role, joined_at, left_at)
            VALUES (?, ?, 'owner', ?, NULL)
            ON CONFLICT(project_id, user_id) DO NOTHING
            `
          )
          .run(event.projectId, event.actorUserId, event.createdAt);
        break;
      }
      case "project.updated": {
        this.sqlite
          .prepare(
            `
            UPDATE projects
            SET
              name = COALESCE(?, name),
              description = COALESCE(?, description),
              status = COALESCE(?, status),
              updated_at = ?
            WHERE id = ?
            `
          )
          .run(event.payload.name ?? null, event.payload.description ?? null, event.payload.status ?? null, event.createdAt, event.projectId);
        break;
      }
      case "member.joined": {
        const userExists = this.orm.select().from(usersTable).where(eq(usersTable.id, event.payload.userId)).get();
        if (!userExists) {
          this.orm
            .insert(usersTable)
            .values({
              id: event.payload.userId,
              displayName: event.payload.userId,
              createdAt: event.createdAt,
              updatedAt: event.createdAt
            })
            .onConflictDoNothing({ target: usersTable.id })
            .run();
        }
        this.sqlite
          .prepare(
            `
            INSERT INTO project_members (project_id, user_id, role, joined_at, left_at)
            VALUES (?, ?, ?, ?, NULL)
            ON CONFLICT(project_id, user_id)
            DO UPDATE SET role = excluded.role, left_at = NULL
            `
          )
          .run(event.projectId, event.payload.userId, event.payload.role, event.createdAt);
        break;
      }
      case "member.left": {
        this.sqlite
          .prepare(
            `
            UPDATE project_members
            SET left_at = ?
            WHERE project_id = ?
              AND user_id = ?
            `
          )
          .run(event.createdAt, event.projectId, event.payload.userId);
        break;
      }
      case "decision.recorded": {
        this.sqlite
          .prepare(
            `
            INSERT OR IGNORE INTO decisions (id, project_id, summary, note, created_event_id, created_by_user_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            `
          )
          .run(
            event.payload.decisionId,
            event.projectId,
            event.payload.summary,
            event.payload.note,
            event.id,
            event.actorUserId,
            event.createdAt
          );
        break;
      }
      case "task.created": {
        this.sqlite
          .prepare(
            `
            INSERT OR IGNORE INTO tasks (
              id,
              project_id,
              title,
              assignee_user_id,
              status,
              created_event_id,
              created_by_user_id,
              created_at,
              completed_at,
              completed_by_user_id
            ) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, NULL, NULL)
            `
          )
          .run(
            event.payload.taskId,
            event.projectId,
            event.payload.title,
            event.payload.assigneeUserId,
            event.id,
            event.actorUserId,
            event.createdAt
          );
        break;
      }
      case "task.completed": {
        this.sqlite
          .prepare(
            `
            UPDATE tasks
            SET
              status = 'done',
              completed_at = ?,
              completed_by_user_id = ?
            WHERE id = ?
              AND project_id = ?
            `
          )
          .run(event.createdAt, event.actorUserId, event.payload.taskId, event.projectId);
        break;
      }
      case "task.reopened": {
        this.sqlite
          .prepare(
            `
            UPDATE tasks
            SET
              status = 'open',
              completed_at = NULL,
              completed_by_user_id = NULL
            WHERE id = ?
              AND project_id = ?
            `
          )
          .run(event.payload.taskId, event.projectId);
        break;
      }
      case "message.posted":
        break;
    }
  }

  private mapEventRow(row: EventRow): LocalTimelineEvent {
    const payloadRaw = JSON.parse(row.payload_json) as unknown;
    const payload = parsePayloadForEventType(row.event_type, payloadRaw);
    return localTimelineEventSchema.parse({
      id: row.id,
      projectId: row.project_id,
      seq: row.seq,
      actorUserId: row.actor_user_id,
      eventType: row.event_type,
      entityId: row.entity_id,
      payload,
      createdAt: row.created_at,
      serverCreatedAt: row.server_created_at,
      syncStatus: row.sync_status,
      retryCount: row.retry_count
    });
  }

  private compareTimelineEvents(left: LocalTimelineEvent, right: LocalTimelineEvent): number {
    const leftSeq = left.seq ?? Number.MAX_SAFE_INTEGER;
    const rightSeq = right.seq ?? Number.MAX_SAFE_INTEGER;
    if (leftSeq !== rightSeq) {
      return leftSeq - rightSeq;
    }
    if (left.createdAt !== right.createdAt) {
      return left.createdAt - right.createdAt;
    }
    return left.id.localeCompare(right.id);
  }

  private touchProject(projectId: string, updatedAt: number): void {
    this.sqlite
      .prepare(
        `
        UPDATE projects
        SET updated_at = CASE WHEN updated_at < ? THEN ? ELSE updated_at END
        WHERE id = ?
        `
      )
      .run(updatedAt, updatedAt, projectId);
  }

  private getRequiredProfile(): Profile {
    const profile = this.getProfile();
    if (!profile) {
      throw new Error("Profile setup is required before this action");
    }
    return profile;
  }

  private getMeta(key: string): string | null {
    const row = this.orm.select().from(appMetaTable).where(eq(appMetaTable.key, key)).get();
    return row?.value ?? null;
  }

  private setMeta(key: string, value: string): void {
    this.orm
      .insert(appMetaTable)
      .values({ key, value })
      .onConflictDoUpdate({
        target: appMetaTable.key,
        set: {
          value
        }
      })
      .run();
  }
}
